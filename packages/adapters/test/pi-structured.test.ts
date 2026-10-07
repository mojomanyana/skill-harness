import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_FAILURE_MARKER, providerFailureFromTranscript } from "@skill-harness/core";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const spawnCalls: string[][] = [];
let streams: string[] = [];

vi.mock("node:child_process", () => ({
  spawn: vi.fn((_command: string, args: string[]) => {
    spawnCalls.push(args);
    const child = new EventEmitter() as EventEmitter & { stdout: Readable; stderr: Readable; kill: ReturnType<typeof vi.fn> };
    child.stdout = new Readable({ read() {} });
    child.stderr = new Readable({ read() {} });
    child.kill = vi.fn();
    const text = streams.shift() ?? "";
    queueMicrotask(() => {
      child.stdout.push(text);
      child.stdout.push(null);
      child.stderr.push(null);
      setImmediate(() => child.emit("close", 0));
    });
    return child;
  }),
}));

vi.mock("@skill-harness/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@skill-harness/core")>();
  return {
    ...original,
    onPath: () => true,
    exec: vi.fn(async (_command: string, args: string[]) =>
      args.includes("--version")
        ? { code: 0, stdout: "1.0.4\n", stderr: "" }
        : { code: 0, stdout: "77\n", stderr: "" }),
  };
});

import { piAdapter } from "../src/pi.js";

const FIXTURES = join(__dirname, "fixtures", "pi-json");
// Synthetic settled variants of retained 0.83.0 records exercise adapter plumbing;
// actual 1.0.4 capture qualification lives in pi-1.0.4-contract.test.ts.
function settledFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8") + '{"type":"agent_settled"}\n';
}
function skill(): string {
  const dir = mkdtempSync(join(tmpdir(), "sh-structured-skill-"));
  writeFileSync(join(dir, "SKILL.md"), "---\nname: demo\ndescription: demo\n---\n\n## Demo\n", "utf8");
  return dir;
}

beforeEach(() => {
  spawnCalls.length = 0;
  streams = [];
});

describe("piAdapter.runStructured", () => {
  it("spawns pi --mode json with the same delivery flags and --no-session for one turn", async () => {
    streams.push(settledFixture("single-turn.jsonl"));
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["Remember the number 77, then say it."], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toEqual(expect.arrayContaining(["--mode", "json", "--no-session", "--skill"]));
    expect(result.traces).toHaveLength(1);
  });

  it("uses one session dir and -c on every turn after the first", async () => {
    streams.push(
      settledFixture("multi-turn-turn1.jsonl"),
      settledFixture("multi-turn-turn2.jsonl"),
    );
    await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "force",
      turns: ["remember 77", "what number?"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(spawnCalls).toHaveLength(2);
    expect(spawnCalls[0]).toContain("--session-dir");
    expect(spawnCalls[0]).not.toContain("-c");
    expect(spawnCalls[1]).toContain("-c");
    expect(spawnCalls[1][spawnCalls[1].indexOf("--session-dir") + 1]).toBe(spawnCalls[0][spawnCalls[0].indexOf("--session-dir") + 1]);
  });

  it("reconstructs a byte-identical transcript to run() for the same final assistant text", async () => {
    streams.push(settledFixture("multi-turn-turn2.jsonl"));
    const req = {
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green" as const,
      turns: ["what number?"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    };
    const structured = await piAdapter.runStructured!(req);
    const plain = await piAdapter.run(req);
    expect(structured.traces[0].final_text).toBe("77");
    expect(structured.transcript).toBe(plain);
  });

  it("marks a terminal stream with malformed JSON as unsafe objective evidence", async () => {
    streams.push('not-json\n{"type":"turn_end"}\n');
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["hi"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(result.traces[0].capture_errors?.filter((entry) => /malformed line/.test(entry))).toHaveLength(1);
  });

  it("records no terminal event as unavailable execution rather than usable evidence", async () => {
    streams.push('{"type":"session","cwd":"/tmp"}\n');
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["hi"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(result.executionFailure).toContain("incomplete");
  });

  it("collects a provider failure that occurs on a turn other than the first", async () => {
    // A real pi `--mode json` line naming a provider-side transport failure,
    // planted on the SECOND turn's stream — turn 1 is an ordinary clean run.
    const providerFailureLine = JSON.stringify({
      type: "message_start",
      message: {
        role: "assistant",
        provider: "openai-codex",
        diagnostics: [
          { type: "provider_transport_failure", error: { name: "Error", message: "WebSocket error" } },
        ],
      },
    });
    streams.push(
      settledFixture("multi-turn-turn1.jsonl"),
      `${providerFailureLine}\n${settledFixture("multi-turn-turn2.jsonl").replaceAll('"stopReason":"stop"', '"stopReason":"error"')}`,
    );
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "force",
      turns: ["remember 77", "what number?"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(result.providerFailure).toContain("openai-codex");
    expect(result.providerFailure).toContain("WebSocket error");
  });

  // I2 (adapter half): the artifact on disk is the only thing a later
  // `grade`/`regrade` call ever reads (see `judgeOneRep` in core/regrade.ts).
  // Before this fix, `runStructured` returned `providerFailure` as a field ONLY
  // — never written into the transcript string — so a re-judge of the saved
  // `.txt` had no way to recover the evidence: the marker regrade.ts now looks
  // for simply was not there.
  //
  // Mutation: deleting the `withProviderFailure(...)` wrapper around the returned
  // transcript in pi.ts's runStructured makes this test fail even though
  // `result.providerFailure` itself is still set correctly.
  //
  // The failure here is injected on turn TWO on purpose. Written inline it landed
  // after turn one's assistant section — indistinguishable, to any reader, from
  // text the model produced. `withProviderFailure` hoists it to the preamble, so
  // `providerFailureFromTranscript` can recover it without trusting model output.
  it("writes the provider-failure marker into the transcript, not just the returned field", async () => {
    const providerFailureLine = JSON.stringify({
      type: "message_start",
      message: {
        role: "assistant",
        provider: "openai-codex",
        diagnostics: [
          { type: "provider_transport_failure", error: { name: "Error", message: "WebSocket error" } },
        ],
      },
    });
    streams.push(
      settledFixture("multi-turn-turn1.jsonl"),
      `${providerFailureLine}\n${settledFixture("multi-turn-turn2.jsonl").replaceAll('"stopReason":"stop"', '"stopReason":"error"')}`,
    );
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "force",
      turns: ["remember 77", "what number?"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(result.providerFailure).toBeTruthy();
    expect(result.transcript).toContain(PROVIDER_FAILURE_MARKER);
    expect(result.transcript).toContain("openai-codex");
    expect(result.transcript).toContain("WebSocket error");
    // Recoverable from the saved artifact alone — that is what a later re-grade has.
    expect(providerFailureFromTranscript(result.transcript)).toContain("WebSocket error");
  });
});
