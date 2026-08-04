import { describe, test, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeLift, collectLift, liftHeadline } from "../src/lift.js";
import { finalizeResults, writeResults, type ResultsDraft, type ScenarioResult } from "../src/results.js";
import { formatScorecard } from "../src/run.js";
import type { Verdict } from "../src/score.js";

type Cell = [id: string, verdict: Verdict, extra?: Partial<ScenarioResult>];

function scenarios(cells: Cell[]): ScenarioResult[] {
  return cells.map(([id, judge_verdict, extra]) => ({
    id,
    judge_verdict,
    judge_reason: "",
    suspect: false,
    override: null,
    note: "",
    ...extra,
  }));
}

function draft(mode: string, cells: Cell[], over: Partial<ResultsDraft> = {}): ResultsDraft {
  return {
    skill: "golden",
    harness: "pi",
    model: "fireworks:fake",
    judge: { provider: "anthropic", model: "opus" },
    timestamp: `2026-08-04T00:00:0${mode === "red" ? 0 : 1}Z`,
    label: null,
    mode,
    scenarios: scenarios(cells),
    ...over,
  };
}

const SPEC = `
skill: golden
judge_persona: a judge.
ship_bar: { total: 2, min_pass: 2 }
critical: [A1]
scenarios:
  - id: A1
    title: first
    turns: ["do it"]
    checklist: ["does it"]
  - id: A2
    title: second
    turns: ["do it again"]
    checklist: ["does it again"]
`;

/** Same two scenarios plus D1, which runs as its own system prompt in every mode. */
const SPEC_WITH_AGENT_FILE = `${SPEC}
  - id: D1
    title: delegated
    turns: ["delegate it"]
    checklist: ["delegates it"]
    system_prompt_file: agents/review.md
`;

/** A red and a green run under one model tag, in that chronological order. */
function skillWithRuns(
  redCells: Cell[] | null,
  greenCells: Cell[] | null,
  opts: { partialGreen?: boolean; spec?: string } = {},
): string {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-lift-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), opts.spec ?? SPEC, "utf8");
  const tag = join(skillDir, "tests", "results", "pi-fake");
  if (redCells) {
    writeResults(join(tag, "2026-08-04T00-00-00Z"), draft("red", redCells), null);
  }
  if (greenCells) {
    writeResults(
      join(tag, "2026-08-04T00-00-01Z"),
      draft("green", greenCells, opts.partialGreen ? { partial: true } : {}),
      { shipBar: { total: 2, min_pass: 2, no_critical_fail: true }, critical: ["A1"] },
    );
  }
  return skillDir;
}

describe("computeLift classification", () => {
  test("red FAIL -> green PASS is a gain: the skill did this", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(lift.cells.A1.class).toBe("gained");
    expect(lift.gained).toBe(1);
    expect(lift.delta).toBe(1);
  });

  test("red PASS -> green FAIL is a regression: the skill broke this", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "FAIL"]]), null),
    );
    expect(lift.cells.A1.class).toBe("regressed");
    expect(lift.regressed).toBe(1);
    expect(lift.delta).toBe(-1);
  });

  test("both PASS is kept, not a gain — the model did not need the skill", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(lift.cells.A1.class).toBe("kept");
    expect(lift.gained).toBe(0);
    expect(lift.delta).toBe(0);
  });

  test("both FAIL is neither gain nor regression", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "FAIL"]]), null),
    );
    expect(lift.cells.A1.class).toBe("both-fail");
    expect(lift.delta).toBe(0);
  });

  test("an author override is what counts, on either side", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "PASS", { override: "FAIL", note: "judge was wrong" }]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    // red's effective verdict is the override (FAIL), so this is a real gain
    expect(lift.cells.A1.class).toBe("gained");
  });
});

describe("computeLift refuses to invent evidence", () => {
  // An ERROR is a harness failure, not evidence the skill-less agent failed the
  // task. Counting red ERROR -> green PASS as a gain would inflate every lift
  // number with infrastructure noise.
  test("an ERROR on either side is inconclusive, never a gain", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "ERROR"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(lift.cells.A1.class).toBe("inconclusive");
    expect(lift.gained).toBe(0);
    expect(lift.inconclusive).toBe(1);
    expect(lift.delta).toBe(0);
  });

  test("an unresolved judge misfire is inconclusive on either side", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL", { suspect: true }]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(lift.cells.A1.class).toBe("inconclusive");
    expect(lift.inconclusive).toBe(1);
  });

  test("an override resolves a misfire, restoring it to the comparison", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL", { suspect: true, override: "FAIL", note: "checked" }]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(lift.cells.A1.class).toBe("gained");
    expect(lift.inconclusive).toBe(0);
  });

  test("JUDGE-AMBIGUOUS is inconclusive, never a pass", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "JUDGE-AMBIGUOUS"]]), null),
      finalizeResults(draft("green", [["A1", "JUDGE-AMBIGUOUS"]]), null),
    );
    expect(lift.cells.A1.class).toBe("inconclusive");
  });

  test("only scenarios present in BOTH runs are compared", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["A2", "PASS"]]), null),
    );
    expect(Object.keys(lift.cells)).toEqual(["A1"]);
    expect(lift.compared).toBe(1);
    expect(lift.greenOnly).toEqual(["A2"]);
  });
});

