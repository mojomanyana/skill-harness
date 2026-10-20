import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ProcessObservation, ProcessScope } from "../src/util/process.js";

const probe = vi.hoisted(() => ({ scope: null as ProcessScope | null }));
vi.mock("../src/util/process.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/util/process.js")>();
  return { ...actual, withProcessScope: <T>(scope: ProcessScope, work: () => T) => {
    probe.scope = scope;
    return actual.withProcessScope(scope, work);
  } };
});
import { withResourceMonitoring } from "../src/resource-monitor.js";
import { throwIfProcessAborted } from "../src/util/process.js";

const directories: string[] = [];
const temporary = () => { const dir = mkdtempSync(join(tmpdir(), "harness-monitor-")); directories.push(dir); return dir; };
const summary = (dir: string) => JSON.parse(readFileSync(join(dir, readdirSync(dir).find(name => name.endsWith(".json"))!), "utf8"));
const record = (pid: number, reason: ProcessObservation["reason"] = "exited"): ProcessObservation => ({
  schema: 1, platform: "linux", scope: "owned-process-group", pid, reason, code: 0, durationMs: 3,
  stdoutBytes: 4, stderrBytes: 0, samples: 1, processesObserved: 1, peakRssBytes: 1024,
  cpuUserTicks: 1, cpuSystemTicks: 0, readBytes: 0, writeBytes: 0, gaps: ["sampling-may-miss-short-lived-processes"],
  cleanup: { termSent: false, killSent: false, groupGone: true, pipesClosed: true },
});
afterEach(() => { vi.useRealTimers(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("private resource summaries", () => {
  it("retains bounded metadata and reports dropped observations without storing payloads or environment", async () => {
    const dir = temporary();
    await withResourceMonitoring(dir, async () => {
      expect(probe.scope?.maxRssBytes).toBeUndefined();
      expect(probe.scope?.maxWriteBytes).toBeUndefined();
      for (let n = 0; n < 300; n++) probe.scope!.onObservation!(record(n));
    });
    const value = summary(dir);
    expect(value).toMatchObject({ state: "settled", totalProcesses: 300, droppedObservations: 44, hostHealth: "unmeasured" });
    expect(value.observations).toHaveLength(256);
    expect(value.active).toEqual([]);
    const text = JSON.stringify(value);
    expect(text).not.toContain("PATH");
    expect(text).not.toContain("argv");
    expect(readdirSync(dir)).toHaveLength(1);
    if (process.platform !== "win32") expect(statSync(join(dir, readdirSync(dir)[0])).mode & 0o777).toBe(0o600);
  });

  it("writes active snapshots before settlement at a bounded cadence", async () => {
    vi.useFakeTimers();
    const dir = temporary();
    await withResourceMonitoring(dir, async () => {
      for (let n = 0; n < 300; n++) probe.scope!.onSample!(record(n, "running"));
      expect(summary(dir).active).toEqual([]);
      await vi.advanceTimersByTimeAsync(5000);
      expect(summary(dir).active).toHaveLength(256);
      expect(summary(dir).droppedActiveObservations).toBe(44);
      expect(summary(dir).state).toBe("running");
      for (let n = 0; n < 300; n++) probe.scope!.onObservation!(record(n));
    });
    expect(summary(dir).active).toEqual([]);
    expect(summary(dir).state).toBe("settled");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["output-limit", "resource-limit"] as const)("stops the remaining scoped work after %s", async reason => {
    const dir = temporary();
    await expect(withResourceMonitoring(dir, async () => {
      probe.scope!.onObservation!(record(42, reason));
      throwIfProcessAborted();
    })).rejects.toThrow(/aborted/);
    expect(summary(dir)).toMatchObject({ state: "interrupted", totalProcesses: 1 });
    expect(summary(dir).observations[0].reason).toBe(reason);
  });

  it("inherits cancellation and still saves the interrupted summary", async () => {
    const dir = temporary(), controller = new AbortController();
    await expect(withResourceMonitoring(dir, async () => {
      controller.abort();
      throwIfProcessAborted();
    }, { signal: controller.signal })).rejects.toThrow(/aborted/);
    expect(summary(dir)).toMatchObject({ state: "interrupted", observations: [] });
  });
});
