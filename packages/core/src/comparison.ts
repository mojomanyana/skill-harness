import type { ResultsFile, ScenarioMetrics, ScenarioResult } from "./results.js";
import type { Verdict } from "./score.js";

export interface ComparisonSideDigests {
  skill: string;
  spec: string;
  fixtures: Record<string, string>;
  /** Every non-candidate test input: scenario facets, persona, fixtures, extensions, post-tests, and system prompts. */
  inputs: Record<string, string>;
}
export interface ComparisonDigests {
  reference: ComparisonSideDigests;
  candidate: ComparisonSideDigests;
  harness: string;
  model: string;
  judge: string;
  environment: { node: string; platform: string; arch: string; [key: string]: string };
}
export interface ComparisonThresholds {
  max_subject_token_increase?: number;
  max_wall_time_increase?: number;
  max_tool_call_increase?: number;
}
export interface ComparisonCell {
  id: string;
  reference: Verdict;
  candidate: Verdict;
  change: "regression" | "lift" | "held-pass" | "held-fail" | "inconclusive";
  critical: boolean;
  reference_flakiness: number | null;
  candidate_flakiness: number | null;
}
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
  tool_calls: number | null;
  delegated_children: number | null;
  max_concurrency: number | null;
}
export interface ComparisonReport {
  schema: 1;
  skill: string;
  model: string;
  mode: string;
  reps: number;
  judge: string;
  paired_setup: true;
  deterministic_sampling: false;
  sampling_note: string;
  partial: boolean;
  release_eligible: boolean;
  ship: boolean;
  note: string;
  cells: ComparisonCell[];
  behavioral_regressions: string[];
  critical_regressions: string[];
  infrastructure_errors: string[];
  metrics: { reference: AggregateMetrics; candidate: AggregateMetrics };
  cost_regressions: string[];
  thresholds?: ComparisonThresholds;
  digests: ComparisonDigests;
  reference: ResultsFile;
  candidate: ResultsFile;
}

