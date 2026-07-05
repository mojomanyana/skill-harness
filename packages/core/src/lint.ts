import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import { loadSpec, SpecError } from "./spec.js";
import { readResults, finalizeResults, findTranscriptFiles, resultsPath, type ResultsFile, type ScoreContext } from "./results.js";

export interface LintFinding {
  skill: string;
  scenario?: string;
  code: string; // spec | ship_bar | critical | fixture | consistency
  message: string;
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
    return [{ skill: skillDir, code: "spec", message }];
  }
  const skill = spec.skill;

  // ship_bar sanity
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
      if (!existsSync(abs) || !statSync(abs).isDirectory()) {
        findings.push({ skill, scenario: s.id, code: "fixture", message: `fixture not found: ${fx}` });
      }
    }
  }

  // results-consistency — only for committed results.yaml (skipped silently otherwise)
  const resultsRoot = join(skillDir, "tests", "results");
  for (const runDir of enumerateRunDirs(resultsRoot)) {
    // Only schema-2 results are recompute-checkable. migrateResults carries a schema-1 grade
    // verbatim (may predate override-aware scoring), so recomputing it would false-flag; skip v1.
    let rawSchema: unknown;
    try { rawSchema = (yaml.load(readFileSync(resultsPath(runDir), "utf8")) as { schema?: unknown })?.schema; } catch { continue; }
    if (rawSchema !== 2) continue;
    let r: ResultsFile;
    try { r = readResults(runDir); } catch { continue; } // a corrupt/partial results.yaml is not this check's concern
    const ctx: ScoreContext | null = r.mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
    const recomputed = finalizeResults(
      { skill: r.skill, harness: r.harness, model: r.model, judge: r.judge, timestamp: r.timestamp, label: r.label, mode: r.mode, scenarios: r.scenarios },
      ctx,
    ).effective_grade;
    if (JSON.stringify(recomputed) !== JSON.stringify(r.effective_grade)) {
      findings.push({ skill, code: "consistency", message: `results.yaml effective_grade is stale in ${runDir} (recompute differs)` });
    }
    for (const s of r.scenarios) {
      if (s.override !== null) {
        if (!s.note || !s.note.trim()) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no note (${runDir})` });
        if (findTranscriptFiles(runDir, s.id, r.mode).length === 0) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no preserved transcript (${runDir})` });
      }
    }
  }
  return findings;
}

/** All committed run dirs under a skill's tests/results (<tag>/<timestamp>/results.yaml). Empty if none. */
function enumerateRunDirs(resultsRoot: string): string[] {
  if (!existsSync(resultsRoot)) return [];
  const out: string[] = [];
  for (const tag of readdirSync(resultsRoot)) {
    const tagDir = join(resultsRoot, tag);
    if (!statSync(tagDir).isDirectory()) continue;
    for (const ts of readdirSync(tagDir)) {
      const runDir = join(tagDir, ts);
      if (statSync(runDir).isDirectory() && existsSync(join(runDir, "results.yaml"))) out.push(runDir);
    }
  }
  return out;
}
