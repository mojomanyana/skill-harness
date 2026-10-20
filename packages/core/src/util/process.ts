import { AsyncLocalStorage } from "node:async_hooks";
import { spawn, type ChildProcess } from "node:child_process";
import { open, opendir } from "node:fs/promises";

export interface ProcessObservation {
  schema: 1;
  platform: string;
  scope: "owned-process-group" | "child-process";
  pid: number | null;
  reason: "running" | "exited" | "timeout" | "aborted" | "output-limit" | "resource-limit" | "spawn-error";
  code: number | null;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  samples: number;
  processesObserved: number;
  peakRssBytes: number | null;
  cpuUserTicks: number | null;
  cpuSystemTicks: number | null;
  readBytes: number | null;
  writeBytes: number | null;
  gaps: string[];
  cleanup: { termSent: boolean; killSent: boolean; groupGone: boolean | null; pipesClosed: boolean };
}

export interface ProcessScope {
  signal?: AbortSignal;
  /** One metadata-only record on settlement; never receives argv, environment or output. */
  onObservation?: (record: ProcessObservation) => void;
  /** Latest active metadata, initially and at most every five seconds; never raw logs. */
  onSample?: (record: ProcessObservation) => void;
  /** Optional owned-tree sampled limits; these are not host quotas or sandbox boundaries. */
  maxRssBytes?: number;
  maxWriteBytes?: number;
}
const scopeStorage = new AsyncLocalStorage<ProcessScope>();

/** Scope all subprocesses in an evaluation, including concurrent subject/judge calls. */
export function withProcessScope<T>(scope: ProcessScope, work: () => T): T {
  return scopeStorage.run({ ...scopeStorage.getStore(), ...scope }, work);
}

export class ProcessControlError extends Error {
  constructor(readonly reason: "aborted" | "output-limit" | "resource-limit", message: string) {
    super(message); this.name = "ProcessControlError";
  }
}
export class ProcessOutputLimitError extends ProcessControlError {
  constructor(message: string) { super("output-limit", message); this.name = "ProcessOutputLimitError"; }
}
export function isProcessControlError(error: unknown): error is ProcessControlError { return error instanceof ProcessControlError; }
export function getProcessSignal(): AbortSignal | undefined { return scopeStorage.getStore()?.signal; }
export function throwIfProcessAborted(): void {
  if (getProcessSignal()?.aborted) throw new ProcessControlError("aborted", "Process execution aborted before spawn");
}

/** Retains at most `limit` bytes, including a single oversized chunk. */
export class BoundedCapture {
  private chunks: Buffer[] = [];
  private tailUsed = 0;
  bytes = 0;
  truncated = false;
  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid output byte limit");
  }
  push(chunk: Buffer): void {
    const remaining = this.limit - this.bytes;
    if (chunk.length > remaining) this.truncated = true;
    if (remaining <= 0) return;
    const count = Math.min(chunk.length, remaining);
    let offset = 0;
    while (offset < count) {
      let tail = this.chunks.at(-1);
      if (!tail || this.tailUsed === tail.length) {
        tail = Buffer.allocUnsafe(Math.min(64 * 1024, this.limit - this.bytes));
        this.chunks.push(tail); this.tailUsed = 0;
      }
      const copied = Math.min(count - offset, tail.length - this.tailUsed);
      chunk.copy(tail, this.tailUsed, offset, offset + copied);
      offset += copied; this.tailUsed += copied; this.bytes += copied;
    }
  }
  text(): string {
    const used = this.chunks.map((chunk, index) => index === this.chunks.length - 1 ? chunk.subarray(0, this.tailUsed) : chunk);
    return Buffer.concat(used, this.bytes).toString("utf8");
  }
}

interface ProcSample { pid: number; start: string; children: number[]; rss: number | null; user: number; system: number; read: number | null; write: number | null }
const MAX_PROCESSES = 128;
const MAX_THREADS = 16;
const MAX_PROC_BYTES = 64 * 1024;

async function procText(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_PROC_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_PROC_BYTES) throw new Error("proc record too large");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally { await file.close(); }
}

/** Parse only kernel numeric metadata. No command line, environment, file names or output. */
async function samplePid(pid: number, gap: (value: string) => void): Promise<ProcSample | null> {
  try {
    const dir = `/proc/${pid}`;
    const stat = await procText(`${dir}/stat`);
    const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
    if (fields.length < 22) return null;
    const value: ProcSample = { pid, start: fields[19], children: [], rss: null,
      user: Number(fields[11]), system: Number(fields[12]), read: null, write: null };
    try {
      const status = await procText(`${dir}/status`);
      const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      if (rss) value.rss = Number(rss[1]) * 1024;
    } catch { gap("rss-sample-unavailable"); }
    try {
      const io = await procText(`${dir}/io`);
      const r = /^read_bytes:\s+(\d+)$/m.exec(io), w = /^write_bytes:\s+(\d+)$/m.exec(io);
      value.read = r ? Number(r[1]) : null;
      value.write = w ? Number(w[1]) : null;
    } catch { gap("io-sample-unavailable"); }
    try {
      const threads = await opendir(`${dir}/task`);
      let count = 0;
      for await (const entry of threads) {
        if (count++ >= MAX_THREADS) { gap("thread-sample-limit"); break; }
        try {
          const children = await procText(`${dir}/task/${entry.name}/children`);
          for (const child of children.trim().split(/\s+/).map(Number).filter(n => n > 0)) {
            if (value.children.length >= MAX_PROCESSES) { gap("process-sample-limit"); break; }
            value.children.push(child);
          }
        } catch { gap("descendant-sample-race"); }
      }
    } catch { gap("descendant-sample-unavailable"); }
    return value;
  } catch { return null; }
}

