import type { Verdict } from "./score.js";
import type { ScenarioResult, ObjectiveResult } from "./results.js";

/** One rep's outcome (subject run + judge). */
export interface RepOutcome {
  verdict: Verdict;
  reason: string;
  suspect: boolean;
  /** Present only when the scenario declared `assert.trace`. */
  objective?: ObjectiveResult;
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
  const errored = present.find((o) => o.status === "ERROR");
  if (errored) return errored;
  const failed = present.find((o) => o.status === "FAIL");
  if (failed) return failed;
  return present[0];
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

  if (clean.length * 2 < reps) {
    // majority of reps misfired → untrustworthy
    return { verdict: "FAIL", reason: `${reps - clean.length}/${reps} reps misfired — re-judge`, passes, reps, clean: clean.length, flakiness: 0, suspect: true };
  }

  const errored = clean.filter((o) => o.verdict === "ERROR").length;
  if (clean.length > 0 && errored === clean.length) {
    return { verdict: "ERROR", reason: `${errored}/${reps} reps errored`, passes: 0, reps, clean: clean.length, flakiness: 0, suspect: false };
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
  if (repCount === 1) {
    const o = outcomes[0];
    return { id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, override: null, note: "", ...objectiveField };
  }
  const agg = aggregateReps(outcomes, threshold);
  return {
    id, judge_verdict: agg.verdict, judge_reason: agg.reason, suspect: agg.suspect,
    reps: agg.reps, passes: agg.passes, clean: agg.clean, flakiness: agg.flakiness,
    pass_threshold: threshold, override: null, note: "", ...objectiveField,
  };
}
