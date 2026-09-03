import { createHash } from "node:crypto";
import type { ExecutionTraceV1, TraceToolCall, TraceResultMeta, TraceMetrics } from "./capture-trace-types.js";
import { normalizeSubagentCall } from "./trace-gates.js";
import { EXECUTION_TRACE_VERSION } from "./capture-trace-types.js";
import { redactArgs, redactText } from "./capture.js";
import type { ModelRef, RunMode } from "./adapters/types.js";

/**
 * Parse pi's `--mode json` event stream into an `ExecutionTraceV1`.
 *
 * Measured against pi 0.83.0; see `docs/pi-native-capture-design-2026-08-08.md`
 * and the fixtures in `packages/adapters/test/fixtures/pi-json/`. Three findings
 * from that spike are baked in here and each one is a bug if removed:
 *
 * 1. **Line-at-a-time, never buffered.** `message_update` re-sends the entire
 *    accumulated message on every delta, so the stream is quadratic in output
 *    length — a trivial three-tool-call run emitted 52 MB wrapping 12 KB of
 *    terminal events. The parser consumes an iterable of lines and holds only
 *    what it keeps.
 * 2. **The final assistant message only.** pi's print mode — what the judge has
 *    always been shown — emits exactly that. Concatenating every assistant text
 *    block would add interim narration the transcript has never contained and
 *    move verdicts on scenarios nobody edited.
 * 3. **Correlate tool calls by `toolCallId`.** Batched calls execute
 *    concurrently and their `end` events arrive in completion order.
 */

/** Events that carry no information a trace keeps, and are large. */
const SKIPPED = new Set(["message_update", "tool_execution_update"]);

/** `details` larger than this is dropped rather than persisted. */
const MAX_DETAILS_CHARS = 2000;

interface ContentBlock {
  type: string;
  text?: string;
  [k: string]: unknown;
}

interface RawMessage {
  role?: string;
  content?: ContentBlock[];
  stopReason?: string;
  toolCallId?: string;
  timestamp?: number | string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: { total?: number };
  };
}

export interface TraceMeta {
  piVersion: string | null;
  subject: ModelRef;
  scenarioId: string;
  mode: RunMode;
  rep: number;
  turn: number;
  /**
   * Workspace paths observed to have changed; supplied by the runner, not the
   * stream. Omitted means NOT OBSERVED, which the trace records as `null`.
   */
  changedPaths?: string[];
  /** Home dir to scrub from arguments. */
  homeDir?: string;
}

/**
 * Build a trace from pi JSON lines.
 *
 * Malformed lines are counted, not thrown on: a single truncated line at the end
 * of a killed process must not discard an otherwise complete trace. But a stream
 * with NO terminal events at all is not a trace — `isComplete` says so, and the
 * caller turns that into ERROR rather than a passing gate.
 */