describe("computeLift aggregates", () => {
  test("counts each class and reports the pass delta over conclusive cells", () => {
    const lift = computeLift(
      finalizeResults(
        draft("red", [["A1", "FAIL"], ["A2", "PASS"], ["A3", "PASS"], ["A4", "FAIL"], ["A5", "ERROR"]]),
        null,
      ),
      finalizeResults(
        draft("green", [["A1", "PASS"], ["A2", "PASS"], ["A3", "FAIL"], ["A4", "FAIL"], ["A5", "PASS"]]),
        null,
      ),
    );
    expect(lift).toMatchObject({
      gained: 1, // A1
      kept: 1, // A2
      regressed: 1, // A3
      bothFail: 1, // A4
      inconclusive: 1, // A5 (red ERROR)
      compared: 5,
    });
    expect(lift.redPassed).toBe(2); // A2, A3 among conclusive
    expect(lift.greenPassed).toBe(2); // A1, A2 among conclusive
    expect(lift.delta).toBe(0); // net zero: one gained, one regressed
  });
});

describe("liftHeadline", () => {
  test("says the skill does nothing when nothing changed", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(liftHeadline(lift)).toMatch(/no measured effect/i);
  });

  test("leads with the gain when the skill helps", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["A2", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["A2", "PASS"]]), null),
    );
    expect(liftHeadline(lift)).toMatch(/\+2/);
  });

  test("calls out regressions even when the net is positive", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["A2", "FAIL"], ["A3", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["A2", "PASS"], ["A3", "FAIL"]]), null),
    );
    expect(liftHeadline(lift)).toMatch(/1 regress/i);
  });
});

describe("collectLift pairs runs on disk", () => {
  test("pairs the latest red with the latest green under one model tag", () => {
    const skillDir = skillWithRuns([["A1", "FAIL"], ["A2", "FAIL"]], [["A1", "PASS"], ["A2", "FAIL"]]);
    const lifts = collectLift(skillDir);
    expect(lifts).toHaveLength(1);
    expect(lifts[0]).toMatchObject({ tag: "pi-fake", gained: 1, compared: 2 });
  });

  test("no red baseline means no lift at all — never a fabricated zero", () => {
    const skillDir = skillWithRuns(null, [["A1", "PASS"]]);
    expect(collectLift(skillDir)).toEqual([]);
  });

  test("a red run with no green counterpart yields no lift", () => {
    const skillDir = skillWithRuns([["A1", "FAIL"]], null);
    expect(collectLift(skillDir)).toEqual([]);
  });

  test("a skill with no results dir at all yields no lift", () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sh-lift-bare-"));
    mkdirSync(join(skillDir, "tests"), { recursive: true });
    writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
    expect(collectLift(skillDir)).toEqual([]);
  });

  test("flags a comparison whose green side was a partial (--only) run", () => {
    const skillDir = skillWithRuns([["A1", "FAIL"], ["A2", "FAIL"]], [["A1", "PASS"]], { partialGreen: true });
    const lifts = collectLift(skillDir);
    expect(lifts[0].partial).toBe(true);
    expect(lifts[0].compared).toBe(1); // only the intersection
  });

  test("uses the most recent red run when several exist", () => {
    const skillDir = skillWithRuns([["A1", "PASS"]], [["A1", "PASS"]]);
    // a newer red run that disagrees with the older one
    writeResults(
      join(skillDir, "tests", "results", "pi-fake", "2026-08-04T00-00-02Z"),
      draft("red", [["A1", "FAIL"]]),
      null,
    );
    const lifts = collectLift(skillDir);
    expect(lifts[0].cells.A1.class).toBe("gained"); // newest red (FAIL) -> green PASS
  });

  test("an unreadable results.yaml is skipped, not thrown", () => {
    const skillDir = skillWithRuns([["A1", "FAIL"]], [["A1", "PASS"]]);
    const bad = join(skillDir, "tests", "results", "pi-fake", "2026-08-04T00-00-09Z");
    mkdirSync(bad, { recursive: true });
    writeFileSync(join(bad, "results.yaml"), ":\n  not: [valid", "utf8");
    expect(() => collectLift(skillDir)).not.toThrow();
    expect(collectLift(skillDir)).toHaveLength(1);
  });
});

