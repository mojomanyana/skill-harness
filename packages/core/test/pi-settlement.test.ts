import { describe, it, expect } from "vitest";
import { parseTrace } from "../src/execution-trace.js";
import { evaluateTraceGates } from "../src/trace-gates.js";

const meta = { piVersion: "1.0.4", subject: { provider: "fixture", model: "scripted" },
  scenarioId: "settlement", mode: "force" as const, rep: 0, turn: 0 };
const message = (text: string, stopReason = "stop") => ({ type: "message_end",
  message: { role: "assistant", content: [{ type: "text", text }], stopReason } });
const settled = { type: "agent_settled" };
const parse = (...events: unknown[]) => parseTrace(events.map((event) => JSON.stringify(event)), meta);
const start = (id: string) => ({ type: "tool_execution_start", toolCallId: id, toolName: "delegate_all",
  args: { tasks: [{ agent: "build", task: "one" }, { agent: "build", task: "two" }] } });
const end = (id: string) => ({ type: "tool_execution_end", toolCallId: id, isError: false, result: {} });

describe("Pi 1.0.4 settlement and malformed-evidence regressions", () => {
  it("requires settlement even after a final-looking message", () => {
    const before = parse(message("answer"));
    expect(before.isComplete).toBe(false);
    expect(before.trace.final_status).toBe("incomplete");
    const after = parse(message("answer"), settled);
    expect(after.isComplete).toBe(true);
    expect(after.trace.final_status).toBe("complete");
    expect(after.trace.capture_errors).toBeUndefined();
  });
  it.each(["error", "aborted", "length", "toolUse"])("never promotes a prior answer after %s", (reason) => {
    const result = parse(message("stale success"), message("latest partial", reason), settled);
    expect(result.trace.final_text).toBe("latest partial");
    expect(result.trace.final_status).not.toBe("complete");
    expect(result.trace.capture_errors?.length).toBeGreaterThan(0);
  });
  it("preserves full visible whitespace in the current final", () => {
    expect(parse(message("  answer\n\n"), settled).trace.final_text).toBe("  answer\n\n");
  });
  it("does not preserve old text when a later final is empty", () => {
    expect(parse(message("stale"), message(""), settled).trace.final_text).toBe("");
  });
  it("does not reuse settlement from a previous agent cycle", () => {
    const result = parse(message("first"), settled, { type: "agent_start" }, message("second"));
    expect(result.isComplete).toBe(false);
    expect(result.trace.final_text).toBe("second");
  });
  it("requires all started calls to finish", () => {
    expect(parse(start("one"), message("done"), settled).isComplete).toBe(false);
  });
  it("refuses duplicate and foreign tool identities as absence evidence", () => {
    for (const events of [[start("one"), start("one"), end("one")],
      [start("one"), end("one"), end("one")], [end("foreign")]]) {
      const { trace } = parse(...events, message("done"), settled);
      expect(trace.capture_errors?.length).toBeGreaterThan(0);
      const gates = evaluateTraceGates({ forbid_calls: [{ tool: "write" }] }, trace);
      expect(gates.assertions.some((entry) => entry.status === "ERROR")).toBe(true);
    }
  });
  it("counts malformed JSON values and messages without throwing", () => {
    const result = parse(null, 1, [], { type: "message_end", message: { role: "assistant", content: {} } }, message("done"), settled);
    expect(result.malformedLines).toBe(3);
    expect(result.trace.capture_errors?.length).toBeGreaterThan(0);
  });
  it("keeps tool concurrency distinct from the number of requested children", () => {
    const { trace } = parse(start("fanout"), end("fanout"), message("done"), settled);
    expect(trace.metrics?.max_concurrency).toBe(1);
    expect(trace.metrics?.delegated_children).toBe(0); // legacy Agent-only argument counter
  });
});
