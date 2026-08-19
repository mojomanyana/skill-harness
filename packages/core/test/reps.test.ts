import { describe, test, expect } from "vitest";
import { aggregateReps, outcomesToResult, type RepOutcome } from "../src/reps.js";

const pass = (): RepOutcome => ({ verdict: "PASS", reason: "ok", suspect: false });
const fail = (): RepOutcome => ({ verdict: "FAIL", reason: "nope", suspect: false });
const susp = (): RepOutcome => ({ verdict: "FAIL", reason: "misfire", suspect: true });
const err = (): RepOutcome => ({ verdict: "ERROR", reason: "judge unparseable", suspect: false });

describe("aggregateReps", () => {
  test("single clean PASS → PASS, no reps inflation of flakiness", () => {
    const a = aggregateReps([pass()], 0.5);
    expect(a).toMatchObject({ verdict: "PASS", passes: 1, reps: 1, clean: 1, flakiness: 0, suspect: false });
    expect(a.reason).toBe("ok"); // N=1 keeps the rep's own reason
  });

  test("single clean FAIL → FAIL", () => {
    expect(aggregateReps([fail()], 0.5)).toMatchObject({ verdict: "FAIL", passes: 0, clean: 1, flakiness: 0, suspect: false });
  });

  test("majority pass at default 0.5 → PASS with flakiness", () => {
    const a = aggregateReps([pass(), pass(), pass(), fail(), fail()], 0.5); // 3/5 = 0.6
    expect(a.verdict).toBe("PASS");
    expect(a.passes).toBe(3);
    expect(a.reps).toBe(5);
    expect(a.clean).toBe(5);
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
    expect(a.clean).toBe(2);
    expect(a.reason).toMatch(/misfired/);
  });

  test("minority suspect → not suspect; pass-rate over clean reps only", () => {
    const a = aggregateReps([susp(), pass(), pass(), pass(), fail()], 0.5); // 4 clean, 3 pass → 0.75
    expect(a.suspect).toBe(false);
    expect(a.verdict).toBe("PASS");
    expect(a.passes).toBe(3);
    expect(a.reps).toBe(5);
    expect(a.clean).toBe(4);
    expect(a.reason).toMatch(/3\/4 reps passed/); // denominator is clean.length, not reps
  });

  test("exactly half the reps clean → NOT suspect (boundary)", () => {
    const a = aggregateReps([susp(), susp(), pass(), pass()], 0.5); // 2 clean of 4
    expect(a.suspect).toBe(false);
    expect(a.verdict).toBe("PASS"); // 2/2 clean passed
    expect(a.passes).toBe(2);
    expect(a.clean).toBe(2);
  });

  test("all suspect → suspect", () => {
    expect(aggregateReps([susp(), susp()], 0.5)).toMatchObject({ suspect: true, verdict: "FAIL", clean: 0 });
  });

  test("all clean reps ERROR → aggregate verdict ERROR, not FAIL", () => {
    const a = aggregateReps([err(), err(), err()], 0.5);
    expect(a.verdict).toBe("ERROR");
    expect(a.suspect).toBe(false);
    expect(a.reason).toMatch(/errored/);
  });

  test("a mix of ERROR and PASS remains ERROR — infrastructure cannot be voted into a behavioral pass", () => {
    const a = aggregateReps([err(), pass(), pass()], 0.5);
    expect(a.verdict).toBe("ERROR");
    expect(a.passes).toBe(2);
    expect(a.reason).toMatch(/1\/3 reps errored/);
  });

  test("several ERROR reps remain ERROR rather than a behavioral FAIL", () => {
    const a = aggregateReps([err(), err(), pass()], 0.5);
    expect(a.verdict).toBe("ERROR");
    expect(a.passes).toBe(1);
  });

  test("ERROR outranks a majority-misfire aggregate instead of becoming behavioral FAIL", () => {
    const a = aggregateReps([{ ...fail(), suspect: true }, { ...fail(), suspect: true }, err()], 1);
    expect(a.verdict).toBe("ERROR");
    expect(a.suspect).toBe(false);
  });
});

describe("outcomesToResult", () => {
  test("retains per-repetition objective hashes for later tamper detection", () => {
    const outcomes = ["a", "b"].map((char) => ({
      ...pass(),
      objective: { status: "PASS" as const, events_sha256: char.repeat(64), assertions: [] },
    }));
    const result = outcomesToResult("A1", outcomes, 2, 1);
    expect(result.objective?.rep_events_sha256).toEqual(["a".repeat(64), "b".repeat(64)]);
  });

  test("single rep → no reps fields (byte-identical to a plain run)", () => {
    const r = outcomesToResult("A1", [pass()], 1, 0.5);
    expect(r).toEqual({ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" });
  });

  test("aggregates cost/latency/tool counters separately from behavioral correctness", () => {
    const first: RepOutcome = {
      ...pass(),
      metrics: {
        wall_time_ms: 120, judge_calls: 1, judge_rejudge_calls: 0,
        subject: { input_tokens: 10, output_tokens: 2, cache_read_tokens: 3, cache_write_tokens: 0, cost_usd: 0.01, tool_calls: 2, delegated_children: 1, max_concurrency: 2 },
      },
    };
    const second: RepOutcome = {
      ...fail(),
      metrics: { wall_time_ms: 80, judge_calls: 1, judge_rejudge_calls: 0 },
    };
    const result = outcomesToResult("A1", [first, second], 2, 0.5);
    expect(result.metrics).toEqual({
      wall_time_ms: 200,
      judge_calls: 2,
      judge_rejudge_calls: 0,
      subject_metrics_reps: 1,
      total_reps: 2,
      input_tokens: 10,
      output_tokens: 2,
      cache_read_tokens: 3,
      cache_write_tokens: 0,
      subject_cost_usd: 0.01,
      tool_calls: 2,
      delegated_children: 1,
      max_concurrency: 2,
    });
  });

  test("multi rep → reps/passes/clean/flakiness + persisted pass_threshold", () => {
    const r = outcomesToResult("A1", [pass(), pass(), fail()], 3, 0.6);
    expect(r.reps).toBe(3);
    expect(r.passes).toBe(2);
    expect(r.clean).toBe(3);
    expect(r.pass_threshold).toBe(0.6);
    expect(r.judge_verdict).toBe("PASS"); // 2/3 = 0.67 >= 0.6
    expect(r.override).toBeNull();
  });
});
