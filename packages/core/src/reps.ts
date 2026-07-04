import type { Verdict } from "./score.js";

/** One rep's outcome (subject run + judge). */
export interface RepOutcome {
  verdict: Verdict;
  reason: string;
  suspect: boolean;
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
