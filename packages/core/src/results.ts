import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import yaml from "js-yaml";
import { modelSlug, type ModelRef } from "./adapters/types.js";
import { score, type ScenarioVerdict } from "./score.js";
import type { Verdict } from "./score.js";
import type { ShipBar } from "./spec.js";

export interface ScenarioResult {
  id: string;
  judge_verdict: Verdict;
  judge_reason: string;
  suspect: boolean; // judge misfire (verdict disagrees with AND(items)); majority-misfired over reps
  override: Verdict | null; // author's call: null | PASS | FAIL (ERROR never used as override)
  note: string; // author's free-text note
  reps?: number; // number of reps run (omitted / 1 for a single run)
  passes?: number; // PASSes among clean reps (reps runs only)
  clean?: number; // number of clean (non-misfired) reps — the real denominator for `passes` (reps runs only)
  flakiness?: number; // 0 = unanimous, 1 = even split (reps runs only)
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
  schema: 2;
  skill: string;
  harness: string;
  model: string; // provider:model token under test
  judge: { provider: string; model: string };
  timestamp: string;
  label: string | null; // run label, e.g. "round-3" — ends timestamp-dir archaeology
  mode: string; // red | green | force
  effective_grade: GradeSummary; // always override-aware; only finalizeResults writes it
  scenarios: ScenarioResult[];
}

/** Everything a caller may set. The grade is computed, never supplied. */
export type ResultsDraft = Omit<ResultsFile, "schema" | "effective_grade">;

export interface ScoreContext {
  shipBar: ShipBar;
  critical: string[];
}

/** Slugify an ISO timestamp into a filesystem-safe directory name. */
function timestampSlug(iso: string): string {
  return iso.replace(/[:.]/g, "-");
}

/** <skillDir>/tests/results/<harness>-<model-slug>/<timestamp-slug>/ */
export function runDirFor(skillDir: string, harness: string, model: ModelRef, timestamp: string): string {
  return join(skillDir, "tests", "results", `${harness}-${modelSlug(model)}`, timestampSlug(timestamp));
}

