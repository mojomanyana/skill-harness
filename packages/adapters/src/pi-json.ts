import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { ExecutionTraceV1, ModelRef, RunMode } from "@skill-harness/core";
import { parseTrace } from "@skill-harness/core";

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
}

export interface PiJsonRunResult {
  trace: ExecutionTraceV1;
  isComplete: boolean;
  malformedLines: number;
  code: number | null;
  stderr: string;
}

/** How much stderr to retain — enough to diagnose, bounded so a loop cannot blow up. */
const MAX_STDERR_CHARS = 8000;

export function runPiJson(opts: PiJsonRunOptions): Promise<PiJsonRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("pi", opts.args, {
      cwd: opts.cwd,
      // stdin from /dev/null: pi hangs waiting on it otherwise, and a hang in a
      // wave is indistinguishable from a slow model until the timeout fires.
      stdio: ["ignore", "pipe", "pipe"],
    });

    const kept: string[] = [];
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`pi --mode json timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);

    const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
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
      if (SKIPPED_TYPE_RE.test(line)) return;
      kept.push(line);
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
      resolve({ ...parsed, code, stderr: stderr.slice(0, MAX_STDERR_CHARS) });
    });
  });
}
