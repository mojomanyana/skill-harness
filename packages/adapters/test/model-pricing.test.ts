import { describe, expect, it } from "vitest";
import { priceSubjectUsage } from "../src/model-pricing.js";
import type { ExecutionTraceV1 } from "@skill-harness/core";

function trace(
  metrics: ExecutionTraceV1["metrics"],
  model = "accounts/fireworks/models/deepseek-v4-flash-0731",
): ExecutionTraceV1 {
  return {
    trace_version: 2,
    pi_version: "0.84.2",
    subject: { provider: "fireworks", model },
    scenario_id: "A1",
    mode: "force",
    rep: 0,
    turn: 0,
    final_text: "ok",
    tool_calls: [],
    changed_paths: null,
    cost_usd: null,
    ...(metrics ? { metrics } : {}),
  };
}

const OBSERVED = {
  input_tokens: 1_000_000,
  output_tokens: 500_000,
  cache_read_tokens: 250_000,
  cache_write_tokens: null,
  cost_usd: null,
  cost_source: "unreported" as const,
  price_as_of: null,
  tool_calls: 0,
  delegated_children: 0,
  max_concurrency: 0,
};

describe("priceSubjectUsage", () => {
  it("computes cost from the dated model table, including cached input", () => {
    const priced = priceSubjectUsage(trace(OBSERVED));
    expect(priced.metrics).toMatchObject({
      input_tokens: 1_000_000,
      output_tokens: 500_000,
      cache_read_tokens: 250_000,
      cache_write_tokens: null,
      cost_usd: 0.287,
      cost_source: "price-table",
      price_as_of: "2026-10-01",
    });
    expect(priced.cost_usd).toBe(0.287);
  });

  it("keeps unreported usage null instead of manufacturing zero", () => {
    const priced = priceSubjectUsage(trace({
      ...OBSERVED,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
    }));
    expect(priced.metrics).toMatchObject({
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cost_usd: null,
      cost_source: "unreported",
      price_as_of: null,
    });
    expect(priced.cost_usd).toBeNull();
  });

  it.each([
    ["accounts/fireworks/models/deepseek-v4p1-flash", 0.55175],
    ["accounts/fireworks/models/nemotron-lightning-3p5-30b-a3b", 0.1525],
    ["accounts/fireworks/models/kimi-k3", 10.575],
  ])("prices current Fireworks model %s", (model, expectedCost) => {
    const priced = priceSubjectUsage(trace(OBSERVED, model));
    expect(priced.metrics).toMatchObject({
      cost_usd: expectedCost,
      cost_source: "price-table",
      price_as_of: "2026-10-01",
    });
  });

  it("leaves cost null for an unpriced model while retaining reported tokens", () => {
    const unpriced = trace({ ...OBSERVED });
    unpriced.subject.model = "accounts/fireworks/models/not-in-table";
    const priced = priceSubjectUsage(unpriced);
    expect(priced.metrics?.input_tokens).toBe(1_000_000);
    expect(priced.metrics?.cost_usd).toBeNull();
    expect(priced.metrics?.cost_source).toBe("unreported");
  });

  it.each([0, 0.037])("preserves provider-reported cost %s instead of repricing it", cost => {
    const priced = priceSubjectUsage(trace({ ...OBSERVED, cost_usd: cost, cost_source: "provider-reported" }));
    expect(priced.cost_usd).toBe(cost);
    expect(priced.metrics).toMatchObject({ cost_usd: cost, cost_source: "provider-reported", price_as_of: null });
  });

  it("preserves explicit subscription accounting without inventing a cash charge", () => {
    const priced = priceSubjectUsage(trace({ ...OBSERVED, cost_source: "subscription" }));
    expect(priced.metrics).toMatchObject({ cost_usd: null, cost_source: "subscription", price_as_of: null });
  });

  it("requires complete priced counters and declines unsupported cache-write pricing", () => {
    for (const metrics of [
      { ...OBSERVED, output_tokens: null }, { ...OBSERVED, input_tokens: null },
      { ...OBSERVED, cache_read_tokens: null }, { ...OBSERVED, cache_write_tokens: 10 },
    ]) {
      expect(priceSubjectUsage(trace(metrics)).metrics).toMatchObject({ cost_usd: null, cost_source: "unreported", price_as_of: null });
    }
  });

  it("retains a complete zero estimate as an estimate", () => {
    expect(priceSubjectUsage(trace({ ...OBSERVED, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 })).metrics)
      .toMatchObject({ cost_usd: 0, cost_source: "price-table" });
  });

  it("uses consistent observed identity and complete per-message counters for new traces", () => {
    const observed = trace({ ...OBSERVED, cache_write_tokens: 0 });
    observed.call = {
      requested: observed.subject,
      observedModels: [{ provider: "fireworks", model: "accounts/fireworks/models/deepseek-v4p1-flash" }],
      status: "complete", effectiveThinking: null,
      usage: { inputTokens: 1_000_000, outputTokens: 500_000, cacheReadTokens: 250_000, cacheWriteTokens: 0 },
      usageCoverage: { assistantMessages: 2, inputTokens: 2, outputTokens: 2, cacheReadTokens: 2, cacheWriteTokens: 2 },
    };
    expect(priceSubjectUsage(observed).metrics?.cost_usd).toBe(0.55175);
    observed.call.usageCoverage.cacheWriteTokens = 1;
    expect(priceSubjectUsage(observed).metrics?.cost_usd).toBeNull();
    observed.call.usageCoverage.cacheWriteTokens = 2;
    observed.call.usageCoverage.outputTokens = 1;
    expect(priceSubjectUsage(observed).metrics?.cost_usd).toBeNull();
    observed.call.usageCoverage.outputTokens = 2;
    observed.call.observedModels.push({ provider: "fireworks", model: observed.subject.model });
    expect(priceSubjectUsage(observed).metrics?.cost_usd).toBeNull();
    observed.call.observedModels = [];
    expect(priceSubjectUsage(observed).metrics?.cost_usd).toBeNull();
    observed.call.observedModels = [{ provider: "other-provider", model: observed.subject.model }];
    expect(priceSubjectUsage(observed).metrics?.cost_usd).toBeNull();
  });
});
