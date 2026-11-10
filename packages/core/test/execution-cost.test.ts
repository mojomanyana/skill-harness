import { describe, expect, it } from "vitest";
import { mergeTraces, parseTrace, traceSha256 } from "../src/execution-trace.js";

const meta = {
  piVersion: "1.5.2", subject: { provider: "openrouter", model: "example/model" },
  scenarioId: "A1", mode: "force" as const, rep: 0, turn: 0,
};
// Synthetic accounting contrasts, using Pi 1.5.2's documented message_end shape.
// totalFromProvider is the explicit discriminator; cost.total alone is also used
// for Pi's local catalogue estimates. These controls make no provider calls.
const message = (cost: unknown) => ({
  type: "message_end", message: {
    role: "assistant", provider: "openrouter", model: "example/model",
    content: [{ type: "text", text: "answer" }], stopReason: "stop",
    usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost },
  },
});
const parse = (events: unknown[], settled = true) => parseTrace(
  [...events, ...(settled ? [{ type: "agent_settled" }] : [])].map(event => JSON.stringify(event)), meta,
).trace;

describe("Pi accounting provenance", () => {
  it("counts provider totals once per assistant completion, including a real zero", () => {
    const paid = message({ total: 0.02, totalFromProvider: true });
    const free = message({ total: 0, totalFromProvider: true });
    const trace = parse([paid, { ...paid, type: "message_update" }, free, { type: "agent_end", messages: [paid.message, free.message] }]);
    expect(trace.metrics).toMatchObject({ cost_usd: 0.02, cost_source: "provider-reported", price_as_of: null });
    expect(trace.cost_usd).toBe(0.02);
    expect(trace.trace_sha256).toBe(traceSha256(trace));
    expect(parse([free]).metrics).toMatchObject({ cost_usd: 0, cost_source: "provider-reported" });
  });

  it.each([
    { total: 0.02 }, { total: 0.02, totalFromProvider: false },
    { total: 0.02, totalFromProvider: "true" }, { total: -1, totalFromProvider: true },
    { total: "0.02", totalFromProvider: true }, { totalFromProvider: true },
  ])("does not promote estimated or invalid totals to reported cost: %j", cost => {
    expect(parse([message(cost)]).metrics).toMatchObject({ cost_usd: null, cost_source: "unreported" });
  });

  it("withholds a partial total when one completion lacks reported cost or settlement is missing", () => {
    const paid = message({ total: 0.02, totalFromProvider: true });
    expect(parse([paid, message(undefined)]).metrics?.cost_usd).toBeNull();
    expect(parse([paid], false).metrics?.cost_usd).toBeNull();
    expect(parse([paid, { type: "message_end", message: {} }]).metrics?.cost_usd).toBeNull();
    expect(parse([]).metrics?.cost_usd).toBeNull();
  });

  it("never overflows a total into a non-finite reported amount", () => {
    const large = message({ total: Number.MAX_VALUE, totalFromProvider: true });
    expect(parse([large, large]).metrics?.cost_usd).toBeNull();
  });

  it("retains missing identities and differing response models instead of hiding uncertainty", () => {
    const normal = message(undefined);
    const missing = { ...normal, message: { ...normal.message, provider: undefined, model: undefined } };
    const fallback = { ...normal, message: { ...normal.message, responseModel: "example/fallback" } };
    expect(parse([normal, missing]).call?.observedModels).toEqual([
      { provider: "openrouter", model: "example/model" }, { provider: null, model: null },
    ]);
    expect(parse([fallback]).call?.observedModels).toEqual([
      { provider: "openrouter", model: "example/model" }, { provider: "openrouter", model: "example/fallback" },
    ]);
  });

  it("merges only complete costs with the same provenance and price date", () => {
    const paid = parse([message({ total: 0.02, totalFromProvider: true })]);
    const free = parse([message({ total: 0, totalFromProvider: true })]);
    const unknown = parse([message(undefined)]);
    expect(mergeTraces([paid, free])?.metrics).toMatchObject({ cost_usd: 0.02, cost_source: "provider-reported" });
    expect(mergeTraces([free, free])?.cost_usd).toBe(0);
    const estimated = { ...paid, metrics: { ...paid.metrics!, cost_source: "price-table" as const, price_as_of: "2026-10-01" } };
    const newEstimate = { ...estimated, metrics: { ...estimated.metrics, price_as_of: "2026-11-01" } };
    for (const pair of [[paid, unknown], [paid, estimated], [estimated, newEstimate]]) {
      const merged = mergeTraces(pair)!;
      expect(merged.cost_usd).toBeNull();
      expect(merged.metrics).toMatchObject({ cost_usd: null, cost_source: "unreported", price_as_of: null });
    }
    const { metrics: _metrics, ...legacy } = paid;
    const incomplete = mergeTraces([legacy, paid])!;
    expect(incomplete.cost_usd).toBeNull();
    expect(incomplete.metrics).toBeUndefined();
  });
});
