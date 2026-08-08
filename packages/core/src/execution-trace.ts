import { createHash } from "node:crypto";
import type { ExecutionTraceV1, TraceToolCall, TraceResultMeta } from "./capture-trace-types.js";
import { EXECUTION_TRACE_VERSION } from "./capture-trace-types.js";
import { redactArgs } from "./capture.js";
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
  usage?: { cost?: { total?: number } };
}

export interface TraceMeta {
  piVersion: string | null;
  subject: ModelRef;
  scenarioId: string;
  mode: RunMode;
  rep: number;
  turn: number;
  /** Workspace paths observed to have changed; supplied by the runner, not the stream. */
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
  let issueCounter = 0;
  let completionCounter = 0;
  let malformedLines = 0;
  let sawTerminal = false;

  let finalText = "";
  let lastAssistantText = "";
  let cost: number | null = null;

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
        completionIndex: -1, // filled in on `end`; -1 means it never completed
        isError: false,
        result: { bytes: 0, sha256: sha256("") },
      });
      continue;
    }

    if (type === "tool_execution_end") {
      const id = str(ev.toolCallId);
      if (!id) continue;
      const call = calls.get(id);
      if (!call) continue; // an end with no start is not evidence of a call
      call.completionIndex = completionCounter++;
      call.isError = ev.isError === true;
      call.result = resultMeta(ev.result);
      continue;
    }

    if (type === "message_end") {
      sawTerminal = true;
      const msg = ev.message as RawMessage | undefined;
      if (msg?.role !== "assistant") continue;
      const text = assistantText(msg);
      if (text) {
        lastAssistantText = text;
        // `stop` marks the model's closing message; a `toolUse` message is
        // mid-flight narration and is deliberately not the transcript.
        if (msg.stopReason === "stop") finalText = text;
      }
      const total = msg.usage?.cost?.total;
      if (typeof total === "number") cost = (cost ?? 0) + total;
      continue;
    }

    if (type === "turn_end" || type === "agent_end" || type === "agent_settled") {
      sawTerminal = true;
      // Deliberately read NOTHING from these. They repeat the same assistant
      // messages `message_end` already carried (all three do), and reading two
      // sources would double the transcript and reintroduce thinking.
      continue;
    }
  }

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
    final_text: finalText || lastAssistantText,
    tool_calls: [...calls.values()].sort((a, b) => a.issueIndex - b.issueIndex),
    changed_paths: [...(meta.changedPaths ?? [])].sort(),
    cost_usd: cost,
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
function resultMeta(result: unknown): TraceResultMeta {
  const body = JSON.stringify((result as { content?: unknown } | undefined)?.content ?? result ?? null);
  const meta: TraceResultMeta = { bytes: Buffer.byteLength(body, "utf8"), sha256: sha256(body) };

  const details = (result as { details?: unknown } | undefined)?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const encoded = JSON.stringify(details);
    // Small `details` is the one channel an extension can expose deliberately.
    // Large `details` is a result body wearing a different hat.
    if (encoded.length <= MAX_DETAILS_CHARS) meta.details = details as Record<string, unknown>;
  }
  return meta;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
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
    return only.trace_sha256 ? only : { ...only, trace_sha256: traceSha256(only) };
  }

  const calls: TraceToolCall[] = [];
  const changed = new Set<string>();
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
    for (const p of t.changed_paths) changed.add(p);
    if (t.cost_usd !== null) cost = (cost ?? 0) + t.cost_usd;
  }

  const last = traces[traces.length - 1];
  const merged: ExecutionTraceV1 = {
    ...last,
    // The scenario's answer is its LAST turn's answer, matching how the
    // transcript reads and how the judge is asked to grade it.
    final_text: last.final_text,
    tool_calls: calls,
    changed_paths: [...changed].sort(),
    cost_usd: cost,
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
