import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./spec.js";
import { readResults, type ResultsFile } from "./results.js";
import type { Verdict } from "./score.js";

export interface TrendCell { verdict: Verdict; suspect: boolean; flakiness?: number; }
export interface TrendRun {
  timestamp: string;
  label: string | null;
  grade: ResultsFile["effective_grade"];
  cells: Record<string, TrendCell>;
}
export interface TrendModel { model: string; tag: string; runs: TrendRun[]; truncated: boolean; }
export interface TrendData {
  skill: string;
  scenarios: { id: string; title: string; critical: boolean }[];
  models: TrendModel[];
}

/**
 * Per model-tag, read the full run history (not just the latest) from
 * <skillDir>/tests/results/, chronologically (timestamp-slug dir names sort
 * correctly), keeping the most recent `limit` runs. Each run's cell carries the
 * override-aware verdict + suspect + reps flakiness. Read-only; no absolute
 * paths in the result.
 */
export function collectTrends(skillDir: string, limit = 20): TrendData {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));

  const resultsRoot = join(skillDir, "tests", "results");
  const models: TrendModel[] = [];
  if (existsSync(resultsRoot)) {
    const tags = readdirSync(resultsRoot)
      .map((n) => join(resultsRoot, n))
      .filter((p) => statSync(p).isDirectory())
      .sort();
    for (const tagDir of tags) {
      const runDirs = readdirSync(tagDir)
        .map((n) => join(tagDir, n))
        .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "results.yaml")))
        .sort(); // timestamp-slug dir names ⇒ chronological ascending
      if (runDirs.length === 0) continue;
      const truncated = runDirs.length > limit;
      const kept = runDirs.slice(-limit); // most recent `limit`, newest last
      const runs: TrendRun[] = kept.map((rd) => {
        const r = readResults(rd);
        const cells: Record<string, TrendCell> = {};
        for (const s of r.scenarios) {
          cells[s.id] = { verdict: s.override ?? s.judge_verdict, suspect: s.suspect ?? false, flakiness: s.flakiness };
        }
        return { timestamp: r.timestamp, label: r.label, grade: r.effective_grade, cells };
      });
      const model = readResults(kept[kept.length - 1]).model;
      models.push({ model, tag: tagDir.split("/").pop()!, runs, truncated });
    }
  }
  return { skill: spec.skill, scenarios, models };
}
