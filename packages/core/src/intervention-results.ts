import { createHash } from "node:crypto";
import { validateResults } from "./results.js";
import { aggregateMetrics } from "./comparison.js";
import type { InterventionManifest, InterventionEvidence, InterventionCell } from "./intervention.js";
/** Normalize existing validated schema3 records, retaining the complete source votes alongside the summary. */
export function interventionEvidenceFromResults(manifest: InterventionManifest, armId: string, raw: unknown, outputBytes: ReadonlyMap<string, Uint8Array>) {
  const sourceResults = validateResults(raw), arm = manifest.arms.find(a => a.id === armId);
  if (!arm || sourceResults.model !== arm.configuration.model) throw new Error("intervention result model mismatch");
  if (sourceResults.schema !== 3 || sourceResults.partial || sourceResults.mode !== manifest.common.mode
    || `${sourceResults.judge.provider}:${sourceResults.judge.model}` !== manifest.judge) throw new Error("incomplete or incompatible intervention results");
  if (sourceResults.source_hashes?.["intervention:manifest"] !== manifest.id || sourceResults.source_hashes?.["intervention:inputs"] !== manifest.inputDigest) throw new Error("recorded frozen intervention binding missing; never stamp historical results");
  if (sourceResults.scenarios.length !== manifest.cases.length || sourceResults.scenarios.some(s => !manifest.cases.some(c => c.id === s.id))) throw new Error("intervention scenario plan mismatch");
  const cells: InterventionCell[] = [], artifacts = new Set<string>();
  for (const spec of manifest.cases) {
    const scenario = sourceResults.scenarios.find(s => s.id === spec.id)!;
    if (scenario.criterion_count !== spec.criteria || (scenario.reps ?? 1) !== spec.reps || (scenario.pass_threshold ?? 1) !== spec.threshold) throw new Error("intervention repetition/criterion policy mismatch");
    for (const panel of scenario.rep_judgments ?? []) {
      const delivery = sourceResults.subject_invocations!.find(o => o.scenario_id === spec.id && o.repetition === panel.repetition)?.prompt?.status;
      if (!delivery || !panel.objective) throw new Error("intervention objective/delivery evidence missing");
      const objective = panel.objective.status;
      const bytes = outputBytes.get(`${spec.id}:${panel.repetition}`);
      if (bytes !== undefined && (!(bytes instanceof Uint8Array) || bytes.byteLength > 8 * 1024 * 1024)) throw new Error("intervention output exceeds bounds");
      const artifactSha256 = bytes ? createHash("sha256").update(bytes).digest("hex") : null;
      if (artifactSha256) artifacts.add(artifactSha256);
      let criteria: InterventionCell["criteria"] = [], suspect = false;
      if (delivery === "PASS" && objective === "PASS") {
        if (panel.judgments.length !== 1) throw new Error("multi-judge normalization not yet supported; retain original panel without selecting a convenient vote");
        const judgment = panel.judgments[0];
        if (`${judgment.judge.provider}:${judgment.judge.model}` !== manifest.judge) throw new Error("intervention cell judge mismatch");
        criteria = [...(judgment.criteria ?? [])].sort((a, b) => a.index - b.index).map(c => c.verdict === "ERROR" ? "UNKNOWN" : c.verdict);
        suspect = judgment.suspect || scenario.suspect;
      }
      cells.push({ caseId: spec.id, repetition: panel.repetition, delivery, objective, criteria, suspect, artifactSha256 });
    }
  }
  const metrics = aggregateMetrics(sourceResults.scenarios);
  const cost = manifest.resourceMetric === "wall_ms" ? (sourceResults.scenarios.every(s => s.metrics) ? metrics.wall_time_ms : null)
    : manifest.resourceMetric === "tool_calls" ? metrics.tool_calls
      : metrics.cost_source === "provider-reported" && metrics.subject_metrics_reps === metrics.total_reps ? metrics.subject_cost_usd : null;
  const evidence: InterventionEvidence = { armId, inputDigest: manifest.inputDigest, artifactDigests: [...artifacts].sort(), cells, cost, costUnit: manifest.resourceMetric };
  return { evidence, sourceResults };
}
