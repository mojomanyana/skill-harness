import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  normalizePiDaddyLedger,
  normalizePrincipalAssuranceLedger,
  normalizePiTraces,
  collectTrajectorySources,
} from "../src/trajectory.js";
import { evaluateTrajectoryGates, parseTrace } from "@skill-harness/core";

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

describe("pi-daddy 0.17 and 0.18 ledger normalization", () => {
  it("recognizes a real v2 workspace_lease before the unversioned 0.17 fallback", () => {
    const leaseLine = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").find((line) => JSON.parse(line).event === "workspace_lease")!;
    expect(() => normalizePiDaddyLedger(`${leaseLine}\n`)).not.toThrow();
    expect(normalizePiDaddyLedger(`${leaseLine}\n`)[0]).toMatchObject({
      source: "pi-daddy-v2", type: "writer_lease_acquired", run_id: "run-18", task_id: "task-18",
      workspace_id: "ws-18", context_id: "ctx-18", phase: "build", child_id: "d0.1",
    });
  });

  it("normalizes all four real v2 variants and retains trusted and correlation identity", () => {
    const events = normalizePiDaddyLedger(fixture("pi-daddy-v2-positive.jsonl"));
    const decision = events.find((event) => event.type === "capability_decision")!;
    expect(decision).toMatchObject({
      source: "pi-daddy-v2", run_id: "run-18", task_id: "task-18",
      context_id: "ctx-18", phase: "build", parent_id: "d0", child_id: "d0.1",
      requested_capabilities: ["tool:read"], effective_capabilities: ["tool:read"],
      digests: {
        task: "a".repeat(64), definition: "b".repeat(64),
        correlation_plan: "1".repeat(64), correlation_task: "3".repeat(64),
        correlation_definition: "2".repeat(64), correlation_base: "4".repeat(40),
        correlation_head: "5".repeat(40), correlation_tree: "6".repeat(40),
      },
      attributes: {
        event_seq: 12, last_change_seq: 10, last_authority_seq: 9,
        correlation: { run_id: "run-18", task_id: "task-18", workspace_id: "ws-18" },
      },
    });
    expect(decision.workspace_id).toBeUndefined();
    expect(decision.digests?.plan).toBeUndefined();
    expect(decision.digests?.head).toBeUndefined();
    expect(decision.digests?.tree).toBeUndefined();
    const starts = events.filter((event) => event.type === "child_started");
    expect(starts).toHaveLength(1);
    expect(starts[0].attributes).toMatchObject({ native_event: "child_lifecycle", state: "starting" });
    expect(events.find((event) => event.type === "approval_used")?.approval).toMatchObject({
      capability: "tool:read", subject: "build", source: "persisted", scope: "always", expires_at: "2026-09-20T12:00:00.000Z",
    });
    expect(events.find((event) => event.type === "approval_used")?.attributes).toMatchObject({
      approval_uses: { max: 5, remaining: 4 },
    });
    expect(events.find((event) => event.type === "writer_lease_acquired")?.attributes).toMatchObject({
      access: "write", outcome: "acquired", recovered: false,
    });
    expect(normalizePiDaddyLedger(fixture("pi-daddy-v2-read-lease.jsonl"))[0]).toMatchObject({
      type: "workspace_read_uncontended", attributes: { access: "read", outcome: "uncontended" },
    });
    expect(events.find((event) => event.type === "child_completed")).toMatchObject({ exit_code: 0, child_id: "d0.1" });
    expect(events.find((event) => event.type === "check_receipt_recorded")).toMatchObject({
      child_id: "check:unit:11111111-1111-4111-8111-111111111111", workspace_id: "ws-18", digests: { tree: "6".repeat(40) },
      attributes: { receipt_id: "d".repeat(64), check_id: "unit", check_receipt_id: "d".repeat(64) },
    });
    expect(evaluateTrajectoryGates({ version: "1.0", require: [{ event: "check_receipt_recorded" }] }, events).status).toBe("PASS");
  });

  it("uses production event order and does not treat authorization as child execution", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    expect(records.map((record) => `${record.event}:${record.state ?? record.outcome ?? "decision"}`)).toEqual([
      "workspace_lease:acquired",
      "capability_decision:decision",
      "child_lifecycle:starting",
      "child_lifecycle:completed",
      "workspace_lease:released",
      "workspace_lease:acquired",
      "workspace_lease:released",
      "check_receipt:decision",
    ]);
    const events = normalizePiDaddyLedger(fixture("pi-daddy-v2-positive.jsonl"));
    expect(events.filter((event) => event.type === "child_started")).toHaveLength(1);
    expect(events.find((event) => event.type === "capability_decision")?.attributes).toMatchObject({ native_event: "capability_decision", blocked: false });
    expect(Date.parse(records[7].ts)).toBeLessThan(Date.parse(records[6].ts));
  });

  it("orders approval use before the capability grant it authorizes", () => {
    const events = normalizePiDaddyLedger(fixture("pi-daddy-v2-positive.jsonl"));
    expect(events.findIndex((event) => event.type === "approval_used"))
      .toBeLessThan(events.findIndex((event) => event.type === "capability_granted"));
  });

  it("accepts a timeout check receipt appended after its matching release outcome", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    records[6].outcome = "timeout";
    records[6].releaseReason = "timeout";
    expect(() => normalizePiDaddyLedger(records.map((record) => JSON.stringify(record)).join("\n"))).not.toThrow();
  });

  it("accepts check receipts whose semantic end time precedes their append-after-release line", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-pi-daddy-v2-"));
    writeFileSync(join(cwd, "ledger.jsonl"), fixture("pi-daddy-v2-positive.jsonl"));
    const collected = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-v1", path: "ledger.jsonl", required: true }]);
    expect(collected.errors).toEqual([]);
    const owner = "check:unit:11111111-1111-4111-8111-111111111111";
    const receipt = collected.events.find((event) => event.type === "check_receipt_recorded")!;
    const release = collected.events.find((event) => event.type === "writer_lease_released" && event.child_id === owner)!;
    expect(receipt.seq).toBeLessThan(release.seq);
    expect(receipt.attributes?.native_seq).toBeGreaterThan(release.attributes?.native_seq as number);
  });

  it("allows append-lock timestamp interleaving across independent children and runs", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    const first = { ...records[2], ts: "2026-08-20T12:00:02.000Z", childId: "d0.1" };
    const second = { ...records[2], ts: "2026-08-20T12:00:01.000Z", childId: "d0.2" };
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`)).not.toThrow();

    const nextRun = JSON.parse(JSON.stringify(first));
    nextRun.ts = "2026-08-20T12:00:01.000Z";
    nextRun.correlation.run_id = "run-19";
    nextRun.correlation.task_id = "task-19";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(first)}\n${JSON.stringify(nextRun)}\n`)).not.toThrow();

    const cwd = mkdtempSync(join(tmpdir(), "sh-pi-daddy-concurrent-"));
    writeFileSync(join(cwd, "ledger.jsonl"), `${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
    expect(collectTrajectorySources(cwd, [{ adapter: "pi-daddy-v1", path: "ledger.jsonl", required: true }]).errors).toEqual([]);
  });

  it("does not let the receipt exception lower the timestamp high-water mark", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    const unrelated = { ...records[5], ts: "2026-08-20T12:00:06.500Z" };
    expect(() => normalizePiDaddyLedger([...records, unrelated].map((record) => JSON.stringify(record)).join("\n"))).toThrow(/timestamp moves backwards.*line 9/i);
  });

  it("does not pair a receipt release with an acquisition before an intervening terminal lease", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).slice(5);
    const acquisition = { ...records[0], ts: "2026-08-20T12:00:00.000Z" };
    const firstRelease = { ...records[1], ts: "2026-08-20T12:00:01.000Z" };
    const staleRelease = { ...records[1], ts: "2026-08-20T12:00:10.000Z" };
    const receipt = { ...records[2], ts: "2026-08-20T12:00:05.000Z" };
    expect(() => normalizePiDaddyLedger([acquisition, firstRelease, staleRelease, receipt].map((record) => JSON.stringify(record)).join("\n"))).toThrow(/timestamp moves backwards.*line 4/i);
  });

  it("requires the receipt timestamp to follow the current matching acquisition", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).slice(5);
    const oldAcquisition = { ...records[0], ts: "2026-08-20T12:00:00.000Z" };
    const oldRelease = { ...records[1], ts: "2026-08-20T12:00:01.000Z" };
    records[2].ts = "2026-08-20T12:00:04.000Z";
    expect(() => normalizePiDaddyLedger([oldAcquisition, oldRelease, ...records].map((record) => JSON.stringify(record)).join("\n"))).toThrow(/timestamp moves backwards.*line 5/i);
  });

  it("rejects unrelated v2 and legacy timestamp inversions", () => {
    const v2 = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").slice(0, 3).map((line) => JSON.parse(line));
    v2[2].ts = "2026-08-20T12:00:00.500Z";
    expect(() => normalizePiDaddyLedger(v2.map((record) => JSON.stringify(record)).join("\n"))).toThrow(/timestamp moves backwards.*line 3/i);

    const legacy = JSON.parse(fixture("pi-daddy-capability-escalation.jsonl"));
    const earlier = { ...legacy, ts: "2026-08-19T11:59:59Z" };
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(legacy)}\n${JSON.stringify(earlier)}\n`)).toThrow(/timestamp moves backwards.*line 2/i);
  });

  it("redacts nested secrets from every assembled v2 attribute object", () => {
    const decision = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "capability_decision")!;
    decision.correlation.assurance_scope = { api_key: "sk-scope-secret" };
    const serialized = JSON.stringify(normalizePiDaddyLedger(`${JSON.stringify(decision)}\n`));
    expect(serialized).not.toContain("sk-scope-secret");
    expect(serialized).toContain("[REDACTED]");

    decision.correlation.run_id = "sk-ABCDEFGHIJKLMNOP";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(decision)}\n`)).toThrow(/correlation.*run_id.*sensitive/i);
    decision.correlation.run_id = "run-18";
    decision.agentType = "sk-ABCDEFGHIJKLMNOP";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(decision)}\n`)).toThrow(/agentType.*sensitive/i);
  });

  it("enforces pi-daddy's pinned correlation whitelist, types, and bounds", () => {
    const [line] = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n");
    const record = JSON.parse(line);
    // Since the pinned closed contract is validated before semantic normalization,
    // an undeclared correlation field and a mistyped one are refused by the schema
    // layer; the field name is still withheld because it is untrusted input.
    record.correlation.task = "TOP SECRET";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)).toThrow(/closed contract violation.*correlation carries undeclared field \[REDACTED field name\]/i);
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)).not.toThrow(/TOP SECRET/);

    delete record.correlation.task;
    record.correlation.event_seq = "12";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)).toThrow(/closed contract violation.*correlation\.event_seq must be a number/i);

    record.correlation.event_seq = 12;
    record.correlation.schema_version = "1.1";
    record.correlation.plan_digest = "opaque-controller-plan-id";
    expect(normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)[0].digests?.correlation_plan).toBe("opaque-controller-plan-id");

    record.correlation.schema_version = "1.0";
    record.correlation.plan_digest = "1".repeat(64);
    record.correlation.run_id = "r".repeat(513);
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)).toThrow(/correlation.*run_id.*512/i);
  });

  it("does not promote non-authoritative correlation workspace identity", () => {
    const lifecycle = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "child_lifecycle")!;
    const [event] = normalizePiDaddyLedger(`${JSON.stringify(lifecycle)}\n`);
    expect(event.workspace_id).toBeUndefined();
    expect(event.attributes).toMatchObject({ correlation: { workspace_id: "ws-18" } });

    // `child_lifecycle` declares no top-level workspaceId, so the closed contract
    // refuses the forged one before any promotion decision is reached.
    lifecycle.workspaceId = "forged-top-level";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(lifecycle)}\n`)).toThrow(/child_lifecycle.*closed contract violation.*carries undeclared field workspaceId/i);
  });

  it("omits optional facts that the ledger did not record", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    const decision = records.find((record) => record.event === "capability_decision")!;
    delete decision.approved;
    delete decision.approvalSource;
    delete decision.approvalSources;
    delete decision.approvalScope;
    delete decision.approvalScopes;
    delete decision.approvalExpiresAt;
    delete decision.approvalUses;
    delete decision.humanDenied;
    const [normalizedDecision] = normalizePiDaddyLedger(`${JSON.stringify(decision)}\n`).filter((event) => event.type === "capability_decision");
    expect(Object.hasOwn(normalizedDecision.attributes!, "approved")).toBe(false);
    expect(Object.hasOwn(normalizedDecision.attributes!, "human_denied")).toBe(false);

    const lifecycle = records.find((record) => record.event === "child_lifecycle" && record.state === "starting")!;
    const [normalizedLifecycle] = normalizePiDaddyLedger(`${JSON.stringify(lifecycle)}\n`);
    for (const field of ["timed_out", "aborted", "truncated"]) expect(Object.hasOwn(normalizedLifecycle.attributes!, field)).toBe(false);
  });

  it("rejects trusted capability-only digests injected into another variant", () => {
    const lifecycle = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "child_lifecycle")!;
    lifecycle.taskDigest = "a".repeat(64);
    lifecycle.definitionDigest = { sha256: "b".repeat(64) };
    // Trusted digests live only on capability_decision, so the closed contract sees
    // both of them as undeclared fields on this variant and names them.
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(lifecycle)}\n`)).toThrow(/child_lifecycle.*closed contract violation.*carries undeclared field taskDigest.*\+1 more contract violation/i);
    delete lifecycle.definitionDigest;
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(lifecycle)}\n`)).toThrow(/child_lifecycle.*carries undeclared field taskDigest/i);
  });

  it("accepts duplicate requested capabilities that pi-daddy resolves into unique result sets", () => {
    const decision = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "capability_decision")!;
    decision.requested.push("tool:read");
    const events = normalizePiDaddyLedger(`${JSON.stringify(decision)}\n`);
    expect(events.filter((event) => event.type === "capability_requested" && event.capability === "tool:read")).toHaveLength(1);
    expect(events.find((event) => event.type === "capability_decision")?.requested_capabilities).toEqual(["tool:read"]);
    expect(evaluateTrajectoryGates({ version: "1.0", require: [{ event: "capability_requested" }] }, events).status).toBe("PASS");
  });

  it("rejects inconsistent approval and capability evidence", () => {
    const decision = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "capability_decision")!;

    const unrequestedApproval = JSON.parse(JSON.stringify(decision));
    unrequestedApproval.approved.push("tool:write");
    unrequestedApproval.approvalSources["tool:write"] = "persisted";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(unrequestedApproval)}\n`)).toThrow(/approved.*requested.*resolved decision/i);

    const overlapping = JSON.parse(JSON.stringify(decision));
    overlapping.denied = ["tool:read"];
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(overlapping)}\n`)).toThrow(/effective.*denied.*clipped.*gatedBlocked.*disjoint/i);

    const invalidSource = JSON.parse(JSON.stringify(decision));
    invalidSource.approvalSources["tool:read"] = "sk-ABCDEFGHIJKLMNOP";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(invalidSource)}\n`)).toThrow(/approvalSources.*prompt.*session.*persisted.*inherited/i);
  });

  it("requires valid structured refusals and coherent lease outcomes", () => {
    const refusalRecords = fixture("pi-daddy-v2-refusal-stale.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    const blocked = JSON.parse(JSON.stringify(refusalRecords.find((record) => record.event === "capability_decision")));
    delete blocked.refusal;
    expect(normalizePiDaddyLedger(`${JSON.stringify(blocked)}\n`).find((event) => event.type === "child_spawn_refused")?.refusal_code).toBeUndefined();

    const chainRefusal = JSON.parse(JSON.stringify(blocked));
    chainRefusal.approved = ["tool:write"];
    chainRefusal.approvalSource = "persisted";
    chainRefusal.approvalSources = { "tool:write": "persisted" };
    chainRefusal.approvalScope = "always";
    chainRefusal.approvalScopes = { "tool:write": "always" };
    chainRefusal.denied = [];
    chainRefusal.gatedBlocked = ["tool:write"];
    const chainEvents = normalizePiDaddyLedger(`${JSON.stringify(chainRefusal)}\n`);
    expect(chainEvents.some((event) => event.type === "approval_used")).toBe(true);
    expect(chainEvents.some((event) => event.type === "capability_refused" && event.capability === "tool:write")).toBe(false);

    // A code outside pi-daddy's pinned enum is refused by the closed contract, which
    // reports the vocabulary it does accept rather than echoing the received value.
    blocked.refusal = { code: "TOTALLY_FAKE", message: "not public" };
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(blocked)}\n`)).toThrow(/refusal\.code must be one of CAPABILITY_ESCALATION, GRANT_ID_MALFORMED/);

    const refusedLease = JSON.parse(JSON.stringify(refusalRecords.find((record) => record.event === "workspace_lease")));
    delete refusedLease.refusal;
    const [normalizedRefusal] = normalizePiDaddyLedger(`${JSON.stringify(refusedLease)}\n`);
    expect(normalizedRefusal.type).toBe("writer_lease_refused");
    expect(normalizedRefusal.refusal_code).toBeUndefined();
  });

  it("redacts free-text diagnostics before persistence", () => {
    const blocked = fixture("pi-daddy-v2-refusal-stale.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "capability_decision")!;
    blocked.reason = "password=hunter2";
    blocked.refusal.message = "provider credential is hunter2";
    const serialized = JSON.stringify(normalizePiDaddyLedger(`${JSON.stringify(blocked)}\n`));
    expect(serialized).not.toContain("hunter2");
    expect(serialized).toContain("REDACTED sha256");
  });

  it("rejects malformed trusted digest and receipt identity", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    const decision = records.find((record) => record.event === "capability_decision")!;
    // Requiredness and type drift inside definitionDigest is contract-level; an
    // empty-but-present name is not expressible in the pinned schema, so the
    // adapter's own semantic check remains the enforcer for that one.
    for (const [definitionDigest, expected] of [
      [{}, /closed contract violation.*definitionDigest\.name is required/i],
      [{ name: "build", source: "/skills/build/SKILL.md" }, /closed contract violation.*definitionDigest\.sha256 is required/i],
      [{ name: "build", source: "/skills/build/SKILL.md", sha256: 42 }, /closed contract violation.*definitionDigest\.sha256 must be a string/i],
      [{ name: "", source: "/skills/build/SKILL.md", sha256: "b".repeat(64) }, /capability_decision.*definitionDigest.*name.*source.*sha256/i],
    ] as const) {
      expect(() => normalizePiDaddyLedger(`${JSON.stringify({ ...decision, definitionDigest })}\n`)).toThrow(expected);
    }

    const receipt = records.find((record) => record.event === "check_receipt")!;
    receipt.receiptId = "not-a-digest";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(receipt)}\n`)).toThrow(/check_receipt.*receiptId must match \^\[a-fA-F0-9\]\{64\}\$/);
    receipt.receiptId = "d".repeat(64);
    // The pinned schema only bounds treeSha as a non-empty string; requiring a git
    // object id is a harness-side check that survives after schema validation.
    receipt.treeSha = "not-a-git-object";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(receipt)}\n`)).toThrow(/check_receipt.*treeSha.*git object/i);
    receipt.treeSha = "";
    expect(() => normalizePiDaddyLedger(`${JSON.stringify(receipt)}\n`)).toThrow(/closed contract violation.*treeSha must not be empty/i);
  });

  it("treats a receipt's top-level treeSha as the measured identity and correlation.tree_sha as a label", () => {
    // pi-daddy's canonical builder emits the two independently, and its contract calls
    // correlation opaque and non-authoritative. Requiring equality both rejected the
    // producer's own receipt and let a controller string vouch for a measured one.
    const receipt = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "check_receipt")!;
    receipt.treeSha = "b".repeat(40);
    receipt.correlation.tree_sha = "6".repeat(40);
    const [event] = normalizePiDaddyLedger(`${JSON.stringify(receipt)}\n`);
    expect(event.type).toBe("check_receipt_recorded");
    expect(event.digests?.tree).toBe("b".repeat(40));
    expect(event.digests?.correlation_tree).toBe("6".repeat(40));
    expect(event.attributes).toMatchObject({ correlation: { tree_sha: "6".repeat(40) } });

    // An assertion over measured tree identity is answered by the receipt, never by
    // the correlation copy.
    expect(evaluateTrajectoryGates(
      { version: "1.0", require: [{ event: "check_receipt_recorded", where: { "digests.tree": { equals: "b".repeat(40) } } }] },
      normalizePiDaddyLedger(`${JSON.stringify(receipt)}\n`),
    ).status).toBe("PASS");
    expect(evaluateTrajectoryGates(
      { version: "1.0", require: [{ event: "check_receipt_recorded", where: { "digests.tree": { equals: "6".repeat(40) } } }] },
      normalizePiDaddyLedger(`${JSON.stringify(receipt)}\n`),
    ).status).toBe("FAIL");
  });

  it("rejects executors outside pi-daddy's public process/herdr union", () => {
    const records = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line));
    for (const nativeEvent of ["capability_decision", "child_lifecycle"]) {
      const record = { ...records.find((candidate) => candidate.event === nativeEvent), executor: "not-an-executor" };
      expect(() => normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)).toThrow(new RegExp(`${nativeEvent}.*executor.*process.*herdr`, "i"));
    }
  });

  it("uses pi-daddy's isolated <delegate> approval subject for tools-form delegation", () => {
    const decision = fixture("pi-daddy-v2-positive.jsonl").trim().split("\n").map((line) => JSON.parse(line)).find((record) => record.event === "capability_decision")!;
    for (const agentType of ["delegate", undefined]) {
      const record = { ...decision, agentType };
      const approval = normalizePiDaddyLedger(`${JSON.stringify(record)}\n`).find((event) => event.type === "approval_used")?.approval;
      expect(approval?.subject).toBe("<delegate>");
    }
  });

  it("retains structured v2 refusals and stale sequence evidence", () => {
    const events = normalizePiDaddyLedger(fixture("pi-daddy-v2-refusal-stale.jsonl"));
    expect(events.find((event) => event.type === "child_spawn_refused")).toMatchObject({
      refusal_code: "CAPABILITY_ESCALATION",
      attributes: { structured_refusal: { code: "CAPABILITY_ESCALATION", details: { capability: "tool:write" } } },
    });
    expect(events.find((event) => event.type === "capability_refused" && event.capability === "tool:write")?.refusal_code).toBe("CAPABILITY_ESCALATION");
    expect(events.some((event) => event.type === "capability_granted")).toBe(false);
    expect(evaluateTrajectoryGates({ version: "1.0", require: [{ event: "capability_granted" }] }, events).status).toBe("FAIL");
    expect(events.find((event) => event.type === "writer_lease_refused")).toMatchObject({
      refusal_code: "WORKSPACE_LEASE_STALE",
      attributes: { event_seq: 8, last_change_seq: 9, structured_refusal: { code: "WORKSPACE_LEASE_STALE" } },
    });
    expect(evaluateTrajectoryGates({ version: "1.0", require: [{ event: "child_spawn_refused" }] }, events).status).toBe("PASS");
  });

  it("fails closed with an actionable error when a v2 event has no workflow join identity", () => {
    expect(() => normalizePiDaddyLedger(fixture("pi-daddy-v2-missing-join.jsonl"))).toThrow(/workspace_lease.*correlation.*run_id.*task_id/i);
    for (const line of fixture("pi-daddy-v2-positive.jsonl").trim().split("\n")) {
      const record = JSON.parse(line) as Record<string, unknown>;
      delete record.correlation;
      expect(() => normalizePiDaddyLedger(`${JSON.stringify(record)}\n`)).toThrow(
        new RegExp(`${String(record.event)}.*correlation\\.run_id.*correlation\\.task_id`, "i"),
      );
    }
  });

  it("rejects a v2-shaped lookalike stamped v3 and the old hypothetical schema", () => {
    // Ledger v3 is now separately supported; this historical fixture remains
    // invalid because it is a v2 lease with no v3 execution identity.
    expect(() => normalizePiDaddyLedger(fixture("pi-daddy-unsupported-version.jsonl"))).toThrow(/invalid pi-daddy v3 workspace_lease.*executionId/i);
    expect(() => normalizePiDaddyLedger('{"schema_version":"1.0","record_type":"child_lifecycle"}\n')).toThrow(/schema_version.*not a public pi-daddy ledger format/i);
  });

  it("never serializes absent v2 values as the literal string undefined", () => {
    for (const name of ["pi-daddy-v2-positive.jsonl", "pi-daddy-v2-refusal-stale.jsonl"]) {
      expect(JSON.stringify(normalizePiDaddyLedger(fixture(name)))).not.toContain('"undefined"');
    }
  });

  it("preserves unversioned 0.17 GrantRecord support and its stable refusal codes", () => {
    const events = normalizePiDaddyLedger(fixture("pi-daddy-capability-escalation.jsonl"));
    const spawn = events.find((event) => event.type === "child_spawn_refused")!;
    expect(spawn).toMatchObject({ parent_id: "d0", child_id: "d0.1", refusal_code: "CAPABILITY_ESCALATION" });
    expect(spawn.requested_capabilities).toEqual(["tool:read", "tool:write"]);
    expect(spawn.effective_capabilities).toEqual(["tool:read"]);
    expect(spawn.digests?.definition).toBe("a".repeat(64));
    expect(spawn.task_id).toBeUndefined();
    expect(spawn.workspace_id).toBeUndefined();
    expect(spawn.approval).toBeUndefined();
    expect(events.some((event) => event.type === "capability_refused" && event.capability === "tool:write")).toBe(true);

    expect(normalizePiDaddyLedger(fixture("pi-daddy-undeclared-tools.jsonl")).find((event) => event.type === "child_spawn_refused")?.refusal_code).toBe("UNDECLARED_CAPABILITIES");
    const gated = normalizePiDaddyLedger(fixture("pi-daddy-gated-unapproved.jsonl"));
    expect(gated.find((event) => event.type === "child_spawn_refused")?.refusal_code).toBe("APPROVAL_NO_UI");
  });
});

describe("native source collection", () => {
  it("loads required globs, tolerates explicitly optional absence, and re-sequences without losing native order", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-events-"));
    mkdirSync(join(cwd, "state", "run-1"), { recursive: true });
    writeFileSync(join(cwd, "state", "run-1", "events.jsonl"), fixture("principal-assurance-v1.jsonl"));
    const result = collectTrajectorySources(cwd, [
      { adapter: "principal-assurance-v1", path: "state/*/events.jsonl", required: true },
      { adapter: "pi-daddy-v1", path: "missing.jsonl", required: false },
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
    writeFileSync(join(cwd, "ledger.jsonl"), '{"ledgerVersion":{"api_key":"hunter2"},"event":"password=hunter2"}\n');
    const result = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-v1", path: "ledger.jsonl", required: true }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).not.toContain("hunter2");
    expect(result.errors[0]).toContain("REDACTED");
  });

  it("reports required missing evidence instead of returning an empty success", () => {
    const cwd = mkdtempSync(join(tmpdir(), "sh-events-"));
    const result = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-v1", path: "missing.jsonl", required: true }]);
    expect(result.events).toEqual([]);
    expect(result.errors[0]).toMatch(/required event source.*missing/);
  });
});

describe("pi trace normalization", () => {
  it("converts native start/end calls without putting pi field names into the evaluator", () => {
    const lines = readFileSync(join(PI_FIXTURES, "tool-error.jsonl"), "utf8").trim().split("\n");
    const parsed = parseTrace(lines, {
      piVersion: "0.83.0", subject: { provider: "p", model: "m" }, scenarioId: "A1", mode: "green", rep: 0, turn: 0,
    });
    const events = normalizePiTraces([parsed.trace]);
    expect(events.map((event) => event.type)).toEqual(["tool_started", "tool_completed"]);
    expect(events[0]).toMatchObject({ tool: "read", at: expect.stringMatching(/^2026-/), attributes: { tool_call_id: expect.any(String) } });
    expect(events[1]).toMatchObject({ tool: "read", at: expect.stringMatching(/^2026-/), attributes: { success: false } });
  });
});
