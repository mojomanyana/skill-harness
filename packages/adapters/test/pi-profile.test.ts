import { expect, test, vi } from "vitest";
vi.mock("../src/pi-json.js", () => ({ runPiJson: vi.fn() }));
import { runPiJson } from "../src/pi-json.js";
import { piAdapter } from "../src/pi.js";
import { parseTrace } from "@skill-harness/core";

test("structured judge passes effort explicitly and reports observed metadata on errors", async () => {
  vi.spyOn(piAdapter, "version").mockResolvedValue("1.5.0");
  const model = { provider: "local", model: "judge", thinking: "high" as const };
  const trace = parseTrace([JSON.stringify({ type: "message_end", message: { role: "assistant", provider: "local", model: "resolved", content: [{ type: "text", text: "answer" }], stopReason: "error", usage: { input: 2, output: 0 } } }), '{"type":"agent_settled"}'],
    { piVersion: "1.5.0", subject: model, scenarioId: "j", mode: "red", rep: 0, turn: 0 }).trace;
  vi.mocked(runPiJson).mockResolvedValue({ trace, isComplete: true, malformedLines: 0, code: 1, stderr: "fixture failure", providerFailure: null });
  const result = await piAdapter.judgeStructured!({ model, prompt: "p", cwd: "/tmp" });
  expect(vi.mocked(runPiJson).mock.calls[0][0].args).toEqual(expect.arrayContaining(["--thinking", "high", "--mode", "json", "--no-mcp", "--no-tools"]));
  expect(result.raw).toMatch(/^\[judge error:/);
  expect(result.observation).toMatchObject({ requested: model, effectiveThinking: null, status: "error", usage: { inputTokens: 2, outputTokens: 0 } });
  vi.restoreAllMocks();
});

test.each([["1.5.3", 1], ["1.6.0", 0]])("structured judge on Pi %s makes %i Pi call(s)", async (version, calls) => {
  vi.spyOn(piAdapter, "version").mockResolvedValue(version);
  vi.mocked(runPiJson).mockReset();
  const trace = parseTrace([JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "verdict" }], stopReason: "stop" } }), '{"type":"agent_settled"}'],
    { piVersion: version, subject: { provider: "local", model: "judge" }, scenarioId: "j", mode: "red", rep: 0, turn: 0 }).trace;
  vi.mocked(runPiJson).mockResolvedValue({ trace, isComplete: true, malformedLines: 0, code: 0, stderr: "", providerFailure: null });
  const result = await piAdapter.judgeStructured!({ model: { provider: "local", model: "judge" }, prompt: "p", cwd: "/tmp" });
  expect(vi.mocked(runPiJson)).toHaveBeenCalledTimes(calls);
  expect(result.raw).toBe(calls ? "verdict" : `[judge error: Pi 1.6.0 is unqualified; execution requires qualified Pi 1.0.4 or 1.1.0 or 1.4.0 or 1.5.0 or 1.5.2, or a later patch of the newest listed release in its minor]`);
  vi.restoreAllMocks();
});
