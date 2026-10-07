import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseTrace, lines } from "@skill-harness/core";

const fixtureRoot = new URL("./fixtures/pi-1.0.4/", import.meta.url);
const meta = { piVersion: "1.0.4", subject: { provider: "p01-scripted", model: "contract-fixture" },
  scenarioId: "SDK", mode: "force" as const, rep: 0, turn: 0 };
function fixture(name: string) {
  const text = readFileSync(new URL(`${name}.jsonl`, fixtureRoot), "utf8");
  return { ...parseTrace(lines(text), meta), events: text.trim().split("\n").map((line) => JSON.parse(line)) };
}

describe("actual model-free Pi 1.0.4 CLI captures", () => {
  it("pins fixture identity and the exact real producer version", () => {
    const provenance = JSON.parse(readFileSync(new URL("provenance.json", fixtureRoot), "utf8"));
    const source = JSON.parse(readFileSync(new URL("vendor-source.json", fixtureRoot), "utf8"));
    expect(source.repository).toBe("https://github.com/mojomanyana/pi-daddy");
    expect(source.commit).toBe("6327d0bca1b580b15921a11e184f0199814831bb");
    expect(source.path).toBe("packages/pi-daddy/test-integration/pi-sdk/fixtures/provenance.json");
    expect(createHash("sha256").update(readFileSync(new URL("provenance.json", fixtureRoot))).digest("hex")).toBe(source.sha256);
    expect(provenance.normalization).toContain("FIXTURE_CWD and PI_PACKAGE");
    expect(provenance.scenarios).toHaveLength(5);
    for (const record of provenance.scenarios) {
      expect(record.producer).toBe("@earendil-works/pi-coding-agent@1.0.4");
      const bytes = readFileSync(new URL(`${record.scenario}.jsonl`, fixtureRoot));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
    }
  });
  it.each(["success", "nested", "retry"])("preserves complete final delivery for %s", (name) => {
    const result = fixture(name);
    expect(result.isComplete).toBe(true);
    expect(result.trace.final_status).toBe("complete");
    expect(result.trace.capture_errors).toBeUndefined();
    const final = result.events.filter((event) => event.type === "message_end" && event.message.role === "assistant").at(-1);
    const exact = final.message.content.filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text).join("");
    expect(result.trace.final_text).toBe(exact);
    expect(result.trace.final_text).not.toBe(result.trace.final_text.trim());
  });
  it.each(["error", "stop-then-error"])("does not upgrade exit-zero %s to success", (name) => {
    const result = fixture(name);
    expect(result.isComplete).toBe(true);
    expect(result.trace.final_status).toBe("error");
    expect(result.trace.capture_errors?.length).toBeGreaterThan(0);
    const assistants = result.events.filter((event) => event.type === "message_end" && event.message.role === "assistant");
    expect(result.trace.final_text).toBe(assistants.at(-1).message.content.filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text).join(""));
  });
  it("retains actual nested error propagation without treating tool concurrency as children", () => {
    const { trace } = fixture("nested");
    expect(trace.tool_calls).toHaveLength(2);
    expect(trace.tool_calls.every((call) => call.isError)).toBe(true);
    expect(trace.metrics?.max_concurrency).toBe(2);
    expect(trace.metrics?.delegated_children).toBe(0);
  });
  it("does not finish at the first agent_end even when willRetry is false", () => {
    const { events } = fixture("stop-then-error");
    const firstEnd = events.findIndex((event) => event.type === "agent_end");
    expect(events[firstEnd].willRetry).toBe(false);
    const prefix = parseTrace(events.slice(0, firstEnd + 1).map((event) => JSON.stringify(event)), meta);
    expect(prefix.isComplete).toBe(false);
    expect(prefix.trace.final_status).toBe("incomplete");
  });
});

interface ConformanceCase {
  id: string;
  input: { fixture?: string; records?: unknown[]; rawSuffix?: string };
  expected: { available: boolean; finalText: string; status: string };
}
const conformance = JSON.parse(readFileSync(new URL("final-conformance.json", fixtureRoot), "utf8")) as {
  version: number; piVersion: string; cases: ConformanceCase[];
};
describe("shared runtime/harness final conformance", () => {
  it("uses the exact qualified version", () => {
    expect(conformance.version).toBe(1);
    expect(conformance.piVersion).toBe(meta.piVersion);
  });
  it.each(conformance.cases)("$id", ({ input, expected }) => {
    const source = input.fixture ? readFileSync(new URL(input.fixture, fixtureRoot), "utf8")
      : input.records!.map((event) => JSON.stringify(event)).join("\n") + "\n" + (input.rawSuffix ?? "");
    const { trace } = parseTrace(lines(source), meta);
    expect(trace.final_status).toBe(expected.status);
    expect(trace.final_status === "complete" && !trace.capture_errors?.length).toBe(expected.available);
    expect(trace.final_text).toBe(expected.finalText);
  });
});
