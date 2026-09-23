import type { ScenarioMetrics, ScenarioResult } from "./results.js";

export interface AggregateMetrics {
  wall_time_ms: number;
  judge_calls: number;
  judge_rejudge_calls: number;
  subject_metrics_reps: number;
  total_reps: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  subject_cost_usd: number | null;
  cost_source: "provider-reported" | "subscription" | "unreported" | null;
  tool_calls: number | null;
  delegated_children: number | null;
  max_concurrency: number | null;
}

export function aggregateMetrics(scenarios: ScenarioResult[]): AggregateMetrics {
  const metrics = scenarios.map((scenario) => scenario.metrics).filter((value): value is ScenarioMetrics => value !== undefined);
  const sumOptional = (field: keyof ScenarioMetrics): number | null => {
    const values = metrics.map((value) => value[field]).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  };
  const maxValues = metrics.map((value) => value.max_concurrency).filter((value): value is number => typeof value === "number");
  return {
    wall_time_ms: metrics.reduce((sum, value) => sum + value.wall_time_ms, 0),
    judge_calls: metrics.reduce((sum, value) => sum + value.judge_calls, 0),
    judge_rejudge_calls: metrics.reduce((sum, value) => sum + value.judge_rejudge_calls, 0),
    subject_metrics_reps: metrics.reduce((sum, value) => sum + value.subject_metrics_reps, 0),
    total_reps: metrics.reduce((sum, value) => sum + value.total_reps, 0),
    input_tokens: sumOptional("input_tokens"),
    output_tokens: sumOptional("output_tokens"),
    cache_read_tokens: sumOptional("cache_read_tokens"),
    cache_write_tokens: sumOptional("cache_write_tokens"),
    subject_cost_usd: sumOptional("subject_cost_usd"),
    cost_source: (() => {
      const sources = scenarios.map((scenario) => scenario.metrics?.cost_source).filter((source): source is NonNullable<typeof source> => source !== undefined);
      return sources.length === 0 ? null : sources.every((source) => source === sources[0]) ? sources[0] : "unreported";
    })(),
    tool_calls: sumOptional("tool_calls"),
    delegated_children: sumOptional("delegated_children"),
    max_concurrency: maxValues.length ? Math.max(...maxValues) : null,
  };
}
