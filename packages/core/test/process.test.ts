import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { exec } from "../src/util/exec.js";
import { BoundedCapture, isProcessControlError, runProcess, withProcessScope, type ProcessObservation } from "../src/util/process.js";

describe("bounded process execution", () => {
  it("keeps complete UTF-8 output and ordinary exit codes, with metadata-only observations", async () => {
    const records: ProcessObservation[] = [];
    const result = await withProcessScope({ onObservation: record => records.push(record) }, () =>
      exec(process.execPath, ["-e", "process.stdout.write('🙂');process.stderr.write('diagnostic');process.exitCode=7"]));
    expect(result.stdout).toBe("🙂");
    expect(result.stderr).toBe("diagnostic");
    expect(result.code).toBe(7);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ reason: "exited", stdoutBytes: 4, stderrBytes: 10, cleanup: { pipesClosed: true } });
    expect(JSON.stringify(records)).not.toContain("diagnostic");
    expect(JSON.stringify(records)).not.toContain(process.execPath);
    if (process.platform !== "linux") expect(records[0]).toMatchObject({ peakRssBytes: null, readBytes: null });
  });

  it("caps a single oversized chunk and refuses to return truncated stdout as success", async () => {
    const capture = new BoundedCapture(7);
    capture.push(Buffer.alloc(50_000, 120));
    expect(capture.bytes).toBe(7);
    expect(capture.text()).toBe("xxxxxxx");
    expect(capture.truncated).toBe(true);
    const boundary = new BoundedCapture(65_540);
    boundary.push(Buffer.alloc(65_535, 120));
    for (const byte of Buffer.from("🙂!")) boundary.push(Buffer.from([byte]));
    expect(boundary.text()).toBe("x".repeat(65_535) + "🙂!");
    expect(boundary.truncated).toBe(false);
    const records: ProcessObservation[] = [];
    await expect(withProcessScope({ onObservation: r => records.push(r) }, () =>
      exec(process.execPath, ["-e", "process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)"], { maxStdoutBytes: 64 })))
      .rejects.toThrow(/stdout capture exceeded/);
    expect(records[0].reason).toBe("output-limit");
  });

  it("aborts a running child and refuses a subsequent spawn in the same cancelled scope", async () => {
    const controller = new AbortController();
    const records: ProcessObservation[] = [];
    await withProcessScope({ signal: controller.signal, onObservation: r => records.push(r) }, async () => {
      const result = await runProcess(process.execPath, ["-e", "console.log('ready');setInterval(()=>{},1000)"], {
        onStdout: () => controller.abort(), killGraceMs: 20,
      });
      expect(isProcessControlError(result.error)).toBe(true);
      expect(result.observation.reason).toBe("aborted");
      await expect(exec(process.execPath, ["-e", "throw Error('must not run')"])).rejects.toThrow(/before spawn/);
    });
    expect(records).toHaveLength(1);
  });

  it("reports bounded active snapshots before completion without exposing child text", async () => {
    const active: ProcessObservation[] = [], settled: ProcessObservation[] = [];
    await withProcessScope({ onSample: r => active.push(r), onObservation: r => settled.push(r) }, () =>
      exec(process.execPath, ["-e", "console.log('private payload');setTimeout(()=>{},150)"], { timeoutMs: 3000 }));
    expect(active).toHaveLength(1);
    expect(active[0].reason).toBe("running");
    expect(settled[0].reason).toBe("exited");
    expect(JSON.stringify(active)).not.toContain("private payload");
    expect(active[0]).not.toBe(settled[0]);
  });
});

function running(pid: number): boolean {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0] !== "Z";
  } catch { return false; }
}

describe.skipIf(process.platform !== "linux")("Linux owned process groups", () => {
  it("kills a TERM-resistant child and descendant on timeout, without waiting for inherited pipes forever", async () => {
    let output = "";
    const script = `const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});
      console.log(child.pid);process.on('SIGTERM',()=>{});setInterval(()=>{},1000);`;
    const result = await runProcess(process.execPath, ["-e", script], {
      timeoutMs: 500, killGraceMs: 30, onStdout: chunk => { output += chunk; },
    });
    const descendant = Number(output.trim());
    expect(descendant).toBeGreaterThan(0);
    expect(result.observation.reason).toBe("timeout");
    expect(result.observation.cleanup.killSent).toBe(true);
    expect(running(descendant)).toBe(false);
    expect(result.observation.durationMs).toBeLessThan(3000);
  });

  it("cleans a descendant after normal root exit and records only sampled owned-tree metrics", async () => {
    let output = "";
    const script = `const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{stdio:'inherit'});
      console.log(child.pid);setTimeout(()=>process.exit(0),100);`;
    const result = await runProcess(process.execPath, ["-e", script], { killGraceMs: 30, onStdout: c => { output += c; } });
    expect(result.code).toBe(0);
    expect(result.observation.reason).toBe("exited");
    expect(result.observation.cleanup.termSent).toBe(true);
    expect(running(Number(output.trim()))).toBe(false);
    expect(result.observation.samples).toBeGreaterThan(0);
    expect(result.observation.peakRssBytes).toBeGreaterThan(0);
    expect(result.observation.gaps).toContain("sampling-may-miss-short-lived-processes");
    expect(result.observation.gaps).toContain("sampled-io-counters-may-include-reaped-children");
  });

  it("enforces an explicitly selected sampled RSS limit", async () => {
    const result = await withProcessScope({ maxRssBytes: 1 }, () =>
      runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], { timeoutMs: 3000, killGraceMs: 20 }));
    expect(result.observation.reason).toBe("resource-limit");
    expect(isProcessControlError(result.error)).toBe(true);
  });
});
