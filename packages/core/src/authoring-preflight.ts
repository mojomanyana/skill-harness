import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { Spec } from "./spec.js";
import { MARKERS } from "./workspace.js";

export interface AuthoringFinding {
  scenario: string;
  code: "INPUT_DISCOVERY" | "READ_COUNT" | "PATH_PORTABILITY" | "COMMAND_SPELLING" | "TEST_SYNTAX" | "CITATION_FORMAT" | "UNAVAILABLE_FORBIDDEN_TOOL" | "UNAVAILABLE_REQUIRED_TOOL";
  severity?: "error";
  message: string;
}

/** Review hints only. A valid exact-format contract may intentionally trigger one. */
export function inspectEvalAuthoring(spec: Spec, profile: {
  tools?: readonly string[];
  fixtureFiles?: (scenario: Spec["scenarios"][number]) => readonly string[];
} = {}): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];
  for (const s of spec.scenarios) {
    const tools = profile.tools ?? s.tools;
    const add = (code: AuthoringFinding["code"], message: string) => findings.push({ scenario: s.id, code, message });
    for (const call of s.traceAssert?.require_calls ?? []) {
      const pattern = call.args?.path?.matches;
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
  const visit = (directory: string, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.isSymbolicLink()) continue;
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(join(directory, entry.name), name + "/");
      else if (entry.isFile()) files.push(MARKERS.some(marker => name.startsWith(marker + "/")) ? name.slice(name.indexOf("/") + 1) : name);
    }
  };
  visit(root, "");
  return [...new Set(files)].sort();
}