/** Path of a transcript file within a run dir. A rep index (for --reps N>1) is suffixed. */
export function transcriptPath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.txt`);
}

export function reportPath(runDir: string): string {
  return join(runDir, "report.html");
}

export function resultsPath(runDir: string): string {
  return join(runDir, "results.yaml");
}

/** The verdict that counts: author override when present, else the judge's. */
export function effectiveVerdicts(scenarios: ScenarioResult[]): ScenarioVerdict[] {
  return scenarios.map((s) => ({
    id: s.id,
    verdict: s.override ?? s.judge_verdict,
    suspect: s.suspect && s.override == null, // an override resolves the misfire
  }));
}

/**
 * The ONLY place effective_grade is computed. Every writer goes through here,
 * so a persisted grade can never disagree with verdicts + overrides.
 * ctx is null for unscored (red/force) runs.
 */
export function finalizeResults(draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile {
  let effective_grade: GradeSummary;
  if (ctx) {
    const s = score(effectiveVerdicts(draft.scenarios), { shipBar: ctx.shipBar, critical: ctx.critical });
    effective_grade = { passed: s.passed, total: s.total, pct: s.pct, letter: s.letter, ship: s.ship, note: s.note };
  } else {
    effective_grade = { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: `mode=${draft.mode} (not scored)` };
  }
  return {
    schema: 2,
    skill: draft.skill,
    harness: draft.harness,
    model: draft.model,
    judge: draft.judge,
    timestamp: draft.timestamp,
    label: draft.label,
    mode: draft.mode,
    effective_grade,
    scenarios: draft.scenarios,
  };
}

/** Finalize + persist results.yaml (creating the run dir). Returns what was written. */
export function writeResults(runDir: string, draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile {
  const results = finalizeResults(draft, ctx);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(resultsPath(runDir), yaml.dump(results, { lineWidth: 100 }), "utf8");
  return results;
}

const SUSPECT_PREFIX_RE = /^\[suspect misfire[^\]]*\]\s*/;

/** Read-only schema-1 → schema-2 migration. Never rewrites the file on disk. */
export function migrateResults(raw: unknown): ResultsFile {
  if (raw == null || typeof raw !== "object") {
    throw new Error("empty or invalid results.yaml");
  }
  const o = raw as Record<string, unknown>;
  if (o.schema === 2) return raw as ResultsFile;
  const v1 = raw as {
    skill: string; harness: string; model: string;
    judge: { provider: string; model: string };
    timestamp: string;
    grade: GradeSummary;
    scenarios: Array<Omit<ScenarioResult, "suspect">>;
  };
  const modeMatch = /^mode=(\w+)/.exec(v1.grade?.note ?? "");
  return {
    schema: 2,
    skill: v1.skill,
    harness: v1.harness,
    model: v1.model,
    judge: v1.judge,
    timestamp: v1.timestamp,
    label: null,
    mode: modeMatch ? modeMatch[1] : "green",
    // v1 grades may predate override-aware recompute; carried verbatim (read-only).
    // Every v2 WRITE recomputes, so staleness cannot propagate.
    effective_grade: v1.grade,
    scenarios: (v1.scenarios ?? []).map((s) => {
      const reason = s.judge_reason ?? "";
      return {
        ...s,
        override: s.override ?? null,
        note: s.note ?? "",
        suspect: SUSPECT_PREFIX_RE.test(reason),
        judge_reason: reason.replace(SUSPECT_PREFIX_RE, ""),
      };
    }),
  };
}

/** Read results.yaml from a run dir, migrating schema-1 files in memory. */
export function readResults(runDir: string): ResultsFile {
  const text = readFileSync(resultsPath(runDir), "utf8");
  return migrateResults(yaml.load(text));
}

/** Pure: return a copy with override + note applied to one scenario. */
export function applyOverride(
  results: ResultsFile,
  scenarioId: string,
  override: Verdict | null,
  note: string
): ResultsFile {
  if (override !== null && note.trim() === "") {
    throw new Error(`override for \`${scenarioId}\` requires a note — say why the judge was wrong`);
  }
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
*.jsonl
report.html
!results.yaml
`;

/**
 * Manage results/.gitignore: transcripts + reports ignored, results.yaml tracked.
 * Rewrites a stale managed body (so new ignore rules roll out) while keeping any
 * `!…` preservation lines added by preserveTranscript.
 */
export function ensureResultsGitignore(resultsRoot: string): void {
  mkdirSync(resultsRoot, { recursive: true });
  const giPath = join(resultsRoot, ".gitignore");
  const existing = existsSync(giPath) ? readFileSync(giPath, "utf8") : "";
  if (existing.startsWith(GITIGNORE_BODY)) return;
  const preserved = existing
    .split("\n")
    .filter((l) => l.startsWith("!") && l.trim() !== "!results.yaml");
  writeFileSync(giPath, GITIGNORE_BODY + preserved.map((l) => l + "\n").join(""), "utf8");
}

// Matches both transcript (`.rep<k>.txt`) and judge-raw (`.rep<k>.judge.txt`) rep suffixes.
const REP_SUFFIX_RE = /\.rep(\d+)\.(?:judge\.)?txt$/;

/** Sort transcript-like filenames: plain (no rep) first, then by numeric rep index. */
function sortByRep(files: string[]): string[] {
  const repOf = (f: string): number | null => {
    const m = REP_SUFFIX_RE.exec(f);
    return m ? Number(m[1]) : null;
  };
  return files.sort((a, b) => {
    const ra = repOf(a);
    const rb = repOf(b);
    if (ra === null && rb === null) return a.localeCompare(b);
    if (ra === null) return -1;
    if (rb === null) return 1;
    return ra - rb;
  });
}

/**
 * ALL transcript files for a scenario in a run dir, sorted deterministically:
 * a plain `<id>.<mode>.txt` first (if present), then rep-suffixed files
 * (`<id>.<mode>.rep<k>.txt`) in numeric rep order. Empty if the run dir or
 * scenario has no transcripts.
 *
 * With `mode` given, only that mode's transcripts match (`<id>.<mode>.txt` /
 * `<id>.<mode>.rep<k>.txt`) — e.g. to detect a green-only condition without
 * false positives from a red/force transcript of the same scenario. Omitted,
 * behavior is unchanged: any `<id>.*.txt` regardless of mode, excluding this
 * scenario's judge-raw artifacts (`<id>.*.judge.txt` — see judgeRawPath).
 */
export function findTranscriptFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const escapedId = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher =
    mode !== undefined
      ? new RegExp(`^${escapedId}\\.${mode}(\\.rep\\d+)?\\.txt$`)
      : null;
  const files = readdirSync(runDir).filter((f) =>
    matcher ? matcher.test(f) : f.startsWith(`${scenarioId}.`) && f.endsWith(".txt") && !f.includes(".judge.")
  );
  return sortByRep(files);
}

/** Path of a scenario's raw judge-output artifact within a run dir (rep-suffixed for reps). */
export function judgeRawPath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.judge.txt`);
}

/** A scenario's raw judge-output files, sorted (plain first, then numeric rep). Mode-scoped when given. */
export function findJudgeRawFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === undefined
    ? new RegExp(`^${esc}\\..*\\.judge\\.txt$`)
    : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.judge\\.txt$`);
  return sortByRep(readdirSync(runDir).filter((f) => re.test(f)));
}

/** A single representative transcript file for a scenario in a run dir. Null if none. */
export function findTranscriptFile(runDir: string, scenarioId: string): string | null {
  return findTranscriptFiles(runDir, scenarioId)[0] ?? null;
}

/**
 * Un-gitignore ALL of a scenario's transcript files (audit trail for an
 * override — a --reps run has one transcript per rep, and every rep that
 * drove the verdict must survive a commit, not just an arbitrary one).
 * Appends `!<tag>/<ts>/<id>.<mode>[.rep<k>].txt` to results/.gitignore for
 * each, once. The path uses POSIX separators so the negation matches on
 * Windows too (git ignore patterns are always forward-slashed).
 */
export function preserveTranscript(resultsRoot: string, runDir: string, scenarioId: string): void {
  const files = findTranscriptFiles(runDir, scenarioId);
  if (files.length === 0) return;
  ensureResultsGitignore(resultsRoot);
  const giPath = join(resultsRoot, ".gitignore");
  const existingLines = readFileSync(giPath, "utf8").split("\n");
  const newLines: string[] = [];
  for (const file of files) {
    const rel = relative(resultsRoot, join(runDir, file)).split(sep).join("/");
    const line = `!${rel}`;
    if (!existingLines.includes(line) && !newLines.includes(line)) {
      newLines.push(line);
    }
  }
  if (newLines.length > 0) {
    appendFileSync(giPath, newLines.map((l) => l + "\n").join(""), "utf8");
  }
}
