import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import type { ScenarioResult, AdjudicationResult, Judgment, ResultsFile } from "./results.js";
import {
  judgeRawPath, writeResults, scoreContextFor, findTranscriptFiles, repIndexOf,
  rebuildScenarioResult, mergeScenarioMetrics, effectiveThreshold,
} from "./results.js";
import type { Scenario, ShipBar, Spec } from "./spec.js";
import type { Verdict } from "./score.js";
import { score, type ScenarioVerdict } from "./score.js";
import { buildJudgePrompt, judgeInWorkspace, parseVerdict } from "./grade.js";
import { appendJournal } from "./journal.js";

/**
 * Confidence-aware adjudication: decide which judged cells are untrustworthy
 * enough to be worth asking again, collapse the resulting votes, and project the
 * outcome into the fields the existing scorer already understands.
 *
 * Two rules govern everything here.
 *
 * **Spend is never implicit.** A spec may declare triggers, but only an explicit
 * `--auto-rejudge` (or a confirmed extension dialog) authorizes a second call.
 * `plan(...)` is a pure function that returns what WOULD be spent; nothing in
 * this module calls a judge.
 *
 * **Unresolved disagreement must not resolve itself.** When two judges disagree
 * and no third is authorized, the cell projects to `suspect: true` — which the
 * existing ship bar already treats as blocking. That is deliberate reuse rather
 * than a parallel gate: a second ship rule could drift out of step with the
 * first, and a disagreement that quietly became a PASS is the exact failure this
 * feature exists to prevent.
 */

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type TriggerKind = "ambiguous" | "contradictory" | "non_unanimous" | "ship_deciding";

/** Maximum judgments per cell, first wave included. Hard cap, not a default. */
export const MAX_JUDGMENTS = 3;

export interface CellState {
  id: string;
  /** First-wave verdict for the cell (already aggregated over reps). */
  verdict: Verdict;
  reason: string;
  /** The judge misfired, or the cell is otherwise untrustworthy. */
  suspect: boolean;
  /** Per-rep verdicts, when the cell ran with reps. Empty for a single-rep cell. */
  repVerdicts?: Verdict[];
}

export interface TriggerDecision {
  id: string;
  triggers: TriggerKind[];
}

export interface PlanInput {
  cells: CellState[];
  scenarios: Scenario[];
  shipBar: ShipBar;
  critical: string[];
  /** Which trigger classes are enabled. Defaults to all four. */
  enabled?: TriggerKind[];
  /** A tie-break judge exists, so a third call is permitted on disagreement. */
  tieBreakAvailable: boolean;
}

export interface AdjudicationPlan {
  decisions: TriggerDecision[];
  /** Cells that will be re-judged at least once. */
  triggered: string[];
  /**
   * Triggered cells whose VERDICT this plan provably cannot settle.
   *
   * Their first-wave judgment misfired, so it is not a clean vote (see
   * `collapseJudgments`). With no tie-break judge, one extra call reaches at most
   * one clean vote and a collapse needs two: the cell returns `unresolved` and
   * stays `suspect: true` whatever the second judge says.
   *
   * They are still re-judged, and deliberately so — the second opinion is the
   * evidence an author reads to resolve the misfire by hand, which is the only
   * way these cells ever get resolved. What was missing was saying so: the
   * preflight offered them alongside cells a call could actually settle, so the
   * buyer could not tell which was which. This list is that disclosure.
   */
  needsTieBreak: string[];
  /**
   * Exact upper bound on ADDITIONAL judge calls this plan can make.
   *
   * Deliberately a call count, not a cost estimate. The default judge runs on a
   * Claude subscription and reports no per-call usage back to the harness, so a
   * dollar figure there would be invented. Count is the only honest unit.
   */
  maxAdditionalCalls: number;
}

