import type { ModelCallObservation, ModelRef } from "./adapters/types.js";
import { modelProfileKey, modelProfileLabel, parseModelRef } from "./adapters/types.js";
import { effectiveVerdicts, type ResultsFile } from "./results.js";

/** Requested conditions are a comparison boundary, never proof of effective settings. */
export function requestedSubject(results: ResultsFile): ModelRef {
  return results.subject_profile ?? (results.model.includes(":") ? parseModelRef(results.model) : { provider: "unknown", model: results.model });
}

export function comparisonProfile(results: ResultsFile): string {
  const header = modelProfileKey(results.judge);
  const identities = (calls: ModelCallObservation[]) => [...new Set(calls.flatMap(call => call.observedModels)
    .filter(model => model.provider !== null || model.model !== null)
    .map(model => JSON.stringify([model.provider, model.model])))].sort();
  const scenarios = [...results.scenarios].sort((a, b) => a.id.localeCompare(b.id));
  const assigned = scenarios.flatMap(scenario => (scenario.rep_judgments ?? []).flatMap(panel =>
    panel.judgments.map(judgment => [scenario.id, panel.repetition, judgment.ordinal, modelProfileKey(judgment.judge)])));
  // Preserve heterogeneous assignments, not merely their set: swapped judges are
  // different conditions. Uniform legacy panels keep their historical identity.
  const judges = assigned.some(row => row[3] !== header) ? assigned.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : null;
  const sorted = <T>(rows: T[]) => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // Identical format retries add cost/reliability evidence, not a new profile.
  // Preserve unknown gaps and identity transitions within the same judgment.
  const attemptIdentities = (calls: ModelCallObservation[]) => calls.map(call => identities([call])).filter((value, index, all) =>
    index === 0 || JSON.stringify(value) !== JSON.stringify(all[index - 1]));
  const observed = scenarios.map(scenario => ({ id: scenario.id,
    subject: sorted((scenario.subject_calls ?? []).map(call => ({ repetition: call.repetition, turn: call.turn, identities: identities([call.observation]) })).filter(call => call.identities.length)),
    judge: sorted((scenario.rep_judgments ?? []).flatMap(panel => panel.judgments.map(judgment => ({ repetition: panel.repetition, ordinal: judgment.ordinal,
      attempts: attemptIdentities(judgment.calls ?? []),
    })).filter(judgment => judgment.attempts.some(attempt => attempt.length)))),
  })).filter(scenario => scenario.subject.length || scenario.judge.length);
  return JSON.stringify({ subject: modelProfileKey(requestedSubject(results)), judge: header, judges, observed });
}

function usageCoverage(calls: ModelCallObservation[], expected: number | null) {
  const counters = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const;
  return {
    recordedInvocations: calls.length,
    expectedInvocations: expected,
    completeInvocationCoverage: expected !== null && calls.length === expected,
    // Report a subtotal with its coverage. Missing/error calls can still have usage.
    counters: Object.fromEntries(counters.map(key => {
      const values = calls.map(call => call.usage[key]).filter((value): value is number => value !== null);
      const observedMessages = calls.reduce((sum, call) => sum + call.usageCoverage.assistantMessages, 0);
      const reportedMessages = calls.reduce((sum, call) => sum + call.usageCoverage[key], 0);
      return [key, { reportedSubtotal: values.length ? values.reduce((sum, value) => sum + value, 0) : null,
        reportedInvocations: values.length, reportedMessages, observedMessages,
        complete: expected !== null && calls.length === expected && expected > 0 && observedMessages > 0 && reportedMessages === observedMessages }];
    })),
  };
}

