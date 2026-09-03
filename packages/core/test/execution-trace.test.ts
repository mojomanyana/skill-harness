import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseTrace, lines, serializeTrace, deserializeTrace, traceSha256 } from "../src/execution-trace.js";

/**
 * Parser tests run against the REAL pi captures in the adapters package, not
 * hand-written JSON. A hand-written fixture tests the parser against the shape
 * its author believed pi emits, which is exactly the assumption Phase 0 found
 * wrong four times.
 */
const FIXTURES = join(
  fileURLToPath(new URL("../../adapters/test/fixtures/pi-json/", import.meta.url)),
);

const META = {
  piVersion: "0.83.0",
  subject: { provider: "fireworks", model: "gpt-oss-20b" },
  scenarioId: "A1",
  mode: "green" as const,
  rep: 0,
  turn: 0,
};

function fixture(name: string) {
  return parseTrace(lines(readFileSync(join(FIXTURES, name), "utf8")), META);
}

describe("parseTrace — transcript", () => {
  it("matches print-mode stdout exactly", () => {
    const printed = readFileSync(join(FIXTURES, "parity-print-mode.txt"), "utf8");
    expect(fixture("single-turn.jsonl").trace.final_text.trim()).toBe(printed.trim());
  });

  it("never carries thinking, though every fixture contains it", () => {
    const raw = readFileSync(join(FIXTURES, "single-turn.jsonl"), "utf8");
    expect(raw).toContain('"thinking"'); // the fixture really does have it
    const { trace } = fixture("single-turn.jsonl");
    expect(JSON.stringify(trace)).not.toContain("thinking");
  });

  it("takes the final assistant message, not interim narration", () => {
    const { trace } = fixture("parallel-out-of-order.jsonl");
    expect(trace.final_text).toContain("SLOW");
    // The tool-calling message's own text block must not be prepended.
    expect(trace.final_text.startsWith("\n")).toBe(false);
  });

  it("recovers the answer from a multi-turn second invocation", () => {
    expect(fixture("multi-turn-turn2.jsonl").trace.final_text).toContain("77");
  });
});