export function buildComparison(input: {
  skill: string;
  model: string;
  mode: string;
  reps: number;
  judge: string;
  reference: ResultsFile;
  candidate: ResultsFile;
  critical: string[];
  digests: ComparisonDigests;
  partial?: boolean;
  thresholds?: ComparisonThresholds;
}): ComparisonReport {
  const { reference, candidate } = input;
  if (reference.model !== candidate.model || reference.model !== input.model) throw new Error("comparison subject models differ");
  if (reference.mode !== candidate.mode || reference.mode !== input.mode) throw new Error("comparison delivery modes differ");
  const referenceJudge = `${reference.judge.provider}:${reference.judge.model}`;
  const candidateJudge = `${candidate.judge.provider}:${candidate.judge.model}`;
  if (referenceJudge !== candidateJudge || referenceJudge !== input.judge) throw new Error("comparison judge policies differ");
  const referenceIds = reference.scenarios.map((scenario) => scenario.id);
  const candidateIds = candidate.scenarios.map((scenario) => scenario.id);
  if (JSON.stringify([...referenceIds].sort()) !== JSON.stringify([...candidateIds].sort())) {
    throw new Error("comparison scenario IDs differ — paired comparisons require the same scenario plan");
  }
  if (input.digests.reference.spec !== input.digests.candidate.spec ||
      JSON.stringify(sorted(input.digests.reference.fixtures)) !== JSON.stringify(sorted(input.digests.candidate.fixtures)) ||
      JSON.stringify(sorted(input.digests.reference.inputs)) !== JSON.stringify(sorted(input.digests.candidate.inputs))) {
    throw new Error("comparison spec/test-input digests differ — only the skill candidate may change in a paired run");
  }
  const referencePlan = Object.fromEntries(reference.scenarios.map((scenario) => [scenario.id, [scenario.reps ?? 1, scenario.pass_threshold ?? null]]));
  const candidatePlan = Object.fromEntries(candidate.scenarios.map((scenario) => [scenario.id, [scenario.reps ?? 1, scenario.pass_threshold ?? null]]));
  if (JSON.stringify(sorted(referencePlan)) !== JSON.stringify(sorted(candidatePlan))) {
    throw new Error("comparison repetition/threshold plans differ");
  }

  const critical = new Set(input.critical);
  const byCandidate = new Map(candidate.scenarios.map((scenario) => [scenario.id, scenario]));
  const cells = reference.scenarios.map((left): ComparisonCell => {
    const right = byCandidate.get(left.id)!;
    const a = effective(left), b = effective(right);
    const conclusive = !untrustworthy(left, a) && !untrustworthy(right, b);
    const change = !conclusive
      ? "inconclusive"
      : a === "PASS" && b !== "PASS"
        ? "regression"
        : a !== "PASS" && b === "PASS"
          ? "lift"
          : a === "PASS"
            ? "held-pass"
            : "held-fail";
    return {
      id: left.id,
      reference: a,
      candidate: b,
      change,
      critical: critical.has(left.id),
      reference_flakiness: left.flakiness ?? null,
      candidate_flakiness: right.flakiness ?? null,
    };
  });
  const behavioral = cells.filter((cell) => cell.change === "regression").map((cell) => cell.id);
  const criticalRegressions = cells.filter((cell) => cell.change === "regression" && cell.critical).map((cell) => cell.id);
  const byReference = new Map(reference.scenarios.map((scenario) => [scenario.id, scenario]));
  const infrastructureErrors = cells.filter((cell) =>
    cell.reference === "ERROR" || cell.reference === "JUDGE-AMBIGUOUS" || byReference.get(cell.id)?.suspect ||
    cell.candidate === "ERROR" || cell.candidate === "JUDGE-AMBIGUOUS" || byCandidate.get(cell.id)?.suspect,
  ).map((cell) => cell.id);
  const metrics = { reference: aggregateMetrics(reference.scenarios), candidate: aggregateMetrics(candidate.scenarios) };
  const costRegressions = thresholdFindings(metrics.reference, metrics.candidate, input.thresholds);
  const partial = input.partial === true || reference.partial === true || candidate.partial === true;
  const releaseEligible = !partial;
  const ship = releaseEligible && candidate.effective_grade.ship && behavioral.length === 0 && infrastructureErrors.length === 0 && costRegressions.length === 0;
  const note = partial
    ? "branch feedback only — partial/affected comparisons never SHIP; run the full paired plan for a release decision"
    : ship
      ? "candidate clears its ship bar with no paired behavioral regression"
      : "candidate is NOT READY under the paired behavioral/cost release policy";
  return {
    schema: 1,
    skill: input.skill,
    model: input.model,
    mode: input.mode,
    reps: input.reps,
    judge: input.judge,
    paired_setup: true,
    deterministic_sampling: false,
    sampling_note: "paired setup only: prompts/fixtures/models/policy/repetition plan match; provider-deterministic seeding is not claimed",
    partial,
    release_eligible: releaseEligible,
    ship,
    note,
    cells,
    behavioral_regressions: behavioral,
    critical_regressions: criticalRegressions,
    infrastructure_errors: [...new Set(infrastructureErrors)],
    metrics,
    cost_regressions: costRegressions,
    ...(input.thresholds ? { thresholds: input.thresholds } : {}),
    digests: input.digests,
    reference,
    candidate,
  };
}

/** 2 = critical behavioral regression, 1 = ordinary/ship/infra regression, 0 = clean or partial feedback. */
export function comparisonExitCode(report: ComparisonReport): 0 | 1 | 2 {
  if (report.critical_regressions.length) return 2;
  if (report.behavioral_regressions.length || report.infrastructure_errors.length || report.cost_regressions.length || (report.release_eligible && !report.ship)) return 1;
  return 0;
}

