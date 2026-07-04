import { describe, test, expect } from "vitest";
import { score, type ScenarioVerdict } from "../src/score.js";
import type { ShipBar } from "../src/spec.js";
// assets/report.grade.js is plain ESM JS, deliberately without a bundler (see
// M4 fix notes) — imported directly here so this test exercises the exact
// module that gets injected verbatim into report.template.html. If a future
// change to score.ts's rules isn't mirrored in report.grade.js, this test
// fails: it is the drift guard for the review UI's client-side scorer.
import { gradeColumn } from "../../../assets/report.grade.js";

interface CellFixture {
  id: string;
  judge_verdict: "PASS" | "FAIL" | "ERROR";
  override?: "PASS" | "FAIL" | "ERROR" | null;
  suspect?: boolean;
}

const SHIP_BAR: ShipBar = { total: 3, min_pass: 3, no_critical_fail: true };
const CRITICAL = ["A1"];

/**
 * Build both score.ts's verdict list and a report.grade.js column from the
 * SAME cell fixtures, via the same effective()+suspect rule the review UI
 * and results.yaml both use: verdict is override||judge_verdict, and a cell
 * is "suspect" only while unresolved (suspect && !override).
 */
function build(cells: CellFixture[]) {
  const verdicts: ScenarioVerdict[] = cells.map((c) => ({
    id: c.id,
    verdict: c.override || c.judge_verdict,
    suspect: !!c.suspect && !c.override,
  }));
  const col = {
    cells: Object.fromEntries(
      cells.map((c) => [
        c.id,
        { judge_verdict: c.judge_verdict, override: c.override ?? null, suspect: !!c.suspect },
      ])
    ),
  };
  return { verdicts, col };
}

const FIXTURES: Record<string, CellFixture[]> = {
  "all pass": [
    { id: "A1", judge_verdict: "PASS" },
    { id: "C2", judge_verdict: "PASS" },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "plain fail (non-critical, non-B) still scores": [
    { id: "A1", judge_verdict: "PASS" },
    { id: "C2", judge_verdict: "FAIL" },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "critical fail gates ship": [
    { id: "A1", judge_verdict: "FAIL" },
    { id: "C2", judge_verdict: "PASS" },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "B-series fail gates ship": [
    { id: "A1", judge_verdict: "PASS" },
    { id: "B1", judge_verdict: "FAIL" },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "unresolved suspect excludes cell + blocks ship": [
    { id: "A1", judge_verdict: "PASS" },
    { id: "C2", judge_verdict: "FAIL", suspect: true },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "suspect resolved by override counts as override verdict, unblocks ship": [
    { id: "A1", judge_verdict: "PASS" },
    { id: "C2", judge_verdict: "FAIL", suspect: true, override: "PASS" },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "mix: critical fail + B-series fail + resolved suspect fail": [
    { id: "A1", judge_verdict: "FAIL" },
    { id: "B1", judge_verdict: "FAIL" },
    { id: "C2", judge_verdict: "FAIL", suspect: true, override: "FAIL" },
    { id: "C3", judge_verdict: "PASS" },
  ],
  "mix: unresolved suspect alongside a critical fail": [
    { id: "A1", judge_verdict: "FAIL" },
    { id: "B1", judge_verdict: "PASS" },
    { id: "C2", judge_verdict: "PASS", suspect: true },
    { id: "C3", judge_verdict: "PASS" },
  ],
};

describe("report.grade.js gradeColumn matches score.ts score() (drift guard)", () => {
  for (const [name, cells] of Object.entries(FIXTURES)) {
    test(name, () => {
      const { verdicts, col } = build(cells);
      const expected = score(verdicts, { shipBar: SHIP_BAR, critical: CRITICAL });
      const actual = gradeColumn(col, SHIP_BAR, CRITICAL);
      expect(actual.passed).toBe(expected.passed);
      expect(actual.total).toBe(expected.total);
      expect(actual.ship).toBe(expected.ship);
      expect(actual.pct).toBe(expected.pct);
      expect(actual.letter).toBe(expected.letter);
      expect(actual.suspect).toBe(expected.suspectCount);
    });
  }
});
