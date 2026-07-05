import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import { loadSpec, SpecError } from "./spec.js";
import { readResults, finalizeResults, findTranscriptFiles, resultsPath, type ScoreContext } from "./results.js";

export type LintCode = "spec" | "ship_bar" | "critical" | "fixture" | "consistency" | "lint-error";

export interface LintFinding {
  readonly skill: string; // skill name (basename of the dir when the spec fails to parse)
  readonly scenario?: string;
  readonly code: LintCode;
  readonly message: string;
}

/** True if `p` exists and is a directory. Never throws (TOCTOU-safe: a race or dangling
 * symlink between the check and the stat is treated as "not a directory", not an error). */
function isDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/**
 * Validate one skill's spec + fixtures statically (and results-consistency when
 * committed results exist — see the consistency block). Never throws: a bad spec
 * becomes a single `code:"spec"` finding. Returns ALL findings so the CLI can
 * report every problem across every skill.
 */
export function lintSkill(skillDir: string): LintFinding[] {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const findings: LintFinding[] = [];
  let spec: import("./spec.js").Spec;
  try {
    spec = loadSpec(specPath);
  } catch (e) {
    const message = e instanceof SpecError ? e.message : e instanceof Error ? e.message : String(e);
    return [{ skill: basename(skillDir), code: "spec", message }];
  }
  const skill = spec.skill;

  // ship_bar sanity
  if (spec.ship_bar.total < 1) {
    findings.push({ skill, code: "ship_bar", message: "ship_bar.total must be >= 1" });
  }
  if (spec.ship_bar.min_pass < 1) {
    findings.push({ skill, code: "ship_bar", message: "ship_bar.min_pass must be >= 1" });
  }
  if (spec.ship_bar.min_pass > spec.ship_bar.total) {
    findings.push({ skill, code: "ship_bar", message: `ship_bar.min_pass (${spec.ship_bar.min_pass}) > total (${spec.ship_bar.total})` });
  }
  if (spec.ship_bar.total > spec.scenarios.length) {
    findings.push({ skill, code: "ship_bar", message: `ship_bar.total (${spec.ship_bar.total}) > scenario count (${spec.scenarios.length})` });
  }

  // critical ids exist
  const ids = new Set(spec.scenarios.map((s) => s.id));
  for (const cid of spec.critical) {
    if (!ids.has(cid)) findings.push({ skill, code: "critical", message: `critical id \`${cid}\` is not a scenario` });
  }

  // fixture paths exist — check the EFFECTIVE workspace fixture (what the runtime actually
  // copies: run.ts uses scenario.workspace, not the raw scenario.fixture — an inline scenario
  // with env.workspace: fixture:PATH sets workspace.fixture but NOT scenario.fixture). Resolve
  // relative to the spec's dir, matching workspace.ts resolve(specDir, fixture) where specDir = <skillDir>/tests.
  const specDir = dirname(specPath);
  for (const s of spec.scenarios) {
    const fx = typeof s.workspace === "object" && s.workspace !== null ? s.workspace.fixture : undefined;
    if (fx) {
      const abs = isAbsolute(fx) ? fx : resolve(specDir, fx);
      if (!isDir(abs)) {
        findings.push({ skill, scenario: s.id, code: "fixture", message: `fixture not found: ${fx}` });
      }
    }
  }

  // results-consistency — only for committed results.yaml (skipped silently otherwise).
  // Each run dir gets ONE try: schema-1 is intentionally skipped (continue, no finding —
  // migrateResults carries a schema-1 grade verbatim, so recomputing it would false-flag).
  // Anything else that goes wrong (unparseable YAML, or a schema-2 file that's missing/
  // malformed fields — e.g. `scenarios: null`) is caught and surfaces as a `consistency`
  // finding instead of throwing (lintSkill never throws) or being silently dropped (a
  // broken committed artifact must fail the gate, not pass it).
  const resultsRoot = join(skillDir, "tests", "results");
  for (const runDir of enumerateRunDirs(resultsRoot)) {
    try {
      const raw = yaml.load(readFileSync(resultsPath(runDir), "utf8")) as { schema?: unknown };
      if (raw?.schema !== 2) continue; // schema-1 intentionally skipped — no finding
      const r = readResults(runDir);
      const ctx: ScoreContext | null = r.mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
      const recomputed = finalizeResults(
        { skill: r.skill, harness: r.harness, model: r.model, judge: r.judge, timestamp: r.timestamp, label: r.label, mode: r.mode, scenarios: r.scenarios },
        ctx,
      ).effective_grade;
      if (JSON.stringify(recomputed) !== JSON.stringify(r.effective_grade)) {
        findings.push({ skill, code: "consistency", message: `results.yaml effective_grade is stale in ${runDir} (recompute differs)` });
      }
      for (const s of r.scenarios) {
        if (s.override != null) {
          if (!s.note || !s.note.trim()) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no note (${runDir})` });
          if (findTranscriptFiles(runDir, s.id, r.mode).length === 0) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no preserved transcript (${runDir})` });
        }
      }
    } catch (e) {
      findings.push({ skill, code: "consistency", message: `results.yaml unreadable or malformed in ${runDir}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return findings;
}

/**
 * All committed run dirs under a skill's tests/results (<tag>/<timestamp>/results.yaml).
 * Empty if none. Never throws: unreadable/dangling entries (e.g. a broken symlink, or a
 * TOCTOU removal between readdir and statSync) are skipped rather than propagated, so a
 * single bad entry can't abort lintSkill's "never throws" contract.
 */
function enumerateRunDirs(resultsRoot: string): string[] {
  if (!existsSync(resultsRoot)) return [];
  const out: string[] = [];
  let tags: string[];
  try { tags = readdirSync(resultsRoot); } catch { return out; }
  for (const tag of tags) {
    const tagDir = join(resultsRoot, tag);
    if (!isDir(tagDir)) continue;
    let timestamps: string[];
    try { timestamps = readdirSync(tagDir); } catch { continue; }
    for (const ts of timestamps) {
      const runDir = join(tagDir, ts);
      if (isDir(runDir) && existsSync(join(runDir, "results.yaml"))) out.push(runDir);
    }
  }
  return out;
}
