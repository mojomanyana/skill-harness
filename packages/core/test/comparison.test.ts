import { describe, expect, it } from "vitest";
import { buildComparison, comparisonExitCode, formatComparison, type ComparisonDigests } from "../src/comparison.js";
import type { ResultsFile, ScenarioResult } from "../src/results.js";

const DIGESTS: ComparisonDigests = {
  reference: { skill: "a".repeat(64), spec: "b".repeat(64), fixtures: { "fixtures/A1": "c".repeat(64) }, inputs: { "fixture:fixtures/A1": "c".repeat(64) } },
  candidate: { skill: "d".repeat(64), spec: "b".repeat(64), fixtures: { "fixtures/A1": "c".repeat(64) }, inputs: { "fixture:fixtures/A1": "c".repeat(64) } },
  harness: "e".repeat(64),
  model: "f".repeat(64),
  judge: "9".repeat(64),
  environment: { node: "v26", platform: "linux", arch: "x64" },
};

function scenario(id: string, verdict: "PASS" | "FAIL" | "ERROR", metrics?: ScenarioResult["metrics"]): ScenarioResult {
  return { id, judge_verdict: verdict, judge_reason: verdict, suspect: false, override: null, note: "", ...(metrics ? { metrics } : {}) };
}

function results(scenarios: ScenarioResult[], ship: boolean, partial = false): ResultsFile {
  return {
    schema: 2, skill: "demo", harness: "pi", model: "p:m", judge: { provider: "j", model: "x" },
    timestamp: "2026-08-19T00:00:00Z", label: null, mode: "force", ...(partial ? { partial: true } : {}),
    effective_grade: { passed: scenarios.filter((s) => s.judge_verdict === "PASS").length, total: scenarios.length, pct: 0, letter: "F", ship, note: "" },
    scenarios,
  };
}

const metric = (tokens: number, wall: number): ScenarioResult["metrics"] => ({
  wall_time_ms: wall, judge_calls: 1, judge_rejudge_calls: 0, subject_metrics_reps: 1, total_reps: 1,
  input_tokens: tokens, output_tokens: 10, cache_read_tokens: 0, cache_write_tokens: 0,
  subject_cost_usd: 0.01, tool_calls: 2, delegated_children: 1, max_concurrency: 2,
});

describe("paired reference-versus-candidate comparison", () => {
  it("reports per-scenario regression/lift, variance, cost, and critical exit policy", () => {
    const comparison = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 3, judge: "j:x",
      reference: results([scenario("A1", "PASS", metric(100, 100)), scenario("A2", "FAIL")], true),
      candidate: results([scenario("A1", "FAIL", metric(130, 150)), scenario("A2", "PASS")], false),
      critical: ["A1"], digests: DIGESTS,
      thresholds: { max_subject_token_increase: 0.2, max_wall_time_increase: 0.25 },
    });
    expect(comparison.cells.map((cell) => [cell.id, cell.change])).toEqual([["A1", "regression"], ["A2", "lift"]]);
    expect(comparison.critical_regressions).toEqual(["A1"]);
    expect(comparison.metrics.reference.input_tokens).toBe(100);
    expect(comparison.metrics.candidate.input_tokens).toBe(130);
    expect(comparison.cost_regressions).toEqual(expect.arrayContaining([expect.stringMatching(/subject tokens/), expect.stringMatching(/wall time/)]));
    expect(comparisonExitCode(comparison)).toBe(2);
    expect(formatComparison(comparison)).toContain("sampling: paired setup; provider-deterministic seeding NOT claimed");
  });

  it("an ordinary ship-bar regression exits 1 while cost thresholds never turn failing behavior into improvement", () => {
    const comparison = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 1, judge: "j:x",
      reference: results([scenario("A1", "PASS", metric(100, 100))], true),
      candidate: results([scenario("A1", "FAIL", metric(50, 50))], false),
      critical: [], digests: DIGESTS,
    });
    expect(comparisonExitCode(comparison)).toBe(1);
    expect(comparison.behavioral_regressions).toEqual(["A1"]);
    expect(comparison.cells[0].change).toBe("regression");
  });

  it("an explicitly budgeted cost/latency regression stays non-behavioral but exits 1", () => {
    const comparison = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 1, judge: "j:x",
      reference: results([scenario("A1", "PASS", metric(100, 100))], true),
      candidate: results([scenario("A1", "PASS", metric(150, 100))], true),
      critical: [], digests: DIGESTS, thresholds: { max_subject_token_increase: 0.1 },
    });
    expect(comparison.behavioral_regressions).toEqual([]);
    expect(comparison.cost_regressions).toHaveLength(1);
    expect(comparison.ship).toBe(false);
    expect(comparisonExitCode(comparison)).toBe(1);
  });

  it("a configured threshold with unavailable metrics blocks instead of silently passing", () => {
    const comparison = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 1, judge: "j:x",
      reference: results([scenario("A1", "PASS")], true),
      candidate: results([scenario("A1", "PASS")], true),
      critical: [], digests: DIGESTS, thresholds: { max_subject_token_increase: 0.1 },
    });
    expect(comparison.cost_regressions[0]).toMatch(/unavailable.*cannot evaluate/);
    expect(comparison.ship).toBe(false);
    expect(comparisonExitCode(comparison)).toBe(1);
  });

  it("a partial/affected comparison is branch feedback and can never produce SHIP", () => {
    const comparison = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 1, judge: "j:x",
      reference: results([scenario("A1", "PASS")], true, true),
      candidate: results([scenario("A1", "PASS")], true, true),
      critical: ["A1"], digests: DIGESTS, partial: true,
    });
    expect(comparison.release_eligible).toBe(false);
    expect(comparison.ship).toBe(false);
    expect(comparison.note).toMatch(/branch feedback.*never SHIP/i);
  });

  it("ERROR is inconclusive infrastructure on either side, never a behavioral failure or pass", () => {
    const comparison = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 1, judge: "j:x",
      reference: results([scenario("A1", "PASS")], true),
      candidate: results([scenario("A1", "ERROR")], false),
      critical: ["A1"], digests: DIGESTS,
    });
    expect(comparison.cells[0].change).toBe("inconclusive");
    expect(comparison.infrastructure_errors).toEqual(["A1"]);
    expect(comparisonExitCode(comparison)).toBe(1);

    const referenceError = buildComparison({
      skill: "demo", model: "p:m", mode: "force", reps: 1, judge: "j:x",
      reference: results([scenario("A1", "ERROR")], false),
      candidate: results([scenario("A1", "PASS")], true),
      critical: ["A1"], digests: DIGESTS,
    });
    expect(referenceError.cells[0].change).toBe("inconclusive");
    expect(referenceError.infrastructure_errors).toEqual(["A1"]);
    expect(referenceError.ship).toBe(false);
    expect(comparisonExitCode(referenceError)).toBe(1);
  });
});
