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

/** A red and a green run under one model tag, in that chronological order. */
function skillWithRuns(redCells: Cell[] | null, greenCells: Cell[] | null, opts: { partialGreen?: boolean } = {}): string {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-lift-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
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
