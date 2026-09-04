import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { collectTrajectorySources, normalizePiDaddyLedger } from "../src/trajectory.js";
import {
  PI_DADDY_LEDGER_V3_CONTRACT_COMMIT,
  PI_DADDY_LEDGER_V3_SCHEMA,
  PI_DADDY_LEDGER_V3_SCHEMA_SHA256,
} from "../src/pi-daddy-ledger-v3.js";
import { assertSupportedSchemaV3, declaredPropertyNames, validateClosedSchemaV3 } from "../src/closed-schema.js";

// Immutable pi-daddy Wave 1 merge head; PINNED.json and consumer notes must agree.
const PRODUCER_COMMIT = "4a9524394ca995fd74ed9bbb836dc4e73cda3b8c";
const PRODUCER_TREE = "7c006bff213142634f0f911ba9bd6add363ecaae";
const REPO = fileURLToPath(new URL("../../..", import.meta.url));
const CONTRACT = join(REPO, "contracts", "pi-daddy", "ledger", "v3");
const bytes = (relative: string) => readFileSync(join(CONTRACT, relative), "utf8");
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const line = (value: unknown) => `${JSON.stringify(value)}\n`;
const names = ["capability-decision", "workspace-lease", "child-lifecycle", "check-receipt", "workflow-fact"] as const;
const fixture = (name: typeof names[number]) => JSON.parse(bytes(`fixtures/${name}.json`)) as Record<string, any>;
const pinned = JSON.parse(bytes("PINNED.json")) as { repository: string; commit: string; tree: string; version: string; ledger_version: number; schema_sha256: string; artifacts: Record<string, { source: string; sha256: string; generated_by: string }> };

