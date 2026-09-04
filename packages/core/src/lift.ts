import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readResults, effectiveVerdicts, isScoredMode, type ResultsFile, type ScenarioResult } from "./results.js";
import { loadSpec } from "./spec.js";
import type { Verdict } from "./score.js";

/**
 * What a skill did to one scenario, red (skill off) vs green (skill active).
 *
 * `inconclusive` is load-bearing: it is what stops lift from becoming a number
 * that only ever goes up. See `classify`.
 */
export type LiftClass = "gained" | "regressed" | "kept" | "both-fail" | "inconclusive";

export interface LiftCell {
  red: Verdict;
  /**
   * Whether the red side's verdict was an unresolved misfire. Carried (not just
   * folded into `class`) because the review UI recomputes the class live as the
   * author overrides green verdicts — it needs the red evidence, not a frozen
   * conclusion. See assets/report.grade.js's liftClass.
   */
  redSuspect: boolean;
  green: Verdict;
  class: LiftClass;
}

export interface Lift {
  tag: string; // <harness>-<modelslug> dir name
  model: string;
  redTimestamp: string;
  greenTimestamp: string;
  /**
   * How the skill was delivered on the non-baseline side: `green` (the harness
   * activated it) or `force` (SKILL.md as the system prompt).
   *
   * The `green*` field names are kept as the *skill-active side*, not as a claim
   * about the mode — they are the wire format the committed report assets and the
   * review UI read, and renaming them would break every published report to say
   * something the `mode` field already says. A red baseline is mode-independent
   * (`--no-skills` either way), so red-vs-force is as valid a comparison as
   * red-vs-green — but which one you are looking at changes what the number means,
   * so it is recorded rather than implied.
   */
  mode: string;
  /** Scenario ids present in both runs — the only ones a lift can speak to. */
  compared: number;
  gained: number; // skill turned a non-pass into a pass
  regressed: number; // skill turned a pass into a non-pass
  kept: number; // passed either way — the model never needed the skill here
  bothFail: number; // failed either way — the skill did not help here
  inconclusive: number; // an ERROR or unresolved misfire on either side
  redPassed: number; // passes on the red side, conclusive cells only
  greenPassed: number; // passes on the green side, conclusive cells only
  delta: number; // greenPassed - redPassed
  /** Ids the green run covered that the red baseline did not (and vice versa). */
  greenOnly: string[];
  redOnly: string[];
  /**
   * Ids both runs covered that a lift cannot speak to, because the harness runs
   * them identically in red and green. Reported rather than compared: folding them
   * in would credit the red side with passes the skill itself produced. See
   * `LiftOptions.modeInsensitive`.
   */
  modeInsensitive: string[];
  /**
   * Ids both runs covered whose two verdicts were produced by different
   * aggregations, so the comparison is not like-for-like. Excluded rather than
   * compared: see `comparableAggregation`.
   */
  aggregationMismatch: LiftAggregationMismatch[];
  /** True when either side was an `--only` run, so coverage is a subset by construction. */
  partial: boolean;
  cells: Record<string, LiftCell>;
}

/**
 * How one side produced a scenario's verdict: over how many reps, and under which
 * majority threshold (null when no aggregation happened).
 */
export interface AggregationShape {
  reps: number;
  threshold: number | null;
}

export interface LiftAggregationMismatch {
  id: string;
  red: AggregationShape;
  green: AggregationShape;
}

function aggregationShape(s: ScenarioResult): AggregationShape {
  const reps = s.reps ?? 1;
  // At one rep `outcomesToResult` keeps the single judge verdict and never calls
  // `aggregateReps`, so a `pass_threshold` sitting beside it was applied to
  // nothing. Normalizing it away keeps a stray field from faking a mismatch.
  return { reps, threshold: reps > 1 ? s.pass_threshold ?? null : null };
}