/**
 * Classify triggers and compute the spend ceiling. Pure — calls nothing.
 *
 * Triggers are computed from the COMPLETE first wave, never incrementally. A
 * `ship_deciding` cell can only be identified once every other cell's verdict is
 * known, and computing it mid-wave would make the trigger set depend on the order
 * scenarios happened to finish in.
 */
export function planAdjudication(input: PlanInput): AdjudicationPlan {
  const enabled = new Set(input.enabled ?? (["ambiguous", "contradictory", "non_unanimous", "ship_deciding"] as TriggerKind[]));
  const decisions: TriggerDecision[] = [];

  for (const cell of input.cells) {
    const triggers: TriggerKind[] = [];

    // `JUDGE-AMBIGUOUS` is what the parser emits when a judge's verdict blocks
    // disagree. `ERROR` is what it emits when nothing parsed at all — and that
    // was matched by no trigger here, so the least readable judgments in the run
    // were the ones never asked again. Both are "the first wave produced no
    // usable answer", which is precisely what a second opinion is for.
    if (enabled.has("ambiguous") && (cell.verdict === "JUDGE-AMBIGUOUS" || cell.verdict === "ERROR")) {
      triggers.push("ambiguous");
    }

    // A misfire IS the contradiction: the overall verdict disagrees with the
    // AND of the per-item grades. `detectMisfire` already found it; this is the
    // decision about what to do with it.
    if (enabled.has("contradictory") && cell.suspect && cell.verdict !== "JUDGE-AMBIGUOUS" && cell.verdict !== "ERROR") {
      triggers.push("contradictory");
    }

    if (enabled.has("non_unanimous") && isNonUnanimous(cell)) triggers.push("non_unanimous");

    if (enabled.has("ship_deciding") && flipsShipDecision(cell, input)) triggers.push("ship_deciding");

    decisions.push({ id: cell.id, triggers });
  }

  const suspectById = new Map(input.cells.map((c) => [c.id, c.suspect]));
  const fired = decisions.filter((d) => d.triggers.length > 0);
  // A misfired first-wave judgment is not a clean vote, so with only one extra
  // judge the cell can never reach the two clean votes a collapse needs. The call
  // is still worth making — it records a second opinion for the author — but the
  // buyer has to be told it cannot settle the verdict.
  const needsTieBreak = input.tieBreakAvailable ? [] : fired.filter((d) => suspectById.get(d.id)).map((d) => d.id);
  const triggered = fired.map((d) => d.id);

  // Per triggered cell: one secondary call always, plus one tie-break call only
  // if a third judge is available to make it.
  const perCell = input.tieBreakAvailable ? 2 : 1;

  return { decisions, triggered, needsTieBreak, maxAdditionalCalls: triggered.length * perCell };
}

/** A rep set containing both a PASS and a non-PASS is not a settled result. */
function isNonUnanimous(cell: CellState): boolean {
  const reps = cell.repVerdicts ?? [];
  if (reps.length < 2) return false;
  const passes = reps.filter((v) => v === "PASS").length;
  return passes > 0 && passes < reps.length;
}

/**
 * Would flipping this one cell change SHIP / NOT READY?
 *
 * Counterfactual against the REAL scorer, not a reimplementation of the ship
 * rules. min-pass, critical and B-series all move the answer, and a second copy
 * of that logic would be a copy that drifts. Both directions are tested: a cell
 * that would break a shipping run and one that would rescue a blocked one are
 * equally worth a second opinion.
 */