describe("formatScorecard lift line", () => {
  const summary = (mode: string, cells: Cell[]) => ({
    runDir: "/tmp/whatever",
    results: finalizeResults(draft(mode, cells), { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [] }),
  });

  test("reports the lift when a baseline exists", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    const out = formatScorecard(summary("green", [["A1", "PASS"]]), lift);
    expect(out).toMatch(/LIFT:.*\+1 net/);
    expect(out).toMatch(/vs red baseline/);
  });

  // The grade alone cannot answer "does this skill do anything?" — a green run
  // with no baseline must say so and name the fix, not stay silent.
  test("tells a green run with no baseline how to get one", () => {
    const out = formatScorecard(summary("green", [["A1", "PASS"]]));
    expect(out).toMatch(/no red baseline/);
    expect(out).toMatch(/--mode red/);
  });

  test("says nothing about lift on a red run", () => {
    const out = formatScorecard(summary("red", [["A1", "PASS"]]));
    expect(out).not.toMatch(/LIFT/);
  });
});

// Regression tests for defects found in review of this feature.
describe("lift never claims 'no effect' when it measured nothing", () => {
  test("all-inconclusive says nothing conclusive, not no-effect", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "ERROR"], ["A2", "ERROR"]]), null),
      finalizeResults(draft("green", [["A1", "ERROR"], ["A2", "ERROR"]]), null),
    );
    const headline = liftHeadline(lift);
    expect(headline).toMatch(/nothing conclusive/i);
    expect(headline).not.toMatch(/no measured effect/i);
  });

  // The nastiest shape: the skill may be doing everything, but the baseline
  // errored out, so there is no evidence either way. Reporting "no effect" here
  // actively misrepresents a skill that works.
  test("a wholly-errored red baseline is not evidence of no effect", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "ERROR"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    expect(liftHeadline(lift)).not.toMatch(/no measured effect/i);
    expect(liftHeadline(lift)).toMatch(/nothing conclusive/i);
  });

  test("both-fail is still a real measurement, so it keeps saying no effect", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "FAIL"]]), null),
    );
    expect(liftHeadline(lift)).toMatch(/no measured effect/i);
  });
});

describe("mode-insensitive scenarios are not comparable", () => {
  // pi.ts: an agent-file run IS the system prompt — "no skill activation, whatever
  // the mode" — so a system_prompt_file scenario runs identically in red and green.
  // Counting it as `kept` would credit the red side with a pass the skill produced.
  test("a system_prompt_file scenario is excluded from the comparison, not classed kept", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["D1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["D1", "PASS"]]), null),
      { modeInsensitive: ["D1"] },
    );
    expect(lift.modeInsensitive).toEqual(["D1"]);
    expect(lift.cells.D1).toBeUndefined();
    expect(lift.kept).toBe(0);
    expect(lift.compared).toBe(1);
    expect(lift.gained).toBe(1);
  });

  test("an excluded scenario does not inflate redPassed, which is what understated lift", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["D1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["D1", "PASS"]]), null),
      { modeInsensitive: ["D1"] },
    );
    expect(lift.redPassed).toBe(0);
    expect(lift.greenPassed).toBe(1);
    expect(lift.delta).toBe(1);
  });

  test("with no opts every scenario is still compared — the default is unchanged", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["D1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["D1", "PASS"]]), null),
    );
    expect(lift.modeInsensitive).toEqual([]);
    expect(lift.compared).toBe(2);
  });

  test("collectLift reads system_prompt_file out of the spec", () => {
    const skillDir = skillWithRuns([["A1", "FAIL"], ["D1", "PASS"]], [["A1", "PASS"], ["D1", "PASS"]], {
      spec: SPEC_WITH_AGENT_FILE,
    });
    const [lift] = collectLift(skillDir);
    expect(lift.modeInsensitive).toEqual(["D1"]);
    expect(lift.compared).toBe(1);
  });

  test("the headline says how many were not comparable, rather than hiding them", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["D1", "PASS"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["D1", "PASS"]]), null),
      { modeInsensitive: ["D1"] },
    );
    expect(liftHeadline(lift)).toMatch(/1 not comparable/i);
  });

  test("a lift whose every shared scenario is mode-insensitive reports no comparison", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["D1", "PASS"]]), null),
      finalizeResults(draft("green", [["D1", "PASS"]]), null),
      { modeInsensitive: ["D1"] },
    );
    expect(lift.compared).toBe(0);
  });

  // "no shared scenarios" would be false — the runs share D1, it just cannot be
  // compared. Saying so is the same distinction `inconclusive` protects: not
  // measured and measured-no-effect are different claims.
  test("all-excluded says why, rather than claiming the runs shared nothing", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["D1", "PASS"]]), null),
      finalizeResults(draft("green", [["D1", "PASS"]]), null),
      { modeInsensitive: ["D1"] },
    );
    expect(liftHeadline(lift)).not.toMatch(/no shared scenarios/i);
    expect(liftHeadline(lift)).toMatch(/nothing comparable/i);
    expect(liftHeadline(lift)).toMatch(/both modes/i);
  });
});