export function parseTrace(lines: Iterable<string>, meta: TraceMeta): { trace: ExecutionTraceV1; isComplete: boolean; malformedLines: number } {
  const calls = new Map<string, TraceToolCall>();
  const issuedAt = new Map<string, string>();
  const completedAt = new Map<string, string>();
  let issueCounter = 0;
  let completionCounter = 0;
  let malformedLines = 0;
  let sawTerminal = false;

  let finalText = "";
  let lastAssistantText = "";
  let cost: number | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let sawUsage = false;
  let activeCalls = 0;
  let maxConcurrency = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let ev: { type?: string; [k: string]: unknown };
    try {
      ev = JSON.parse(trimmed) as { type?: string };
    } catch {
      malformedLines++;
      continue;
    }
    const type = ev.type;
    if (typeof type !== "string" || SKIPPED.has(type)) continue;

    if (type === "tool_execution_start") {
      const id = str(ev.toolCallId);
      if (!id) continue;
      calls.set(id, {
        id,
        name: str(ev.toolName) ?? "(unknown)",
        args: redactArgs(ev.args, meta.homeDir),
        issueIndex: issueCounter++,
        ...(issuedAt.get(id) ? { started_at: issuedAt.get(id) } : {}),
        completionIndex: -1, // filled in on `end`; -1 means it never completed
        isError: false,
        result: { bytes: 0, sha256: sha256("") },
      });
      activeCalls++;
      maxConcurrency = Math.max(maxConcurrency, activeCalls);
      continue;
    }

    if (type === "tool_execution_end") {
      const id = str(ev.toolCallId);
      if (!id) continue;
      const call = calls.get(id);
      if (!call) continue; // an end with no start is not evidence of a call
      if (call.completionIndex < 0) activeCalls = Math.max(0, activeCalls - 1);
      call.completionIndex = completionCounter++;
      if (completedAt.get(id)) call.completed_at = completedAt.get(id);
      call.isError = ev.isError === true;
      call.result = resultMeta(ev.result, meta.homeDir);
      continue;
    }

    if (type === "message_end") {
      sawTerminal = true;
      const msg = ev.message as RawMessage | undefined;
      const at = isoTime(msg?.timestamp);
      if (msg?.role === "assistant" && at) {
        for (const block of msg.content ?? []) {
          if (block.type !== "toolCall" || typeof block.id !== "string") continue;
          issuedAt.set(block.id, at);
          const call = calls.get(block.id);
          if (call) call.started_at = at;
        }
      }
      if (msg?.role === "toolResult" && typeof msg.toolCallId === "string" && at) {
        completedAt.set(msg.toolCallId, at);
        const call = calls.get(msg.toolCallId);
        if (call) call.completed_at = at;
      }
      if (msg?.role !== "assistant") continue;
      const text = assistantText(msg);
      if (text) {
        lastAssistantText = text;
        // `stop` marks the model's closing message; a `toolUse` message is
        // mid-flight narration and is deliberately not the transcript.
        if (msg.stopReason === "stop") finalText = text;
      }
      if (msg.usage && (
        typeof msg.usage.input === "number" || typeof msg.usage.output === "number" ||
        typeof msg.usage.cacheRead === "number" || typeof msg.usage.cacheWrite === "number" ||
        typeof msg.usage.cost?.total === "number"
      )) sawUsage = true;
      const total = msg.usage?.cost?.total;
      if (typeof total === "number") cost = (cost ?? 0) + total;
      if (typeof msg.usage?.input === "number") inputTokens += msg.usage.input;
      if (typeof msg.usage?.output === "number") outputTokens += msg.usage.output;
      if (typeof msg.usage?.cacheRead === "number") cacheReadTokens += msg.usage.cacheRead;
      if (typeof msg.usage?.cacheWrite === "number") cacheWriteTokens += msg.usage.cacheWrite;
      continue;
    }

    if (type === "turn_end" || type === "agent_end" || type === "agent_settled") {
      sawTerminal = true;
      // Deliberately read NOTHING from these. They repeat the same assistant
      // messages `message_end` already carried (`turn_end` and `agent_end` do;
    // `agent_settled` carries no keys at all beyond `type`), and reading two
      // sources would double the transcript and reintroduce thinking.
      continue;
    }
  }

  const toolCalls = [...calls.values()].sort((a, b) => a.issueIndex - b.issueIndex);
  const subscription = meta.subject.provider === "openai-codex" || meta.subject.provider === "claude-code";
  const costSource: TraceMetrics["cost_source"] = subscription
    ? "subscription"
    : cost !== null
      ? "provider-reported"
      : "unreported";
  const metrics: TraceMetrics = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    cost_usd: cost ?? 0,
    cost_source: costSource,
    tool_calls: toolCalls.length,
    delegated_children: toolCalls
      .filter((call) => call.name === "Agent")
      .reduce((count, call) => count + normalizeSubagentCall(call.args).length, 0),
    max_concurrency: maxConcurrency,
  };
  const trace: ExecutionTraceV1 = {
    trace_version: EXECUTION_TRACE_VERSION,
    pi_version: meta.piVersion,
    subject: meta.subject,
    scenario_id: meta.scenarioId,
    mode: meta.mode,
    rep: meta.rep,
    turn: meta.turn,
    // Fall back to the last assistant text when no message carried `stop` — a
    // truncated or length-capped run still produced an answer, and losing it
    // would silently turn a real reply into an empty transcript.
    // Redacted: the model's own answer routinely quotes the paths it just read,
    // and `smoke-real-pi.sh` asserts no `/home/` survives into a persisted trace
    // — an assertion that used to pass only because the smoke model happened not
    // to echo one.
    final_text: redactText(finalText || lastAssistantText, meta.homeDir),
    tool_calls: toolCalls,
    // `null`, not `[]`: the stream says nothing about the filesystem. The runner
    // overwrites this after observing the workspace. Defaulting to `[]` claimed
    // "observed, nothing changed" for every trace ever parsed.
    changed_paths: meta.changedPaths ? [...meta.changedPaths].sort() : null,
    cost_usd: cost,
    // Tool calls remain in the trace for objective gates. Aggregate usage/cost/
    // tool metrics are published only when pi actually reported usage; otherwise
    // zero would mean "free" instead of "unavailable".
    ...(sawUsage ? { metrics } : {}),
  };
  trace.trace_sha256 = traceSha256(trace);

  return { trace, isComplete: sawTerminal, malformedLines };
}

