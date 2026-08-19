import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import yaml from "js-yaml";
import { modelSlug, type ModelRef } from "./adapters/types.js";
import { score, type ScenarioVerdict } from "./score.js";
import { HARNESS_VERSION } from "./version.js";
import type { Verdict } from "./score.js";
import type { ShipBar, Scenario } from "./spec.js";

export interface ScenarioMetrics {
  wall_time_ms: number;
  judge_calls: number;
  judge_rejudge_calls: number;
  subject_metrics_reps: number;
  total_reps: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  subject_cost_usd?: number;
  tool_calls?: number;
  delegated_children?: number;
  max_concurrency?: number;
}

/** Merge bookkeeping from a later judge/gate pass without duplicating subject usage. */
export function mergeScenarioMetrics(prior: ScenarioMetrics | undefined, fresh: ScenarioMetrics | undefined): ScenarioMetrics | undefined {
  if (!prior) return fresh;
  if (!fresh) return prior;
  const subject = prior.subject_metrics_reps > 0 ? prior : fresh;
  return {
    wall_time_ms: prior.wall_time_ms + fresh.wall_time_ms,
    judge_calls: prior.judge_calls + fresh.judge_calls,
    judge_rejudge_calls: prior.judge_rejudge_calls + fresh.judge_rejudge_calls,
    subject_metrics_reps: subject.subject_metrics_reps,
    total_reps: prior.total_reps,
    ...(subject.input_tokens === undefined ? {} : { input_tokens: subject.input_tokens }),
    ...(subject.output_tokens === undefined ? {} : { output_tokens: subject.output_tokens }),
    ...(subject.cache_read_tokens === undefined ? {} : { cache_read_tokens: subject.cache_read_tokens }),
    ...(subject.cache_write_tokens === undefined ? {} : { cache_write_tokens: subject.cache_write_tokens }),
    ...(subject.subject_cost_usd === undefined ? {} : { subject_cost_usd: subject.subject_cost_usd }),
    ...(subject.tool_calls === undefined ? {} : { tool_calls: subject.tool_calls }),
    ...(subject.delegated_children === undefined ? {} : { delegated_children: subject.delegated_children }),
    ...(subject.max_concurrency === undefined ? {} : { max_concurrency: subject.max_concurrency }),
  };
}

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
  pass_threshold?: number; // effective threshold used (reps runs only) — lets re-judge reproduce the aggregate
  /** Cost/latency counters. Separate from verdicts: cheaper failure is still failure. */
  metrics?: ScenarioMetrics;
  /**
   * Objective trace-gate evidence. ADDITIVE and optional.
   *
   * Absent means "the scenario declared no trace assertions" — NOT an objective
   * pass. Anything reading this must treat the two as different; collapsing them
   * would silently upgrade every legacy result to "objectively verified".
   */
  objective?: ObjectiveResult;
  /**
   * Confidence-aware adjudication. ADDITIVE and optional.
   *
   * Absent means historical single-judge behavior — NOT that judges agreed. An
   * unresolved adjudication additionally sets `suspect: true`, which is what
   * actually blocks SHIP; this field is the audit trail behind that flag.
   */
  adjudication?: AdjudicationResult;
}

/** One judge's answer for a cell, kept verbatim however the collapse turned out. */
export interface Judgment {
  /** 1-based: judgment 1 is the first-wave judge, 2 the secondary, 3 the tie-break. */
  ordinal: number;
  judge: { provider: string; model: string };
  verdict: Verdict;
  reason: string;
  /** The judge misfired — recorded, never counted as a clean vote. */
  suspect: boolean;
}

export interface AdjudicationResult {
  state: "confirmed" | "tie_broken" | "unresolved";
  /** Why the cell was re-judged. */
  trigger: "ambiguous" | "contradictory" | "non_unanimous" | "ship_deciding";
  /** Every judgment, in order. Never pruned — an author resolving this needs all of them. */
  judgments: Judgment[];
  /** The collapsed answer. Absent when unresolved. */
  verdict?: "PASS" | "FAIL";
}

