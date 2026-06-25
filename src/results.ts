import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { modelSlug, type ModelRef } from "./adapters/types.js";
import type { Verdict } from "./score.js";

export interface ScenarioResult {
  id: string;
  judge_verdict: Verdict;
  judge_reason: string;
  override: Verdict | null; // author's call: null | PASS | FAIL (ERROR never used as override)
  note: string; // author's free-text note
}

export interface GradeSummary {
  passed: number;
  total: number;
  pct: number;
  letter: string;
  ship: boolean;
  note: string;
}

export interface ResultsFile {
  skill: string;
  harness: string;
  model: string; // provider:model token under test
  judge: { provider: string; model: string };
  timestamp: string;
  grade: GradeSummary;
  scenarios: ScenarioResult[];
}

/** Slugify an ISO timestamp into a filesystem-safe directory name. */
function timestampSlug(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

/** <skillDir>/tests/results/<harness>-<model-slug>/<timestamp-slug>/ */
export function runDirFor(skillDir: string, harness: string, model: ModelRef, timestamp: string): string {
  return join(skillDir, "tests", "results", `${harness}-${modelSlug(model)}`, timestampSlug(timestamp));
}

/** Path of a transcript file within a run dir. */
export function transcriptPath(runDir: string, scenarioId: string, mode: string): string {
  return join(runDir, `${scenarioId}.${mode}.txt`);
}

export function reportPath(runDir: string): string {
  return join(runDir, "report.html");
}

export function resultsPath(runDir: string): string {
  return join(runDir, "results.yaml");
}

/** Write results.yaml (creating the run dir). */
export function writeResults(runDir: string, results: ResultsFile): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resultsPath(runDir), yaml.dump(results, { lineWidth: 100 }), "utf8");
}

/** Read results.yaml from a run dir. */
export function readResults(runDir: string): ResultsFile {
  const text = readFileSync(resultsPath(runDir), "utf8");
  return yaml.load(text) as ResultsFile;
}

/** Pure: return a copy with override + note applied to one scenario. */
export function applyOverride(
  results: ResultsFile,
  scenarioId: string,
  override: Verdict | null,
  note: string
): ResultsFile {
  let found = false;
  const scenarios = results.scenarios.map((s) => {
    if (s.id !== scenarioId) return s;
    found = true;
    return { ...s, override, note };
  });
  if (!found) {
    throw new Error(`no scenario \`${scenarioId}\` in results`);
  }
  return { ...results, scenarios };
}

const GITIGNORE_BODY = `# skill-check: commit verdicts (results.yaml), ignore generated artifacts.
*.txt
report.html
!results.yaml
`;

/** Write a results/.gitignore so transcripts + report are ignored but results.yaml is tracked. */
export function ensureResultsGitignore(resultsRoot: string): void {
  mkdirSync(resultsRoot, { recursive: true });
  const giPath = join(resultsRoot, ".gitignore");
  if (!existsSync(giPath)) {
    writeFileSync(giPath, GITIGNORE_BODY, "utf8");
  }
}
