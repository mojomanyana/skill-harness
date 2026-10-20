import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { BoundedCapture, ProcessOutputLimitError, runProcess, type ProcessObservation } from "./process.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  observation?: ProcessObservation;
}

export interface ExecOpts {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
}

/** Spawn a command, capture stdout/stderr. Never throws on non-zero exit; returns the code. */
export async function exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
  const stdout = new BoundedCapture(opts.maxStdoutBytes ?? 8 * 1024 * 1024);
  const stderr = new BoundedCapture(opts.maxStderrBytes ?? 128 * 1024);
  const capture = (sink: BoundedCapture, name: string) => (chunk: Buffer) => {
    sink.push(chunk);
    if (sink.truncated) throw new ProcessOutputLimitError(`${name} capture exceeded ${sink.limit} bytes`);
  };
  const result = await runProcess(cmd, args, { ...opts,
    onStdout: capture(stdout, "stdout"), onStderr: capture(stderr, "stderr") });
  // A partial command output must never masquerade as a successful judge answer,
  // git diff, or tool lookup. Ordinary non-zero exits remain the caller's decision.
  if (result.error) throw result.error;
  return { stdout: stdout.text(), stderr: stderr.text(), code: result.code, observation: result.observation };
}

/** True if a binary is resolvable on PATH. */
export function onPath(bin: string): boolean {
  const dirs = (process.env.PATH ?? "").split(delimiter);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return dirs.some((d) => d && exts.some((ext) => existsSync(join(d, bin + ext))));
}