/** Objective gate outcome for one scenario cell. */
export interface ObjectiveResult {
  /** ERROR means the evidence was missing or malformed — never a pass. */
  status: "PASS" | "FAIL" | "ERROR";
  trace_version?: number;
  trace_sha256?: string;
  trajectory_version?: string;
  events_sha256?: string;
  /** Per-repetition hashes retained when an aggregate has more than one rep. */
  rep_events_sha256?: string[];
  rep_trace_sha256?: string[];
  assertions: { kind: string; status: "PASS" | "FAIL" | "ERROR"; detail: string }[];
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
  /**
   * The harness version that wrote this file — provenance for the numbers in it.
   *
   * Optional because runs recorded before the field existed do not have one, and
   * inventing a version for them would fabricate provenance. Not part of `schema`:
   * 0.2.1 → 0.3.0 kept `schema: 2` while changing what a verdict means, which is
   * exactly the drift `schema` cannot express. Written by `finalizeResults`, so no
   * writer can forget it.
   */
  harness_version?: string;
  /**
   * The version of the harness CLI that produced the transcripts — `pi --version`
   * for `harness: pi`.
   *
   * Provenance for the *delivery*, not for the tool: pi 0.80.x wrapped a `--skill`
   * prompt with the skill body, pi 0.83.0 switched to progressive disclosure, and
   * that upgrade silently changed what `--mode green` measured. Two waves of runs
   * in the reference corpus are indistinguishable from a naked-model baseline, and
   * the incident is invisible in the artifacts precisely because nothing recorded
   * which pi ran.
   *
   * Written only by `run` (the command that actually invokes the harness) and
   * carried verbatim by every rewriter — `grade`/`rescore`/`regate` re-decide
   * verdicts, they do not re-deliver the skill, so re-stamping this field with
   * today's pi would attribute the old transcripts to a version that never
   * produced them. Optional: runs recorded before the field existed have none, and
   * an adapter that cannot report a version writes none rather than guessing.
   */
  harness_cli_version?: string;
  /**
   * `pass` when this run proved, before spending the wave, that the skill body was
   * reachable in the model's context (see canary.ts). `skipped` when the probe was
   * asked for but could not be performed — SKILL.md has no `## ` heading to quote
   * back, so no reply could prove anything. Absent means the probe was not asked
   * for — never that it failed, because a failed canary aborts the run and no
   * results.yaml is written.
   *
   * `skipped` exists because absent and skipped were the same value: a user who
   * passed `--canary` precisely because pi ≥ 0.83.0 delivery is unreliable got a
   * silently degraded probe, a fully billed wave, and a committed results.yaml
   * byte-identical to a run where delivery was never checked at all.
   *
   * Only green runs can carry it: red delivers nothing by design and force delivers
   * through the system prompt. It is provenance for the *validity* of a green run,
   * which is why it lives here rather than only in the journal — `journal.jsonl` is
   * gitignored, and this claim has to survive a commit.
   */
  delivery_canary?: "pass" | "skipped";
  skill: string;
  harness: string;
  model: string; // provider:model token under test
  judge: { provider: string; model: string };
  timestamp: string;
  label: string | null; // run label, e.g. "round-3" — ends timestamp-dir archaeology
  mode: string; // red | green | force — green and force are scored (see SCORED_MODES); red is the control
  /** True for an `--only`-filtered run: a scenario subset, never ship-graded, never a release run. */
  partial?: boolean;
  /**
   * sha256 of every source this run measured: SKILL.md, each distinct
   * system_prompt_file, each scenario's definition (`scenario:<id>`) and each
   * fixture tree (`fixture:<path>`). Lint compares the newest run's hashes against
   * the current sources — a mismatch means the published result describes inputs
   * that no longer exist (the stale-scorecard class this field exists to kill).
   * See sources.ts for the key scheme; runs recorded before a key kind existed
   * simply don't carry it, and are never retroactively flagged.
   */
  source_hashes?: Record<string, string>;
  effective_grade: GradeSummary; // always override-aware; only finalizeResults writes it
  scenarios: ScenarioResult[];
}