/** The aggregation shape of a `--reps N` cell — only the fields a lift comparison reads. */
function agg(n: number, threshold = 0.5): Partial<ScenarioResult> {
  return { reps: n, pass_threshold: threshold };
}

describe("cells aggregated differently on the two sides are not comparable", () => {
  // A one-rep red verdict is a single draw; a three-rep green verdict is a
  // majority. "red FAIL -> green PASS" across that gap can be sampling alone, so
  // counting it as `gained` reports the harness's own asymmetry as skill value.
  test("red at 1 rep vs green at 3 is excluded, not classed gained", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS", agg(3)]]), null),
    );
    expect(lift.aggregationMismatch).toEqual([
      { id: "A1", red: { reps: 1, threshold: null }, green: { reps: 3, threshold: 0.5 } },
    ]);
    expect(lift.cells.A1).toBeUndefined();
    expect(lift.gained).toBe(0);
    expect(lift.compared).toBe(0);
  });

  test("an excluded cell moves neither side's pass count nor the delta", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "PASS"], ["A2", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS", agg(3)], ["A2", "PASS"]]), null),
    );
    expect(lift.compared).toBe(1);
    expect(lift.redPassed).toBe(0);
    expect(lift.greenPassed).toBe(1);
    expect(lift.delta).toBe(1);
  });

  test("equal reps and equal threshold compare as before", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL", agg(3)]]), null),
      finalizeResults(draft("green", [["A1", "PASS", agg(3)]]), null),
    );
    expect(lift.aggregationMismatch).toEqual([]);
    expect(lift.gained).toBe(1);
  });

  // Same rep count, different majority policy: green needed 1 of 3 to pass where
  // red needed 3 of 3. Like-for-like is about the whole aggregation, not just N.
  test("the same reps under different pass thresholds is still a mismatch", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL", agg(3, 1)]]), null),
      finalizeResults(draft("green", [["A1", "PASS", agg(3, 0.34)]]), null),
    );
    expect(lift.aggregationMismatch).toHaveLength(1);
    expect(lift.compared).toBe(0);
  });

  // A single rep never goes through aggregateReps, so a threshold recorded beside
  // it was not applied to anything. Excluding on it would refuse a comparison
  // that is in fact like-for-like.
  test("a threshold is ignored where neither side aggregated anything", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS", { pass_threshold: 0.5 }]]), null),
    );
    expect(lift.aggregationMismatch).toEqual([]);
    expect(lift.gained).toBe(1);
  });

  test("the headline names the mismatch instead of quietly dropping the cell", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"], ["A2", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"], ["A2", "PASS", agg(3)]]), null),
    );
    expect(liftHeadline(lift)).toMatch(/1 not comparable/i);
    expect(liftHeadline(lift)).toMatch(/1 rep vs 3 reps/i);
  });

  // "no measured effect" would be a claim about the skill. There is no measurement
  // here at all — the same not-measured/measured-no-effect line `inconclusive`
  // and `modeInsensitive` both hold.
  test("all-excluded says what to re-run, rather than reporting no effect", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS", agg(3)]]), null),
    );
    const headline = liftHeadline(lift);
    expect(headline).not.toMatch(/no measured effect|no shared scenarios/i);
    expect(headline).toMatch(/nothing comparable/i);
    expect(headline).toMatch(/--reps 3/);
  });

  test("collectLift surfaces the mismatch on runs read off disk", () => {
    const skillDir = skillWithRuns([["A1", "FAIL"], ["A2", "FAIL"]], [["A1", "PASS", agg(3)], ["A2", "PASS", agg(3)]]);
    const [lift] = collectLift(skillDir);
    expect(lift.aggregationMismatch.map((m) => m.id)).toEqual(["A1", "A2"]);
    expect(lift.compared).toBe(0);
  });
});

describe("formatScorecard does not print lift under a red baseline", () => {
  test("a red run stays silent even when a lift is available", () => {
    const lift = computeLift(
      finalizeResults(draft("red", [["A1", "FAIL"]]), null),
      finalizeResults(draft("green", [["A1", "PASS"]]), null),
    );
    const redSummary = {
      runDir: "/tmp/x",
      results: finalizeResults(draft("red", [["A1", "FAIL"]]), null),
    };
    expect(formatScorecard(redSummary, lift)).not.toMatch(/LIFT/);
  });
});
