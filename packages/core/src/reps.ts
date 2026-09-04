import type { Verdict } from "./score.js";
import type { ScenarioResult, ObjectiveResult, ScenarioMetrics, Judgment, SubjectInvocationObservation } from "./results.js";
import type { TraceMetrics } from "./capture-trace-types.js";

/** One rep's outcome (subject run + judge). */
export interface RepOutcome {
  verdict: Verdict;
  reason: string;
  suspect: boolean;
  /** Present only when the scenario declared structured objective assertions. */
  objective?: ObjectiveResult;
  judgment?: Judgment;
  subject_invocations?: SubjectInvocationObservation[];
  metrics?: {
    wall_time_ms: number;
    judge_calls: number;
    judge_rejudge_calls: number;
    subject?: TraceMetrics;
  };
}

/**
 * Collapse per-rep objective results.
 *
 * Strict on purpose, and deliberately NOT the same policy as the judge's
 * pass-threshold aggregation: an objective assertion is a statement about what
 * the model DID, so one rep that called a forbidden tool is a real finding, not
 * a minority draw to be voted away. ERROR dominates (missing evidence is never a
 * pass), then FAIL, then PASS. The retained assertion detail comes from the
 * first non-passing rep, since that is the one worth reading.
 */
export function aggregateObjective(outcomes: RepOutcome[]): ObjectiveResult | undefined {
  const present = outcomes.map((o) => o.objective).filter((o): o is ObjectiveResult => o !== undefined);
  if (present.length === 0) return undefined;
  const picked = present.find((o) => o.status === "ERROR") ?? present.find((o) => o.status === "FAIL") ?? present[0];
  if (present.length === 1) return picked;
  const eventHashes = present.map((objective) => objective.events_sha256);
  const traceHashes = present.map((objective) => objective.trace_sha256);
  return {
    ...picked,
    ...(eventHashes.every((hash): hash is string => typeof hash === "string") ? { rep_events_sha256: eventHashes } : {}),
    ...(traceHashes.every((hash): hash is string => typeof hash === "string") ? { rep_trace_sha256: traceHashes } : {}),
  };
}

/** A scenario's aggregated result over N reps. */
export interface RepAggregate {
  verdict: Verdict;
  reason: string;
  passes: number; // PASSes among the clean (non-misfired) reps
  reps: number; // N
  clean: number; // number of clean (non-misfired) reps — the real denominator for `passes`
  flakiness: number; // 0 = unanimous, 1 = even split; over clean reps
  suspect: boolean; // fewer than half the reps were clean
}

/**
 * Collapse N rep outcomes into one scenario verdict. A rep is "clean" when its
 * judge did not misfire. If fewer than half the reps are clean the scenario is
 * `suspect` (its verdict is untrustworthy). Otherwise the pass-rate is computed
 * over the clean reps and the scenario PASSes at `pass_rate >= threshold`
 * (default caller threshold 0.5, ties pass). Flakiness = 1 - |2·pass_rate - 1|.
 */
export function aggregateReps(outcomes: RepOutcome[], threshold: number): RepAggregate {
  const reps = outcomes.length;
  const clean = outcomes.filter((o) => !o.suspect);
  const passes = clean.filter((o) => o.verdict === "PASS").length;

  const errored = outcomes.filter((o) => o.verdict === "ERROR").length;
  // Infrastructure/judge/tooling errors are not behavioral failures, and they
  // cannot be voted into a pass by successful siblings. Preserve the third
  // state so a release blocks for missing evidence without blaming the skill.
  if (errored > 0) {
    return { verdict: "ERROR", reason: `${errored}/${reps} reps errored — infrastructure, not behavior`, passes, reps, clean: clean.length, flakiness: 0, suspect: false };
  }

  if (clean.length * 2 < reps) {
    // majority of reps misfired → untrustworthy
    return { verdict: "FAIL", reason: `${reps - clean.length}/${reps} reps misfired — re-judge`, passes, reps, clean: clean.length, flakiness: 0, suspect: true };
  }

  const passRate = passes / clean.length;
  const verdict: Verdict = passRate >= threshold ? "PASS" : "FAIL";
  const flakiness = 1 - Math.abs(2 * passRate - 1);
  const reason = reps === 1 ? outcomes[0].reason : `${passes}/${clean.length} reps passed (flaky ${flakiness.toFixed(2)})`;
  return { verdict, reason, passes, reps, clean: clean.length, flakiness, suspect: false };
}

