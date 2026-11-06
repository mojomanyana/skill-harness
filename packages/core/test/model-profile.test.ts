import { expect, test } from "vitest";
import { parseModelRef, withThinking, modelSlug, sameModelProfile, type HarnessAdapter, type ModelCallObservation } from "../src/adapters/types.js";
import { parseTrace } from "../src/execution-trace.js";
import { gradeTranscript } from "../src/grade.js";
import { computeLift, liftHeadline } from "../src/lift.js";
import { finalizeResults, rebuildScenarioResult, type ResultsFile } from "../src/results.js";
import { comparisonProfile, summarizeRun } from "../src/run-summary.js";

const subject = { provider: "local", model: "subject" };
const judge = { provider: "local", model: "judge" };
function trace() {
  return parseTrace([
    JSON.stringify({ type: "message_end", message: { role: "assistant", provider: "observed-provider", model: "resolved-model", content: [{ type: "text", text: "ok" }], stopReason: "stop", usage: { input: 4, output: 0, cacheRead: 0 } } }),
    JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop", usage: { input: 3 } } }),
    '{"type":"agent_settled"}',
  ], { subject: { ...subject, thinking: "high" }, piVersion: "1.5.0", scenarioId: "A1", mode: "force", rep: 0, turn: 0 }).trace;
}
function result(): ResultsFile {
  return finalizeResults({ skill: "example", harness: "pi", model: "local:subject", subject_profile: subject, judge,
    timestamp: "2026-11-05", label: null, mode: "force", scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "" }] }, null);
}

test("explicit effort separates profiles and paths without reinterpreting colon-bearing model IDs", () => {
  expect(parseModelRef("ollama:qwen:30b")).toEqual({ provider: "ollama", model: "qwen:30b" });
  expect(parseModelRef("local:subject:high").model).toBe("subject:high");
  expect(() => withThinking(subject, "fast")).toThrow(/Unsupported/);
  expect(() => withThinking(parseModelRef("local:subject:high"), "low")).toThrow(/either/);
  const high = withThinking(subject, "high");
  expect(sameModelProfile(subject, high)).toBe(false);
  expect(modelSlug(high)).not.toBe(modelSlug(subject));
  expect(withThinking(subject, "max").thinking).toBe("max");
});

test("runtime observations preserve unknown effort, resolved identity, zeros and partial usage", () => {
  const call = trace().call!;
  expect(call.requested.thinking).toBe("high");
  expect(call.effectiveThinking).toBeNull();
  expect(call.observedModels).toEqual([{ provider: "observed-provider", model: "resolved-model" }]);
  expect(call.usage).toEqual({ inputTokens: 7, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: null });
  expect(call.usageCoverage).toEqual({ assistantMessages: 2, inputTokens: 2, outputTokens: 1, cacheReadTokens: 1, cacheWriteTokens: 0 });
});

test("invalid judge output and its retry retain separate usage observations", async () => {
  let calls = 0;
  const observation = trace().call!;
  const adapter: HarnessAdapter = { name: "pi", available: async () => true, run: async () => "",
    judge: async () => { throw new Error("Legacy path must not be used"); },
    judgeStructured: async () => ({ raw: calls++ === 0 ? "invalid" : '{"votes":[{"criterion":1,"vote":"PASS","reason":"ok"}],"verdict":"PASS","reason":"ok"}', observation }),
  };
  const graded = await gradeTranscript(adapter, judge, "p", "/tmp", 1);
  expect(graded.verdict).toBe("PASS");
  expect(graded.calls).toHaveLength(2);
  expect(graded.judgeRetries).toBe(1);
  adapter.judgeStructured = async () => ({ raw: "[judge error: aborted]", observation: { ...observation, status: "error" } });
  const failed = await gradeTranscript(adapter, judge, "p", "/tmp", 1);
  expect(failed.verdict).toBe("ERROR");
  expect(failed.calls?.[0].usage.inputTokens).toBe(7);
});

test("different subject or judge efforts cannot become a lift claim", () => {
  const base = result(), changed = result();
  changed.subject_profile = { ...subject, thinking: "high" };
  let lift = computeLift(base, changed);
  expect(lift.compared).toBe(0);
  expect(liftHeadline(lift)).toMatch(/profiles differ/);
  changed.subject_profile = subject;
  changed.judge = { ...judge, thinking: "low" };
  expect(comparisonProfile(base)).not.toBe(comparisonProfile(changed));
  expect(computeLift(base, changed).compared).toBe(0);
  expect(computeLift(base, result()).compared).toBe(1);
});