/** Visible assistant text. Thinking is dropped here, and at every other reader. */
function assistantText(msg: RawMessage): string {
  return (msg.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

/**
 * Bounded metadata about a tool result. The body is never kept: results carry
 * file contents, command output, and absolute paths (a failing `read` embeds the
 * full path in its error string).
 */
function resultMeta(result: unknown, homeDir?: string): TraceResultMeta {
  const body = JSON.stringify((result as { content?: unknown } | undefined)?.content ?? result ?? null);
  const meta: TraceResultMeta = { bytes: Buffer.byteLength(body, "utf8"), sha256: sha256(body) };

  const details = (result as { details?: unknown } | undefined)?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const encoded = JSON.stringify(details);
    // Small `details` is the one channel an extension can expose deliberately.
    // Large `details` is a result body wearing a different hat.
    //
    // Redacted like every other value that reaches disk. `TraceResultMeta` has
    // always PROMISED this — "retained only when it is small and free of
    // redaction hits" — while the code checked only the size, so a tool that put
    // a token, a connection string or a home path in `details` wrote it verbatim
    // into the trace artifact. `args` right beside it was redacted the whole time.
    if (encoded.length <= MAX_DETAILS_CHARS) meta.details = redactArgs(details, homeDir);
  }
  return meta;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function isoTime(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Deterministic hash over the trace, excluding the hash field itself.
 *
 * Keys are emitted in a fixed order rather than whatever insertion produced, so
 * the same execution always hashes the same — a digest that depends on key order
 * would make `regate` report spurious drift.
 */
export function traceSha256(trace: ExecutionTraceV1): string {
  const { trace_sha256: _omit, ...rest } = trace;
  return sha256(stableStringify(rest));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Serialize a trace as the JSONL artifact saved beside a transcript. */
export function serializeTrace(trace: ExecutionTraceV1): string {
  return `${JSON.stringify(trace)}\n`;
}

/** Read a saved trace artifact back, for `regate`. Returns null when unusable. */
export function deserializeTrace(text: string): ExecutionTraceV1 | null {
  const line = text.split("\n").find((l) => l.trim());
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as ExecutionTraceV1;
    // A trace from a future version is refused rather than half-read: the whole
    // point of the version field is that a reader can decline.
    if (parsed.trace_version !== EXECUTION_TRACE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Collapse a scenario's per-turn traces into one view for gate evaluation.
 *
 * Assertions are written about the scenario ("it delegated to `plan` at least
 * once"), not about turn 3 — a multi-turn scenario would otherwise need the
 * author to know which turn a tool call landed in, which is a property of the
 * model's choices, not of the test.
 *
 * Indices are renumbered across the whole scenario so `issueIndex` stays a total
 * order. `completionIndex` is renumbered within the concatenation too: turns are
 * strictly sequential (each is a separate `pi` invocation), so no completion in
 * turn 2 can precede one in turn 1.
 *
 * Returns null for an empty list — "no turns produced evidence" must not look
 * like "a run in which nothing happened".
 */
export function mergeTraces(traces: ExecutionTraceV1[]): ExecutionTraceV1 | null {
  if (traces.length === 0) return null;
  if (traces.length === 1) {
    // Compute the digest here rather than trusting the producer to have set it.
    // `regate` identifies saved evidence by this hash, so a trace that arrived
    // without one would be un-regatable — and an adapter is exactly the layer
    // most likely to forget.
    const only = traces[0];
    return { ...only, trace_sha256: traceSha256(only) };
  }

  const calls: TraceToolCall[] = [];
  const changed = new Set<string>();
  let anyUnobserved = false;
  let cost: number | null = null;

  let completed = 0;
  for (const t of traces) {
    // Issue order and completion order are renumbered SEPARATELY. Assigning both
    // from the same counter collapsed them, so every merged call got
    // `completionIndex === issueIndex` — destroying the out-of-order completion
    // data the parser records, and the persisted trace then described a
    // concurrency ordering that did not happen.
    const mergedCompletion = new Map(
      [...t.tool_calls]
        .filter((c) => c.completionIndex >= 0)
        .sort((a, b) => a.completionIndex - b.completionIndex)
        .map((c) => [c.id, completed++] as const),
    );
    for (const c of [...t.tool_calls].sort((a, b) => a.issueIndex - b.issueIndex)) {
      calls.push({ ...c, issueIndex: calls.length, completionIndex: mergedCompletion.get(c.id) ?? -1 });
    }
    // A single unobserved turn makes the merged evidence unobserved: a scenario
    // cannot claim "nothing changed" from turns it never looked at.
    if (t.changed_paths === null) anyUnobserved = true;
    else for (const p of t.changed_paths) changed.add(p);
    if (t.cost_usd !== null) cost = (cost ?? 0) + t.cost_usd;
  }

  const completeMetrics = traces.every((trace) => trace.metrics !== undefined);
  const metrics = completeMetrics
    ? traces.reduce<TraceMetrics>((sum, trace) => ({
        input_tokens: sum.input_tokens + trace.metrics!.input_tokens,
        output_tokens: sum.output_tokens + trace.metrics!.output_tokens,
        cache_read_tokens: sum.cache_read_tokens + trace.metrics!.cache_read_tokens,
        cache_write_tokens: sum.cache_write_tokens + trace.metrics!.cache_write_tokens,
        cost_usd: sum.cost_usd + trace.metrics!.cost_usd,
        cost_source: sum.cost_source === trace.metrics!.cost_source ? sum.cost_source : "unreported",
        tool_calls: sum.tool_calls + trace.metrics!.tool_calls,
        delegated_children: sum.delegated_children + trace.metrics!.delegated_children,
        max_concurrency: Math.max(sum.max_concurrency, trace.metrics!.max_concurrency),
      }), {
        input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
        cost_usd: 0, cost_source: traces[0].metrics!.cost_source, tool_calls: 0, delegated_children: 0, max_concurrency: 0,
      })
    : undefined;
  const last = traces[traces.length - 1];
  const captureErrors = traces.flatMap((trace) => trace.capture_errors ?? []);
  const { capture_errors: _lastCaptureErrors, ...lastWithoutCaptureErrors } = last;
  void _lastCaptureErrors;
  const merged: ExecutionTraceV1 = {
    ...lastWithoutCaptureErrors,
    // The scenario's answer is its LAST turn's answer, matching how the
    // transcript reads and how the judge is asked to grade it.
    final_text: last.final_text,
    tool_calls: calls,
    changed_paths: anyUnobserved ? null : [...changed].sort(),
    cost_usd: cost,
    ...(captureErrors.length ? { capture_errors: captureErrors } : {}),
    ...(metrics ? { metrics } : {}),
  };
  merged.trace_sha256 = traceSha256(merged);
  return merged;
}

/** Split a raw stdout blob into lines. Prefer streaming; this is for saved blobs. */
export function* lines(text: string): Generator<string> {
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      yield text.slice(start, i);
      start = i + 1;
    }
  }
  if (start < text.length) yield text.slice(start);
}