/**
 * The run modes whose results carry a real grade: the ones where the skill under
 * test was actually delivered to the model.
 *
 * `green` activates the skill through the harness's own mechanism (`pi --skill`);
 * `force` puts SKILL.md in the system prompt. Both are measurements OF THE SKILL,
 * so both are scored against the ship bar. `red` is the control — the model with
 * no skill — and scoring it would produce a ship grade for the thing the skill is
 * measured against.
 *
 * Force was unscored until 0.5.0, when it stopped being an escape hatch and became
 * a deployment: on pi 0.83.0 `--skill` switched to progressive disclosure (the
 * description is in context, the body loads on demand — "models don't always do
 * this"), so skill-as-system-prompt is the delivery a corpus can actually rely on.
 * Ten committed force runs in the reference corpus read `not scored` for exactly
 * that reason. Scored directly rather than behind a spec flag or a `--score-force`
 * opt-in: "was the skill in front of the model?" is a property of the mode, not a
 * per-repo preference, and a second knob would just be a second thing to forget.
 *
 * Consequence to expect, and it is the intended one: a force run recorded before
 * 0.5.0 carries a "not scored" placeholder grade that a recompute now disagrees
 * with, so `lint` flags it as stale and `rescore` (free) writes the real grade.
 *
 * The two modes are NOT interchangeable measurements of the same thing — placement
 * changes behavior in both directions (measured on identical skill text: `build` A1
 * 0/3 → 3/3, `plan` C2 3/3 → 0/3). Anything that plots or compares runs over time
 * therefore keeps the epochs apart rather than pooling them; see trends.ts.
 */
export const SCORED_MODES: readonly string[] = ["green", "force"];

/** Whether a run in this mode delivered the skill, and so has a grade worth computing. */
export function isScoredMode(mode: string): boolean {
  return SCORED_MODES.includes(mode);
}

/**
 * The one place "does this run get a grade?" is decided: the scoring mode gate plus
 * the `--only` partial gate, in one predicate every writer shares.
 *
 * Before 0.5.0 this ternary was open-coded in seven places (run, grade, rescore,
 * regate, lint, and both review-server writers) — which is how force runs came to
 * be unscored in all seven at once, and how any future mode would have had to be
 * remembered seven times.
 */
export function scoreContextFor(
  run: { mode: string; partial?: boolean },
  spec: { ship_bar: ShipBar; critical: string[] },
): ScoreContext | null {
  if (!isScoredMode(run.mode) || run.partial) return null;
  return { shipBar: spec.ship_bar, critical: spec.critical };
}

