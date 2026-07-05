import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { loadSpec, SpecError } from "./spec.js";

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

  // (Task 2 inserts the results-consistency block here.)
  return findings;
}