test("summary never promotes missing call usage to complete totals", () => {
  const run = result();
  const call: ModelCallObservation = trace().call!;
  run.scenarios[0].metrics = { wall_time_ms: 4, judge_calls: 2, judge_rejudge_calls: 0, subject_metrics_reps: 0, total_reps: 1 };
  run.scenarios[0].rep_judgments = [{ repetition: 0, recorded_verdict: "PASS", judgments: [{ ordinal: 1, judge, verdict: "PASS", reason: "ok", suspect: false, judgeFormat: "json", judgeRetries: 1, calls: [call] }] }];
  const summary = summarizeRun(run);
  expect(summary.usage.judge).toMatchObject({ recordedInvocations: 1, expectedInvocations: 2, completeInvocationCoverage: false });
  expect(summary.usage.judge.counters.outputTokens).toMatchObject({ reportedSubtotal: 0, complete: false });
  expect(summary.subject.effectiveThinking).toBeNull();
  expect(summary.evidence.providerRequests).toBeNull();
  expect(finalizeResults(run, null).subject_profile).toEqual(subject);
});

test("retained-judgment token coverage does not use old cumulative call counts", () => {
  const run = result();
  run.scenarios[0].metrics = { wall_time_ms: 4, judge_calls: 9, judge_rejudge_calls: 8, subject_metrics_reps: 0, total_reps: 1 };
  run.scenarios[0].rep_judgments = [{ repetition: 0, recorded_verdict: "PASS", judgments: [{ ordinal: 1, judge, verdict: "PASS", reason: "ok", suspect: false, judgeFormat: "json", calls: [trace().call!] }] }];
  const summary = summarizeRun(run);
  expect(summary.usage.judge).toMatchObject({ recordedInvocations: 1, expectedInvocations: 1, completeInvocationCoverage: true });
  expect(summary.accounting.cumulativeJudgeCallsRecorded).toBe(9);
  expect(summary.usage.judge.counters.outputTokens.complete).toBe(false);
});

test("swapping heterogeneous judge assignments cannot hide behind the same profile set", () => {
  const left = result(), right = result();
  const assign = (run: ResultsFile, efforts: ("high" | "low")[]) => {
    run.scenarios = efforts.map((thinking, index) => ({ ...run.scenarios[0], id: `A${index + 1}`,
      rep_judgments: [{ repetition: 0, recorded_verdict: "PASS", judgments: [{ ordinal: 1, judge: { ...judge, thinking }, verdict: "PASS", reason: "ok", suspect: false }] }],
    }));
  };
  assign(left, ["low", "high"]); assign(right, ["high", "low"]);
  expect(comparisonProfile(left)).not.toBe(comparisonProfile(right));
  expect(computeLift(left, right).compared).toBe(0);
});

test("same requested alias with different observed identities is not a comparable condition", () => {
  const left = result(), right = result();
  left.scenarios[0].subject_calls = [{ repetition: 0, turn: 0, observation: trace().call! }];
  right.scenarios[0].subject_calls = [{ repetition: 0, turn: 0, observation: { ...trace().call!, observedModels: [{ provider: "observed-provider", model: "different" }] } }];
  expect(computeLift(left, right).compared).toBe(0);
  right.scenarios[0].subject_calls = left.scenarios[0].subject_calls;
  expect(computeLift(left, right).compared).toBe(1);
  expect(summarizeRun(right).subject.effectiveThinking).toBeNull();
});

test("observed identities remain assigned to their subject turns and judge attempts", () => {
  const left = result(), right = result();
  const a = trace().call!, b = { ...a, observedModels: [{ provider: "observed-provider", model: "other" }] };
  left.scenarios[0].subject_calls = [{ repetition: 0, turn: 0, observation: a }, { repetition: 0, turn: 1, observation: b }];
  right.scenarios[0].subject_calls = [{ repetition: 0, turn: 0, observation: b }, { repetition: 0, turn: 1, observation: a }];
  expect(comparisonProfile(left)).not.toBe(comparisonProfile(right));
  left.scenarios[0].subject_calls = right.scenarios[0].subject_calls = undefined;
  left.scenarios[0].rep_judgments = [{ repetition: 0, recorded_verdict: "PASS", judgments: [{ ordinal: 1, judge, verdict: "PASS", reason: "ok", suspect: false, calls: [a, b] }] }];
  right.scenarios[0].rep_judgments = [{ repetition: 0, recorded_verdict: "PASS", judgments: [{ ordinal: 1, judge, verdict: "PASS", reason: "ok", suspect: false, calls: [b, a] }] }];
  expect(comparisonProfile(left)).not.toBe(comparisonProfile(right));
});

test("a same-model format retry changes usage coverage but not the comparison profile", () => {
  const left = result(), right = result(), call = trace().call!;
  const panel = (calls: ModelCallObservation[]) => [{ repetition: 0, recorded_verdict: "PASS" as const, judgments: [{ ordinal: 1, judge, verdict: "PASS" as const, reason: "ok", suspect: false, calls }] }];
  left.scenarios[0].rep_judgments = panel([call]);
  right.scenarios[0].rep_judgments = panel([call, call]);
  expect(comparisonProfile(left)).toBe(comparisonProfile(right));
  expect(computeLift(left, right).compared).toBe(1);
  expect(summarizeRun(right).usage.judge.recordedInvocations).toBe(2);
  right.scenarios[0].rep_judgments = panel([call, { ...call, observedModels: [] }, call]);
  expect(comparisonProfile(left)).not.toBe(comparisonProfile(right));
});