/** The pass-threshold a re-grade uses: the run's persisted value, else the spec's per-scenario value, else 0.5. */
export function effectiveThreshold(prevScenario: ScenarioResult | undefined, scenario: Scenario): number {
  // Critical includes destructive/security/capability/data-loss AND right-sizing
  // counterexamples. Every clean repetition must pass; an aggregate majority may
  // not hide one release-blocking failure.
  if (scenario.critical) return 1;
  return prevScenario?.pass_threshold ?? scenario.passThreshold ?? 0.5;
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

/**
 * The verdict that counts: author override when present, else the objective
 * gate, else the judge's.
 *
 * **The objective gate outranks the judge.** `assert.trace` is a mechanical
 * statement about what the model DID — it called `write`, it touched `.env`.
 * The judge is an LLM reading prose. When they disagree, the measurement wins.
 *
 * This is the only place that ordering is enforced, and it has to be here.
 * `objective` used to reach the ship decision solely through `gatePrefix` in
 * `run.ts`, which forces a single rep's verdict — so every path that recomputed
 * a verdict afterwards silently dropped the gate while keeping the `objective`
 * block that claimed it was enforced. Three of them did: `--reps N` out-voted an
 * objective FAIL 2-to-1 (100%, grade A, SHIP, on a CRITICAL scenario that called
 * a forbidden tool), `regrade` re-judged from a transcript the tool calls are
 * absent from, and `regate` recomputed it. `reps.ts` already states the policy —
 * "one rep that called a forbidden tool is a real finding, not a minority draw
 * to be voted away" — and nothing enforced it.
 *
 * An author override still wins, exactly as it does over `suspect`. Overriding a
 * deterministic assertion is a deliberate, recorded human act — and the failure
 * this guards against was never a human deciding, it was nobody deciding.
 */
export function effectiveVerdicts(scenarios: ScenarioResult[]): ScenarioVerdict[] {
  return scenarios.map((s) => ({
    id: s.id,
    verdict: s.override ?? objectiveVerdict(s) ?? s.judge_verdict,
    suspect: s.suspect && s.override == null, // an override resolves the misfire
  }));
}

/**
 * The verdict an objective gate forces, or undefined when it forces nothing.
 *
 * ERROR outranks FAIL: "the evidence is missing" must never read as "the
 * assertion held". Absent `objective` forces nothing at all — it means the
 * scenario declared no trace assertions, and treating that as a pass would
 * upgrade every legacy result to "objectively verified".
 */
function objectiveVerdict(s: ScenarioResult): Verdict | undefined {
  if (!s.objective) return undefined;
  if (s.objective.status === "ERROR") return "ERROR";
  if (s.objective.status === "FAIL") return "FAIL";
  return undefined;
}

/**
 * The ONLY place effective_grade is computed. Every writer goes through here,
 * so a persisted grade can never disagree with verdicts + overrides.
 * ctx is null for unscored runs — `red` only, since 0.5.0: `force` is a real
 * deployment and is scored (see SCORED_MODES directly above).
 */
export function finalizeResults(draft: ResultsDraft, ctx: ScoreContext | null): ResultsFile {
  let effective_grade: GradeSummary;
  if (ctx) {
    const s = score(effectiveVerdicts(draft.scenarios), { shipBar: ctx.shipBar, critical: ctx.critical });
    effective_grade = { passed: s.passed, total: s.total, pct: s.pct, letter: s.letter, ship: s.ship, note: s.note };
  } else {
    const why = draft.partial ? "partial run (--only) — not scored" : `mode=${draft.mode} (not scored)`;
    effective_grade = { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: why };
  }
  return {
    schema: 2,
    // Stamped here, the single place every writer passes through, so `run`,
    // `grade`, `rescore` and the review UI's override save all record which tool
    // produced the record they leave behind.
    harness_version: HARNESS_VERSION,
    // Omitted rather than written as null when absent: a run whose adapter could
    // not report a version must not look like one that reported "nothing".
    ...(draft.harness_cli_version ? { harness_cli_version: draft.harness_cli_version } : {}),
    ...(draft.delivery_canary ? { delivery_canary: draft.delivery_canary } : {}),
    skill: draft.skill,
    harness: draft.harness,
    model: draft.model,
    judge: draft.judge,
    timestamp: draft.timestamp,
    label: draft.label,
    mode: draft.mode,
    ...(draft.partial ? { partial: true } : {}),
    ...(draft.source_hashes ? { source_hashes: draft.source_hashes } : {}),
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

const GITIGNORE_BODY = `# skill-harness: commit verdicts (results.yaml), ignore generated artifacts.
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

// Matches transcript (`.rep<k>.txt`), judge-raw (`.rep<k>.judge.txt`) and
// staged-diff (`.rep<k>.diff.txt`) rep suffixes.
// Every rep-suffixed artifact kind. `.trace.jsonl` was added without updating this,
// so `repIndexOf` returned null for traces and `regate` looked for an unsuffixed
// path that does not exist on a multi-rep run — reporting "trace missing" for
// traces sitting on disk.
const REP_SUFFIX_RE = /\.rep(\d+)\.(?:(?:judge|diff)\.txt|(?:trace|events)\.jsonl|txt)$/;

/** The rep index embedded in a transcript / judge-raw / staged-diff filename (`.rep<k>.`), or null for a plain (non-rep) file. */
export function repIndexOf(filename: string): number | null {
  const m = REP_SUFFIX_RE.exec(filename);
  return m ? Number(m[1]) : null;
}

/** Sort transcript-like filenames: plain (no rep) first, then by numeric rep index. */
function sortByRep(files: string[]): string[] {
  return files.sort((a, b) => {
    const ra = repIndexOf(a);
    const rb = repIndexOf(b);
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
 * scenario's sibling artifacts, which share the `.txt` extension deliberately
 * (so `results/.gitignore`'s `*.txt` covers them all): judge-raw output
 * (`<id>.*.judge.txt` — see judgeRawPath) and the staged diff
 * (`<id>.*.diff.txt` — see diffPath).
 */
export function findTranscriptFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const escapedId = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher =
    mode !== undefined
      ? new RegExp(`^${escapedId}\\.${mode}(\\.rep\\d+)?\\.txt$`)
      : null;
  const files = readdirSync(runDir).filter((f) =>
    matcher
      ? matcher.test(f)
      : f.startsWith(`${scenarioId}.`) &&
        f.endsWith(".txt") &&
        !f.endsWith(".judge.txt") &&
        !f.endsWith(".diff.txt")
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
  // `judge2`/`judge3` are the second and third opinions adjudication writes. They
  // were not matched here, so an override on an adjudicated cell committed the
  // first judge's answer and silently dropped the very judgments the adjudication
  // rested on — the audit trail minus its evidence.
  const re = mode === undefined
    ? new RegExp(`^${esc}\\..*\\.judge\\d*\\.txt$`)
    : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.judge\\d*\\.txt$`);
  return sortByRep(readdirSync(runDir).filter((f) => re.test(f)));
}

/**
 * Path of a seeded scenario's staged-diff artifact within a run dir (rep-suffixed
 * for reps).
 *
 * The diff is the only record of what the model actually *did* — the workspace is
 * torn down after every rep, so without this a seeded verdict cannot be audited
 * after the fact. Named `<id>.<mode>[.rep<k>].diff.txt` so it sorts beside its
 * transcript and is covered by the `*.txt` rule in results/.gitignore: diffs are
 * generated evidence, ignored like transcripts, not committed like results.yaml.
 */
export function diffPath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.diff.txt`);
}

/**
 * What happens to one piece of recorded evidence when a command rebuilds a result.
 *
 *  - `carry` — the command did not re-measure this, so the prior value still
 *    describes the run and must survive.
 *  - `fresh` — the command re-measured it; take the new value.
 *  - `drop`  — the command invalidated it; a stale value would misinform.
 */
export type EvidencePolicy = "carry" | "fresh" | "drop";

export interface RebuildPolicy {
  objective: EvidencePolicy;
  adjudication: EvidencePolicy;
}

/**
 * Rebuild a `ScenarioResult` after a command re-measured part of it.
 *
 * **The single choke point for every rewriter**, and exhaustive by construction:
 * every field is destructured below, so adding one to `ScenarioResult` fails the
 * build HERE until someone decides whether it is carried, taken fresh, or
 * dropped. That guard is the whole point of the function.
 *
 * It exists because the ad-hoc version — `{ ...fresh, override: prior.override,
 * note: prior.note }`, written independently in three places — silently dropped
 * `objective` from `grade` and `adjudication` from `regate`. Both failures ran in
 * the dangerous direction: a trace-gated scenario re-read as "no assertions
 * declared", and an unresolved judge disagreement as a settled verdict. 1,036
 * tests passed through it; a real smoke run caught it.
 *
 * The author's `override` and `note` are always carried and are not policy —
 * no command re-measures a human's judgement.
 */
export function rebuildScenarioResult(
  fresh: ScenarioResult,
  prior: ScenarioResult | undefined,
  policy: RebuildPolicy,
): ScenarioResult {
  // Exhaustive destructure. Do not replace with a spread: the spread is what
  // allowed a new field to pass through unconsidered in the first place.
  const {
    id, judge_verdict, judge_reason, suspect,
    override: _freshOverride, note: _freshNote,
    reps, passes, clean, flakiness, pass_threshold,
    metrics: freshMetrics,
    objective: freshObjective,
    adjudication: freshAdjudication,
    ...rest
  } = fresh;
  const _exhaustive: Record<string, never> = rest;
  void _exhaustive;
  void _freshOverride;
  void _freshNote;

  const pick = <T>(p: EvidencePolicy, freshValue: T | undefined, priorValue: T | undefined): T | undefined => {
    if (p === "drop") return undefined;
    return p === "fresh" ? freshValue : priorValue;
  };

  const objective = pick(policy.objective, freshObjective, prior?.objective);
  const pickedAdjudication = pick(policy.adjudication, freshAdjudication, prior?.adjudication);
  const conflictsWithFreshEvidence = Boolean(
    pickedAdjudication?.verdict && (
      objective?.status === "FAIL" || objective?.status === "ERROR" ||
      (pass_threshold === 1 && (reps ?? 1) > 1 && judge_verdict !== "PASS")
    ),
  );
  // A settled cell-level panel cannot overrule newly evaluated objective gates,
  // nor can one transcript erase a failed repetition under an all-clean policy.
  const adjudication = conflictsWithFreshEvidence && pickedAdjudication
    ? { ...pickedAdjudication, state: "unresolved" as const, verdict: undefined }
    : pickedAdjudication;

  // `unresolved` is carried by the `suspect` flag and by nothing else — the
  // adjudication block records WHY, but `suspect` is what the ship bar reads.
  // Taking `suspect` from `fresh` while carrying the block therefore published a
  // record that said `state: "unresolved"` and scored as a clean SHIP. `regate`
  // did exactly that: it rebuilds verdict and suspect from the saved first-wave
  // judge file, so a free, offline command silently resolved a disagreement in
  // favour of shipping — inverting this module's stated invariant that an
  // unresolved disagreement must not resolve itself.
  const unresolved = adjudication?.state === "unresolved";

  // A settled adjudication outranks a re-read of the first-wave judge file for
  // the same reason: `regate` re-measures GATES, not judgments, so re-reading
  // `<id>.judge.txt` would revert a `confirmed`/`tie_broken` verdict that two or
  // three judges settled — leaving `adjudication.verdict` on the record
  // contradicting the `judge_verdict` beside it.
  const settled = policy.adjudication === "carry" && !conflictsWithFreshEvidence ? adjudication?.verdict : undefined;

  // Field ORDER matches `outcomesToResult`, the writer that produces a run's
  // results.yaml in the first place. It is not cosmetic: `results.yaml` is a
  // committed file, and emitting the same fields in a different order made every
  // `grade`/`regate`/`adjudicate` rewrite every multi-rep scenario block in the
  // corpus with a pure-noise diff.
  return {
    id,
    judge_verdict: settled ?? judge_verdict,
    judge_reason,
    suspect: suspect || unresolved,
    // Aggregation shape always comes from the fresh computation — these describe
    // how THIS result was aggregated, not the previous one.
    ...(reps === undefined ? {} : { reps }),
    ...(passes === undefined ? {} : { passes }),
    ...(clean === undefined ? {} : { clean }),
    ...(flakiness === undefined ? {} : { flakiness }),
    ...(pass_threshold === undefined ? {} : { pass_threshold }),
    ...((freshMetrics ?? prior?.metrics) ? { metrics: freshMetrics ?? prior!.metrics } : {}),
    // The author owns the verdict; a re-measurement never discards their call.
    override: prior?.override ?? null,
    note: prior?.note ?? "",
    // Omitted rather than set to undefined: absent must stay absent, so a result
    // with no evidence serialises byte-identically to one from before the field
    // existed.
    ...(objective ? { objective } : {}),
    ...(adjudication ? { adjudication } : {}),
  };
}

/**
 * Where a rep's execution trace is saved: `<id>.<mode>[.rep<k>].trace.jsonl`.
 *
 * `.jsonl` rather than `.txt` so it is distinguishable at a glance from a
 * transcript, and one JSON object per line so a multi-turn scenario's per-turn
 * traces append without a wrapper.
 */
export function tracePath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.trace.jsonl`);
}

