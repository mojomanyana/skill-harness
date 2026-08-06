import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSpec } from "./spec.js";
import { readResults, effectiveVerdicts, isScoredMode, type ResultsFile } from "./results.js";
import type { Verdict } from "./score.js";

export interface TrendCell { verdict: Verdict; suspect: boolean; flakiness?: number; }
export interface TrendRun {
  timestamp: string;
  label: string | null;
  grade: ResultsFile["effective_grade"];
  cells: Record<string, TrendCell>;
}
export interface TrendModel {
  model: string;
  tag: string;
  /**
   * The delivery mode every run in this series shares (`green` or `force`).
   *
   * A series is per tag AND per mode, never pooled: the two modes are different
   * deliveries of the same text, and placement moves verdicts in both directions at
   * once (measured on identical skill text: `build` A1 0/3 → 3/3 with force, `plan`
   * C2 3/3 → 0/3). A sparkline that ran green then force would draw that epoch
   * change as skill progress — or regression — which is the one thing a trend line
   * must not invent.
   */
  mode: string;
  runs: TrendRun[];
  truncated: boolean;
  skipped: number;
}
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

/** One model tag's scored run history in ONE delivery mode, chronologically ascending. */
export interface ScoredRunGroup {
  tag: string; // <harness>-<modelslug> dir name
  mode: string; // green | force — never red, and never two modes in one group
  model: string; // provider:model token, from the newest run read
  runs: ResultsFile[];
  /** Runs in this tag whose results.yaml could not be parsed (per tag, not per mode). */
  skipped: number;
}

/**
 * Walk `<skillDir>/tests/results/` and group every SCORED run by model tag × delivery
 * mode, chronologically (timestamp-slug dir names sort correctly).
 *
 * The single history reader: `collectTrends` renders it, `collectStability` derives
 * run-over-run flips from it. Two walkers over the same tree is how "which runs count"
 * drifts — the mistake that had force runs excluded from scoring in seven places at
 * once (see SCORED_MODES).
 *
 * Red runs are excluded: a baseline has no grade, and pairing it with anything would
 * compare a skill-off run to a skill-on one. Green and force are never pooled into one
 * group — placement moves verdicts, so a green run and a force run of the same scenario
 * are two measurements, not two samples.
 *
 * A run whose `results.yaml` fails to parse (e.g. an interrupted non-atomic write) is
 * logged via `console.warn`, skipped, and counted in `skipped` — never thrown, because
 * one torn file must not take down a whole read-only view.
 */
export function collectScoredRuns(skillDir: string): ScoredRunGroup[] {
  const resultsRoot = join(skillDir, "tests", "results");
  if (!existsSync(resultsRoot)) return [];
  const groups: ScoredRunGroup[] = [];
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

    // Every candidate run is read: a run's mode is not knowable from its dir name, so
    // filtering has to happen after the read. Bucketed by mode in first-seen order.
    const byMode = new Map<string, ResultsFile[]>();
    let skipped = 0;
    for (const rd of runDirs) {
      let r: ResultsFile;
      try {
        r = readResults(rd);
      } catch (e) {
        console.warn(`skill-harness: skipping unreadable run ${rd}: ${e instanceof Error ? e.message : e}`);
        skipped++;
        continue;
      }
      if (!isScoredMode(r.mode)) continue; // baseline — deliberate exclusion, not a skip
      (byMode.get(r.mode) ?? byMode.set(r.mode, []).get(r.mode)!).push(r);
    }
    for (const [mode, runs] of byMode) {
      // `skipped` is per tag (an unreadable run has no knowable mode), so a tag with
      // two series reports the same count on both — the alternative is attributing a
      // parse failure to a mode nobody could read.
      groups.push({ tag, mode, model: runs[runs.length - 1].model, runs, skipped });
    }
  }
  return groups;
}

/**
 * Per model-tag, read the full run history (not just the latest) from
 * <skillDir>/tests/results/, chronologically (timestamp-slug dir names sort
 * correctly), keeping the most recent `limit` runs. Each run's cell carries the
 * override-aware verdict + suspect (matching `effectiveVerdicts`'s canonical
 * rule: an override resolves a misfire) + reps flakiness. Read-only; no
 * absolute paths in the result.
 *
 * Only scored runs are included in the history — a red baseline has no real grade
 * (`effective_grade` is a "not scored" placeholder; see run.ts) and would otherwise
 * plot as a misleading 0% dip in the sparkline/grid. Red runs are deliberately
 * excluded, which is distinct from `skipped`: a run's mode can only be known after
 * reading its results.yaml, so every candidate run-dir in the tag is read (not just
 * the most recent `limit`) before filtering and applying the `limit` window —
 * trends is a bounded, on-demand, local view, so this extra read cost is
 * acceptable.
 *
 * Green and force runs both count, but never in the same series: a tag with both
 * yields one TrendModel per mode (see `TrendModel.mode`), each with its own
 * `limit` window. A tag with no scored run at all is omitted entirely.
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

  const models: TrendModel[] = [];
  for (const group of collectScoredRuns(skillDir)) {
    const truncated = group.runs.length > limit;
    const kept = group.runs.slice(-limit); // most recent `limit`, newest last
    const runs: TrendRun[] = [];
    for (const r of kept) {
      // effectiveVerdicts is the single source of truth for the override-aware
      // verdict/suspect rule (suspect = s.suspect && s.override == null — an override
      // resolves the misfire); zip in flakiness from the matching ScenarioResult.
      const verdicts = effectiveVerdicts(r.scenarios);
      const cells: Record<string, TrendCell> = {};
      r.scenarios.forEach((s, i) => {
        cells[s.id] = { verdict: verdicts[i].verdict, suspect: verdicts[i].suspect ?? false, flakiness: s.flakiness };
      });
      runs.push({ timestamp: r.timestamp, label: r.label, grade: r.effective_grade, cells });
    }
    models.push({ model: group.model, tag: group.tag, mode: group.mode, runs, truncated, skipped: group.skipped });
  }
  return { skill: spec.skill, scenarios, models };
}
