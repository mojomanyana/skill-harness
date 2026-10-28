import type { Diagnosis } from "@skill-harness/core";

/** Human view of the same offline report; never a second scoring policy. */
export function formatDiagnosis(report: Diagnosis): string {
  const grouped = report.criterionDimensions;
  const lines = [
    `${grouped.skill} · ${grouped.model} · ${grouped.mode}`,
    "Saved criterion votes — current author-declared grouping, not a new assessment.",
    "Counts are criterion observations, not passing answers. Mixed criteria remain indivisible.",
    "No model calls; saved results and acceptance rules unchanged.",
    `Coverage: ${grouped.coverage.availableVotes}/${grouped.coverage.expectedVotes} known-size votes available; ${grouped.coverage.unknownScenarioSizes} scenario sizes unknown.`,
    `Mapping: ${grouped.metadataSha256}`,
  ];
  for (const scenario of grouped.scenarios) {
    lines.push("", `${scenario.id}: recorded ${scenario.original.judge_verdict}; override ${scenario.original.override ?? "none"}; objective ${scenario.original.objective?.status ?? "not recorded"}`);
    for (const [dimension, counts] of Object.entries(scenario.counts)) {
      if (counts.pass + counts.fail + counts.unavailable > 0) lines.push(`  ${dimension}: ${counts.pass} PASS, ${counts.fail} FAIL, ${counts.unavailable} unavailable`);
    }
    const reasons = new Set([scenario.unavailableReason, ...scenario.repetitions.map(rep => rep.unavailableReason)].filter(Boolean));
    for (const reason of reasons) lines.push(`  Unavailable: ${reason}`);
  }
  if (report.issues.length) {
    lines.push("", "Evidence and next checks:");
    for (const issue of report.issues) lines.push(`- ${issue.scenario ? issue.scenario + ": " : ""}${issue.category}: ${issue.evidence}\n  Next: ${issue.next}`);
  }
  lines.push("", "Reuse plan:");
  for (const item of report.reusePlan.scenarios) lines.push(`- ${item.id}: ${item.action} — ${item.note}`);
  return lines.join("\n");
}
