import { existsSync, readFileSync } from "node:fs";
import type { ExecutionTraceV1, TraceToolCall } from "./capture-trace-types.js";
import { EXECUTION_TRACE_VERSION } from "./capture-trace-types.js";
import { deserializeTrace, mergeTraces, traceSha256 } from "./execution-trace.js";
import { redactText } from "./redaction.js";
import type { ModelRef } from "./adapters/types.js";
import type { Scenario } from "./spec.js";
import { finalAssistantMessage } from "./seeded.js";

export interface TraceIdentity {
  scenarioId: string;
  mode: string;
  repetition: number;
  turns: number;
  subject?: ModelRef;
  piVersion?: string;
  responses?: string[] | null;
}

export interface JudgeExecutionFacts {
  schema: 1;
  status: "verified" | "unknown" | "invalid";
  coverage: "complete" | "partial" | "unknown";
  reason: string;
  traceSha256?: string;
  observedCalls: number | null;
  omittedCalls: number;
  calls: Array<{
    tool: string;
    state: "completed" | "error" | "unfinished";
    path?: string;
    resultBytes?: number;
    resultSha256?: string;
  }>;
}

const HASH = /^[a-f0-9]{64}$/;
const MAX_CALLS = 32;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const index = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** Validate the fields consumed by merging and the evidence projection before using them. */
function validTrace(trace: ExecutionTraceV1): boolean {
  if (!object(trace) || trace.trace_version !== EXECUTION_TRACE_VERSION || !object(trace.subject) || typeof trace.subject.provider !== "string" || typeof trace.subject.model !== "string" ||
      !(trace.pi_version === null || typeof trace.pi_version === "string") || typeof trace.final_text !== "string" ||
      !index(trace.turn) || !index(trace.rep) || !Array.isArray(trace.tool_calls) ||
      !(trace.changed_paths === null || Array.isArray(trace.changed_paths) && trace.changed_paths.every(p => typeof p === "string")) ||
      !(trace.cost_usd === null || typeof trace.cost_usd === "number" && Number.isFinite(trace.cost_usd)) ||
      !(trace.capture_errors === undefined || Array.isArray(trace.capture_errors) && trace.capture_errors.every(e => typeof e === "string"))) return false;
  if (trace.metrics !== undefined && (!object(trace.metrics) ||
      ["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "cost_usd"].some(key => {
        const value = (trace.metrics as unknown as Record<string, unknown>)[key];
        return value !== null && !(typeof value === "number" && Number.isFinite(value) && value >= 0);
      }) || [trace.metrics.tool_calls, trace.metrics.delegated_children, trace.metrics.max_concurrency].some(value => !index(value)))) return false;
  const ids = new Set<string>();
  const completions = new Set<number>();
  for (const [position, call] of trace.tool_calls.entries()) {
    if (!object(call) || typeof call.id !== "string" || !call.id || ids.has(call.id) ||
        typeof call.name !== "string" || !call.name || !object(call.args) || call.issueIndex !== position ||
        !(call.completionIndex === -1 || index(call.completionIndex)) || typeof call.isError !== "boolean" ||
        !object(call.result) || !index(call.result.bytes) || typeof call.result.sha256 !== "string" || !HASH.test(call.result.sha256)) return false;
    ids.add(call.id);
    if (call.completionIndex >= 0) {
      if (completions.has(call.completionIndex)) return false;
      completions.add(call.completionIndex);
    }
  }
  return [...completions].sort((a, b) => a - b).every((value, position) => value === position);
}

export function unavailableExecution(reason = "No bound execution trace was supplied.", status: "unknown" | "invalid" = "unknown"): JudgeExecutionFacts {
  return { schema: 1, status, coverage: "unknown", reason, observedCalls: null, omittedCalls: 0, calls: [] };
}