/** Saved adapter-neutral workflow events for one scenario rep. */
export function trajectoryPath(runDir: string, scenarioId: string, mode: string, rep?: number): string {
  const base = rep === undefined ? `${scenarioId}.${mode}` : `${scenarioId}.${mode}.rep${rep}`;
  return join(runDir, `${base}.events.jsonl`);
}

/** A scenario's normalized-event files, sorted (plain first, then numeric rep). */
export function findTrajectoryFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === undefined
    ? new RegExp(`^${esc}\\..*\\.events\\.jsonl$`)
    : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.events\\.jsonl$`);
  return sortByRep(readdirSync(runDir).filter((f) => re.test(f)));
}

/** A scenario's staged-diff files, sorted (plain first, then numeric rep). Mode-scoped when given. */
export function findDiffFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === undefined
    ? new RegExp(`^${esc}\\..*\\.diff\\.txt$`)
    : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.diff\\.txt$`);
  return sortByRep(readdirSync(runDir).filter((f) => re.test(f)));
}

/** A scenario's execution-trace files, sorted (plain first, then numeric rep). Mode-scoped when given. */
export function findTraceFiles(runDir: string, scenarioId: string, mode?: string): string[] {
  if (!existsSync(runDir)) return [];
  const esc = scenarioId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = mode === undefined
    ? new RegExp(`^${esc}\\..*\\.trace\\.jsonl$`)
    : new RegExp(`^${esc}\\.${mode}(\\.rep\\d+)?\\.trace\\.jsonl$`);
  return sortByRep(readdirSync(runDir).filter((f) => re.test(f)));
}