/**
 * Whether two verdicts were produced the same way, and so mean the same thing.
 *
 * A one-rep verdict is a single draw; a three-rep verdict is a majority over
 * three. Across that gap `red FAIL -> green PASS` can be sampling alone, and
 * `gained` would be reporting the harness's own asymmetry as skill value — the
 * inverse of the `modeInsensitive` error, and pointing the number the *other*
 * way. The threshold counts too: 1-of-3 versus 3-of-3 is a different majority
 * policy at the same N, so the aggregate is not the same measurement.
 */
function comparableAggregation(red: AggregationShape, green: AggregationShape): boolean {
  return red.reps === green.reps && red.threshold === green.threshold;
}

/** A verdict that carries real evidence about the task, rather than about the harness or the judge. */
function conclusive(verdict: Verdict, suspect: boolean): boolean {
  // ERROR is a harness failure (timeout, empty reply) — it says nothing about
  // whether the agent could do the task. JUDGE-AMBIGUOUS and an unresolved
  // misfire are judge failures. Treating any of them as a FAIL would make
  // "red FAIL -> green PASS" fire on infrastructure noise, and lift would
  // measure flakiness while looking like skill value.
  return !suspect && verdict !== "ERROR" && verdict !== "NOT-MEASURED" && verdict !== "JUDGE-AMBIGUOUS";
}

function classify(red: { verdict: Verdict; suspect: boolean }, green: { verdict: Verdict; suspect: boolean }): LiftClass {
  if (!conclusive(red.verdict, red.suspect) || !conclusive(green.verdict, green.suspect)) return "inconclusive";
  const redPass = red.verdict === "PASS";
  const greenPass = green.verdict === "PASS";
  if (redPass && greenPass) return "kept";
  if (!redPass && greenPass) return "gained";
  if (redPass && !greenPass) return "regressed";
  return "both-fail";
}

export interface LiftOptions {
  /**
   * Scenario ids whose red and green runs are the same run by construction, so
   * comparing them measures nothing.
   *
   * The case that exists today is `system_prompt_file`: the pi adapter treats an
   * agent-file scenario's file AS the system prompt and passes `--no-skills`
   * *whatever the mode*, so the skill is loaded on both sides. Left in, such a
   * cell lands in `kept` (or `both-fail`) and drags the denominator down —
   * understating lift with evidence that the skill worked.
   */
  modeInsensitive?: Iterable<string>;
}

/**
 * Compare a red (baseline, skill off) run against a green (skill active) run of
 * the same model: the "does this skill actually do anything?" measurement.
 *
 * Both sides go through `effectiveVerdicts`, so an author override is what
 * counts and an override resolves a misfire — the same rule scoring uses. Only
 * the intersection of scenario ids is compared; a lift cannot speak to a
 * scenario one side never ran, nor to one the harness ran identically in both
 * modes (`opts.modeInsensitive`).
 */
