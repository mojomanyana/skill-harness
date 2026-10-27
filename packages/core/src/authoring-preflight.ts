import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, relative, isAbsolute, resolve } from "node:path";
import type { Spec } from "./spec.js";
import { MARKERS } from "./workspace.js";

export interface AuthoringFinding {
  scenario: string;
  code: "INPUT_DISCOVERY" | "READ_COUNT" | "PATH_PORTABILITY" | "LITERAL_PATH_PATTERN" | "COMMAND_SPELLING" | "TEST_SYNTAX" | "CITATION_FORMAT" | "UNAVAILABLE_FORBIDDEN_TOOL" | "UNAVAILABLE_REQUIRED_TOOL" | "JUDGE_REFERENCE_GAP" | "MISSING_COVERAGE_MAP";
  severity?: "error";
  message: string;
}

/** Review hints only. A valid exact-format contract may intentionally trigger one. */
export function inspectEvalAuthoring(spec: Spec, profile: {
  tools?: readonly string[];
  fixtureFiles?: (scenario: Spec["scenarios"][number]) => readonly string[];
  /** Explicitly selected fixture/reference text only. No host search or automatic judge disclosure. */
  fixtureText?: (scenario: Spec["scenarios"][number], file: string) => string | null;
  referenceText?: (file: string) => string | null;
} = {}): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];
  for (const s of spec.scenarios) {
    const tools = profile.tools ?? s.tools;
    const add = (code: AuthoringFinding["code"], message: string) => findings.push({ scenario: s.id, code, message });
    if (!s.covers?.length) add("MISSING_COVERAGE_MAP", "No instruction-section coverage is declared. Map the behavior this scenario can detect; a map is not proof of coverage.");
    if (s.judgeEvidence === "response" && profile.fixtureText && profile.referenceText) {
      const references = (s.judgeReferences ?? []).map(profile.referenceText).filter((text): text is string => text !== null);
      const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();
      const visible = [...references, s.judgeContext ?? ""].map(normalize);
      for (const file of profile.fixtureFiles?.(s) ?? []) {
        if (!/\.(?:md|txt|json|ya?ml|csv)$/i.test(file)) continue;
        const source = profile.fixtureText(s, file);
        if (source !== null && normalize(source) && !visible.some(ref => ref.includes(normalize(source)))) {
          add("JUDGE_REFERENCE_GAP", `Fixture ${file} is not present verbatim in judge references/context. Verify whether its claims are needed to judge valid answers, including brand, goals and conflicting facts. Deliberately private sources may remain excluded; document the reason. This is an inventory warning, not a semantic verdict.`);
        }
      }
    }
    for (const call of s.traceAssert?.require_calls ?? []) {
      const pattern = call.args?.path?.matches;
      const literal = call.args?.path?.equals;
      if (call.tool === "read" && typeof literal === "string" && ["^", "$", "(", "[", ".*", ".+", "\\d", "\\s", "\\w"].some(token => literal.includes(token))) {
        const files = profile.fixtureFiles?.(s) ?? [];
        const normalize = (file: string) => file.replaceAll("\\", "/").replace(/^\.\//, "");
        // A metacharacter can belong to a real filename. Warn only when the supplied
        // fixture inventory supports the regex interpretation but not the literal.
        if (!files.some(file => normalize(file) === normalize(literal))) {
          try {
            const expression = new RegExp(literal);
            if (files.some(file => expression.test(file))) {
              add("LITERAL_PATH_PATTERN", `Required read path ${JSON.stringify(literal)} uses literal equality, but matches fixture names as a regular expression. If a pattern was intended, use args.path.matches; retain literal equality for an intended filename. This is an authoring hint, not an execution failure.`);
            }
          } catch { /* Invalid regex syntax can still be an intentional literal filename. */ }
        }
      }
      if (tools && !tools.includes(call.tool)) {
        findings.push({ scenario: s.id, code: "UNAVAILABLE_REQUIRED_TOOL", severity: "error", message: `Required tool ${call.tool} is excluded by the explicit Pi tool filter.` });
      }
      if (tools?.length === 1 && tools[0] === "read" && call.tool === "read" && pattern) {
        const matches = (profile.fixtureFiles?.(s) ?? []).filter(file => new RegExp(pattern).test(file));
        if (matches.length && !matches.some(file => s.turns.join("\n").includes(file))) {
          add("INPUT_DISCOVERY", "A required source is not named in the prompt and the supplied profile exposes only read. Provide an inventory or discovery capability.");
        }
      }
      if (call.tool === "read" && (call.count?.min ?? 1) > 1) {
        add("READ_COUNT", "Repeated reads do not prove content coverage. Calibrate a single complete read and repeated first chunks.");
      }
      if (pattern?.includes("(^|/)")) add("PATH_PORTABILITY", "The path predicate rejects Windows separators. Check whether that restriction is intentional.");
      if (call.tool === "bash" && call.args?.command?.matches === String.raw`\bnpm test\b`) {
        add("COMMAND_SPELLING", "The command predicate rejects npm run test, which invokes the same package script.");
      }
    }
    if (s.assert?.diff_contains?.includes("expect(")) add("TEST_SYNTAX", "An assertion spelling does not establish that a regression test detects the defect.");
    if (s.checklist.some(item => /\bCite\s+\S+\s+line\s+\d/i.test(item))) {
      add("CITATION_FORMAT", "A mandatory line citation can reject an accurate attributed answer. Justify the format requirement or accept equivalent evidence.");
    }
    if (tools && s.traceAssert?.forbid_calls?.some(call => !tools.includes(call.tool))) {
      add("UNAVAILABLE_FORBIDDEN_TOOL", "A forbidden tool is absent from the supplied profile. Non-use does not demonstrate refusal of an available capability.");
    }
  }
  return findings;
}

