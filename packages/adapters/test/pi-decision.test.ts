import { describe, it, expect } from "vitest";
import { parseDecisionProcess, decisionProcess } from "../src/pi-decision.js";
import { createHash } from "node:crypto";
const model = { provider: "openai-codex", model: "gpt-6.1-sol" };
function result(answer: unknown = { probability: 0.9, abstain: false }) {
  const text = JSON.stringify(answer);
  const events = [
    { type: "agent_start" },
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text }],
        stopReason: "stop",
        provider: model.provider,
        model: model.model,
        usage: { input: 0, output: 4 },
      },
    },
    { type: "agent_settled" },
    {
      type: "decision-receipt",
      piVersion: "1.0.4",
      ...model,
      sessionId: "session-1",
      messageId: "message-1",
      finalSha256: createHash("sha256").update(text).digest("hex"),
      oauth: true,
      subscription: true,
      tools: 0,
      retry: false,
      compaction: false,
    },
  ];
  return {
    events,
    process: {
      stdout: events.map((e) => JSON.stringify(e)).join("\n") + "\n",
      code: 0,
      signal: null,
      failure: null,
    },
  };
}
function change(mutate: (events: any[]) => void) {
  const x = result();
  mutate(x.events);
  x.process.stdout = x.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  return x.process;
}
describe("isolated Pi decision result", () => {
  it("binds observed model/native final and preserves reported zero usage", () => {
    expect(parseDecisionProcess(result().process, model, "case")).toMatchObject(
      {
        status: "answered",
        probability: 0.9,
        resolvedModel: "openai-codex:gpt-6.1-sol",
        nativeFinal: { sessionId: "session-1", messageId: "message-1" },
        usage: { inputTokens: 0, outputTokens: 4, costUsd: null },
        trainingEligible: false,
      },
    );
  });
  it("keeps explicit abstention separate from an answer", () => {
    expect(
      parseDecisionProcess(
        result({ probability: null, abstain: true }).process,
        model,
        "case",
      ).status,
    ).toBe("abstained");
  });
  it.each([
    { probability: 1.1, abstain: false },
    { probability: 0.5, abstain: true },
    { probability: null, abstain: false },
    { probability: 0.5, abstain: false, reason: "secret" },
    null,
  ])("refuses malformed answer %j", (answer) => {
    expect(() =>
      parseDecisionProcess(result(answer).process, model, "case"),
    ).toThrow();
  });
  it.each([
    "piVersion",
    "provider",
    "model",
    "oauth",
    "subscription",
    "tools",
    "retry",
    "compaction",
    "sessionId",
    "messageId",
    "finalSha256",
  ])("rejects bad receipt %s", (key) => {
    expect(() =>
      parseDecisionProcess(
        change((e) => {
          e.at(-1)[key] = null;
        }),
        model,
        "case",
      ),
    ).toThrow();
  });
  it("rejects missing or late settlement, repeated answers, changed models and tools", () => {
    const mutations = [
      (e: any[]) => e.splice(2, 1),
      (e: any[]) => e.splice(3, 0, { type: "message_update" }),
      (e: any[]) => e.splice(2, 0, e[1]),
      (e: any[]) => {
        e[1].message.model = "fallback";
      },
      (e: any[]) => e.splice(2, 0, { type: "decision-forbidden-tool" }),
      (e: any[]) => e.push({ type: "agent_start" }),
    ];
    for (const mutation of mutations)
      expect(() =>
        parseDecisionProcess(change(mutation), model, "case"),
      ).toThrow();
  });
  it("does not bless exit-zero errors, malformed input or valid output from a failed process", () => {
    expect(() =>
      parseDecisionProcess(
        change((e) => {
          e[1].message.stopReason = "error";
        }),
        model,
        "case",
      ),
    ).toThrow();
    expect(() =>
      parseDecisionProcess(
        { ...result().process, stdout: result().process.stdout + "null\n" },
        model,
        "case",
      ),
    ).toThrow();
    expect(() =>
      parseDecisionProcess({ ...result().process, code: 1 }, model, "case"),
    ).toThrow();
  });
  it("rejects invalid token usage", () => {
    expect(() =>
      parseDecisionProcess(
        change((e) => {
          e[1].message.usage.input = -1;
        }),
        model,
        "case",
      ),
    ).toThrow();
  });
});
describe("bounded decision process", () => {
  it("waits for killed-process close on timeout", async () => {
    const r = await decisionProcess(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      process.cwd(),
      50,
    );
    expect(r.failure).toMatch(/timed out/);
    expect(r.signal).toBe("SIGKILL");
  });
  it("kills oversized outputs and sanitizes failed-start errors", async () => {
    const r = await decisionProcess(
      process.execPath,
      [
        "-e",
        "process.stdout.write('x'.repeat(3*1024*1024));setInterval(()=>{},1000)",
      ],
      process.cwd(),
      2000,
    );
    expect(r.failure).toMatch(/exceeded limit/);
    expect(r.stdout.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    const bad = await decisionProcess(
      "/does-not-exist-decision",
      [],
      process.cwd(),
      1000,
    );
    expect(bad.failure).toBe("decision process failed to start");
  });
});
