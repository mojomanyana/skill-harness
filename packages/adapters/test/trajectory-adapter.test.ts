import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  normalizePrincipalAssuranceLedger,
  normalizePiTraces,
  collectTrajectorySources,
} from "../src/trajectory.js";
import { parseTrace } from "@skill-harness/core";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "governance");
const PI_FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures", "pi-json");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const canonical = (value: unknown): string => value === null || typeof value === "string" || typeof value === "boolean"
  ? JSON.stringify(value)
  : typeof value === "number"
    ? JSON.stringify(value)
    : Array.isArray(value)
      ? `[${value.map(canonical).join(",")}]`
      : `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
function rehash(rows: Record<string, unknown>[]): string {
  let previous: string | null = null;
  for (const [index, row] of rows.entries()) {
    row.seq = index + 1;
    row.prev_digest = previous;
    delete row.event_digest;
    row.event_digest = createHash("sha256").update(canonical(row)).digest("hex");
    previous = row.event_digest as string;
  }
  return rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
}

describe("principal assurance v1 normalization", () => {
  it("preserves native event names, sequence, head/tree distinction, and Build completion", () => {
    const events = normalizePrincipalAssuranceLedger(fixture("principal-assurance-v1.jsonl"));
    expect(events.map((event) => event.type)).toEqual([
      "run_initialized", "task_packet_recorded", "phase_completed", "evidence_recorded", "finalization_completed",
    ]);
    expect(events[1]).toMatchObject({ run_id: "run-1", task_id: "task-1", workspace_id: "ws-1", digests: { plan: "b".repeat(64), definition: "c".repeat(64) } });
    expect(events[2]).toMatchObject({ phase: "build", task_id: "task-1" });
    expect(events[3].digests).toEqual({ head: "1".repeat(40), tree: "2".repeat(40) });
    expect(events[3].exit_code).toBe(0);
  });

  it("fails clearly on an unsupported schema instead of half-reading it", () => {
    expect(() => normalizePrincipalAssuranceLedger('{"schema_version":"2.0","seq":1,"type":"run_initialized"}\n')).toThrow(/unsupported principal assurance schema version/);
  });

  it("verifies the immutable sequence and digest chain before normalization", () => {
    const rows = fixture("principal-assurance-v1.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    rows[2].phase = "review";
    expect(() => normalizePrincipalAssuranceLedger(rows.map((row) => JSON.stringify(row)).join("\n"))).toThrow(/event digest mismatch/);
  });

  it("rejects authenticated sequence whose wall-clock timestamps move backwards", () => {
    const rows = fixture("principal-assurance-v1.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    rows[2].at = "2026-08-19T11:59:59Z";
    expect(() => normalizePrincipalAssuranceLedger(rehash(rows))).toThrow(/timestamp moves backwards/);
  });

  it("enum-validates assurance source and its closed structured scope", () => {
    const rows = fixture("principal-assurance-v1.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    rows[0].assurance = {
      requested: "critical", effective: "critical", source: "policy", reason: "production migration",
      scope: { type: "selectors", selectors: ["packages/core/**"] }, activated_at: "2026-08-19T12:00:00Z",
    };
    expect(normalizePrincipalAssuranceLedger(rehash(rows))[0].attributes?.assurance).toMatchObject({
      source: "policy", scope: { type: "selectors", selectors: ["packages/core/**"] },
    });

    rows[0].assurance.source = "trusted-looking-but-unknown";
    expect(() => normalizePrincipalAssuranceLedger(rehash(rows))).toThrow(/assurance\.source is not a recognized source/);
    rows[0].assurance.source = "policy";
    rows[0].assurance.scope = { type: "entire-run", selectors: ["src/**"] };
    expect(() => normalizePrincipalAssuranceLedger(rehash(rows))).toThrow(/assurance\.scope is not a closed structured scope/);
  });

  it("redacts secret-like native payloads before persisting normalized attributes", () => {
    const rows = fixture("principal-assurance-v1.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    rows[0].request = "use api_key=sk-super-secret-value";
    const events = normalizePrincipalAssuranceLedger(rehash(rows));
    expect(JSON.stringify(events[0].attributes)).not.toContain("sk-super-secret-value");
    expect(JSON.stringify(events[0].attributes)).toContain("REDACTED");
  });

  it("does not promote an arbitrary non-Build definition digest", () => {
    const rows = fixture("principal-assurance-v1.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    rows[1].packet.definition_digests = { "skill:review": "d".repeat(64) };
    const events = normalizePrincipalAssuranceLedger(rehash(rows));
    expect(events[1].digests?.definition).toBeUndefined();
  });
});

describe("native source collection", () => {
  it("loads required globs, tolerates explicitly optional absence, and re-sequences without losing native order", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-events-"));
    mkdirSync(join(cwd, "state", "run-1"), { recursive: true });
    writeFileSync(join(cwd, "state", "run-1", "events.jsonl"), fixture("principal-assurance-v1.jsonl"));
    const result = collectTrajectorySources(cwd, [
      { adapter: "principal-assurance-v1", path: "state/*/events.jsonl", required: true },
      { adapter: "pi-daddy-record-v1", path: "missing.jsonl", required: false },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(result.events.map((event) => event.type)).toContain("finalization_completed");
  });

  it("rejects duplicate/forked principal run streams instead of splicing their chronology", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-events-"));
    mkdirSync(join(cwd, "state", "run-1"), { recursive: true });
    mkdirSync(join(cwd, "state", "run-1-copy"), { recursive: true });
    writeFileSync(join(cwd, "state", "run-1", "events.jsonl"), fixture("principal-assurance-v1.jsonl"));
    writeFileSync(join(cwd, "state", "run-1-copy", "events.jsonl"), fixture("principal-assurance-v1.jsonl"));
    const result = collectTrajectorySources(cwd, [{ adapter: "principal-assurance-v1", path: "state/*/events.jsonl", required: true }]);
    expect(result.errors.join(" ")).toMatch(/equal timestamps|appears in multiple ledger files/);
  });

  it("sanitizes malformed native errors before they can be persisted", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-events-secret-error-"));
    writeFileSync(
      join(cwd, "ledger.jsonl"),
      JSON.stringify({
        v: 1, seq: 1, prev: null, at: "2026-08-20T12:00:00.000Z", kind: "lifecycle", id: "r1",
        body: {}, digest: "0".repeat(64), "password=hunter2": true,
      }) + "\n",
    );
    const result = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-record-v1", path: "ledger.jsonl", required: true }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("hunter2");
    expect(result.errors[0]).toMatch(/REDACTED/i);
  });

  it("reports required missing evidence instead of returning an empty success", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-events-"));
    const result = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-record-v1", path: "missing.jsonl", required: true }]);
    expect(result.events).toEqual([]);
    expect(result.errors[0]).toMatch(/required event source.*missing/);
  });
});

describe("pi trace normalization", () => {
  it("converts native start/end calls without putting pi field names into the evaluator", () => {
    const lines = [...readFileSync(join(PI_FIXTURES, "tool-error.jsonl"), "utf8").trim().split("\n"), JSON.stringify({ type: "agent_settled" })];
    const parsed = parseTrace(lines, {
      piVersion: "1.6.1", subject: { provider: "p", model: "m" }, scenarioId: "A1", mode: "green", rep: 0, turn: 0,
    });
    const events = normalizePiTraces([parsed.trace]);
    expect(events.map((event) => event.type)).toEqual(["tool_started", "tool_completed"]);
    expect(events[0]).toMatchObject({ tool: "read", at: expect.stringMatching(/^2026-/), attributes: { tool_call_id: expect.any(String) } });
    expect(events[1]).toMatchObject({ tool: "read", at: expect.stringMatching(/^2026-/), attributes: { success: false } });
  });
});
