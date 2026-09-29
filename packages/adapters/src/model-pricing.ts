import { traceSha256, type ExecutionTraceV1 } from "@skill-harness/core";
import table from "./model-prices.json" with { type: "json" };

interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  source: string;
}

const prices = table.models as Record<string, ModelPrice>;
const MILLION = 1_000_000;

/** Apply the repository's dated token prices to one Pi execution trace. */
export function priceSubjectUsage(trace: ExecutionTraceV1): ExecutionTraceV1 {
  if (!trace.metrics) return trace;
  const price = prices[trace.subject.model];
  const { input_tokens, output_tokens, cache_read_tokens } = trace.metrics;
  const hasUsage = input_tokens !== null || output_tokens !== null || cache_read_tokens !== null;
  const cost = price && hasUsage
    ? ((input_tokens ?? 0) * price.input + (cache_read_tokens ?? 0) * price.cachedInput + (output_tokens ?? 0) * price.output) / MILLION
    : null;
  const metrics = {
    ...trace.metrics,
    cost_usd: cost !== null && cost > 0 ? cost : null,
    cost_source: cost !== null && cost > 0 ? "price-table" as const : "unreported" as const,
    price_as_of: table.asOf,
  };
  const priced = { ...trace, cost_usd: metrics.cost_usd, metrics };
  return { ...priced, trace_sha256: traceSha256(priced) };
}
