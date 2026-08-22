import { beforeEach, describe, expect, it, vi } from "vitest";
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
        ? { code: 0, stdout: "0.83.0\n", stderr: "" }
        : { code: 0, stdout: "77\n", stderr: "" }),
  };
});

import { piAdapter } from "../src/pi.js";

const FIXTURES = join(__dirname, "fixtures", "pi-json");
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
    streams.push(readFileSync(join(FIXTURES, "single-turn.jsonl"), "utf8"));
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["Remember the number 77, then say it."], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toEqual(expect.arrayContaining(["--mode", "json", "--no-session", "--skill"]));
    expect(result.traces).toHaveLength(1);
    expect(result.events).toBeDefined();
  });

  it("uses one session dir and -c on every turn after the first", async () => {
    streams.push(
      readFileSync(join(FIXTURES, "multi-turn-turn1.jsonl"), "utf8"),
      readFileSync(join(FIXTURES, "multi-turn-turn2.jsonl"), "utf8"),
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
    streams.push(readFileSync(join(FIXTURES, "multi-turn-turn2.jsonl"), "utf8"));
    const req = {
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green" as const,
      turns: ["what number?"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    };
    const structured = await piAdapter.runStructured!(req);
    const plain = await piAdapter.run(req);
    expect(structured.transcript).toBe(plain);
  });

  it("marks a terminal stream with malformed JSON as unsafe objective evidence", async () => {
    streams.push('not-json\n{"type":"turn_end"}\n');
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["hi"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(result.traces[0].capture_errors?.[0]).toMatch(/malformed line/);
  });

  it("throws when the stream has no terminal event rather than returning empty evidence", async () => {
    streams.push('{"type":"session","cwd":"/tmp"}\n');
    await expect(piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "green",
      turns: ["hi"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    })).rejects.toThrow(/no terminal events/);
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
      readFileSync(join(FIXTURES, "multi-turn-turn1.jsonl"), "utf8"),
      `${providerFailureLine}\n${readFileSync(join(FIXTURES, "multi-turn-turn2.jsonl"), "utf8")}`,
    );
    const result = await piAdapter.runStructured!({
      skillDir: skill(), model: { provider: "fireworks", model: "x" }, mode: "force",
      turns: ["remember 77", "what number?"], cwd: "/tmp", scenarioId: "A1", rep: 0,
    });
    expect(result.providerFailure).toContain("openai-codex");
    expect(result.providerFailure).toContain("WebSocket error");
  });
});
