import type { ExecutionTraceV1, ModelRef, RunMode, ProcessObservation } from "@skill-harness/core";
import { BoundedCapture, ProcessOutputLimitError, runProcess, parseTrace, providerFailureFromJsonLine } from "@skill-harness/core";

/**
 * Run `pi --mode json` and build an execution trace, **streaming**.
 *
 * The streaming is not an optimization, it is the requirement. pi's
 * `message_update` events re-send the entire accumulated message on every delta,
 * so stdout is quadratic in the answer's length — a trivial three-tool-call run
 * measured **52 MB** of stdout wrapping 12 KB of terminal events. Buffering that
 * into a string (which is what the shared `exec()` helper does) would exhaust
 * memory partway through a long wave, taking the whole run with it.
 *
 * The lifecycle is shared with `exec()`, but capture is streaming. Quadratic events are
 * dropped as each line arrives, so the giant ones are never retained; the
 * remainder is bounded by both bytes and record count. Oversized lines or retained
 * evidence terminate the owned process and report an infrastructure error.
 */

/**
 * The two quadratic event types, matched at the head of the object where pi
 * emits `type`. Line-anchored so a value inside the payload cannot masquerade as
 * the event kind.
 */
export const SKIPPED_TYPE_RE = /^\s*\{\s*"type"\s*:\s*"(?:message_update|tool_execution_update)"/;

export interface PiJsonRunOptions {
  args: string[];
  cwd: string;
  timeoutMs: number;
  piVersion: string | null;
  subject: ModelRef;
  scenarioId: string;
  mode: RunMode;
  rep: number;
  turn: number;
  changedPaths?: string[];
  homeDir?: string;
  /**
   * Extra env for the subject process, from the arm. `spawn` treats `undefined`
   * as "inherit", so the control arm (which never sets this) is unaffected.
   */
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxLineBytes?: number;
  maxRetainedBytes?: number;
  maxRecords?: number;
  maxOutputBytes?: number;
}

export interface PiJsonRunResult {
  trace: ExecutionTraceV1;
  isComplete: boolean;
  malformedLines: number;
  code: number | null;
  stderr: string;
  /**
   * Set when a line on the stream carried a provider-side failure diagnostic
   * (auth, transport) rather than the model answering badly. `runStructured`
   * collects this across turns; `run.ts` turns it into ERROR — never a model
   * verdict.
   */
  providerFailure: string | null;
  observation?: ProcessObservation;
}

/** How much stderr to retain — enough to diagnose, bounded so a loop cannot blow up. */
const MAX_STDERR_CHARS = 8000;

export async function runPiJson(opts: PiJsonRunOptions): Promise<PiJsonRunResult> {
  const kept: string[] = [];
  const stderr = new BoundedCapture(MAX_STDERR_CHARS);
  const maxLine = opts.maxLineBytes ?? 8 * 1024 * 1024;
  const maxRetained = opts.maxRetainedBytes ?? 16 * 1024 * 1024;
  const maxRecords = opts.maxRecords ?? 50_000;
  for (const limit of [maxLine, maxRetained, maxRecords])
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid Pi capture limit");
  let retainedBytes = 0;
  let providerFailure: string | null = null;
  const keep = (line: string) => {
    const size = Buffer.byteLength(line, "utf8");
    if (retainedBytes + size > maxRetained || kept.length >= maxRecords)
      throw new ProcessOutputLimitError("Pi retained JSON evidence limit exceeded");
    kept.push(line); retainedBytes += size;
  };
  const acceptLine = (line: string) => {
    // Prefilter before the full parse: the events skipped here are both the
    // overwhelming majority of lines and by far the largest.
    //
    // Anchored on the `type` field, NOT a substring of the whole line. A raw
    // `line.includes('"message_update"')` also matched any event whose
    // ARGUMENTS contained that text — so a `tool_execution_start` for, say,
    // `grep '"message_update"' logs/` was dropped before parsing, and a
    // dropped start means the call never enters the trace at all. A
    // `forbid_calls` gate on that tool then passed for want of the evidence.
    if (!line.trim()) return;
    if (SKIPPED_TYPE_RE.test(line)) {
      // Validate but never retain the quadratic payload. Otherwise a malformed
      // update could disappear and make an incomplete capture look successful.
      let event: { type: string };
      try { event = JSON.parse(line) as { type: string }; }
      catch {
        keep("null"); // one parser-owned malformed-record error per bad line
        return;
      }
      // A late update invalidates an earlier final/settlement. Consecutive
      // updates need only one small state marker, not their accumulated text.
      if (event.type === "message_update" && kept.at(-1) !== '{"type":"message_update"}')
        keep('{"type":"message_update"}');
      return;
    }
    keep(line);
    if (providerFailure === null) providerFailure = providerFailureFromJsonLine(line);
  };
  // Frame bytes at LF, so split UTF-8 and legal Unicode separators stay intact.
  // Enforce the bound before decoding or parsing an unterminated giant line.
  let pending = new BoundedCapture(maxLine);
  const append = (chunk: Buffer) => {
    pending.push(chunk);
    if (pending.truncated)
      throw new ProcessOutputLimitError("Pi JSON line byte limit exceeded");
  };
  const flush = () => {
    if (pending.bytes) acceptLine(pending.text());
    pending = new BoundedCapture(maxLine);
  };
  const result = await runProcess("pi", opts.args, { cwd: opts.cwd, env: opts.env,
    timeoutMs: opts.timeoutMs, signal: opts.signal, maxOutputBytes: opts.maxOutputBytes,
    onStdout(chunk) {
      let start = 0, end: number;
      while ((end = chunk.indexOf(10, start)) >= 0) {
        append(chunk.subarray(start, end)); flush(); start = end + 1;
      }
      if (start < chunk.length) append(chunk.subarray(start));
    },
    onStderr(chunk) { stderr.push(chunk); },
    onStdoutEnd: flush,
  });
  if (result.error) {
    if (result.observation.reason === "timeout") throw new Error(`pi --mode json timed out after ${opts.timeoutMs}ms`);
    throw result.error;
  }
  const parsed = parseTrace(kept, {
    piVersion: opts.piVersion,
    subject: opts.subject,
    scenarioId: opts.scenarioId,
    mode: opts.mode,
    rep: opts.rep,
    turn: opts.turn,
    changedPaths: opts.changedPaths,
    homeDir: opts.homeDir,
  });
  return { ...parsed, code: result.code, stderr: stderr.text(), providerFailure, observation: result.observation };
}