function flipsShipDecision(cell: CellState, input: PlanInput): boolean {
  // The target cell's `suspect` is cleared on BOTH sides. It has to be: a suspect
  // cell blocks SHIP on its own, so leaving the flag on the baseline would make
  // the two scores differ because of the flag rather than the verdict — and every
  // suspect cell would report as ship-deciding. Clearing it on both sides asks the
  // question actually being asked: holding everything else fixed, does THIS
  // CELL'S VERDICT decide the ship?
  const verdictsWith = (targetVerdict: Verdict): ScenarioVerdict[] =>
    input.cells.map((c) =>
      c.id === cell.id
        ? { id: c.id, verdict: targetVerdict, suspect: false }
        : { id: c.id, verdict: c.verdict, suspect: c.suspect },
    );

  const opts = { shipBar: input.shipBar, critical: input.critical };
  const flipped: Verdict = cell.verdict === "PASS" ? "FAIL" : "PASS";
  return score(verdictsWith(cell.verdict), opts).ship !== score(verdictsWith(flipped), opts).ship;
}

// ---------------------------------------------------------------------------
// Vote collapse
// ---------------------------------------------------------------------------

export type AdjudicationState = "confirmed" | "tie_broken" | "unresolved";

/**
 * Collapse the judgments recorded for one cell.
 *
 * A judgment is a CLEAN vote only if it is a plain PASS or FAIL from a judge that
 * did not misfire. Ambiguous, suspect and unreadable judgments are recorded in
 * full but never counted — a malformed answer is not evidence, and letting one
 * cast a deciding vote would launder exactly the unreliability being measured.
 */
export function collapseJudgments(judgments: Judgment[], trigger: TriggerKind): AdjudicationResult {
  const clean = judgments.filter((j) => !j.suspect && (j.verdict === "PASS" || j.verdict === "FAIL"));
  const base = { trigger, judgments } as const;

  if (clean.length < 2) {
    // Nothing to compare: one clean vote (or none) cannot confirm anything.
    return { ...base, state: "unresolved" };
  }

  const passes = clean.filter((j) => j.verdict === "PASS").length;
  const fails = clean.length - passes;

  if (passes === 0 || fails === 0) {
    return { ...base, state: "confirmed", verdict: clean[0].verdict as "PASS" | "FAIL" };
  }
  // A clean strict majority breaks the tie. With exactly 2 clean votes that
  // disagree there is no majority, so this correctly falls through.
  if (passes > fails) return { ...base, state: "tie_broken", verdict: "PASS" };
  if (fails > passes) return { ...base, state: "tie_broken", verdict: "FAIL" };
  return { ...base, state: "unresolved" };
}

/**
 * Project an adjudication onto the compatibility fields the scorer reads.
 *
 * `unresolved` becomes `suspect: true`, which the existing ship bar already
 * blocks on. The raw judgments survive on the result either way — an author
 * resolving this needs to see what each judge actually said, not just the
 * collapsed answer.
 */
export function boundAdjudicationToRepetitions(result: ScenarioResult, scenario: Scenario, adj: AdjudicationResult): AdjudicationResult {
  const criticalAggregate = (result.reps ?? 1) > 1 && effectiveThreshold(result, scenario) === 1;
  // A cell-level re-judge reads one transcript. It can confirm the aggregate,
  // but cannot erase another clean repetition's failure.
  return criticalAggregate && result.judge_verdict !== "PASS" && adj.verdict === "PASS"
    ? { ...adj, state: "unresolved", verdict: undefined }
    : adj;
}

export function projectAdjudication(result: ScenarioResult, adj: AdjudicationResult): ScenarioResult {
  if (adj.state === "unresolved") {
    return {
      ...result,
      // Verdict is left as recorded rather than forced to FAIL: `suspect` is what
      // blocks the ship, and overwriting the verdict would destroy the
      // first-wave answer an author needs in order to adjudicate.
      judge_reason: `${adj.judgments.length} judgments disagree (${adj.trigger}) — resolve or re-judge`,
      suspect: true,
      adjudication: adj,
    };
  }
  return {
    ...result,
    judge_verdict: adj.verdict ?? result.judge_verdict,
    judge_reason: reasonFor(adj),
    // A confirmed or tie-broken cell is no longer untrustworthy — that is the
    // entire point of having asked again.
    suspect: false,
    adjudication: adj,
  };
}

