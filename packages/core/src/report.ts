import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadSpec, type ShipBar } from "./spec.js";
import { readResults, type ResultsFile } from "./results.js";

export interface RunColumn {
  index: number;
  label: string; // model token
  tag: string; // harness-modelslug dir name
  runDir: string; // absolute path (server-side only)
  timestamp: string;
  grade: ResultsFile["effective_grade"];
  judge: ResultsFile["judge"];
  cells: Record<string, { judge_verdict: string; judge_reason: string; suspect: boolean; override: string | null; note: string }>;
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
      const cells: RunColumn["cells"] = {};
      for (const s of r.scenarios) {
        cells[s.id] = {
          judge_verdict: s.judge_verdict,
          judge_reason: s.judge_reason,
          suspect: s.suspect ?? false, // schema-1 files lack the field until Task 2's migration
          override: s.override,
          note: s.note,
        };
      }
      columns.push({
        index: columns.length,
        label: r.model,
        tag: tagDir.split("/").pop()!,
        runDir,
        timestamp: r.timestamp,
        grade: r.effective_grade,
        judge: r.judge,
        cells,
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
      grade: c.grade,
      judge: c.judge,
      cells: c.cells,
    })),
  };
}

/** Inject the run JSON into the template at the __DATA__ placeholder. */
export function renderReport(template: string, data: ReportData): string {
  const json = JSON.stringify(publicView(data));
  return template
    .replace("/*__DATA__*/null", json)
    .replace("__SKILL__", data.skill);
}
