import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

/**
 * `runPiJson` itself — the spawn, the streaming reader, and above all its FAILURE
 * paths. `pi-structured.test.ts` covers the happy path through `runStructured`
 * (argv, session flags, transcript parity); what it cannot reach is what happens
 * when pi hangs, cannot be spawned, floods stderr, or exits non-zero, because
 * `runStructured` hardcodes a multi-minute timeout and a real `pi` never
 * misbehaves on demand.
 *
 * These are the paths where a mistake is silent rather than loud: a hang that
 * looks like a slow model, a spawn failure that looks like an empty answer. Each
 * one below is a bug this module either had or was written to prevent.
 */

interface Script {
  stdout?: string;
  stderr?: string;
  /** Exit code passed to `close`. Omit together with `hang` to close cleanly on 0. */
  code?: number | null;
  /** Emit `error` instead of ever closing — what a missing binary looks like. */
  error?: Error;
  /** Never close: the child is alive and silent, which is what a hang IS. */
  hang?: boolean;
}

interface FakeChild extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  kill: ReturnType<typeof vi.fn>;
}

const spawnCalls: { command: string; args: string[]; opts: Record<string, unknown> }[] = [];
const children: FakeChild[] = [];
let scripts: Script[] = [];

vi.mock("node:child_process", () => ({
  spawn: vi.fn((command: string, args: string[], opts: Record<string, unknown>) => {
    spawnCalls.push({ command, args, opts });
    const child = new EventEmitter() as FakeChild;
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = vi.fn();
    children.push(child);
    const s = scripts.shift() ?? {};
    queueMicrotask(() => {
      if (s.error) {
        child.emit("error", s.error);
        return;
      }
      if (s.stdout) child.stdout.push(s.stdout);
      if (s.stderr) child.stderr.push(s.stderr);
      child.stdout.push(null);
      child.stderr.push(null);
      if (s.hang) return;
      setImmediate(() => child.emit("close", s.code === undefined ? 0 : s.code));
    });
    return child;
  }),
}));

import { runPiJson, SKIPPED_TYPE_RE } from "../src/pi-json.js";

const META = {
  cwd: "/tmp",
  timeoutMs: 5000,
  piVersion: "0.84.1",
  subject: { provider: "fireworks", model: "x" },
  scenarioId: "A1",
  mode: "green" as const,
  rep: 0,
  turn: 0,
};

const run = (args: string[] = ["-p", "hi"]) => runPiJson({ args, ...META });

/** A minimal stream that parses to a complete trace. */
const TERMINAL = '{"type":"turn_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}],"stopReason":"stop"}}\n';

beforeEach(() => {
  spawnCalls.length = 0;
  children.length = 0;
  scripts = [];
});