/** Names only, never file contents. Do not follow symlinks or inspect private host directories. */
export function fixtureInventory(root: string): string[] {
  const files: string[] = [];
  let entries = 0;
  const visit = (directory: string, prefix: string, depth = 0) => {
    if (depth > 32) throw new Error("Fixture inventory exceeds 32 directory levels; select a smaller fixture");
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > 4096) throw new Error("Fixture inventory exceeds 4096 entries; select a smaller fixture");
      if (entry.name === ".git" || entry.isSymbolicLink()) continue;
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(join(directory, entry.name), name + "/", depth + 1);
      else if (entry.isFile()) files.push(MARKERS.some(marker => name.startsWith(marker + "/")) ? name.slice(name.indexOf("/") + 1) : name);
    }
  };
  visit(root, "");
  return [...new Set(files)].sort();
}

/** Optional text inventory for offline lint. Bounded; never expands the judge's input. */
export function authoringEvidenceProfile(specDir: string) {
  let remaining = 2 * 1024 * 1024;
  const cache = new Map<string, string | null>();
  const text = (file: string): string | null => {
    const path = resolve(specDir, file);
    if (cache.has(path)) return cache.get(path)!;
    let value: string | null = null;
    try {
      const rel = relative(realpathSync(specDir), realpathSync(path));
      const stat = statSync(path), size = stat.size;
      if (!stat.isFile() || isAbsolute(rel) || rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || size > 65536 || size > remaining) return null;
      remaining -= size;
      value = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
    } catch { /* Unreadable/binary source is not invented as empty evidence. */ }
    cache.set(path, value);
    return value;
  };
  const fixture = (s: Spec["scenarios"][number]) => typeof s.workspace === "object" ? s.workspace.fixture : s.fixture;
  return {
    fixtureText: (s: Spec["scenarios"][number], file: string) => {
      const root = fixture(s);
      if (!root) return null;
      // Overlay order is the same as workspace creation: later pending content wins.
      return text(join(root, "_uncommitted", file)) ?? text(join(root, "_staged", file)) ?? text(join(root, file));
    },
    referenceText: text,
  };
}