/** A single representative transcript file for a scenario in a run dir. Null if none. */
export function findTranscriptFile(runDir: string, scenarioId: string): string | null {
  return findTranscriptFiles(runDir, scenarioId)[0] ?? null;
}

/**
 * Un-gitignore ALL of a scenario's transcript, judge-raw AND staged-diff
 * artifact files (audit trail for an override — a --reps run has one of each
 * per rep, and every rep that drove the verdict must survive a commit, not just
 * an arbitrary one).
 * Appends `!<tag>/<ts>/<id>.<mode>[.rep<k>].txt` (and the matching
 * `.judge.txt` / `.diff.txt`) to results/.gitignore for each, once. The path
 * uses POSIX separators so the negation matches on Windows too (git ignore
 * patterns are always forward-slashed).
 *
 * The diff belongs here for the same reason the judge-raw output does: an
 * override says the judge got it wrong, and on a seeded scenario the evidence
 * for that claim is the code the model wrote.
 */
export function preserveTranscript(resultsRoot: string, runDir: string, scenarioId: string): void {
  const files = [
    ...findTranscriptFiles(runDir, scenarioId),
    ...findJudgeRawFiles(runDir, scenarioId),
    ...findDiffFiles(runDir, scenarioId),
    // On a trace-gated scenario the trace IS the evidence for the override — the
    // same role the staged diff plays on a seeded one. Omitting it committed an
    // override whose justification was gitignored, and left `regate` with nothing
    // to re-evaluate on the one cell a human had disputed.
    ...findTraceFiles(runDir, scenarioId),
    ...findTrajectoryFiles(runDir, scenarioId),
  ];
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