/**
 * Collapse a scenario's rep outcomes into a ScenarioResult. N=1 preserves the
 * single judge's verdict/reason with no reps fields (byte-identical to a plain
 * run); N>1 aggregates and persists the effective threshold (so a later
 * re-judge reproduces the same pass-rate). override/note are left empty for the
 * caller to merge.
 */
export function outcomesToResult(id: string, outcomes: RepOutcome[], repCount: number, threshold: number): ScenarioResult {
  // Spread rather than always-set: a scenario with no trace assertions must
  // produce a result byte-identical to one from before this field existed.
  const objective = aggregateObjective(outcomes);
  const objectiveField = objective ? { objective } : {};
  const metrics = aggregateMetrics(outcomes);
  const metricsField = metrics ? { metrics } : {};
  const repJudgments = outcomes.map((outcome, repetition) => ({ repetition, judgments: outcome.judgment ? [outcome.judgment] : [], recorded_verdict: outcome.verdict, ...(outcome.objective ? { objective: outcome.objective } : {}) }));
  const repJudgmentField = outcomes.some(outcome => outcome.judgment) ? { rep_judgments: repJudgments } : {};
  if (repCount === 1) {
    const o = outcomes[0];
    return { id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, ...metricsField, override: null, note: "", ...objectiveField, ...repJudgmentField };
  }
  const agg = aggregateReps(outcomes, threshold);
  return {
    id, judge_verdict: agg.verdict, judge_reason: agg.reason, suspect: agg.suspect,
    reps: agg.reps, passes: agg.passes, clean: agg.clean, flakiness: agg.flakiness,
    pass_threshold: threshold, ...metricsField, override: null, note: "", ...objectiveField, ...repJudgmentField,
  };
}

function aggregateMetrics(outcomes: RepOutcome[]): ScenarioMetrics | undefined {
  const present = outcomes.map((outcome) => outcome.metrics).filter((metrics): metrics is NonNullable<RepOutcome["metrics"]> => metrics !== undefined);
  if (present.length === 0) return undefined;
  const subjects = present.map((metrics) => metrics.subject).filter((metrics): metrics is TraceMetrics => metrics !== undefined);
  const base: ScenarioMetrics = {
    wall_time_ms: present.reduce((sum, metrics) => sum + metrics.wall_time_ms, 0),
    judge_calls: present.reduce((sum, metrics) => sum + metrics.judge_calls, 0),
    judge_rejudge_calls: present.reduce((sum, metrics) => sum + metrics.judge_rejudge_calls, 0),
    subject_metrics_reps: subjects.length,
    total_reps: outcomes.length,
  };
  if (subjects.length === 0) return base;
  return {
    ...base,
    input_tokens: subjects.reduce((sum, metrics) => sum + metrics.input_tokens, 0),
    output_tokens: subjects.reduce((sum, metrics) => sum + metrics.output_tokens, 0),
    cache_read_tokens: subjects.reduce((sum, metrics) => sum + metrics.cache_read_tokens, 0),
    cache_write_tokens: subjects.reduce((sum, metrics) => sum + metrics.cache_write_tokens, 0),
    subject_cost_usd: subjects.reduce((sum, metrics) => sum + metrics.cost_usd, 0),
    cost_source: subjects.every((metrics) => metrics.cost_source === subjects[0].cost_source)
      ? subjects[0].cost_source
      : "unreported",
    tool_calls: subjects.reduce((sum, metrics) => sum + metrics.tool_calls, 0),
    delegated_children: subjects.reduce((sum, metrics) => sum + metrics.delegated_children, 0),
    max_concurrency: Math.max(...subjects.map((metrics) => metrics.max_concurrency)),
  };
}
