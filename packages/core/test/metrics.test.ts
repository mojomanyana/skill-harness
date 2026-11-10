import { expect, test } from "vitest";
import type { CostSource } from "../src/capture-trace-types.js";
import { aggregateMetrics } from "../src/metrics.js";
import { outcomesToResult, type RepOutcome } from "../src/reps.js";
import { finalizeResults, type ScenarioResult } from "../src/results.js";
import { formatScorecard } from "../src/run.js";
import { summarizeRun } from "../src/run-summary.js";

const plain = (): RepOutcome => ({ verdict: "PASS", reason: "ok", suspect: false });
const rep = (cost: number | null, source: CostSource = "provider-reported"): RepOutcome => ({
  ...plain(), metrics: { wall_time_ms: 2, judge_calls: 1, judge_rejudge_calls: 0,
    subject: { input_tokens: 10, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: null,
      cost_usd: cost, cost_source: source, price_as_of: source === "price-table" ? "2026-09-29" : null,
      tool_calls: 0, delegated_children: 0, max_concurrency: 0 },
  },
});
const scenario = (outcomes: RepOutcome[], id = "A1") => outcomesToResult(id, outcomes, outcomes.length, 1);
const run = (scenarios: ScenarioResult[]) => finalizeResults({ skill: "example", harness: "pi", model: "provider:subject",
  judge: { provider: "provider", model: "judge" }, timestamp: "2026-11-11", label: null, mode: "force", scenarios }, null);
const scorecard = (scenarios: ScenarioResult[]) => formatScorecard({ runDir: "/retained", results: run(scenarios) });

test("complete provider costs include finite zero through rep usage, scenario and run aggregation", () => {
  const first = scenario([rep(0), rep(0.25)]);
  expect(first.usage?.map(value => value.costUsd)).toEqual([0, 0.25]);
  expect(first.usage?.[0]).toMatchObject({ outputTokens: 0, cacheReadTokens: 0 });
  expect(first.metrics).toMatchObject({ subject_cost_usd: 0.25, cost_source: "provider-reported", output_tokens: 0, cache_read_tokens: 0 });
  const aggregate = aggregateMetrics([first, scenario([rep(0.75)], "A2")]);
  expect(aggregate).toMatchObject({ subject_cost_usd: 1, cost_source: "provider-reported", judge_calls: 3 });
  const zero = scenario([rep(0)]);
  expect(aggregateMetrics([zero])).toMatchObject({ subject_cost_usd: 0, cost_source: "provider-reported" });
  expect(scorecard([zero])).toContain("$0.000000 provider-reported");
  expect(scorecard([zero])).not.toContain("WARNING");
});

test.each([
  ["missing cost", [rep(0.25), rep(null)]],
  ["missing subject observation", [rep(0.25), plain()]],
  ["mixed sources", [rep(0.25), rep(0.5, "price-table")]],
  ["unreported provenance", [rep(0.25, "unreported")]],
  ["invalid amount", [rep(Number.NaN)]],
] as const)("%s cannot turn a partial rep cost into a complete scenario total", (_label, outcomes) => {
  const result = scenario([...outcomes]);
  expect(result.metrics?.subject_cost_usd).toBeUndefined();
  expect(result.metrics?.cost_source).toBe("unreported");
  expect(aggregateMetrics([result])).toMatchObject({ subject_cost_usd: null, cost_source: "unreported" });
  expect(scorecard([result])).toContain("subject cost unavailable");
});

test.each([
  ["missing scenario metrics", scenario([plain()], "A2")],
  ["missing scenario cost", scenario([rep(null)], "A2")],
  ["mixed sources", scenario([rep(0.5, "price-table")], "A2")],
  ["subscription mixed with metered costs", scenario([rep(null, "subscription")], "A2")],
] as const)("%s cannot turn a known scenario cost into a complete run total", (_label, second) => {
  const scenarios = [scenario([rep(0.25)]), second];
  expect(aggregateMetrics(scenarios)).toMatchObject({ subject_cost_usd: null, cost_source: "unreported" });
  expect(scorecard(scenarios)).not.toContain("$0.250000");
});

test("estimates are labelled estimates and subscription usage does not assert a zero bill", () => {
  expect(scorecard([scenario([rep(0.02, "price-table")])])).toContain("$0.020000 price-table estimate");
  const subscription = scenario([rep(null, "subscription")]);
  expect(subscription.metrics).toMatchObject({ cost_source: "subscription" });
  expect(subscription.metrics?.subject_cost_usd).toBeUndefined();
  // Old retained subscription zeros also stay outside monetary totals.
  subscription.metrics!.subject_cost_usd = 0;
  expect(aggregateMetrics([subscription])).toMatchObject({ subject_cost_usd: null, cost_source: "subscription" });
  const text = scorecard([subscription]);
  expect(text).toContain("subscription usage; billed cost unavailable");
  expect(text).not.toContain("$0");
  expect(text).not.toContain("marginal");
});

test("judge counts stay separate and missing token counters are not displayed as zero", () => {
  const result = scenario([rep(0.25)]);
  result.metrics!.judge_calls = 19;
  delete result.metrics!.output_tokens;
  delete result.metrics!.cache_read_tokens;
  expect(aggregateMetrics([result]).subject_cost_usd).toBe(0.25);
  expect(scorecard([result])).toContain("unknown out / unknown cache-read");
  const costs = summarizeRun(run([result])).accounting.costs;
  expect(costs).toContain("provider-reported totals and price-table estimates stay distinct");
  expect(costs).toContain("Judge and JEV costs remain separate and unavailable here");
});