/** Derived view of the existing result, not a new run store or acceptance policy. */
export function summarizeRun(results: ResultsFile) {
  const subjects = results.scenarios.flatMap(scenario => (scenario.subject_calls ?? []).map(call => call.observation));
  const judges = results.scenarios.flatMap(scenario => (scenario.rep_judgments ?? []).flatMap(panel => panel.judgments.flatMap(judgment => judgment.calls ?? [])));
  const verdicts = effectiveVerdicts(results.scenarios).map(scenario => scenario.verdict);
  const observed = (calls: ModelCallObservation[]) => [...new Map(calls.flatMap(call => call.observedModels).map(model => [JSON.stringify(model), model])).values()];
  const count = (name: string) => verdicts.filter(verdict => verdict === name).length;
  // Cumulative metrics include earlier grades; the current panels retain only the
  // selected judgments. Never compare those distinct populations as coverage.
  const panels = results.scenarios.flatMap(scenario => scenario.rep_judgments ?? []).flatMap(panel => panel.judgments);
  const unknownAttempts = results.scenarios.some(scenario => !scenario.rep_judgments && scenario.metrics?.judge_calls !== 0)
    || panels.some(judgment => judgment.judgeFormat !== "json");
  const expectedJudges = unknownAttempts ? null : panels.reduce((sum, judgment) => sum + 1 + (judgment.judgeRetries ?? 0), 0);
  return {
    subject: { requested: requestedSubject(results), observedModels: observed(subjects), effectiveThinking: null },
    judge: { requested: results.judge, observedModels: observed(judges), effectiveThinking: null },
    outcomes: { scenarios: results.scenarios.length, passed: count("PASS"), recordedFailures: count("FAIL"),
      executionOrEvidenceErrors: count("ERROR"), ungraded: count("UNGRADED"), notMeasured: count("NOT-MEASURED"), ambiguous: count("JUDGE-AMBIGUOUS"),
      suspect: results.scenarios.filter(scenario => scenario.suspect).length,
      overrides: results.scenarios.filter(scenario => scenario.override !== null).length,
      recordedExecutionOrEvidenceErrors: results.scenarios.filter(scenario => scenario.judge_verdict === "ERROR" || scenario.objective?.status === "ERROR").length },
    usage: { subject: usageCoverage(subjects, null), judge: usageCoverage(judges, expectedJudges) },
    accounting: { scope: "retained judgment attempts; report performs no calls",
      cumulativeJudgeCallsRecorded: results.scenarios.every(scenario => scenario.metrics)
        ? results.scenarios.reduce((sum, scenario) => sum + scenario.metrics!.judge_calls, 0) : null,
      costs: "Subject provider-reported totals and price-table estimates stay distinct; missing or mixed cost observations leave the total unavailable. Subscription usage is not a billed amount. Judge and JEV costs remain separate and unavailable here." },
    evidence: { traceBoundJudgments: results.scenarios.flatMap(scenario => scenario.rep_judgments ?? []).flatMap(panel => panel.judgments).filter(judgment => judgment.input?.execution === "verified").length,
      subjectObservationScope: "retained invocations; earlier retries may be unavailable", providerRequests: null },
    reuse: "Saved answers and judgments are historical evidence; diagnose gives the per-scenario reuse plan. Reuse is not a fresh trial.",
    limits: "Matching requested profiles do not establish equal effective thinking; absent model observations remain unqualified. Errors are not product failures. A recorded FAIL requires contract/judge diagnosis. Usage subtotals are not billing or whole-host costs.",
  };
}

export function runSummaryLines(results: ResultsFile): string[] {
  const summary = summarizeRun(results);
  const observed = (items: { provider: string | null; model: string | null }[]) => items.length ? items.map(item => `${item.provider ?? "unknown"}:${item.model ?? "unknown"}`).join(", ") : "unknown";
  return [
    `Subject requested: ${modelProfileLabel(summary.subject.requested)}; observed: ${observed(summary.subject.observedModels)}; effective thinking: unknown`,
    `Judge requested: ${modelProfileLabel(summary.judge.requested)}; observed: ${observed(summary.judge.observedModels)}; effective thinking: unknown`,
    `Effective outcomes: ${summary.outcomes.passed} PASS, ${summary.outcomes.recordedFailures} FAIL, ${summary.outcomes.executionOrEvidenceErrors} ERROR, ${summary.outcomes.ungraded} UNGRADED, ${summary.outcomes.notMeasured} NOT-MEASURED, ${summary.outcomes.ambiguous} JUDGE-AMBIGUOUS. Additional flags: ${summary.outcomes.suspect} suspect, ${summary.outcomes.overrides} overrides; ${summary.outcomes.recordedExecutionOrEvidenceErrors} recorded execution/evidence errors.`,
    `Token coverage: ${summary.usage.subject.recordedInvocations} retained subject invocation records (total unknown); ${summary.usage.judge.recordedInvocations}/${summary.usage.judge.expectedInvocations ?? "unknown"} retained judge-attempt records. Counter subtotals/coverage: diagnose --format json. Costs remain separate.`,
    "Evidence/reuse: diagnose before rerunning; retained evidence is not a fresh trial; actual provider request totals remain unknown.",
  ];
}
