import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { evaluateTraceGates, lines, parseTrace, piQualificationFailure } from "@skill-harness/core";

const root = new URL("./fixtures/pi-1.4.0/", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
const json = (file: string) => JSON.parse(read(file));
const provenance = json("provenance.json");
const meta = { piVersion: "1.4.0", subject: { provider: "local", model: "transport" },
  scenarioId: "transport-only", mode: "red" as const, rep: 0, turn: 0 };
const expected = "Acorn Cache 2.0 supports offline reads. Source: release.txt:1.";

test("Pi1.4 native captures and qualification source retain exact producer provenance", () => {
  expect(provenance.producer).toBe("@earendil-works/pi-coding-agent@1.4.0");
  expect(provenance.realProviderCalls).toBe(0);
  expect(provenance.packages).toHaveLength(6);
  for (const pkg of provenance.packages) {
    expect(pkg.version).toBe("1.4.0");
    expect(pkg.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    expect(pkg.integrity).toMatch(/^sha512-/);
  }
  for (const item of [...provenance.files, ...provenance.captureSources]) {
    expect(createHash("sha256").update(readFileSync(new URL(item.file, root))).digest("hex"), item.file).toBe(item.sha256);
  }
  for (const stage of ["native", "adapter"]) {
    const report = json(`${stage}-qualification.json`);
    expect(report.status).toBe("passed");
    expect(report.realProviderCalls).toBe(0);
    expect(report.unchangedSource).toBe(true);
    expect(report.allDirectProcessGroupsGone).toBe(true);
    expect(report.allObservedProcessesGone).toBe(true);
    expect(report.captureSources).toEqual(provenance.captureSources);
    const network = json(`${stage}-network.json`);
    expect(network.length).toBeGreaterThan(0);
    expect(network.every((item: { blocked: number }) => item.blocked === 0)).toBe(true);
  }
});

test("native red, green and force have successful read settlement and exact final delivery", () => {
  for (const mode of ["red", "green", "force"] as const) {
    const result = parseTrace(lines(read(`${mode}-transport.jsonl`)), { ...meta, mode });
    expect(result.isComplete).toBe(true);
    expect(result.trace.final_status).toBe("complete");
    expect(result.trace.capture_errors).toBeUndefined();
    expect(result.trace.final_text).toBe(expected);
    expect(result.trace.tool_calls).toHaveLength(1);
    expect(result.trace.tool_calls[0]).toMatchObject({ name: "read", args: { path: "release.txt" }, isError: false });
    expect(evaluateTraceGates({ require_calls: [{ tool: "read", outcome: "success" }] }, result.trace).status).toBe("PASS");
  }
});

test("native failed and filtered tools remain errors even when a scripted final succeeds", () => {
  for (const [name, tool] of [["tool-error", "read"], ["denied-tool", "write"], ["mcp-denied", "mcp__probe__echo"], ["extension-filtered", "fixture_echo"]]) {
    const { trace, isComplete } = parseTrace(lines(read(`red-${name}.jsonl`)), meta);
    expect(isComplete).toBe(true);
    expect(trace.final_status).toBe("complete");
    expect(trace.tool_calls[0]).toMatchObject({ name: tool, isError: true });
    expect(evaluateTraceGates({ require_calls: [{ tool, outcome: "success" }] }, trace).status).toBe("FAIL");
  }
  const selected = parseTrace(lines(read("red-extension-ok.jsonl")), meta);
  expect(selected.trace.tool_calls[0]).toMatchObject({ name: "fixture_echo", isError: false });
});

test("native error and length finals are unavailable, and synthetic missing-settlement controls cannot pass", () => {
  for (const [name, status] of [["provider-error", "error"], ["length", "truncated"]]) {
    const { trace } = parseTrace(lines(read(`red-${name}.jsonl`)), meta);
    expect(trace.final_status).toBe(status);
    expect(trace.capture_errors?.length).toBeGreaterThan(0);
  }
  const native = [...lines(read("red-transport.jsonl"))];
  const missingSettlement = native.filter(line => JSON.parse(line).type !== "agent_settled");
  const missingCompletion = native.filter(line => JSON.parse(line).type !== "tool_execution_end");
  for (const mutated of [missingSettlement, missingCompletion]) {
    const result = parseTrace(mutated, meta);
    expect(result.isComplete).toBe(false);
    expect(result.trace.final_status).toBe("incomplete");
    expect(evaluateTraceGates({ forbid_calls: [{ tool: "write" }] }, result.trace).status).toBe("ERROR");
  }
});

test("supported adapter resumes exact turns and synthetic scoring respects objective and judge failures", () => {
  const resumed = json("adapter-multi-turn.result.json");
  expect(resumed.executionFailure).toBeUndefined();
  expect(resumed.traces.map((trace: { final_text: string }) => trace.final_text)).toEqual([expected, "SECOND_TURN_RECEIPT"]);
  expect(resumed.traces.every((trace: { final_status: string }) => trace.final_status === "complete")).toBe(true);
  const [clean, mixed] = json("adapter-pipeline.json");
  expect(clean).toMatchObject({ exitCode: 0, fixtureShip: true, scriptedJudgeRequests: 1, verdicts: { good: "PASS" } });
  expect(mixed).toMatchObject({ exitCode: 1, fixtureShip: false, scriptedJudgeRequests: 2, verdicts: { good: "PASS", "judge-fail": "FAIL", "gate-fail": "FAIL" } });
  expect(piQualificationFailure("1.4.0")).toBeNull();
  for (const version of ["1.4.0-rc.1", "1.4.1", "1.5.0", "9.9.9", null]) expect(piQualificationFailure(version)).not.toBeNull();
});