export function computeLift(red: ResultsFile, green: ResultsFile, opts: LiftOptions = {}): Lift {
  const insensitive = new Set(opts.modeInsensitive ?? []);
  const redV = new Map(effectiveVerdicts(red.scenarios).map((v) => [v.id, { verdict: v.verdict, suspect: v.suspect ?? false }]));
  const greenV = new Map(effectiveVerdicts(green.scenarios).map((v) => [v.id, { verdict: v.verdict, suspect: v.suspect ?? false }]));
  const redShape = new Map(red.scenarios.map((s) => [s.id, aggregationShape(s)]));
  const greenShape = new Map(green.scenarios.map((s) => [s.id, aggregationShape(s)]));

  const cells: Record<string, LiftCell> = {};
  const counts = { gained: 0, regressed: 0, kept: 0, "both-fail": 0, inconclusive: 0 };
  let redPassed = 0;
  let greenPassed = 0;

  // Green order drives display order (it is the run the author is looking at),
  // restricted to ids the red baseline also covered.
  const modeInsensitive: string[] = [];
  const aggregationMismatch: LiftAggregationMismatch[] = [];
  for (const [id, g] of greenV) {
    const r = redV.get(id);
    if (!r) continue;
    if (insensitive.has(id)) {
      modeInsensitive.push(id);
      continue;
    }
    // Checked before classification, and reported separately, for the reason
    // modeInsensitive is: there is no honest bucket for two verdicts that were
    // not measured the same way.
    const rShape = redShape.get(id) ?? { reps: 1, threshold: null };
    const gShape = greenShape.get(id) ?? { reps: 1, threshold: null };
    if (!comparableAggregation(rShape, gShape)) {
      aggregationMismatch.push({ id, red: rShape, green: gShape });
      continue;
    }
    const cls = classify(r, g);
    cells[id] = { red: r.verdict, redSuspect: r.suspect, green: g.verdict, class: cls };
    counts[cls]++;
    if (cls !== "inconclusive") {
      if (r.verdict === "PASS") redPassed++;
      if (g.verdict === "PASS") greenPassed++;
    }
  }

  return {
    tag: "",
    model: green.model,
    mode: green.mode,
    redTimestamp: red.timestamp,
    greenTimestamp: green.timestamp,
    compared: Object.keys(cells).length,
    gained: counts.gained,
    regressed: counts.regressed,
    kept: counts.kept,
    bothFail: counts["both-fail"],
    inconclusive: counts.inconclusive,
    redPassed,
    greenPassed,
    delta: greenPassed - redPassed,
    greenOnly: [...greenV.keys()].filter((id) => !redV.has(id)),
    redOnly: [...redV.keys()].filter((id) => !greenV.has(id)),
    modeInsensitive,
    aggregationMismatch,
    partial: Boolean(red.partial || green.partial),
    cells,
  };
}

function reps(n: number): string {
  return n === 1 ? "1 rep" : `${n} reps`;
}

/** What differs between the two sides, in the words of the flag that caused it. */
function describeMismatch(ms: LiftAggregationMismatch[]): string {
  const distinct = new Set(
    ms.map((m) =>
      m.red.reps !== m.green.reps
        ? `red ${reps(m.red.reps)} vs ${reps(m.green.reps)}`
        : `red pass threshold ${m.red.threshold} vs ${m.green.threshold}`,
    ),
  );
  return distinct.size === 1 ? [...distinct][0] : "red and green aggregated differently";
}

/** The one command that would make the comparison measurable. */
function mismatchRemedy(ms: LiftAggregationMismatch[]): string {
  const greenReps = new Set(ms.map((m) => m.green.reps));
  if (greenReps.size === 1 && ms.every((m) => m.red.reps !== m.green.reps)) {
    return `re-run the baseline with --reps ${[...greenReps][0]}`;
  }
  return "re-measure both sides the same way";
}

/** One line for a human: what the skill did, and what it cost. */
export function liftHeadline(lift: Lift): string {
  if (lift.compared === 0) {
    // Excluded-but-shared is not the same as never-shared. Claiming the runs had
    // no scenario in common would hide the reason the lift is empty.
    const mismatched = lift.aggregationMismatch.length;
    const insensitive = lift.modeInsensitive.length;
    if (mismatched > 0 && insensitive > 0) {
      return `nothing comparable (${insensitive} run identically in both modes, ${mismatched} ${describeMismatch(lift.aggregationMismatch)})`;
    }
    if (mismatched > 0) {
      return `nothing comparable (${mismatched} shared, ${describeMismatch(lift.aggregationMismatch)} — ${mismatchRemedy(lift.aggregationMismatch)})`;
    }
    if (insensitive > 0) {
      return `nothing comparable (${insensitive} shared, all run identically in both modes)`;
    }
    return "no shared scenarios to compare";
  }

  // Everything inconclusive is NOT "no effect" — it is no measurement. Saying
  // "no measured effect" here would be the same not-measured/measured-no-effect
  // conflation this module refuses to make when a red baseline is missing.
  const conclusive = lift.compared - lift.inconclusive;
  if (conclusive === 0) {
    return `nothing conclusive to compare (${lift.inconclusive} inconclusive — fix the harness/judge, then re-run)`;
  }

  const segments: string[] = [];
  if (lift.gained === 0 && lift.regressed === 0) {
    segments.push(
      lift.kept > 0
        ? `no measured effect (${lift.kept} passed without the skill too)`
        : "no measured effect",
    );
  } else {
    const sign = lift.delta > 0 ? `+${lift.delta}` : String(lift.delta);
    segments.push(`${sign} net (${lift.gained} gained, ${lift.regressed} regressed)`);
  }
  if (lift.inconclusive > 0) segments.push(`${lift.inconclusive} inconclusive`);
  if (lift.modeInsensitive.length > 0) {
    segments.push(`${lift.modeInsensitive.length} not comparable (same run in both modes)`);
  }
  if (lift.aggregationMismatch.length > 0) {
    segments.push(`${lift.aggregationMismatch.length} not comparable (${describeMismatch(lift.aggregationMismatch)})`);
  }
  if (lift.partial) segments.push("partial run");
  return segments.join(" · ");
}