export function formatComparison(report: ComparisonReport): string {
  const lines = [
    `── compare ${report.skill} · ${report.model} · mode=${report.mode} ×${report.reps} ──`,
    "  sampling: paired setup; provider-deterministic seeding NOT claimed",
  ];
  for (const cell of report.cells) {
    const mark = cell.change === "regression" ? "↓" : cell.change === "lift" ? "↑" : cell.change === "inconclusive" ? "?" : "=";
    const variance = cell.reference_flakiness === null && cell.candidate_flakiness === null
      ? ""
      : ` · flakiness ${cell.reference_flakiness ?? "n/a"} → ${cell.candidate_flakiness ?? "n/a"}`;
    lines.push(`  ${mark} ${cell.id}${cell.critical ? " CRITICAL" : ""}: ${cell.reference} → ${cell.candidate} (${cell.change})${variance}`);
  }
  lines.push(`  behavior: ${report.behavioral_regressions.length} regression(s), ${report.cells.filter((cell) => cell.change === "lift").length} lift(s), ${report.infrastructure_errors.length} infrastructure/inconclusive error(s)`);
  lines.push(`  subject tokens: input ${metricDelta(report.metrics.reference.input_tokens, report.metrics.candidate.input_tokens)} · output ${metricDelta(report.metrics.reference.output_tokens, report.metrics.candidate.output_tokens)} · cache-read ${metricDelta(report.metrics.reference.cache_read_tokens, report.metrics.candidate.cache_read_tokens)} (${report.metrics.candidate.subject_metrics_reps}/${report.metrics.candidate.total_reps} candidate reps reported)`);
  lines.push(`  judge calls: ${report.metrics.reference.judge_calls} → ${report.metrics.candidate.judge_calls} (re-judge ${report.metrics.reference.judge_rejudge_calls} → ${report.metrics.candidate.judge_rejudge_calls})`);
  lines.push(`  wall time: ${report.metrics.reference.wall_time_ms}ms → ${report.metrics.candidate.wall_time_ms}ms`);
  lines.push(`  tool calls: ${metricDelta(report.metrics.reference.tool_calls, report.metrics.candidate.tool_calls)}`);
  if (report.cost_regressions.length) lines.push(`  cost/latency thresholds (separate from behavior): ${report.cost_regressions.join("; ")}`);
  lines.push(`  ${report.ship ? "SHIP" : "NOT READY"}: ${report.note}`);
  return lines.join("\n");
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
    tool_calls: sumOptional("tool_calls"),
    delegated_children: sumOptional("delegated_children"),
    max_concurrency: maxValues.length ? Math.max(...maxValues) : null,
  };
}

function effective(result: ScenarioResult): Verdict {
  if (result.override) return result.override;
  if (result.objective?.status === "ERROR") return "ERROR";
  if (result.objective?.status === "FAIL") return "FAIL";
  return result.judge_verdict;
}
function untrustworthy(result: ScenarioResult, verdict: Verdict): boolean { return result.suspect || verdict === "ERROR" || verdict === "JUDGE-AMBIGUOUS"; }
function sorted<T>(value: Record<string, T>): Record<string, T> { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))); }
function increase(reference: number | null, candidate: number | null): number | null { return reference === null || candidate === null || reference <= 0 ? null : (candidate - reference) / reference; }
function thresholdFindings(reference: AggregateMetrics, candidate: AggregateMetrics, thresholds?: ComparisonThresholds): string[] {
  if (!thresholds) return [];
  const out: string[] = [];
  const check = (label: string, left: number | null, right: number | null, max: number | undefined) => {
    if (max === undefined) return;
    if (left === null || right === null) {
      out.push(`${label} unavailable/incomplete — cannot evaluate configured ${(max * 100).toFixed(1)}% maximum`);
      return;
    }
    if (left === 0) {
      if (right > 0) out.push(`${label} increased from 0 to ${right}, exceeding the configured maximum`);
      return;
    }
    const delta = increase(left, right)!;
    if (delta > max) out.push(`${label} +${(delta * 100).toFixed(1)}% exceeds ${(max * 100).toFixed(1)}%`);
  };
  check("subject tokens", reference.input_tokens, candidate.input_tokens, thresholds.max_subject_token_increase);
  check("wall time", reference.wall_time_ms, candidate.wall_time_ms, thresholds.max_wall_time_increase);
  check("tool calls", reference.tool_calls, candidate.tool_calls, thresholds.max_tool_call_increase);
  return out;
}
function metricDelta(reference: number | null, candidate: number | null): string { return reference === null || candidate === null ? "unavailable" : `${reference} → ${candidate}`; }
