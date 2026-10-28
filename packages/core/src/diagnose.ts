import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { readResults, findTranscriptFiles } from "./results.js";
import { loadSpec } from "./spec.js";
import { currentHashFor, isSupersededKey, remedyForKey, scenarioIdForKey } from "./sources.js";
import { inspectEvalAuthoring, authoringEvidenceProfile, fixtureInventory } from "./authoring-preflight.js";
import { planSavedAnswers, type SavedAnswerPlan } from "./saved-run.js";
import { reportCriterionDimensions, type CriterionDimensionReport } from "./criterion-dimensions.js";

export interface Diagnosis {
  schema: 1;
  runDir: string;
  providerCalls: 0;
  resultsChanged: false;
  causalConclusion: "not-established";
  reusePlan: SavedAnswerPlan;
  criterionDimensions: CriterionDimensionReport;
  issues: { category: "evidence" | "configuration" | "judge" | "behavior" | "authoring"; scenario?: string; evidence: string; next: string }[];
}

/** Explain the cheapest next investigation using saved records, never invent a root cause. */
export function diagnoseRun(runDir: string, skillDir: string, specPath: string): Diagnosis {
  const results = readResults(runDir);
  const spec = loadSpec(specPath);
  const report: Diagnosis = { schema: 1, runDir: resolve(runDir), providerCalls: 0, resultsChanged: false, causalConclusion: "not-established", reusePlan: planSavedAnswers(runDir, spec, skillDir, dirname(specPath)), criterionDimensions: reportCriterionDimensions(runDir, spec, dirname(specPath), results), issues: [] };
  const add = (issue: Diagnosis["issues"][number]) => report.issues.push(issue);
  const context = { skillDir, specDir: dirname(specPath), scenarios: spec.scenarios, judgePersona: spec.judge_persona };
  if (!results.source_hashes) add({ category: "evidence", evidence: "This run has no source identity hashes.", next: "Inspect retained inputs; do not claim comparability to current inputs." });
  for (const [key, previous] of Object.entries(results.source_hashes ?? {})) {
    if (isSupersededKey(key, results.source_hashes!)) continue;
    const current = currentHashFor(key, context);
    if (current === undefined || current !== previous) add({ category: "configuration", scenario: scenarioIdForKey(key, spec.scenarios), evidence: `${key}: ${current === undefined ? "not comparable" : "changed or unavailable"}`, next: remedyForKey(key) });
  }
  for (const hint of inspectEvalAuthoring(spec, { ...authoringEvidenceProfile(dirname(specPath)), fixtureFiles: scenario => {
    const fixture = typeof scenario.workspace === "object" ? scenario.workspace.fixture : scenario.fixture;
    try { return fixture ? fixtureInventory(resolve(dirname(specPath), fixture)) : []; } catch { return []; }
  } })) add({ category: "authoring", scenario: hint.scenario, evidence: `${hint.code}: ${hint.message}`, next: "Review this contract using positive, negative and equivalent-answer controls; a heuristic is not proof the eval is wrong." });
  for (const scenario of results.scenarios) {
    const transcripts = findTranscriptFiles(runDir, scenario.id, results.mode);
    if (transcripts.length < (scenario.reps ?? 1)) add({ category: "evidence", scenario: scenario.id, evidence: "Some subject transcripts are unavailable.", next: "Recover original evidence if possible; missing output is not a model failure." });
    if (scenario.judge_verdict === "ERROR" || scenario.objective?.status === "ERROR") {
      add({ category: "evidence", scenario: scenario.id, evidence: scenario.judge_reason, next: "Inspect execution/transport and capture errors before evaluating model quality." });
    } else if (scenario.objective?.status === "FAIL") {
      add({ category: "behavior", scenario: scenario.id, evidence: "An objective assertion failed.", next: "Check the assertion against the trace and agreed behavior; use regate after gate-only corrections, without rerunning the subject." });
    } else if (scenario.suspect || (scenario.ungraded_reps ?? 0) > 0) {
      add({ category: "judge", scenario: scenario.id, evidence: "Judge output is inconsistent or incomplete.", next: "Inspect exact judge inputs and calibrate the judge before regrading saved transcripts." });
    } else if (scenario.judge_verdict === "FAIL") {
      add({ category: "behavior", scenario: scenario.id, evidence: scenario.judge_reason, next: "Compare the answer to references and calibrated controls. A recorded failure alone does not distinguish a skill/model defect from a bad rubric or judge." });
    }
    for (const panel of scenario.rep_judgments ?? []) for (const judgment of panel.judgments) {
      if (!judgment.input) continue;
      const input = judgment.input;
      const path = resolve(runDir, input.artifact);
      let valid = false;
      try {
        const rel = relative(realpathSync(runDir), realpathSync(path));
        valid = !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + (process.platform === "win32" ? "\\" : "/"))
          && existsSync(path) && createHash("sha256").update(readFileSync(path)).digest("hex") === input.sha256;
      } catch { /* Missing or outside evidence is not verified. */ }
      if (!valid) add({ category: "evidence", scenario: scenario.id, evidence: "Recorded judge input is missing, outside the run, or hash-mismatched.", next: "Recover the bound original before making a claim about what the judge saw." });
    }
  }
  return report;
}