function groupExists(pid: number): boolean | null {
  try { process.kill(-pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH" ? false : null; }
}

export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Total stream traffic ceiling, independent of how much a consumer retains. */
  maxOutputBytes?: number;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
  onStdoutEnd?: () => void;
  /** Internal/test seam; not a model execution budget. */
  killGraceMs?: number;
}
export interface ProcessResult { code: number | null; observation: ProcessObservation; error: Error | null }

/** Shared owned-process lifecycle. Callers retain only their bounded stream representation. */
export function runProcess(command: string, args: string[], options: ProcessOptions = {}): Promise<ProcessResult> {
  const scope = scopeStorage.getStore() ?? {};
  const signal = options.signal ?? scope.signal;
  const linux = process.platform === "linux";
  const grace = options.killGraceMs ?? 250;
  const outputLimit = options.maxOutputBytes ?? 256 * 1024 * 1024;
  if (!Number.isSafeInteger(outputLimit) || outputLimit < 1) return Promise.reject(new Error("Invalid process output limit"));
  for (const value of [scope.maxRssBytes, scope.maxWriteBytes])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) return Promise.reject(new Error("Invalid sampled resource limit"));
  if (!linux && (scope.maxRssBytes !== undefined || scope.maxWriteBytes !== undefined))
    return Promise.reject(new Error("Sampled resource limits require Linux /proc; unsupported on this platform"));
  if (!Number.isSafeInteger(grace) || grace < 0 || grace > 30_000) return Promise.reject(new Error("Invalid process cleanup grace"));
  if (signal?.aborted) return Promise.reject(new ProcessControlError("aborted", "Process execution aborted before spawn"));
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const record: ProcessObservation = {
      schema: 1, platform: process.platform, scope: linux ? "owned-process-group" : "child-process", pid: null,
      reason: "exited", code: null, durationMs: 0, stdoutBytes: 0, stderrBytes: 0,
      samples: 0, processesObserved: 0, peakRssBytes: null, cpuUserTicks: null, cpuSystemTicks: null,
      readBytes: null, writeBytes: null, gaps: linux ? ["sampling-may-miss-short-lived-processes", "sampled-io-counters-may-include-reaped-children", "process-group-is-not-containment"] : ["resource-sampling-unsupported", "descendant-cleanup-unsupported"],
      cleanup: { termSent: false, killSent: false, groupGone: null, pipesClosed: false },
    };
    const gap = (value: string) => { if (!record.gaps.includes(value)) record.gaps.push(value); };
    let child: ChildProcess;
    try {
      child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"], detached: linux });
    } catch (error) { reject(error); return; }
    record.pid = child.pid ?? null;
    let done = false, closed = false, terminating = false, rootExited = false;
    let failure: Error | null = null;
    let timeout: NodeJS.Timeout | undefined, interval: NodeJS.Timeout | undefined;
    let force: NodeJS.Timeout | undefined, finalTimer: NodeJS.Timeout | undefined;
    let sampleInFlight: Promise<void> | null = null;
    let lastPublishedSample = -Infinity;
    const known = new Map<string, ProcSample>();

    const send = (name: NodeJS.Signals) => {
      try {
        if (linux && child.pid) process.kill(-child.pid, name);
        else if (!rootExited) child.kill(name);
        if (name === "SIGTERM") record.cleanup.termSent = true;
        else record.cleanup.killSent = true;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") gap("process-signal-failed"); }
    };
    const publish = () => {
      record.durationMs = Math.round(performance.now() - started);
      record.cleanup.pipesClosed = closed;
      record.cleanup.groupGone = linux && child.pid ? groupExists(child.pid) === false : null;
      if (linux && record.cleanup.groupGone !== true) gap("process-group-disappearance-unverified");
      try { scope.onObservation?.(record); } catch { /* Observability cannot strand a child or change its verdict. */ }
    };
    const finish = async () => {
      if (done) return;
      done = true;
      clearTimeout(timeout); clearInterval(interval); clearTimeout(force); clearTimeout(finalTimer);
      signal?.removeEventListener("abort", abort);
      await sampleInFlight;
      child.stdout?.destroy(); child.stderr?.destroy();
      publish();
      resolve({ code: record.code, observation: record, error: failure });
    };
    const stop = (reason: ProcessObservation["reason"], error?: Error) => {
      if (done) return;
      if (record.reason === "exited") record.reason = reason;
      failure ??= error ?? null;
      if (terminating) return;
      terminating = true;
      send("SIGTERM");
      // Keep the hard-stop timer even when the direct child closes first: siblings may remain.
      force = setTimeout(() => {
        if (!linux || !child.pid || groupExists(child.pid) !== false) send("SIGKILL");
        finalTimer = setTimeout(() => { void finish(); }, 100);
      }, grace);
    };
    const abort = () => stop("aborted", new ProcessControlError("aborted", "Process execution aborted"));
    const publishSample = () => {
      if (done || terminating || performance.now() - lastPublishedSample < 5000) return;
      lastPublishedSample = performance.now();
      try { scope.onSample?.({ ...record, reason: "running", durationMs: Math.round(performance.now() - started),
        gaps: [...record.gaps], cleanup: { ...record.cleanup } }); } catch { /* Monitoring must not affect process control. */ }
    };
    const takeSample = async () => {
      if (done) return;
      if (!linux || !child.pid) { publishSample(); return; }
      const queue = [child.pid], visited = new Set<number>();
      let rss = 0, rssSeen = false;
      while (queue.length && visited.size < MAX_PROCESSES && !done) {
        const pid = queue.shift()!;
        if (visited.has(pid)) continue;
        visited.add(pid);
        const sample = await samplePid(pid, gap);
        if (!sample) { gap("process-sample-race"); continue; }
        const key = `${pid}:${sample.start}`;
        if (!known.has(key) && known.size >= MAX_PROCESSES) { gap("process-history-limit"); break; }
        known.set(key, sample);
        if (sample.rss !== null) { rss += sample.rss; rssSeen = true; }
        for (const descendant of sample.children) if (!visited.has(descendant)) {
          if (queue.length >= MAX_PROCESSES) { gap("process-sample-limit"); break; }
          queue.push(descendant);
        }
      }
      if (queue.length) gap("process-sample-limit");
      record.samples++;
      record.processesObserved = known.size;
      if (rssSeen) record.peakRssBytes = Math.max(record.peakRssBytes ?? 0, rss);
      if (known.size) {
        record.cpuUserTicks = [...known.values()].reduce((sum, p) => sum + p.user, 0);
        record.cpuSystemTicks = [...known.values()].reduce((sum, p) => sum + p.system, 0);
        const sumIo = (field: "read" | "write") => {
          const values = [...known.values()].map(p => p[field]);
          return values.every(v => v !== null) ? values.reduce<number>((sum, value) => sum + value!, 0) : null;
        };
        record.readBytes = sumIo("read"); record.writeBytes = sumIo("write");
      }
      if (scope.maxRssBytes !== undefined && rssSeen && rss > scope.maxRssBytes)
        stop("resource-limit", new ProcessControlError("resource-limit", "Owned process RSS limit exceeded"));
      if (scope.maxWriteBytes !== undefined && record.writeBytes !== null && record.writeBytes > scope.maxWriteBytes)
        stop("resource-limit", new ProcessControlError("resource-limit", "Owned process write-byte limit exceeded"));
      publishSample();
    };
    const sample = () => {
      if (sampleInFlight || done) return;
      sampleInFlight = takeSample().catch(() => gap("resource-sample-unavailable")).finally(() => { sampleInFlight = null; });
    };
    const consume = (kind: "stdout" | "stderr", chunk: Buffer) => {
      record[kind === "stdout" ? "stdoutBytes" : "stderrBytes"] += chunk.length;
      if (done || terminating) return;
      if (record.stdoutBytes + record.stderrBytes > outputLimit) {
        stop("output-limit", new ProcessOutputLimitError("Process stream byte limit exceeded")); return;
      }
      try { (kind === "stdout" ? options.onStdout : options.onStderr)?.(chunk); }
      catch (error) { stop("output-limit", error instanceof Error ? error : new Error("Process capture failed")); }
    };
    child.stdout!.on("data", chunk => consume("stdout", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stderr!.on("data", chunk => consume("stderr", Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    child.stdout!.on("end", () => {
      if (done || terminating) return;
      try { options.onStdoutEnd?.(); }
      catch (error) { stop("output-limit", error instanceof Error ? error : new Error("Process capture failed")); }
    });
    child.on("spawn", () => { sample(); interval = setInterval(sample, 1000); interval.unref(); });
    child.on("exit", code => {
      rootExited = true; record.code = code;
      if (linux && child.pid && groupExists(child.pid) !== false) stop("exited");
    });
    child.on("error", error => {
      record.reason = "spawn-error"; failure = error;
      clearTimeout(timeout); clearInterval(interval);
      if (!child.pid) { done = true; signal?.removeEventListener("abort", abort); child.stdout?.destroy(); child.stderr?.destroy(); publish(); reject(error); }
      else stop("spawn-error", error);
    });
    child.on("close", code => {
      closed = true; record.code = code;
      if (!terminating) void finish();
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    if (options.timeoutMs !== undefined && options.timeoutMs > 0)
      timeout = setTimeout(() => stop("timeout", new Error(`Process timed out after ${options.timeoutMs}ms`)), options.timeoutMs);
  });
}
