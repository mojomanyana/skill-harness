import { describe, test, expect } from "vitest";
import { aggregateReps, type RepOutcome } from "../src/reps.js";

const pass = (): RepOutcome => ({ verdict: "PASS", reason: "ok", suspect: false });
const fail = (): RepOutcome => ({ verdict: "FAIL", reason: "nope", suspect: false });
const susp = (): RepOutcome => ({ verdict: "FAIL", reason: "misfire", suspect: true });

describe("aggregateReps", () => {
  test("single clean PASS → PASS, no reps inflation of flakiness", () => {
    const a = aggregateReps([pass()], 0.5);
    expect(a).toMatchObject({ verdict: "PASS", passes: 1, reps: 1, flakiness: 0, suspect: false });
    expect(a.reason).toBe("ok"); // N=1 keeps the rep's own reason
  });

  test("single clean FAIL → FAIL", () => {
    expect(aggregateReps([fail()], 0.5)).toMatchObject({ verdict: "FAIL", passes: 0, flakiness: 0, suspect: false });
  });

  test("majority pass at default 0.5 → PASS with flakiness", () => {
    const a = aggregateReps([pass(), pass(), pass(), fail(), fail()], 0.5); // 3/5 = 0.6
    expect(a.verdict).toBe("PASS");
    expect(a.passes).toBe(3);
    expect(a.reps).toBe(5);
    expect(a.flakiness).toBeCloseTo(1 - Math.abs(2 * 0.6 - 1), 5); // 0.8
    expect(a.reason).toMatch(/3\/5/);
  });

  test("even split passes at default 0.5 (ties pass)", () => {
    expect(aggregateReps([pass(), pass(), fail(), fail()], 0.5).verdict).toBe("PASS"); // 2/4 = 0.5 >= 0.5
  });

  test("custom threshold 0.8 rejects 3/5", () => {
    expect(aggregateReps([pass(), pass(), pass(), fail(), fail()], 0.8).verdict).toBe("FAIL");
  });

  test("fewer than half clean → suspect (excluded verdict is FAIL placeholder)", () => {
    const a = aggregateReps([susp(), susp(), susp(), pass(), pass()], 0.5); // 2 clean of 5
    expect(a.suspect).toBe(true);
    expect(a.verdict).toBe("FAIL");
    expect(a.reason).toMatch(/misfired/);
  });

  test("minority suspect → not suspect; pass-rate over clean reps only", () => {
    const a = aggregateReps([susp(), pass(), pass(), pass(), fail()], 0.5); // 4 clean, 3 pass → 0.75
    expect(a.suspect).toBe(false);
    expect(a.verdict).toBe("PASS");
    expect(a.passes).toBe(3);
  });

  test("all suspect → suspect", () => {
    expect(aggregateReps([susp(), susp()], 0.5)).toMatchObject({ suspect: true, verdict: "FAIL" });
  });
});
