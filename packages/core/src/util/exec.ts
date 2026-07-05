import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface ExecOpts {
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

/** Spawn a command, capture stdout/stderr. Never throws on non-zero exit; returns the code. */
export function exec(cmd: string, args: string[], opts: ExecOpts = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    // stdin must be ignored (not inherited): pi blocks reading stdin even in
    // --print mode if its stdin is an open pipe/tty.
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        stderr += `\n[skill-harness] killed after ${opts.timeoutMs}ms timeout`;
      }, opts.timeoutMs);
    }
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/** True if a binary is resolvable on PATH. */
export function onPath(bin: string): boolean {
  const dirs = (process.env.PATH ?? "").split(delimiter);
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return dirs.some((d) => d && exts.some((ext) => existsSync(join(d, bin + ext))));
}