function reasonFor(adj: AdjudicationResult): string {
  const n = adj.judgments.length;
  const verb = adj.state === "confirmed" ? "confirmed by" : "resolved by majority of";
  return `${adj.verdict} ${verb} ${n} judgments (${adj.trigger})`;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Ask one judge about one cell's saved transcript. Supplied by the caller. */
export type RejudgeFn = (id: string, judge: ModelRef) => Promise<{ verdict: Verdict; reason: string; suspect: boolean }>;

export interface RunAdjudicationOptions {
  plan: AdjudicationPlan;
  cells: CellState[];
  /** The judge that produced the first wave — recorded as judgment 1. */
  primaryJudge: ModelRef;
  secondaryJudge: ModelRef;
  /** Absent means a disagreement stays unresolved rather than being tie-broken. */
  tieBreakJudge?: ModelRef;
  rejudge: RejudgeFn;
  log?: (msg: string) => void;
}

export interface RunAdjudicationResult {
  /** Per triggered cell, the collapsed adjudication. Cells that did not trigger are absent. */
  byId: Map<string, AdjudicationResult>;
  /** Judge calls actually made. Never exceeds `plan.maxAdditionalCalls`. */
  callsMade: number;
}

/**
 * Execute an adjudication plan.
 *
 * ONE implementation, called from `run`, `grade` and the review server's rejudge
 * path. The plan's three collapse policies were the most likely thing to be
 * reimplemented three times and to disagree — a cell that shipped from the CLI
 * and blocked in the browser would be worse than no feature.
 *
 * The tie-break call is made only when the secondary genuinely disagreed. A third
 * opinion on a settled cell is spend with no decision attached to it.
 */
export async function runAdjudication(opts: RunAdjudicationOptions): Promise<RunAdjudicationResult> {
  const byId = new Map<string, AdjudicationResult>();
  const log = opts.log ?? (() => {});
  let callsMade = 0;

  for (const decision of opts.plan.decisions) {
    if (decision.triggers.length === 0) continue;
    const cell = opts.cells.find((c) => c.id === decision.id);
    if (!cell) continue;
    // A cell can satisfy several triggers; the first is recorded as the reason,
    // in the fixed order `planAdjudication` evaluates them.
    const trigger = decision.triggers[0];

    const judgments: Judgment[] = [
      { ordinal: 1, judge: { ...opts.primaryJudge }, verdict: cell.verdict, reason: cell.reason, suspect: cell.suspect },
    ];

    const second = await opts.rejudge(decision.id, opts.secondaryJudge);
    callsMade++;
    judgments.push({ ordinal: 2, judge: { ...opts.secondaryJudge }, ...second });

    let collapsed = collapseJudgments(judgments, trigger);

    if (collapsed.state === "unresolved" && opts.tieBreakJudge) {
      const third = await opts.rejudge(decision.id, opts.tieBreakJudge);
      callsMade++;
      judgments.push({ ordinal: 3, judge: { ...opts.tieBreakJudge }, ...third });
      collapsed = collapseJudgments(judgments, trigger);
    }

    log(`  ${decision.id}: ${collapsed.state}${collapsed.verdict ? ` → ${collapsed.verdict}` : ""} (${judgments.length} judgments)`);
    byId.set(decision.id, collapsed);
  }

  return { byId, callsMade };
}

export interface AdjudicateRunOptions {
  runDir: string;
  spec: Spec;
  adapter: HarnessAdapter;
  /** The first-wave results this adjudication refines. */
  results: ResultsFile;
  primaryJudge: ModelRef;
  secondaryJudge: ModelRef;
  tieBreakJudge?: ModelRef;
  specDir: string;
  now: () => string;
  log?: (msg: string) => void;
}

/**
 * Adjudicate a completed run: plan, disclose the ceiling, execute, persist.
 *
 * Re-judges the SAME saved transcripts — no subject re-run, so the model's
 * behavior is held fixed and any movement is the judge. That is what makes this
 * a measurement of judge reliability rather than another sample of the model.
 */
export async function adjudicateRun(opts: AdjudicateRunOptions): Promise<ResultsFile> {
  const log = opts.log ?? (() => {});
  const mode = opts.results.mode;

  const cells = cellsFromResults(opts.runDir, opts.results);

  const plan = planAdjudication({
    cells,
    scenarios: opts.spec.scenarios,
    shipBar: opts.spec.ship_bar,
    critical: opts.spec.critical,
    tieBreakAvailable: opts.tieBreakJudge !== undefined,
  });

  // Disclosed before the first extra call, always — including the zero case, so
  // "nothing triggered" is visibly different from "the feature did not run".
  log(formatAdjudicationPlan(plan, { secondary: opts.secondaryJudge, tieBreak: opts.tieBreakJudge }));
  if (plan.triggered.length === 0) return opts.results;

  const byIdScenario = new Map(opts.spec.scenarios.map((s) => [s.id, s]));

  const { byId, callsMade } = await runAdjudication({
    plan,
    cells,
    primaryJudge: opts.primaryJudge,
    secondaryJudge: opts.secondaryJudge,
    tieBreakJudge: opts.tieBreakJudge,
    log,
    rejudge: async (id, judge) => {
      const scenario = byIdScenario.get(id);
      if (!scenario) throw new Error(`adjudication: scenario \`${id}\` is not in the spec`);
      return judgeCell({ ...opts, scenario, judge, mode });
    },
  });

  const scenarios = opts.results.scenarios.map((s) => {
    const adj = byId.get(s.id);
    // Adjudication asks judges again and re-measures nothing else, so the run's
    // objective evidence carries. Overrides survive too — a judge panel does not
    // outvote the author.
    if (!adj) return s;
    const scenario = byIdScenario.get(s.id);
    const boundedAdj = scenario ? boundAdjudicationToRepetitions(s, scenario, adj) : adj;
    const projected = projectAdjudication(s, boundedAdj);
    if (boundedAdj !== adj) {
      projected.judge_reason = `${adj.judgments.length} judgments on one transcript cannot replace a critical all-repetitions aggregate`;
    }
    const extraCalls = adj.judgments.filter((judgment) => judgment.ordinal > 1).length;
    projected.metrics = mergeScenarioMetrics(s.metrics, {
      wall_time_ms: 0,
      judge_calls: extraCalls,
      judge_rejudge_calls: extraCalls,
      subject_metrics_reps: 0,
      total_reps: s.metrics?.total_reps ?? s.reps ?? 1,
    });
    return rebuildScenarioResult(projected, s, { objective: "carry", adjudication: "fresh" });
  });

  appendJournal(opts.runDir, {
    event: "adjudication",
    ts: opts.now(),
    triggered: plan.triggered,
    judge_calls: callsMade,
    unresolved: [...byId.entries()].filter(([, a]) => a.state === "unresolved").map(([id]) => id),
  });

  const ctx = scoreContextFor(opts.results, opts.spec);
  return writeResults(opts.runDir, { ...opts.results, scenarios }, ctx);
}

/**
 * Ask one judge about one cell, reading the SAME saved transcript the first wave
 * was graded from.
 *
 * A multi-rep cell is adjudicated on its FIRST rep's transcript under one
 * documented policy, rather than whichever rep would move the headline. Picking
 * the convenient rep is how a "second opinion" becomes a way to get the answer
 * you wanted, which would make the whole feature worse than not having it.
 *
 * The extra judgment is written to `.judge2.txt` / `.judge3.txt`, leaving the
 * first-wave `.judge.txt` untouched — the audit trail is the point.
 */
async function judgeCell(opts: AdjudicateRunOptions & { scenario: Scenario; judge: ModelRef; mode: string }): Promise<{ verdict: Verdict; reason: string; suspect: boolean }> {
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, opts.mode);
  if (files.length === 0) {
    throw new Error(
      `adjudication: no ${opts.mode} transcript for \`${opts.scenario.id}\` in ${opts.runDir} — ` +
        `transcripts are gitignored, so this needs the run dir that produced them`,
    );
  }
  const transcript = readFileSync(join(opts.runDir, files[0]), "utf8");
  const prompt = buildJudgePrompt({
    skill: opts.spec.skill, persona: opts.spec.judge_persona, scenario: opts.scenario, transcript,
  });
  const g = await judgeInWorkspace(opts.adapter, opts.judge, prompt, opts.specDir);

  // Ordinal 2 and 3 get their own artifacts; the first wave's stays as recorded.
  const rep = repIndexOf(files[0]) ?? undefined;
  const base = judgeRawPath(opts.runDir, opts.scenario.id, opts.mode, rep);
  const nth = existsSync(base.replace(/\.judge\.txt$/, ".judge2.txt")) ? 3 : 2;
  writeFileSync(base.replace(/\.judge\.txt$/, `.judge${nth}.txt`), g.raw, "utf8");

  appendJournal(opts.runDir, {
    event: "judge-verdict", ts: opts.now(), id: opts.scenario.id,
    verdict: g.verdict, reason: g.reason, suspect: g.suspect,
  });

  return { verdict: g.verdict, reason: g.reason, suspect: g.suspect };
}