describe("parseTrace — tool calls", () => {
  it("records a single call with its arguments", () => {
    const { trace } = fixture("tool-call.jsonl");
    expect(trace.tool_calls).toHaveLength(1);
    expect(trace.tool_calls[0]).toMatchObject({ name: "read", isError: false, args: { path: "note.txt" } });
  });

  it("keeps result metadata but never the body", () => {
    const { trace } = fixture("tool-call.jsonl");
    const [call] = trace.tool_calls;
    expect(call.result.bytes).toBeGreaterThan(0);
    expect(call.result.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Scoped to the tool-call record on purpose. The file's contents DO appear in
    // `final_text` here — the model quoted them in its answer, and that is the
    // assistant's own words, which print mode carries too. What must never
    // appear is the tool RESULT body, which is a channel the model never chose.
    expect(JSON.stringify(trace.tool_calls)).not.toContain("alpha-token-42");
  });

  it("flags a failing call and drops the path-leaking error body", () => {
    const { trace } = fixture("tool-error.jsonl");
    expect(trace.tool_calls[0].isError).toBe(true);
    expect(JSON.stringify(trace)).not.toContain("ENOENT");
    expect(JSON.stringify(trace)).not.toContain("/WORKSPACE");
  });

  it("separates issue order from completion order under parallelism", () => {
    const { trace } = fixture("parallel-out-of-order.jsonl");
    expect(trace.tool_calls).toHaveLength(3);
    const cmd = (i: number) => String((trace.tool_calls[i].args as { command?: string }).command);
    // Issue order: SLOW, FAST, MID.
    expect(trace.tool_calls.map((_, i) => cmd(i))).toEqual([
      "sleep 6; echo SLOW",
      "sleep 1; echo FAST",
      "sleep 3; echo MID",
    ]);
    expect(trace.tool_calls.map((c) => c.issueIndex)).toEqual([0, 1, 2]);
    // Completion order: FAST(0), MID(1), SLOW(2) — deliberately not issue order.
    expect(trace.tool_calls.map((c) => c.completionIndex)).toEqual([2, 0, 1]);
  });

  it("preserves a subagent call's arguments and structured details", () => {
    const { trace } = fixture("subagent-call.jsonl");
    const agent = trace.tool_calls.find((c) => c.name === "Agent")!;
    expect(agent.args).toMatchObject({ agent: "plan" });
    expect(String((agent.args as { task: string }).task)).toContain("authentication");
    expect(agent.result.details).toMatchObject({ agent: "plan", fake: true });
  });

  it("handles a model that serializes calls instead of batching", () => {
    const { trace } = fixture("sequential-tool-calls.jsonl");
    expect(trace.tool_calls).toHaveLength(3);
    // Every call completed, each in its own round trip.
    expect(trace.tool_calls.every((c) => c.completionIndex >= 0)).toBe(true);
  });
});

describe("parseTrace — cost and latency inputs", () => {
  it("records subject input/output/cache tokens and cost when pi reports them", () => {
    const { trace } = fixture("tool-error.jsonl");
    expect(trace.metrics).toMatchObject({
      input_tokens: 1356,
      output_tokens: 73,
      cache_read_tokens: 1218,
      cache_write_tokens: 0,
      tool_calls: 1,
      max_concurrency: 1,
    });
    expect(trace.metrics?.cost_usd).toBeCloseTo(0.00015945, 8);
    expect(trace.metrics?.cost_source).toBe("provider-reported");
  });

  it("labels subscription zero-cost usage and warns only through its recorded source", () => {
    const raw = Array.from(lines(readFileSync(join(FIXTURES, "tool-error.jsonl"), "utf8")), (line) => {
      const event = JSON.parse(line);
      if (event.type === "message_end" && event.message?.usage) delete event.message.usage.cost;
      return JSON.stringify(event);
    });
    const parsed = parseTrace(raw, { ...META, subject: { provider: "openai-codex", model: "gpt-5.6-terra" } });
    expect(parsed.trace.metrics).toMatchObject({ input_tokens: 1356, cost_usd: 0, cost_source: "subscription" });
  });

  it("records delegated child count and maximum observed tool concurrency", () => {
    expect(fixture("subagent-call.jsonl").trace.metrics?.delegated_children).toBe(1);
    expect(fixture("parallel-out-of-order.jsonl").trace.metrics?.max_concurrency).toBe(3);
    expect(fixture("parallel-out-of-order.jsonl").trace.metrics?.tool_calls).toBe(3);
  });

  it("leaves aggregate metrics unavailable when pi reports no usage instead of fabricating zero tokens/cost", () => {
    const parsed = parseTrace([
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" } }),
    ], META);
    expect(parsed.isComplete).toBe(true);
    expect(parsed.trace.metrics).toBeUndefined();
    expect(parsed.trace.cost_usd).toBeNull();
  });
});

describe("parseTrace — robustness", () => {
  it("exposes saved JSONL as a portable iterable without runtime iterator helpers", () => {
    expect(Array.from(lines("first\nsecond\n"))).toEqual(["first", "second"]);
  });

  it("skips streaming updates rather than treating them as messages", () => {
    const raw = readFileSync(join(FIXTURES, "single-turn.jsonl"), "utf8");
    expect(raw).toContain('"message_update"');
    // If updates were read, the accumulated partials would repeat the answer.
    expect(fixture("single-turn.jsonl").trace.final_text).toBe("pong");
  });

  it("counts malformed lines without discarding the trace", () => {
    const raw = readFileSync(join(FIXTURES, "tool-call.jsonl"), "utf8");
    const corrupted = `${raw}{"type":"message_end", TRUNCATED`;
    const res = parseTrace(lines(corrupted), META);
    expect(res.malformedLines).toBe(1);
    expect(res.isComplete).toBe(true);
    expect(res.trace.tool_calls).toHaveLength(1);
  });

  it("reports an empty stream as incomplete rather than as a clean run", () => {
    const res = parseTrace(lines(""), META);
    expect(res.isComplete).toBe(false);
    expect(res.trace.final_text).toBe("");
  });

  it("ignores an end event with no matching start", () => {
    const orphan = JSON.stringify({ type: "tool_execution_end", toolCallId: "nope", toolName: "read", result: {}, isError: true });
    const res = parseTrace(lines(orphan), META);
    expect(res.trace.tool_calls).toEqual([]);
  });

  it("keeps a call that started and never completed, marked as such", () => {
    const start = JSON.stringify({ type: "tool_execution_start", toolCallId: "x", toolName: "bash", args: { command: "sleep 999" } });
    const res = parseTrace(lines(start), META);
    expect(res.trace.tool_calls).toHaveLength(1);
    expect(res.trace.tool_calls[0].completionIndex).toBe(-1);
  });

  it("redacts secrets that appear in tool arguments", () => {
    const start = JSON.stringify({
      type: "tool_execution_start",
      toolCallId: "x",
      toolName: "bash",
      args: { command: "curl -H 'Bearer abcdefghijklmnopqrstuvwxyz123456'", api_key: "sekrit" },
    });
    const { trace } = parseTrace(lines(start), META);
    const args = trace.tool_calls[0].args as Record<string, unknown>;
    expect(String(args.command)).toContain("[redacted]");
    expect(args.api_key).toBe("[redacted]");
  });

  it("drops oversized details — a big blob is a result body in disguise", () => {
    const start = JSON.stringify({ type: "tool_execution_start", toolCallId: "x", toolName: "t", args: {} });
    const end = JSON.stringify({
      type: "tool_execution_end",
      toolCallId: "x",
      toolName: "t",
      isError: false,
      result: { content: [], details: { blob: "z".repeat(5000) } },
    });
    const { trace } = parseTrace(lines(`${start}\n${end}`), META);
    expect(trace.tool_calls[0].result.details).toBeUndefined();
  });
});

describe("trace identity", () => {
  it("hashes the same execution identically regardless of key order", () => {
    const { trace } = fixture("tool-call.jsonl");
    const reordered = JSON.parse(JSON.stringify({ tool_calls: trace.tool_calls, ...trace }));
    expect(traceSha256(reordered)).toBe(traceSha256(trace));
  });

  it("changes the hash when evidence changes", () => {
    const a = fixture("tool-call.jsonl").trace;
    const b = { ...a, tool_calls: [] };
    expect(traceSha256(b)).not.toBe(traceSha256(a));
  });

  it("round-trips through serialize/deserialize", () => {
    const { trace } = fixture("tool-call.jsonl");
    const back = deserializeTrace(serializeTrace(trace))!;
    expect(back).toEqual(trace);
  });

  it("refuses a trace from an unknown version rather than half-reading it", () => {
    const { trace } = fixture("tool-call.jsonl");
    const future = JSON.stringify({ ...trace, trace_version: 99 });
    expect(deserializeTrace(future)).toBeNull();
  });

  it("returns null on unreadable text", () => {
    expect(deserializeTrace("not json")).toBeNull();
    expect(deserializeTrace("")).toBeNull();
  });
});

describe("cost", () => {
  it("sums pi's reported per-message cost for disclosure", () => {
    const { trace } = fixture("tool-call.jsonl");
    expect(trace.cost_usd).toBeGreaterThan(0);
    expect(trace.cost_usd).toBeLessThan(0.01);
  });

  it("is null when pi reported none", () => {
    expect(parseTrace(lines(""), META).trace.cost_usd).toBeNull();
  });
});
