import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./spec.js";
import { readResults, effectiveVerdicts, type ResultsFile } from "./results.js";
import type { Verdict } from "./score.js";

export interface TrendCell { verdict: Verdict; suspect: boolean; flakiness?: number; }
export interface TrendRun {
  timestamp: string;
  label: string | null;
  grade: ResultsFile["effective_grade"];
  cells: Record<string, TrendCell>;
}
export interface TrendModel { model: string; tag: string; runs: TrendRun[]; truncated: boolean; skipped: number; }
export interface TrendData {
  skill: string;
  scenarios: { id: string; title: string; critical: boolean }[];
  models: TrendModel[];
}

/** A directory that exists right now; false (never throws) if it vanished concurrently (e.g. ENOENT). */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Per model-tag, read the full run history (not just the latest) from
 * <skillDir>/tests/results/, chronologically (timestamp-slug dir names sort
 * correctly), keeping the most recent `limit` runs. Each run's cell carries the
 * override-aware verdict + suspect (matching `effectiveVerdicts`'s canonical
 * rule: an override resolves a misfire) + reps flakiness. Read-only; no
 * absolute paths in the result.
 *
 * Only scored (mode === "green") runs are included in the history — a
 * red/force run has no real grade (`effective_grade` is a "not scored"
 * placeholder; see run.ts) and would otherwise plot as a misleading 0% dip in
 * the sparkline/grid. Non-green runs are deliberately excluded, which is
 * distinct from `skipped`: a run's mode can only be known after reading its
 * results.yaml, so every candidate run-dir in the tag is read (not just the
 * most recent `limit`) before filtering to green and applying the `limit`
 * window — trends is a bounded, on-demand, local view, so this extra read
 * cost is acceptable. If a tag has zero green runs, it's omitted entirely.
 *
 * A run whose `results.yaml` fails to parse (e.g. an interrupted non-atomic
 * write) is logged via `console.warn` and skipped — never surfaced or thrown —
 * and counted in that model's `skipped`. `truncated` reflects only the
 * run-count cap on the green-run history (more green runs existed than
 * `limit`), not parse-skips or mode-excluded runs.
 */
export function collectTrends(skillDir: string, limit = 20): TrendData {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));

  const resultsRoot = join(skillDir, "tests", "results");
  const models: TrendModel[] = [];
  if (existsSync(resultsRoot)) {
    const tags = readdirSync(resultsRoot)
      .filter((n) => isDir(join(resultsRoot, n)))
      .sort();
    for (const tag of tags) {
      const tagDir = join(resultsRoot, tag);
      const runDirs = readdirSync(tagDir)
        .map((n) => join(tagDir, n))
        .filter((p) => isDir(p) && existsSync(join(p, "results.yaml")))
        .sort(); // timestamp-slug dir names ⇒ chronological ascending
      if (runDirs.length === 0) continue;

      // Read every candidate run (mode isn't knowable from the dir name) and
      // filter to green (scored) runs before applying the `limit` window —
      // filtering after the slice would let red/force runs consume window
      // slots, undercounting the green history even when more exists.
      const greenRuns: ResultsFile[] = [];
      let skipped = 0;
      for (const rd of runDirs) {
        let r: ResultsFile;
        try {
          r = readResults(rd);
        } catch (e) {
          // A corrupt/truncated results.yaml must not take down the whole
          // trends view — skip that run, but surface the failure.
          console.warn(`skill-harness trends: skipping unreadable run ${rd}: ${e instanceof Error ? e.message : e}`);
          skipped++;
          continue;
        }
        if (r.mode !== "green") continue; // not scored — deliberate exclusion, not a skip
        greenRuns.push(r);
      }
      if (greenRuns.length === 0) continue;

      const truncated = greenRuns.length > limit;
      const kept = greenRuns.slice(-limit); // most recent `limit`, newest last
      const runs: TrendRun[] = [];
      let model = "";
      for (const r of kept) {
        // effectiveVerdicts is the single source of truth for the
        // override-aware verdict/suspect rule (suspect = s.suspect &&
        // s.override == null — an override resolves the misfire); zip in
        // flakiness from the matching ScenarioResult.
        const verdicts = effectiveVerdicts(r.scenarios);
        const cells: Record<string, TrendCell> = {};
        r.scenarios.forEach((s, i) => {
          cells[s.id] = { verdict: verdicts[i].verdict, suspect: verdicts[i].suspect ?? false, flakiness: s.flakiness };
        });
        runs.push({ timestamp: r.timestamp, label: r.label, grade: r.effective_grade, cells });
        model = r.model; // last successfully-read run (kept is ascending) wins
      }
      models.push({ model, tag, runs, truncated, skipped });
    }
  }
  return { skill: spec.skill, scenarios, models };
}