/** A directory that exists right now; false (never throws) if it vanished concurrently. */
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Per model-tag under <skillDir>/tests/results/, pair the most recent red run
 * with the most recent skill-delivered run (green or force) and compute the lift.
 *
 * Deliberately derived on read rather than persisted into results.yaml: a lift
 * is a fact about a *pair* of runs, so caching it inside one run's file would go
 * stale the moment a new baseline lands — the stale-scorecard failure mode
 * `source_hashes` exists to prevent. Deriving also means lift works
 * retroactively on results already committed by 0.1.x/0.2.0 users.
 *
 * A tag with no red baseline is omitted entirely rather than reported as a zero
 * lift: "not measured" and "measured no effect" are different claims.
 */
/**
 * Scenario ids the harness runs identically in red and green, read from the spec
 * rather than from results.yaml: a lift is derived on read, so this has to work
 * on runs recorded before the field existed — and `scenario:<id>` source hashes
 * fold the value in without preserving it.
 *
 * Never throws: an unparseable spec must degrade to "nothing excluded" rather
 * than take down a view that is otherwise readable from the results alone.
 */
function modeInsensitiveIds(skillDir: string): string[] {
  const specPath = join(skillDir, "tests", "specification.yaml");
  if (!existsSync(specPath)) return [];
  try {
    return loadSpec(specPath).scenarios.filter((s) => s.systemPromptFile).map((s) => s.id);
  } catch {
    return [];
  }
}

export function collectLift(skillDir: string): Lift[] {
  const resultsRoot = join(skillDir, "tests", "results");
  if (!existsSync(resultsRoot)) return [];
  const modeInsensitive = modeInsensitiveIds(skillDir);

  const lifts: Lift[] = [];
  for (const tag of readdirSync(resultsRoot).filter((n) => isDir(join(resultsRoot, n))).sort()) {
    const tagDir = join(resultsRoot, tag);
    const runDirs = readdirSync(tagDir)
      .map((n) => join(tagDir, n))
      .filter((p) => isDir(p) && existsSync(join(p, "results.yaml")))
      .sort(); // timestamp-slug names ⇒ chronological ascending

    // Mode is only knowable after reading results.yaml, so every run in the tag
    // is read; last-wins gives the most recent baseline and the most recent
    // skill-delivered run. The skill side is whichever scored mode ran most
    // recently — a corpus that moved from green to force delivery should see its
    // lift follow, and the baseline it is measured against is the same either way
    // (`--no-skills` in both).
    let red: ResultsFile | undefined;
    let skillOn: ResultsFile | undefined;
    for (const rd of runDirs) {
      let r: ResultsFile;
      try {
        r = readResults(rd);
      } catch (e) {
        // A corrupt/truncated results.yaml must not take down the whole view.
        console.warn(`skill-harness lift: skipping unreadable run ${rd}: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      if (r.mode === "red") red = r;
      else if (isScoredMode(r.mode)) skillOn = r;
    }
    if (!red || !skillOn) continue;
    lifts.push({ ...computeLift(red, skillOn, { modeInsensitive }), tag });
  }
  return lifts;
}