/** Tool inputs are untrusted labels. Keep only bounded local read paths, never commands, URLs, tasks or results. */
function readPath(call: TraceToolCall): string | undefined {
  if (call.name !== "read") return undefined;
  const path = call.args.path ?? call.args.file_path;
  if (typeof path !== "string") return undefined;
  if (path.length > 256 || /[\x00-\x1f\x7f?#]/.test(path) || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return "[path withheld]";
  return redactText(path);
}

/** Digest binding establishes artifact continuity, not a signature or proof of file contents. */
export function executionFacts(
  traces: ExecutionTraceV1[], identity: TraceIdentity,
  binding: { source: "live" } | { source: "saved"; expectedSha256?: string },
): JudgeExecutionFacts {
  if (binding.source === "saved" && !binding.expectedSha256) return unavailableExecution("Legacy trace has no recorded digest binding; execution is unverified.");
  const invalid = (reason: string) => unavailableExecution(reason, "invalid");
  if (!traces.length) return binding.source === "live" ? unavailableExecution() : invalid("Recorded execution trace is missing or unreadable.");
  if (traces.some(trace => !validTrace(trace))) return invalid("Execution trace has malformed structure.");
  if (traces.some((trace, turn) => trace.scenario_id !== identity.scenarioId || trace.mode !== identity.mode || trace.rep !== identity.repetition || trace.turn !== turn ||
      identity.subject && (trace.subject.provider !== identity.subject.provider || trace.subject.model !== identity.subject.model) ||
      identity.piVersion !== undefined && trace.pi_version !== identity.piVersion ||
      trace.subject.provider !== traces[0].subject.provider || trace.subject.model !== traces[0].subject.model || trace.pi_version !== traces[0].pi_version)) {
    return invalid("Execution trace identity or turn sequence does not match this repetition.");
  }
  if (identity.responses !== undefined && (identity.responses === null || identity.responses.length !== traces.length || traces.some((trace, turn) => trace.final_text.trim() !== identity.responses![turn]))) {
    return invalid("Execution trace final answers do not match the judged transcript.");
  }
  if (traces.some(trace => trace.trace_sha256 !== undefined && trace.trace_sha256 !== traceSha256(trace))) return invalid("Execution trace has a mismatching turn digest.");
  // Use the existing canonical merge/digest; only the projection below reaches the judge.
  const merged = mergeTraces(traces);
  const digest = merged?.trace_sha256;
  if (!merged || !digest) return invalid("Execution trace could not be merged.");
  if (binding.source === "saved" && binding.expectedSha256 !== digest) return invalid("Saved trace no longer matches the digest recorded by the run.");
  const complete = traces.length === identity.turns && traces.every(trace => trace.final_status === "complete" && !trace.capture_errors?.length && trace.tool_calls.every(call => call.completionIndex >= 0));
  const calls = merged.tool_calls.slice(0, MAX_CALLS).map(call => ({
    tool: /^[A-Za-z0-9_.:/-]{1,80}$/.test(call.name) ? call.name : "[tool name withheld]",
    state: call.completionIndex < 0 ? "unfinished" as const : call.isError ? "error" as const : "completed" as const,
    ...(readPath(call) === undefined ? {} : { path: readPath(call) }),
    ...(call.completionIndex < 0 ? {} : { resultBytes: call.result.bytes, resultSha256: call.result.sha256 }),
  }));
  const omittedCalls = merged.tool_calls.length - calls.length;
  return {
    schema: 1, status: "verified", coverage: complete && !omittedCalls ? "complete" : "partial",
    reason: complete ? omittedCalls ? "Call list is bounded; omitted calls may include relevant actions." : "All expected turns settled; all recorded calls are listed." : "Turn settlement or capture coverage is incomplete; do not infer that unlisted actions did not occur.",
    traceSha256: digest, observedCalls: merged.tool_calls.length, omittedCalls, calls,
  };
}

/** Reuse the transcript ambiguity check, then compare every assistant turn, excluding harness-owned trailers. */
export function transcriptResponses(transcript: string, scenario: Scenario): string[] | null {
  if (finalAssistantMessage(transcript, scenario) === null) return null;
  return transcript.split(/^<<< ASSISTANT:[ \t]*$/m).slice(1).map(section => section.split(/^(?:>>> USER(?: \(turn \d+\/\d+\))?:[ \t]*|=== SEEDED GATES ===[ \t]*)$/m)[0].trim());
}

/** Read every JSONL turn or decline the whole artifact; never silently drop malformed lines. */
export function loadExecutionFacts(path: string, identity: TraceIdentity, expectedSha256?: string): JudgeExecutionFacts {
  if (!expectedSha256) return unavailableExecution("Legacy run has no recorded trace digest; execution is unverified.");
  if (!existsSync(path)) return unavailableExecution("Recorded execution trace is missing.", "invalid");
  try {
    const lines = readFileSync(path, "utf8").split("\n").filter(line => line.trim());
    const traces = lines.map(deserializeTrace);
    if (traces.some(trace => trace === null)) return unavailableExecution("Execution trace contains unreadable turns.", "invalid");
    return executionFacts(traces as ExecutionTraceV1[], identity, { source: "saved", expectedSha256 });
  } catch {
    return unavailableExecution("Execution trace could not be read or validated.", "invalid");
  }
}
