import { describe, test, expect } from "vitest";
import { computeLift, liftHeadline } from "../src/lift.js";
import { finalizeResults, type ResultsDraft, type ScenarioResult } from "../src/results.js";
import type { Verdict } from "../src/score.js";
// assets/report.grade.js is the exact module injected into report.template.html.
// Imported directly (plain ESM, no bundler) so this test guards the real thing —
// the same arrangement grade-column-parity.test.ts uses for gradeColumn.
import { liftClass, liftSummary, liftNoneBadge } from "../../../assets/report.grade.js";

interface CellFixture {
  id: string;
  red: Verdict;
  redSuspect?: boolean;
  green: Verdict;
  greenSuspect?: boolean;
  greenOverride?: Verdict | null;
}

function scenario(id: string, verdict: Verdict, suspect = false, override: Verdict | null = null): ScenarioResult {
  return { id, judge_verdict: verdict, judge_reason: "", suspect, override, note: override ? "why" : "" };
}

function draft(mode: string, scenarios: ScenarioResult[]): ResultsDraft {
  return {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "anthropic", model: "opus" },
    timestamp: "2026-08-04T00:00:00Z", label: null, mode, scenarios,
  };
}

/** Build the server-side Lift and the client-side column from the SAME fixtures. */
function build(cells: CellFixture[]) {
  const red = finalizeResults(draft("red", cells.map((c) => scenario(c.id, c.red, c.redSuspect))), null);
  const green = finalizeResults(
    draft("green", cells.map((c) => scenario(c.id, c.green, c.greenSuspect, c.greenOverride ?? null))),
    null,
  );
  const lift = computeLift(red, green);
  const col = {
    lift,
    cells: Object.fromEntries(
      cells.map((c) => [
        c.id,
        { judge_verdict: c.green, override: c.greenOverride ?? null, suspect: !!c.greenSuspect },
      ]),
    ),
  };
  return { lift, col };
}

const FIXTURES: Record<string, CellFixture[]> = {
  "gained, kept, regressed, both-fail together": [
    { id: "A1", red: "FAIL", green: "PASS" },
    { id: "A2", red: "PASS", green: "PASS" },
    { id: "A3", red: "PASS", green: "FAIL" },
    { id: "A4", red: "FAIL", green: "FAIL" },
  ],
  "red ERROR is inconclusive": [
    { id: "A1", red: "ERROR", green: "PASS" },
    { id: "A2", red: "FAIL", green: "PASS" },
  ],
  "green ERROR is inconclusive": [
    { id: "A1", red: "FAIL", green: "ERROR" },
  ],
  "JUDGE-AMBIGUOUS on either side is inconclusive": [
    { id: "A1", red: "JUDGE-AMBIGUOUS", green: "PASS" },
    { id: "A2", red: "FAIL", green: "JUDGE-AMBIGUOUS" },
  ],
  "unresolved misfire is inconclusive on the red side": [
    { id: "A1", red: "FAIL", redSuspect: true, green: "PASS" },
  ],
  "unresolved misfire is inconclusive on the green side": [
    { id: "A1", red: "FAIL", green: "FAIL", greenSuspect: true },
  ],
  "an override resolves a green misfire and restores the comparison": [
    { id: "A1", red: "FAIL", green: "FAIL", greenSuspect: true, greenOverride: "PASS" },
  ],
  "a green override flips the class to regressed": [
    { id: "A1", red: "PASS", green: "PASS", greenOverride: "FAIL" },
  ],
  "a green override flips the class to gained": [
    { id: "A1", red: "FAIL", green: "FAIL", greenOverride: "PASS" },
  ],
  "all inconclusive": [
    { id: "A1", red: "ERROR", green: "ERROR" },
  ],
};

describe("report.grade.js liftClass matches lift.ts classify (drift guard)", () => {
  for (const [name, cells] of Object.entries(FIXTURES)) {
    test(name, () => {
      const { lift, col } = build(cells);
      for (const c of cells) {
        expect(liftClass(lift.cells[c.id], col.cells[c.id]), `class for ${c.id}`).toBe(lift.cells[c.id].class);
      }
    });
  }
});

describe("report.grade.js liftSummary matches computeLift aggregates (drift guard)", () => {
  for (const [name, cells] of Object.entries(FIXTURES)) {
    test(name, () => {
      const { lift, col } = build(cells);
      const actual = liftSummary(col);
      expect(actual).toMatchObject({
        gained: lift.gained,
        regressed: lift.regressed,
        kept: lift.kept,
        bothFail: lift.bothFail,
        inconclusive: lift.inconclusive,
        compared: lift.compared,
        redPassed: lift.redPassed,
        greenPassed: lift.greenPassed,
        delta: lift.delta,
      });
    });
  }
});

describe("liftNoneBadge distinguishes a missing baseline from an unusable one", () => {
  // The UI used to fall through to "no red baseline" whenever nothing was
  // comparable — which is false, and hides the one thing the viewer needs to know:
  // a baseline exists and why it could not be used.
  test("a baseline that produced no comparable cell reports why, not 'no red baseline'", () => {
    const red = finalizeResults(draft("red", [scenario("A1", "FAIL")]), null);
    const green = finalizeResults(
      draft("green", [{ ...scenario("A1", "PASS"), reps: 3, pass_threshold: 0.5 }]),
      null,
    );
    const lift = computeLift(red, green);
    const badge = liftNoneBadge({ mode: "green", lift, liftHeadline: liftHeadline(lift) });
    expect(badge.text).not.toMatch(/no red baseline/i);
    expect(badge.title).toMatch(/--reps 3/);
  });

  test("a green column with no baseline at all still says so", () => {
    const badge = liftNoneBadge({ mode: "green" });
    expect(badge.text).toMatch(/no red baseline/i);
    expect(badge.title).toMatch(/--mode red/);
  });

  test("an unscored column with no baseline shows no lift badge", () => {
    expect(liftNoneBadge({ mode: "red" })).toBeNull();
  });
});

describe("liftSummary edge cases", () => {
  test("returns null for a column with no baseline, so the UI renders nothing", () => {
    expect(liftSummary({ cells: {} })).toBeNull();
  });

  test("skips a lift cell whose green scenario is absent from the live column", () => {
    const { lift } = build([{ id: "A1", red: "FAIL", green: "PASS" }]);
    // green cell removed from the live column (e.g. spec dropped the scenario)
    expect(liftSummary({ lift, cells: {} })).toMatchObject({ compared: 0, gained: 0 });
  });
});
