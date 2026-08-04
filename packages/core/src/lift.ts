import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readResults, effectiveVerdicts, type ResultsFile } from "./results.js";
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
  /** True when either side was an `--only` run, so coverage is a subset by construction. */
  partial: boolean;
  cells: Record<string, LiftCell>;
}

/** A verdict that carries real evidence about the task, rather than about the harness or the judge. */
function conclusive(verdict: Verdict, suspect: boolean): boolean {
  // ERROR is a harness failure (timeout, empty reply) — it says nothing about
  // whether the agent could do the task. JUDGE-AMBIGUOUS and an unresolved
  // misfire are judge failures. Treating any of them as a FAIL would make
  // "red FAIL -> green PASS" fire on infrastructure noise, and lift would
  // measure flakiness while looking like skill value.
  return !suspect && verdict !== "ERROR" && verdict !== "JUDGE-AMBIGUOUS";
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

/**
 * Compare a red (baseline, skill off) run against a green (skill active) run of
 * the same model: the "does this skill actually do anything?" measurement.
 *
 * Both sides go through `effectiveVerdicts`, so an author override is what
 * counts and an override resolves a misfire — the same rule scoring uses. Only
 * the intersection of scenario ids is compared; a lift cannot speak to a
 * scenario one side never ran.
 */
export function computeLift(red: ResultsFile, green: ResultsFile): Lift {
  const redV = new Map(effectiveVerdicts(red.scenarios).map((v) => [v.id, { verdict: v.verdict, suspect: v.suspect ?? false }]));
  const greenV = new Map(effectiveVerdicts(green.scenarios).map((v) => [v.id, { verdict: v.verdict, suspect: v.suspect ?? false }]));

  const cells: Record<string, LiftCell> = {};
  const counts = { gained: 0, regressed: 0, kept: 0, "both-fail": 0, inconclusive: 0 };
  let redPassed = 0;
  let greenPassed = 0;

  // Green order drives display order (it is the run the author is looking at),
  // restricted to ids the red baseline also covered.
  for (const [id, g] of greenV) {
    const r = redV.get(id);
    if (!r) continue;
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
    partial: Boolean(red.partial || green.partial),
    cells,
  };
}

/** One line for a human: what the skill did, and what it cost. */
export function liftHeadline(lift: Lift): string {
  if (lift.compared === 0) return "no shared scenarios to compare";

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
 * with the most recent green run and compute the lift.
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
export function collectLift(skillDir: string): Lift[] {
  const resultsRoot = join(skillDir, "tests", "results");
  if (!existsSync(resultsRoot)) return [];

  const lifts: Lift[] = [];
  for (const tag of readdirSync(resultsRoot).filter((n) => isDir(join(resultsRoot, n))).sort()) {
    const tagDir = join(resultsRoot, tag);
    const runDirs = readdirSync(tagDir)
      .map((n) => join(tagDir, n))
      .filter((p) => isDir(p) && existsSync(join(p, "results.yaml")))
      .sort(); // timestamp-slug names ⇒ chronological ascending

    // Mode is only knowable after reading results.yaml, so every run in the tag
    // is read; last-wins gives the most recent of each mode.
    let red: ResultsFile | undefined;
    let green: ResultsFile | undefined;
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
      else if (r.mode === "green") green = r;
    }
    if (!red || !green) continue;
    lifts.push({ ...computeLift(red, green), tag });
  }
  return lifts;
}
