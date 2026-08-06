import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSpec, type ShipBar } from "./spec.js";
import { readResults, type ResultsFile } from "./results.js";
import { collectLift, liftHeadline, type Lift } from "./lift.js";
import { boundaryCells, collectStability, stabilityNote } from "./stability.js";

export interface RunColumn {
  index: number;
  label: string; // model token
  tag: string; // harness-modelslug dir name
  runDir: string; // absolute path (server-side only)
  timestamp: string;
  mode: string; // red | green | force — green and force are scored, red is the unscored baseline
  grade: ResultsFile["effective_grade"];
  judge: ResultsFile["judge"];
  cells: Record<string, {
    judge_verdict: string; judge_reason: string; suspect: boolean;
    reps?: number; passes?: number; clean?: number; flakiness?: number;
    override: string | null; note: string;
    /**
     * Run-over-run history for this cell, derived from the tag's other runs in the
     * SAME mode. Present only for a cell that flipped (`state: "boundary"`) — a
     * marker on every cell would bury the one signal it exists to show, and the
     * per-cell `flakiness` beside it is a within-run number that cannot see this.
     */
    stability?: { flips: number; compared: number; volatility: number | null; note: string };
  }>;
  /**
   * Baseline-vs-skill lift for this model, when the tag has both a red baseline and
   * a skill-delivered run (green or force). Undefined means "never measured" —
   * which is not the same claim as a zero lift, so the report must not render a 0
   * for it.
   *
   * Only set when THIS column is the skill-side run the lift was computed from (see
   * collectReport): the review UI recomputes lift from the column's live cells,
   * which is only valid if those cells are the skill side of the comparison.
   */
  lift?: Lift;
  liftHeadline?: string;
}

export interface ReportData {
  skill: string;
  shipBar: ShipBar;
  critical: string[];
  scenarios: { id: string; title: string; critical: boolean }[];
  columns: RunColumn[];
}

/** Most-recent run dir (by name, which is an ISO-ish slug) under a model-tag dir. */
function latestRunDir(tagDir: string): string | null {
  if (!statSync(tagDir).isDirectory()) return null;
  const runs = readdirSync(tagDir)
    .map((n) => join(tagDir, n))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "results.yaml")))
    .sort();
  return runs.length ? runs[runs.length - 1] : null;
}

/**
 * Collect the latest run per model-tag under <skillDir>/tests/results/, plus the
 * scenario list from the spec (for titles + order). One column per model.
 */
export function collectReport(skillDir: string): ReportData {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const scenarios = spec.scenarios.map((s) => ({ id: s.id, title: s.title, critical: s.critical }));

  const resultsRoot = join(skillDir, "tests", "results");
  // Lift is keyed by model tag, the same key columns are built from.
  const liftByTag = new Map(collectLift(skillDir).map((l) => [l.tag, l]));
  // Stability is keyed by tag + mode + scenario: a column shows one delivery mode, and
  // green and force histories are never one series (placement moves verdicts).
  const boundaryByCell = new Map(
    boundaryCells(collectStability(skillDir)).map((c) => [`${c.tag}\u0000${c.mode}\u0000${c.id}`, c]),
  );
  const columns: RunColumn[] = [];
  if (existsSync(resultsRoot)) {
    const tags = readdirSync(resultsRoot)
      .map((n) => join(resultsRoot, n))
      .filter((p) => statSync(p).isDirectory())
      .sort();
    for (const tagDir of tags) {
      const runDir = latestRunDir(tagDir);
      if (!runDir) continue;
      const r = readResults(runDir);
      const tagName = tagDir.split("/").pop()!;
      const cells: RunColumn["cells"] = {};
      for (const s of r.scenarios) {
        const boundary = boundaryByCell.get(`${tagName}\u0000${r.mode}\u0000${s.id}`);
        cells[s.id] = {
          ...(boundary
            ? {
                stability: {
                  flips: boundary.flips, compared: boundary.compared,
                  volatility: boundary.volatility, note: stabilityNote(boundary),
                },
              }
            : {}),
          judge_verdict: s.judge_verdict,
          judge_reason: s.judge_reason,
          suspect: s.suspect ?? false, // suspect defaults false for older results that predate the field
          reps: s.reps,
          passes: s.passes,
          clean: s.clean,
          flakiness: s.flakiness,
          override: s.override,
          note: s.note,
        };
      }
      const tag = tagName;
      // A column is the tag's LATEST run, which is not necessarily the skill-side
      // one — record a red baseline after a green run and the newest run in the tag
      // is red. The review UI recomputes lift from `cells` (so author overrides move
      // it live), so attaching a lift to a column whose cells are the RED run
      // would have it compare red against red and report "no effect" for a skill
      // that in fact gained every scenario. Attach only when this column IS the
      // skill side of the comparison — matched on the timestamp, which also keeps a
      // green column from borrowing a force run's lift and vice versa.
      const tagLift = liftByTag.get(tag);
      const lift = tagLift && tagLift.greenTimestamp === r.timestamp ? tagLift : undefined;
      columns.push({
        index: columns.length,
        label: r.model,
        tag,
        runDir,
        timestamp: r.timestamp,
        mode: r.mode,
        grade: r.effective_grade,
        judge: r.judge,
        cells,
        ...(lift ? { lift, liftHeadline: liftHeadline(lift) } : {}),
      });
    }
  }

  return { skill: spec.skill, shipBar: spec.ship_bar, critical: spec.critical, scenarios, columns };
}

/** Client-facing view (no absolute paths leaked). */
export function publicView(data: ReportData) {
  return {
    skill: data.skill,
    shipBar: data.shipBar,
    critical: data.critical,
    scenarios: data.scenarios,
    columns: data.columns.map((c) => ({
      index: c.index,
      label: c.label,
      tag: c.tag,
      timestamp: c.timestamp,
      mode: c.mode,
      grade: c.grade,
      judge: c.judge,
      cells: c.cells,
      ...(c.lift ? { lift: c.lift, liftHeadline: c.liftHeadline } : {}),
    })),
  };
}

/**
 * A bare inline <script> (no type="module") can't contain an `export`
 * statement, but assets/report.grade.js is written as real ESM so it can also
 * be imported directly (by Node, in the parity test). Strip the `export `
 * keyword off each exported declaration so the leftover plain function
 * declarations splice cleanly into the template's script scope.
 */
function stripExports(js: string): string {
  return js.replace(/^export\s+/gm, "");
}

/**
 * Inject the run JSON and the client-scorer module into the template, at the
 * __DATA__ and __GRADE__ placeholders respectively. `gradeScript` is the raw
 * contents of assets/report.grade.js (sibling of the template) — the single,
 * score.ts-parity-tested copy of the client grading logic.
 */
export function renderReport(template: string, data: ReportData, gradeScript: string): string {
  const json = JSON.stringify(publicView(data));
  return template
    .replace("/*__DATA__*/null", json)
    .replace("/*__GRADE__*/", stripExports(gradeScript))
    .replace("__SKILL__", data.skill);
}