describe("runPiJson", () => {
  it("gives the child no stdin — pi hangs forever waiting on it otherwise", async () => {
    scripts.push({ stdout: TERMINAL });
    await run();
    // Not cosmetic: an inherited stdin makes `pi -p` block indefinitely, and a
    // hang mid-wave is indistinguishable from a slow model until the timeout.
    expect(spawnCalls[0].command).toBe("pi");
    expect(spawnCalls[0].opts.stdio).toEqual(["ignore", "pipe", "pipe"]);
    expect(spawnCalls[0].opts.cwd).toBe("/tmp");
  });

  it("rejects and SIGKILLs the child when pi never terminates", async () => {
    scripts.push({ hang: true, stdout: TERMINAL });
    const p = runPiJson({ args: ["-p", "hi"], ...META, timeoutMs: 25 });
    await expect(p).rejects.toThrow(/timed out after 25ms/);
    // Left running, the child holds a provider connection and a slot in the wave.
    expect(children[0].kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("does not resolve after a timeout has already rejected", async () => {
    scripts.push({ hang: true });
    const p = runPiJson({ args: ["-p", "hi"], ...META, timeoutMs: 20 });
    await expect(p).rejects.toThrow(/timed out/);
    // A late `close` must not settle the promise a second time.
    children[0].stdout.push(TERMINAL);
    children[0].stdout.push(null);
    children[0].emit("close", 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(children[0].kill).toHaveBeenCalledTimes(1);
  });

  it("rejects with the spawn error rather than reporting an empty trace", async () => {
    scripts.push({ error: new Error("spawn pi ENOENT") });
    // An unspawnable pi that resolved to a trace with no tool calls would satisfy
    // a `forbid_calls` gate for want of evidence.
    await expect(run()).rejects.toThrow(/ENOENT/);
  });

  it("reports a non-zero exit with its stderr instead of throwing", async () => {
    scripts.push({ stdout: TERMINAL, stderr: "model refused\n", code: 7 });
    const r = await run();
    // The caller decides: `runStructured` annotates the transcript with the code,
    // and a stream that DID terminate is still evidence worth keeping.
    expect(r.code).toBe(7);
    expect(r.stderr).toContain("model refused");
    expect(r.isComplete).toBe(true);
  });

  it("reports isComplete false for a stream with no terminal event", async () => {
    scripts.push({ stdout: '{"type":"session","cwd":"/tmp"}\n' });
    const r = await run();
    expect(r.isComplete).toBe(false);
  });

  it("counts malformed lines rather than discarding them silently", async () => {
    scripts.push({ stdout: `not-json\n{"type":"nope"\n${TERMINAL}` });
    const r = await run();
    expect(r.malformedLines).toBe(2);
    expect(r.isComplete).toBe(true);
  });

  it("bounds retained stderr so a chatty failure cannot grow without limit", async () => {
    scripts.push({ stdout: TERMINAL, stderr: "x".repeat(50_000) });
    const r = await run();
    expect(r.stderr.length).toBeLessThanOrEqual(8000 + 1024);
  });

  it("drops the quadratic events but keeps a tool call whose ARGS mention them", async () => {
    // The bug this prefilter was rewritten for: matching `"message_update"` as a
    // substring of the whole line also dropped a `tool_execution_start` whose
    // arguments contained that text, so the call never entered the trace and a
    // `forbid_calls` gate on it passed for want of the evidence.
    // The arg VALUE is the bare event name, so the serialized line contains
    // `"message_update"` with real quotes. Escaping matters here: a value of
    // `grep '"message_update"'` serializes to `\"message_update\"` and would
    // defeat the naive filter too, proving nothing.
    const sneaky = JSON.stringify({
      type: "tool_execution_start",
      toolCallId: "call_1",
      toolName: "bash",
      args: { pattern: "message_update", path: "logs/" },
    });
    expect(sneaky).toContain('"message_update"');
    scripts.push({
      stdout:
        '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"a"}}\n' +
        '{"type":"tool_execution_update","toolCallId":"call_1"}\n' +
        `${sneaky}\n${TERMINAL}`,
    });
    const r = await run();
    expect(r.malformedLines).toBe(0);
    expect(r.trace.tool_calls.map((c) => c.name)).toContain("bash");
    // And the regex the reader uses agrees, on the same line.
    expect(SKIPPED_TYPE_RE.test(sneaky)).toBe(false);
  });
});

/** A real pi `--mode json` line naming a provider-side transport failure. */
const PROVIDER_FAILURE_LINE = JSON.stringify({
  type: "message_start",
  message: {
    role: "assistant",
    provider: "openai-codex",
    diagnostics: [
      { type: "provider_transport_failure", error: { name: "Error", message: "WebSocket error" } },
    ],
  },
});

/**
 * A benign diagnostic — present, but not one of `FAILURE_DIAGNOSTICS` — so the
 * "clean stream" test below has something a too-broad match could wrongly
 * latch onto. A stream with no `diagnostics` array at all cannot falsify an
 * over-broad `FAILURE_DIAGNOSTICS` check: there is nothing there to match.
 */
const BENIGN_DIAGNOSTIC_LINE = JSON.stringify({
  type: "message_start",
  message: {
    role: "assistant",
    provider: "openai-codex",
    diagnostics: [{ type: "rate_limit_notice" }],
  },
});

describe("provider failure detection", () => {
  it("sets providerFailure when a line carries a provider_transport_failure diagnostic", async () => {
    scripts.push({ stdout: `${PROVIDER_FAILURE_LINE}\n${TERMINAL}` });
    const r = await run();
    expect(r.providerFailure).toContain("openai-codex");
    expect(r.providerFailure).toContain("WebSocket error");
  });

  it("leaves providerFailure null for a clean stream with a benign diagnostic", async () => {
    scripts.push({ stdout: `${BENIGN_DIAGNOSTIC_LINE}\n${TERMINAL}` });
    const r = await run();
    expect(r.providerFailure).toBeNull();
  });
});
