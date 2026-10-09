import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import type { ExecutionTraceV1, ModelRef, RunMode } from "@skill-harness/core";
import { parseTrace, providerFailureFromJsonLine } from "@skill-harness/core";

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
 * So this deliberately does NOT reuse `exec()`. The two quadratic event types are
 * dropped as each line arrives, so the giant ones are never retained; the
 * remainder — a few KB of terminal events — is held until `close` and parsed
 * once. What this bounds is the 52 MB, not the residue.
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
}

/** How much stderr to retain — enough to diagnose, bounded so a loop cannot blow up. */
const MAX_STDERR_CHARS = 8000;

export function runPiJson(opts: PiJsonRunOptions): Promise<PiJsonRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("pi", opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      // stdin from /dev/null: pi hangs waiting on it otherwise, and a hang in a
      // wave is indistinguishable from a slow model until the timeout fires.
      stdio: ["ignore", "pipe", "pipe"],
    });

    const kept: string[] = [];
    let stderr = "";
    let providerFailure: string | null = null;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`pi --mode json timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

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
        try {
          const event = JSON.parse(line) as { type: string };
          // A late update invalidates an earlier final/settlement. Consecutive
          // updates need only one small state marker, not their accumulated text.
          if (event.type === "message_update" && kept.at(-1) !== '{"type":"message_update"}') {
            kept.push('{"type":"message_update"}');
          }
        } catch {
          kept.push("null"); // one parser-owned malformed-record error per bad line
        }
        return;
      }
      kept.push(line);
      if (providerFailure === null) providerFailure = providerFailureFromJsonLine(line);
    };
    // JSONL is LF-framed. readline also splits legal Unicode string separators
    // on newer Node runtimes, turning valid model text into malformed records.
    const decoder = new StringDecoder("utf8");
    let pending = "";
    child.stdout.on("data", (chunk: Buffer) => {
      pending += decoder.write(chunk);
      let start = 0, end: number;
      while ((end = pending.indexOf("\n", start)) >= 0) {
        acceptLine(pending.slice(start, end));
        start = end + 1;
      }
      pending = pending.slice(start);
    });
    child.stdout.on("end", () => {
      pending += decoder.end();
      if (pending) acceptLine(pending);
      pending = "";
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < MAX_STDERR_CHARS) stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      resolve({ ...parsed, code, stderr: stderr.slice(0, MAX_STDERR_CHARS), providerFailure });
    });
  });
}