/**
 * Build the plan's input cells from a run.
 *
 * EXPORTED so the CLI, the review server and the pi extension all price the work
 * exactly as `adjudicateRun` will perform it. When the preflight built cells
 * without `repVerdicts` and the executor built them with, the browser could show
 * "no cell triggered" and then spend on non-unanimous cells nobody was told
 * about — inverting the one invariant this feature actually promises.
 */
export function cellsFromResults(runDir: string, results: ResultsFile): CellState[] {
  return results.scenarios.map((s) => ({
    id: s.id,
    verdict: s.judge_verdict,
    reason: s.judge_reason,
    suspect: s.suspect,
    repVerdicts: repVerdictsOf(runDir, s, results.mode),
  }));
}

/** Per-rep verdicts from saved judge artifacts, for the non-unanimous trigger. */
function repVerdictsOf(runDir: string, s: ScenarioResult, mode: string): Verdict[] | undefined {
  if (!s.reps || s.reps < 2) return undefined;
  const out: Verdict[] = [];
  // 0-based: `run.ts` writes rep0..repN-1. Looping from 1 dropped rep0 and probed
  // a repN that never exists, so a 3-rep FAIL/PASS/PASS read as unanimous PASS and
  // a 2-rep cell returned undefined — `non_unanimous` could never fire correctly.
  for (let rep = 0; rep < s.reps; rep++) {
    const path = judgeRawPath(runDir, s.id, mode, rep);
    if (!existsSync(path)) {
      // A rep with no judge artifact is an ABSENT vote, not a vote to skip.
      // `run.ts` deliberately does not call the judge for a rep blocked by a gate
      // or ending in ERROR — so the missing files are exactly the reps that
      // failed hardest, and dropping them made `[FAIL, PASS, PASS]` read as
      // `[PASS, PASS]`: unanimous. The cell whose split was caused by a forbidden
      // tool call was the one cell adjudication declined to look at, and the
      // preflight told the buyer "no cell triggered".
      out.push("ERROR");
      continue;
    }
    out.push(parseVerdict(readFileSync(path, "utf8")).verdict);
  }
  return out.length >= 2 ? out : undefined;
}

