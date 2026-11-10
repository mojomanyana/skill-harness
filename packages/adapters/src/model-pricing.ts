import { traceSha256, type ExecutionTraceV1 } from "@skill-harness/core";
import table from "../prices/model-prices.json" with { type: "json" };

interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  source: string;
}

const prices = table.models as Record<string, ModelPrice>;
const MILLION = 1_000_000;

const finiteAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Keep reported accounting; estimate only when identity and priced usage are known. */
export function priceSubjectUsage(trace: ExecutionTraceV1): ExecutionTraceV1 {
  if (!trace.metrics) return trace;
  if (trace.metrics.cost_source === "subscription" ||
      (trace.metrics.cost_source === "provider-reported" && finiteAmount(trace.metrics.cost_usd))) {
    const metrics = { ...trace.metrics, cost_usd: trace.metrics.cost_source === "subscription" ? null : trace.metrics.cost_usd, price_as_of: null };
    const priced = { ...trace, cost_usd: metrics.cost_usd, metrics };
    return { ...priced, trace_sha256: traceSha256(priced) };
  }
  const observed = trace.call?.observedModels;
  // Legacy traces have no call observation; retain their explicitly estimated
  // requested-model pricing. New traces must have one complete observed identity.
  const model = observed === undefined ? trace.subject.model
    : observed.length === 1 && observed[0].provider === trace.subject.provider ? observed[0].model : null;
  // This bundled table contains Fireworks rates only, not cross-provider rates
  // for similarly named models or routing aliases.
  const price = trace.subject.provider === "fireworks" && model && Object.hasOwn(prices, model) ? prices[model] : undefined;
  const { input_tokens, output_tokens, cache_read_tokens } = trace.metrics;
  const coverage = trace.call?.usageCoverage;
  const completeCoverage = !trace.call || (trace.call.status === "complete" && coverage!.assistantMessages > 0
    && [coverage!.inputTokens, coverage!.outputTokens, coverage!.cacheReadTokens, coverage!.cacheWriteTokens].every(count => count === coverage!.assistantMessages)
    && trace.metrics.cache_write_tokens === 0);
  const cost = price && completeCoverage && !trace.capture_errors?.length
    && finiteAmount(input_tokens) && finiteAmount(output_tokens) && finiteAmount(cache_read_tokens)
    && (trace.metrics.cache_write_tokens === null || trace.metrics.cache_write_tokens === 0)
    ? (input_tokens * price.input + cache_read_tokens * price.cachedInput + output_tokens * price.output) / MILLION
    : null;
  const estimated = finiteAmount(cost);
  const metrics = {
    ...trace.metrics,
    cost_usd: estimated ? cost : null,
    cost_source: estimated ? "price-table" as const : "unreported" as const,
    price_as_of: estimated ? table.asOf : null,
  };
  const priced = { ...trace, cost_usd: metrics.cost_usd, metrics };
  return { ...priced, trace_sha256: traceSha256(priced) };
}
