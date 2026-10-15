import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { lines, parseTrace, piQualificationFailure } from "@skill-harness/core";

const root = new URL("./fixtures/pi-1.1.0/", import.meta.url);
const provenance = JSON.parse(readFileSync(new URL("provenance.json", root), "utf8"));
const meta = { piVersion: "1.1.0", subject: { provider: "fixture", model: "mcp-fixture" },
  scenarioId: "transport-only", mode: "red" as const, rep: 0, turn: 0 };

test("actual isolated Pi 1.1.0 capture preserves successful tool settlement and exact final delivery", () => {
  const bytes = readFileSync(new URL("success.jsonl", root));
  expect(provenance.producer).toBe("@earendil-works/pi-coding-agent@1.1.0");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(provenance.sha256);
  const { trace, isComplete } = parseTrace(lines(bytes.toString("utf8")), meta);
  expect(isComplete).toBe(true);
  expect(trace.final_status).toBe("complete");
  expect(trace.capture_errors).toBeUndefined();
  expect(trace.tool_calls).toHaveLength(1);
  expect(trace.tool_calls[0]).toMatchObject({ name: "mcp__probe__echo", isError: false });
  expect(trace.final_text).toBe("Acorn Cache 2.0 supports offline reads. Source: release.txt:1.");
  const withoutSettlement = [...lines(bytes.toString("utf8"))].filter(line => JSON.parse(line).type !== "agent_settled");
  expect(parseTrace(withoutSettlement, meta).isComplete).toBe(false);
});

test("retained current-harness transport qualifications cover both explicit releases with no real model calls", () => {
  for (const run of provenance.runs) {
    const bytes = readFileSync(new URL(run.file, root));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(run.sha256);
    const report = JSON.parse(bytes.toString("utf8"));
    expect(piQualificationFailure(report.pi)).toBeNull();
    expect(report.status).toBe("passed");
    expect(report.runs.map((item: { mode: string }) => item.mode)).toEqual(["red", "green", "force"]);
    expect(report.harnessConfiguredMcpCalls).toBe(0);
    expect(report.providerCalls).toBe(0);
    expect(report.modelQualityEvaluated).toBe(false);
  }
  const script = readFileSync(new URL(provenance.captureScript.file, root));
  expect(createHash("sha256").update(script).digest("hex")).toBe(provenance.captureScript.sha256);
});