describe("pinned pi-daddy ledger v3 contract", () => {
  it("pins exact production source and byte-exact real-builder artifacts", () => {
    expect(pinned).toMatchObject({ repository: "mojomanyana/pi-daddy", commit: PRODUCER_COMMIT, tree: PRODUCER_TREE, version: "0.21.1", ledger_version: 3 });
    expect(PI_DADDY_LEDGER_V3_CONTRACT_COMMIT).toBe(PRODUCER_COMMIT);
    expect(PI_DADDY_LEDGER_V3_SCHEMA_SHA256).toBe(pinned.schema_sha256);
    expect(PI_DADDY_LEDGER_V3_SCHEMA_SHA256).toBe(sha(bytes("ledger-event.schema.json")));
    expect(PI_DADDY_LEDGER_V3_SCHEMA).toEqual(JSON.parse(bytes("ledger-event.schema.json")));
    const consumerNotes = bytes("README.md");
    expect(consumerNotes).toContain(`commit      ${pinned.commit}`);
    expect(consumerNotes).toContain(`tree        ${pinned.tree}`);
    expect(consumerNotes).toContain(`version     ${pinned.version}`);
    expect(consumerNotes).toContain(`/clean/pi-daddy ${pinned.commit} --check`);
    expect(Object.keys(pinned.artifacts).sort()).toEqual([
      "fixtures/capability-decision.json", "fixtures/check-receipt.json", "fixtures/child-lifecycle.json",
      "fixtures/workflow-fact.json", "fixtures/workspace-lease.json", "ledger-event.schema.json", "pi-daddy-README.md", "refusals.ts",
    ]);
    for (const [relative, artifact] of Object.entries(pinned.artifacts)) {
      expect(sha(bytes(relative)), relative).toBe(artifact.sha256);
      if (relative.startsWith("fixtures/")) expect(artifact.generated_by).toBe("packages/pi-daddy/scripts/generate-ledger-v3-contract.ts");
    }
  });

  it("enforces every construct in the producer's closed v3 schema", () => {
    expect(() => assertSupportedSchemaV3(PI_DADDY_LEDGER_V3_SCHEMA, "pinned v3 schema")).not.toThrow();
    const known = declaredPropertyNames(PI_DADDY_LEDGER_V3_SCHEMA);
    for (const name of names) expect(validateClosedSchemaV3(PI_DADDY_LEDGER_V3_SCHEMA, fixture(name), { knownFieldNames: known }), name).toEqual([]);
    expect(validateClosedSchemaV3(PI_DADDY_LEDGER_V3_SCHEMA, { ...fixture("workflow-fact"), extra: true }, { knownFieldNames: known })).not.toEqual([]);
  });

  it("normalizes all five builder-produced variants without v3-to-v2 loss", () => {
    const normalized = Object.fromEntries(names.map((name) => [name, normalizePiDaddyLedger(line(fixture(name)))]));
    for (const name of names) {
      expect(normalized[name].length, name).toBeGreaterThan(0);
      expect(normalized[name].every((event) => event.source === "pi-daddy-v3"), name).toBe(true);
      expect(normalized[name].every((event) => event.attributes?.ledger_version === 3), name).toBe(true);
    }
    const decision = normalized["capability-decision"];
    expect(decision.every((event) => event.execution_id === fixture("capability-decision").executionId)).toBe(true);
    expect(decision.every((event) => event.parent_execution_id === null)).toBe(true);
    expect(decision.every((event) => event.task_from_execution_id === fixture("capability-decision").taskFromExecutionId)).toBe(true);
    expect(decision.some((event) => event.type === "child_spawn_refused")).toBe(true);
    expect(decision.some((event) => event.type === "capability_granted")).toBe(false);
    const fact = normalized["workflow-fact"][0];
    expect(fact).toMatchObject({ type: "workflow_fact", workflow_fact_id: fixture("workflow-fact").factId, run_id: "run-contract-001" });
    expect(fact.attributes).toMatchObject({ provenance: "controller_validated", fact_kind: "transition", fact_subject: "build-to-review", fact_state: "completed" });
  });

  it("preserves run/task/workspace/context/digest/tree/change/authority/check joins where supplied", () => {
    for (const name of names) {
      const record = fixture(name);
      const events = normalizePiDaddyLedger(line(record));
      for (const event of events) {
        expect(event.run_id).toBe(record.correlation.run_id);
        if (name !== "workflow-fact") expect(event.task_id).toBe(record.correlation.task_id);
        expect(event.context_id).toBe(record.correlation.context_id);
        expect(event.digests?.correlation_plan).toBe(record.correlation.plan_digest);
        expect(event.digests?.correlation_definition).toBe(record.correlation.definition_digest);
        expect(event.digests?.correlation_tree).toBe(record.correlation.tree_sha);
        expect(event.attributes).toMatchObject({ event_seq: 21, last_change_seq: 18, last_authority_seq: 20, check_receipt_id: "7".repeat(64) });
      }
    }
    const receipt = normalizePiDaddyLedger(line(fixture("check-receipt")))[0];
    expect(receipt.workspace_id).toBe("workspace-contract");
    expect(receipt.digests?.tree).toBe(fixture("check-receipt").treeSha);
  });

  it("preserves refusals as refusals and never turns them into grants or success evidence", () => {
    const record = fixture("capability-decision");
    const events = normalizePiDaddyLedger(line(record));
    const refused = events.find((event) => event.type === "child_spawn_refused");
    expect(refused).toMatchObject({ refusal_code: "WORKSPACE_WRITE_CONFLICT", execution_id: record.executionId });
    expect(refused?.attributes?.structured_refusal).toMatchObject({ code: "WORKSPACE_WRITE_CONFLICT" });
    expect(events.filter((event) => event.type === "capability_granted")).toEqual([]);
    // This producer fixture is blocked by a workspace conflict after capability
    // resolution, so its denied partition is empty. The refusal is the terminal
    // spawn event; manufacturing a capability_refused event would be lossy too.
    expect(events.filter((event) => event.type === "capability_refused")).toEqual([]);
  });

  it("rejects unknown/ambiguous versions instead of falling back to v2 or 0.17", () => {
    const record = fixture("capability-decision");
    expect(() => normalizePiDaddyLedger(line({ ...record, ledgerVersion: 4 }))).toThrow(/unsupported.*4/i);
    const noVersion = { ...record }; delete noVersion.ledgerVersion;
    expect(() => normalizePiDaddyLedger(line(noVersion))).toThrow(/missing explicit ledgerVersion 2 or 3|not.*legacy/i);
    const noEvent = { ...record }; delete noEvent.event;
    expect(() => normalizePiDaddyLedger(line(noEvent))).toThrow(/event.*required|discriminator/i);
  });

  it("has non-vacuous fail-closed mutations for version, ancestry, correlation, lifecycle, refusal, receipt, tree, and freshness", () => {
    const cases: Array<[string, Record<string, any>]> = [];
    cases.push(["version", { ...fixture("workspace-lease"), ledgerVersion: 2 }]);
    const ancestry = fixture("child-lifecycle"); ancestry.parentExecutionId = ancestry.executionId; cases.push(["ancestry", ancestry]);
    const correlation = fixture("workspace-lease"); correlation.correlation = { ...correlation.correlation, future_field: "x" }; cases.push(["correlation", correlation]);
    const lifecycle = fixture("child-lifecycle"); lifecycle.state = "running"; delete lifecycle.deadlineAt; cases.push(["lifecycle", lifecycle]);
    const refusal = fixture("capability-decision"); refusal.refusal.code = "FUTURE_REFUSAL"; cases.push(["refusal", refusal]);
    const receipt = fixture("check-receipt"); receipt.receiptId = "bad"; cases.push(["receipt", receipt]);
    const tree = fixture("check-receipt"); tree.treeSha = ""; cases.push(["tree", tree]);
    const freshness = fixture("workspace-lease"); freshness.correlation.event_seq = "21"; cases.push(["freshness", freshness]);
    expect(cases).toHaveLength(8);
    for (const [label, record] of cases) expect(() => normalizePiDaddyLedger(line(record)), label).toThrow();

    const changedTree = fixture("check-receipt"); changedTree.treeSha = "c".repeat(40);
    expect(normalizePiDaddyLedger(line(changedTree))[0].digests?.tree).toBe("c".repeat(40));
    const changedFreshness = fixture("workspace-lease"); changedFreshness.correlation.event_seq = 22;
    expect(normalizePiDaddyLedger(line(changedFreshness))[0].attributes?.event_seq).toBe(22);
  });

  it("provides an explicit v3 source selector without widening the historical pi-daddy-v1 selector", () => {
    const cwd = mkdtempSync(join(tmpdir(), "pi-daddy-v3-selector-"));
    writeFileSync(join(cwd, "ledger.jsonl"), line(fixture("workspace-lease")));
    const v3 = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-ledger-v3", path: "ledger.jsonl", required: true }]);
    expect(v3.errors).toEqual([]);
    expect(v3.events[0].source).toBe("pi-daddy-v3");
    const historical = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-v1", path: "ledger.jsonl", required: true }]);
    expect(historical.events).toEqual([]);
    expect(historical.errors[0]).toMatch(/does not admit ledgerVersion 3.*pi-daddy-ledger-v3/i);

    writeFileSync(join(cwd, "ledger.jsonl"), line(JSON.parse(readFileSync(join(REPO, "contracts", "pi-daddy", "ledger", "v2", "fixtures", "workspace-lease.json"), "utf8"))));
    const wrong = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-ledger-v3", path: "ledger.jsonl", required: true }]);
    expect(wrong.events).toEqual([]);
    expect(wrong.errors[0]).toMatch(/requires explicit ledgerVersion 3/i);
  });

  it("keeps frozen v2 and unversioned 0.17 dispatch unchanged", () => {
    const v2 = JSON.parse(readFileSync(join(REPO, "contracts", "pi-daddy", "ledger", "v2", "fixtures", "workspace-lease.json"), "utf8"));
    const v2Events = normalizePiDaddyLedger(line(v2));
    expect(v2Events.every((event) => event.source === "pi-daddy-v2")).toBe(true);
    expect(v2Events.every((event) => event.execution_id === undefined)).toBe(true);
    const legacy = { ts: "2026-08-20T12:00:00.000Z", parentId: "d0", childId: "d0.1", depth: 1, requested: ["tool:read"], parentGrant: ["tool:read"], effective: ["tool:read"], denied: [], clipped: [], gatedBlocked: [], blocked: false, executor: "process" };
    expect(normalizePiDaddyLedger(line(legacy)).every((event) => event.source === "pi-daddy-0.17")).toBe(true);
  });
});