/**
 * Resolve and validate the extra judges.
 *
 * Every configured judge passes the SAME two gates the primary does: the metered
 * refusal and the judge≠subject check. A secondary judge is still a judge — a
 * feature that multiplies judge calls is the last place to let one slip past the
 * policy that exists because a default once billed a corpus by accident.
 *
 * Returns null when adjudication was not authorized, so callers can treat "not
 * enabled" and "enabled with no triggers" as different things.
 */
export function resolveAdjudicationJudges(opts: {
  enabled: boolean;
  primary: ModelRef;
  secondaryToken?: string;
  tieBreakToken?: string;
  /**
   * The run's recorded subject, as a raw token.
   *
   * A TOKEN rather than a parsed ref, and parsed only after the `enabled` check:
   * an eagerly-parsed argument threw on any run whose recorded model is not
   * `provider:model` — which killed the whole regrade over a provenance oddity in
   * a field only used for a warning.
   */
  subjectToken: string;
  parseRef: (token: string) => ModelRef;
  assertAllowed: (judge: ModelRef, source: string) => void;
  resemblesSubject: (judge: ModelRef, subject: ModelRef) => boolean;
  warn: (msg: string) => void;
}): { secondary: ModelRef; tieBreak?: ModelRef } | null {
  if (!opts.enabled) return null;

  // An unreadable subject skips the resemblance warning rather than failing the
  // run. The judge≠subject check is advice; the metered refusal below is the gate.
  let subject: ModelRef | null = null;
  try {
    subject = opts.parseRef(opts.subjectToken);
  } catch {
    opts.warn(`  ⚠ cannot read the run's model (\`${opts.subjectToken}\`) — skipping the judge≠subject check`);
  }

  // With no explicit secondary the primary judge is asked again as an independent
  // draw. That is a real measurement — the judge-variance study found a ~2%
  // disagreement rate on identical transcripts — not a no-op.
  const secondary = opts.secondaryToken ? opts.parseRef(opts.secondaryToken) : opts.primary;
  const tieBreak = opts.tieBreakToken ? opts.parseRef(opts.tieBreakToken) : undefined;

  opts.assertAllowed(secondary, "--secondary-judge");
  if (tieBreak) opts.assertAllowed(tieBreak, "--tie-break-judge");

  if (subject) {
    for (const [label, judge] of [["secondary", secondary], ["tie-break", tieBreak]] as const) {
      if (judge && opts.resemblesSubject(judge, subject)) {
        opts.warn(
          `  ⚠ ${label} judge (${judge.provider}:${judge.model}) resembles the model under test ` +
            `(${subject.provider}:${subject.model}) — same-family grading inflates scores.`,
        );
      }
    }
  }

  return tieBreak ? { secondary, tieBreak } : { secondary };
}

