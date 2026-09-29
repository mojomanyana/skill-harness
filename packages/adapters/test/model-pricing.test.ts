import { describe, expect, it } from "vitest";
import { priceSubjectUsage } from "../src/model-pricing.js";
import type { ExecutionTraceV1 } from "@skill-harness/core";

function trace(metrics: ExecutionTraceV1["metrics"]): ExecutionTraceV1 {
  return {
    trace_version: 2,
    pi_version: "0.84.2",
    subject: { provider: "fireworks", model: "accounts/fireworks/models/deepseek-v4-flash-0731" },
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
      price_as_of: "2026-09-29",
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
      price_as_of: "2026-09-29",
    });
    expect(priced.cost_usd).toBeNull();
  });

  it("leaves cost null for an unpriced model while retaining reported tokens", () => {
    const unpriced = trace({ ...OBSERVED });
    unpriced.subject.model = "accounts/fireworks/models/not-in-table";
    const priced = priceSubjectUsage(unpriced);
    expect(priced.metrics?.input_tokens).toBe(1_000_000);
    expect(priced.metrics?.cost_usd).toBeNull();
    expect(priced.metrics?.cost_source).toBe("unreported");
  });
});