/** Human-readable preflight line. Counts, never dollars — see `maxAdditionalCalls`. */
export function formatAdjudicationPlan(plan: AdjudicationPlan, judges: { secondary: ModelRef; tieBreak?: ModelRef }): string {
  const stuck = plan.needsTieBreak.length
    ? [
        `  ${plan.needsTieBreak.length} of those cannot be SETTLED by this plan: ${plan.needsTieBreak.join(", ")}`,
        "    (their first judgment misfired, so one more judge cannot reach two clean votes — the call",
        "     buys a second opinion to resolve by hand; add a tie-break judge to settle them outright)",
      ]
    : [];
  if (plan.triggered.length === 0) {
    return ["adjudication: no cell triggered — no additional judge calls", ...stuck].join("\n");
  }
  const lines = [
    `adjudication: ${plan.triggered.length} cell(s) triggered — up to ${plan.maxAdditionalCalls} additional judge call(s)`,
    `  secondary judge: ${judges.secondary.provider}:${judges.secondary.model}`,
  ];
  if (judges.tieBreak) lines.push(`  tie-break judge: ${judges.tieBreak.provider}:${judges.tieBreak.model}`);
  else lines.push("  no tie-break judge — a disagreement stays unresolved and blocks SHIP");
  for (const d of plan.decisions) {
    if (d.triggers.length) lines.push(`  ${d.id}: ${d.triggers.join(", ")}`);
  }
  return [...lines, ...stuck].join("\n");
}
