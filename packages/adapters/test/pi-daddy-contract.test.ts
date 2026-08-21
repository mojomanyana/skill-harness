/**
 * Pinned producer-consumer conformance against pi-daddy's canonical ledger v2 contract.
 *
 * Everything here is driven by the *producer's own artifact*, vendored byte-for-byte
 * under `contracts/pi-daddy/ledger/v2/` and digest-pinned by `PINNED.json`. That is
 * the point: the adapter used to restate the contract in its own words, and a
 * restatement is where drift hides — a refusal code the producer had added read as
 * "unsupported", and a top-level field the closed schema forbids rode through.
 *
 * Free and offline. No model, judge, or network calls.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  collectTrajectorySources,
  normalizePiDaddyLedger,
  V2_REFUSAL_CODES,
  V2_RESTATED_VOCABULARIES,
  V2_VOCABULARY_SUBSETS,
} from "../src/trajectory.js";
import { evaluateTrajectoryGates } from "@skill-harness/core";
import { PI_DADDY_CONTRACT_COMMIT, PI_DADDY_LEDGER_V2_SCHEMA, PI_DADDY_LEDGER_V2_SCHEMA_SHA256 } from "../src/pi-daddy-ledger-v2.js";
import { assertSupportedSchema, declaredPropertyNames, validateClosedSchema } from "../src/closed-schema.js";

/** The producer commit this consumer is pinned to (pi-daddy main, merged PR #11). */
const EXPECTED_PRODUCER_COMMIT = "1948b9406c13c9730f2fc103e68023d6e58c5e85";

const CONTRACT = join(fileURLToPath(new URL("../../..", import.meta.url)), "contracts", "pi-daddy", "ledger", "v2");
const bytes = (relative: string) => readFileSync(join(CONTRACT, relative), "utf8");
const pinned = JSON.parse(bytes("PINNED.json")) as {
  commit: string;
  artifacts: Record<string, { source: string; sha256: string }>;
};
const CANONICAL_FIXTURES = ["capability-decision", "workspace-lease", "child-lifecycle", "check-receipt"] as const;
const canonicalFixture = (name: (typeof CANONICAL_FIXTURES)[number]) =>
  JSON.parse(bytes(join("fixtures", `${name}.json`))) as Record<string, unknown>;
const line = (record: unknown) => `${JSON.stringify(record)}\n`;
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/** Resolve a `#/a/b/c` pointer inside the pinned schema. */
function resolvePointer(pointer: string): unknown {
  return pointer.replace(/^#\/?/, "").split("/").filter(Boolean).reduce<any>((node, key) => {
    if (node === undefined || node === null) throw new Error(`unresolvable pointer ${pointer}`);
    return node[key];
  }, PI_DADDY_LEDGER_V2_SCHEMA as any);
}

/** The event name a `oneOf` branch discriminates on. */
function discriminatorOf(branch: any): string {
  const target = branch?.$ref ? resolvePointer(branch.$ref) as any : branch;
  const event = target?.properties?.event?.const;
  if (typeof event !== "string") throw new Error("union branch has no event discriminator");
  return event;
}

/** Required-property lists, read out of the pinned schema rather than restated. */
function branchOf(event: string): Record<string, unknown> {
  const defs = (PI_DADDY_LEDGER_V2_SCHEMA as Record<string, any>).$defs as Record<string, any>;
  const branch = Object.values(defs).find((candidate) => candidate?.properties?.event?.const === event);
  if (!branch) throw new Error(`no schema branch for ${event}`);
  return branch as Record<string, unknown>;
}

describe("pinned pi-daddy ledger v2 contract", () => {
  it("pins the producer commit and every vendored artifact digest", () => {
    expect(pinned.commit).toBe(EXPECTED_PRODUCER_COMMIT);
    expect(PI_DADDY_CONTRACT_COMMIT).toBe(EXPECTED_PRODUCER_COMMIT);
    expect(Object.keys(pinned.artifacts).sort()).toEqual([
      "fixtures/capability-decision.json",
      "fixtures/check-receipt.json",
      "fixtures/child-lifecycle.json",
      "fixtures/workspace-lease.json",
      "ledger-event.schema.json",
      "pi-daddy-README.md",
    ]);
    for (const [relative, entry] of Object.entries(pinned.artifacts)) {
      expect(sha256(bytes(relative)), `${relative} is not the pinned producer bytes`).toBe(entry.sha256);
      expect(entry.source).toMatch(/^packages\/pi-daddy\/contracts\/ledger\/v2\//);
    }
  });

  it("keeps the runtime schema identical to the vendored producer schema", () => {
    const vendored = bytes("ledger-event.schema.json");
    expect(PI_DADDY_LEDGER_V2_SCHEMA_SHA256).toBe(sha256(vendored));
    expect(PI_DADDY_LEDGER_V2_SCHEMA_SHA256).toBe(pinned.artifacts["ledger-event.schema.json"].sha256);
    // Deep equality, not "close enough": the runtime object is what actually gates
    // records, so a hand edit to either copy has to fail here.
    expect(PI_DADDY_LEDGER_V2_SCHEMA).toEqual(JSON.parse(vendored));
  });

  it("refuses to validate a schema containing a construct the evaluator cannot enforce", () => {
    // A subset evaluator that ignores an unknown keyword silently validates less than
    // the contract declares. It must fail loudly instead.
    expect(() => assertSupportedSchema(PI_DADDY_LEDGER_V2_SCHEMA, "pinned schema")).not.toThrow();
    expect(() => assertSupportedSchema({ type: "object", unevaluatedProperties: false }, "probe"))
      .toThrow(/unsupported JSON Schema keyword `unevaluatedProperties`/);
    expect(() => assertSupportedSchema({ type: "object", properties: { a: { allOf: [] } } }, "probe"))
      .toThrow(/unsupported JSON Schema keyword `allOf`.*properties\/a/);
    expect(() => assertSupportedSchema({ type: "string", format: "email" }, "probe")).toThrow(/unsupported format `email`/);

    // A `$ref` with siblings is the subtlest form of the same hole: `validate` follows
    // the ref and evaluates the target *instead of* the node, so the sibling would be
    // dropped in silence. Refusing the schema is the only honest option.
    const refSiblings = { $defs: { id: { type: "string" } }, properties: { a: { $ref: "#/$defs/id", minLength: 10 } } };
    expect(() => assertSupportedSchema(refSiblings, "probe")).toThrow(/combines \$ref with `minLength`/);
    expect(() => assertSupportedSchema({ $defs: { id: { type: "string" } }, properties: { a: { $ref: "#/$defs/id", title: "ok" } } }, "probe")).not.toThrow();

    // A keyword whose name is known but whose value has the wrong shape would be
    // skipped by the downstream Array.isArray/typeof guards, silently unenforced.
    const badShapes: Array<[Record<string, unknown>, RegExp]> = [
      [{ type: "object", properties: { a: { type: "string" } }, required: "a" }, /declares `required`.*an array of strings/],
      [{ type: "string", enum: "a" }, /declares `enum`.*a non-empty array/],
      [{ type: "string", enum: [] }, /declares `enum`.*a non-empty array/],
      [{ type: "string", pattern: 7 }, /declares `pattern`.*a string/],
      [{ type: "string", minLength: "1" }, /declares `minLength`.*a number/],
      [{ type: "object", additionalProperties: "no" }, /declares `additionalProperties`.*a boolean or a schema object/],
      [{ oneOf: [] }, /declares `oneOf`.*a non-empty array/],
      [{ type: [] }, /declares `type`.*a string or array of strings/],
    ];
    for (const [probe, expected] of badShapes) {
      expect(() => assertSupportedSchema(probe, "probe"), JSON.stringify(probe)).toThrow(expected);
    }
  });

  it("validates format: date-time as RFC 3339 permits, not as the harness happens to emit", () => {
    // This constraint comes from the producer's schema, so being stricter than RFC 3339
    // would report a conforming producer line as a *contract* violation. The harness's
    // own narrower `validTime` still applies afterwards, correctly labelled as its own.
    const probe = { type: "string" as const, format: "date-time" };
    for (const value of ["2026-08-20T12:00:00Z", "2026-08-20t12:00:00z", "2026-12-31T23:59:60Z", "2026-08-20T12:00:00.123+02:00"]) {
      expect(validateClosedSchema(probe, value), value).toEqual([]);
    }
    for (const value of ["2026-08-20 12:00:00Z", "2026-13-01T00:00:00Z", "2026-02-30T00:00:00Z", "2026-08-20T24:00:00Z", "not-a-date"]) {
      expect(validateClosedSchema(probe, value).length, value).toBeGreaterThan(0);
    }
  });

  it("keeps every restated vocabulary set-equal to the pinned schema", () => {
    // Not just the refusal codes. A semantic set that has drifted *narrower* than the
    // contract now produces the mirror of the original bug: the closed schema admits
    // the record and a stale harness set throws it out as "unsupported".
    expect(V2_RESTATED_VOCABULARIES.length).toBeGreaterThanOrEqual(10);
    for (const { name, kind, pointer, values } of V2_RESTATED_VOCABULARIES) {
      const node = resolvePointer(pointer);
      const expected = kind === "enum"
        ? (node as any).enum as string[]
        : kind === "propertyNames"
          ? Object.keys((node as any).properties as Record<string, unknown>)
          : ((node as any) as any[]).map((branch) => (branchOf(discriminatorOf(branch)) as any).properties.event.const as string);
      expect(Array.isArray(expected) && expected.length > 0, `${name}: ${pointer} resolved to no vocabulary`).toBe(true);
      expect([...values].sort(), `${name} has drifted from ${pointer}`).toEqual([...expected].sort());
    }
  });

  it("keeps harness-side vocabulary subsets inside the pinned schema", () => {
    for (const { name, kind, pointer, values } of V2_VOCABULARY_SUBSETS) {
      const node = resolvePointer(pointer) as any;
      if (kind === "enum") {
        const allowed = new Set(node.enum as string[]);
        for (const value of values) expect(allowed.has(value), `${name} contains ${value}, which ${pointer} does not`).toBe(true);
        continue;
      }
      // The numeric correlation fields must be exactly those the schema types as numbers.
      const numeric = Object.entries(node.properties as Record<string, any>)
        .filter(([, entry]) => entry?.type === "number" || entry?.type === "integer")
        .map(([field]) => field);
      expect([...values].sort(), `${name} has drifted from the numeric fields of ${pointer}`).toEqual(numeric.sort());
    }
  });

  it("carries pi-daddy's refusal vocabulary with no drift in either direction", () => {
    const canonical = (branchOf("capability_decision") as any).properties.refusal.$ref;
    expect(canonical).toBe("#/$defs/refusal");
    const enumerated = ((PI_DADDY_LEDGER_V2_SCHEMA as Record<string, any>).$defs.refusalCode.enum as string[]);
    expect(enumerated).toContain("GRANT_ID_MALFORMED");
    // Set equality both ways: a code the producer added must not read as unsupported,
    // and the harness must not invent one the producer never published.
    expect([...V2_REFUSAL_CODES].sort()).toEqual([...enumerated].sort());
  });

  it("accepts every canonical builder fixture unmodified", () => {
    for (const name of CANONICAL_FIXTURES) {
      const record = canonicalFixture(name);
      expect(validateClosedSchema(PI_DADDY_LEDGER_V2_SCHEMA, record, { knownFieldNames: declaredPropertyNames(PI_DADDY_LEDGER_V2_SCHEMA) })).toEqual([]);
      const events = normalizePiDaddyLedger(line(record));
      expect(events.length, `${name} normalized to nothing`).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.source).toBe("pi-daddy-v2");
        expect(event.run_id).toBe("run-contract-001");
        expect(event.task_id).toBe("task-contract-001");
      }
    }
  });

  it("accepts the four canonical fixtures as one ledger through the pi-daddy-v1 selector", () => {
    // `pi-daddy-v1` is the historical *selector* name kept for spec compatibility;
    // it is the path a real spec takes to this adapter, so the conformance check
    // goes through it rather than calling the normalizer directly.
    const cwd = mkdtempSync(join(tmpdir(), "sh-pi-daddy-contract-"));
    writeFileSync(join(cwd, "grants-ledger.jsonl"), CANONICAL_FIXTURES.map((name) => JSON.stringify(canonicalFixture(name))).join("\n") + "\n");
    const result = collectTrajectorySources(cwd, [{ adapter: "pi-daddy-v1", path: "grants-ledger.jsonl", required: true }]);
    expect(result.errors).toEqual([]);
    expect(result.events.map((event) => event.seq)).toEqual(result.events.map((_, index) => index + 1));
    expect(result.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "capability_requested", "child_spawn_refused", "writer_lease_acquired", "child_failed", "check_receipt_recorded",
    ]));
  });

  it("takes measured tree identity from the receipt, not from correlation", () => {
    const receipt = canonicalFixture("check-receipt");
    // The producer's own builder emits these two independently — this fixture is the
    // regression: requiring equality rejected pi-daddy's canonical receipt.
    expect(receipt.treeSha).not.toBe((receipt.correlation as Record<string, unknown>).tree_sha);
    const [event] = normalizePiDaddyLedger(line(receipt));
    expect(event.digests?.tree).toBe(receipt.treeSha);
    expect(event.digests?.correlation_tree).toBe((receipt.correlation as Record<string, unknown>).tree_sha);
    expect(event.workspace_id).toBe(receipt.workspaceId);
  });

  it("normalizes a canonical decision refused with GRANT_ID_MALFORMED and gates on it", () => {
    const decision = canonicalFixture("capability-decision");
    (decision.refusal as Record<string, unknown>).code = "GRANT_ID_MALFORMED";
    const events = normalizePiDaddyLedger(line(decision));
    const refused = events.find((event) => event.type === "child_spawn_refused")!;
    expect(refused.refusal_code).toBe("GRANT_ID_MALFORMED");
    expect(refused.attributes?.structured_refusal).toMatchObject({ code: "GRANT_ID_MALFORMED" });

    // Prove it all the way through the gate layer, not just the normalizer: a code the
    // adapter accepts but a spec cannot assert on would still be unusable evidence.
    expect(evaluateTrajectoryGates(
      { version: "1.0", require: [{ event: "child_spawn_refused", where: { refusal_code: { equals: "GRANT_ID_MALFORMED" } } }] },
      events,
    ).status).toBe("PASS");
    expect(evaluateTrajectoryGates(
      { version: "1.0", require: [{ event: "child_spawn_refused", where: { refusal_code: { equals: "CAPABILITY_ESCALATION" } } }] },
      events,
    ).status).toBe("FAIL");
  });

  it("fails closed on an undeclared top-level field in every variant", () => {
    for (const name of CANONICAL_FIXTURES) {
      const record = { ...canonicalFixture(name), assuranceScope: "smuggled" };
      expect(() => normalizePiDaddyLedger(line(record)), `${name} accepted an undeclared field`)
        .toThrow(/closed contract violation.*carries undeclared field/i);
    }
    // An undeclared field whose name is not in the contract's vocabulary is refused
    // without echoing the name — a ledger is untrusted input.
    expect(() => normalizePiDaddyLedger(line({ ...canonicalFixture("workspace-lease"), "sk-ABCDEFGHIJKLMNOP": 1 })))
      .toThrow(/carries undeclared field \[REDACTED field name\]/);
  });

  it("does not relay a ledger-supplied map key into a diagnostic path", () => {
    // Under a map-valued `additionalProperties` the key comes from the record, and
    // contract errors are persisted. A short, clean capability name is useful in the
    // path; a secret-shaped or unbounded one is not worth relaying.
    const secretKey = { ...canonicalFixture("capability-decision"), approvalSources: { "sk-ABCDEFGHIJKLMNOPQRST": "telepathy" } };
    expect(() => normalizePiDaddyLedger(line(secretKey))).toThrow(/approvalSources\[REDACTED key\]/);
    expect(() => normalizePiDaddyLedger(line(secretKey))).not.toThrow(/sk-ABCDEFGHIJKLMNOPQRST/);

    const decision = canonicalFixture("capability-decision");
    (decision.refusal as Record<string, unknown>).details = { ["k".repeat(200)]: {} };
    expect(() => normalizePiDaddyLedger(line(decision))).toThrow(/refusal\.details\[REDACTED key\]/);

    const named = { ...canonicalFixture("capability-decision"), approvalSources: { "tool:bash": "telepathy" } };
    expect(() => normalizePiDaddyLedger(line(named))).toThrow(/approvalSources\["tool:bash"\] must be one of prompt/);
  });

  it("fails closed on signal, outcome, state, access and executor enum drift", () => {
    const cases: Array<[(typeof CANONICAL_FIXTURES)[number], Record<string, unknown>, RegExp]> = [
      ["child-lifecycle", { signal: "SIGNOTREAL" }, /signal must/i],
      ["child-lifecycle", { state: "cancelled" }, /state must be one of starting, completed, failed/i],
      ["child-lifecycle", { executor: "not-an-executor" }, /executor must be one of process, herdr/i],
      ["workspace-lease", { outcome: "half-acquired" }, /outcome must be one of acquired, uncontended/i],
      ["workspace-lease", { access: "append" }, /access must be one of read, write/i],
      ["workspace-lease", { recovered: "maybe" }, /recovered must/i],
      ["capability-decision", { executor: "docker" }, /executor must be one of process, herdr/i],
      ["capability-decision", { gateOutcome: "approved" }, /gateOutcome must be one of declined, dismissed, no-ui, error/i],
      ["capability-decision", { approvalSources: { "tool:bash": "telepathy" } }, /approvalSources.*must be one of prompt, session, persisted, inherited/i],
      ["capability-decision", { approvalScopes: { "tool:bash": "forever" } }, /approvalScopes.*must be one of once, session, always/i],
    ];
    for (const [name, patch, expected] of cases) {
      expect(() => normalizePiDaddyLedger(line({ ...canonicalFixture(name), ...patch })), `${name} ${JSON.stringify(patch)}`).toThrow(expected);
    }
  });

  it("fails closed on nullability and numeric-type drift", () => {
    const cases: Array<[(typeof CANONICAL_FIXTURES)[number], Record<string, unknown>, RegExp]> = [
      // exitCode is integer-or-null: a string, a float, and a missing-vs-null mix-up
      // are all contract violations rather than something to coerce.
      ["child-lifecycle", { exitCode: "0" }, /exitCode must be an integer or null/i],
      ["child-lifecycle", { exitCode: 1.5 }, /exitCode must be an integer or null/i],
      ["child-lifecycle", { signal: 9 }, /signal must/i],
      // These flags are `const: true` — pi-daddy never writes `false`, it omits them.
      ["child-lifecycle", { aborted: false }, /aborted must be true/i],
      ["child-lifecycle", { timedOut: "yes" }, /timedOut must be true/i],
      ["capability-decision", { humanDenied: false }, /humanDenied must be true/i],
      ["capability-decision", { depth: null }, /depth must be an integer/i],
      ["capability-decision", { depth: -1 }, /depth must be >= 0/i],
      ["capability-decision", { blocked: "true" }, /blocked must be a boolean/i],
      ["capability-decision", { requested: null }, /requested must be an array/i],
      ["capability-decision", { requested: ["tool:bash", 7] }, /requested\[1\] must be a string/i],
      ["capability-decision", { approvalUses: { "tool:read": { max: 1 } } }, /approvalUses\["tool:read"\].remaining is required/i],
      ["capability-decision", { taskDigest: "9".repeat(63) }, /taskDigest must match/i],
      ["check-receipt", { receiptId: null }, /receiptId must be a string/i],
      ["check-receipt", { treeSha: "" }, /treeSha must not be empty/i],
      ["workspace-lease", { root: "" }, /root must not be empty/i],
      ["workspace-lease", { correlation: { run_id: 1, task_id: "t" } }, /correlation\.run_id must be a string/i],
      ["workspace-lease", { correlation: { run_id: "r", task_id: "t", event_seq: "3" } }, /correlation\.event_seq must be a number/i],
    ];
    for (const [name, patch, expected] of cases) {
      expect(() => normalizePiDaddyLedger(line({ ...canonicalFixture(name), ...patch })), `${name} ${JSON.stringify(patch)}`).toThrow(expected);
    }
  });

  it("reports a failed union against the branch the record's discriminator names", () => {
    // With several fields missing at once, the *intended* branch has the most
    // violations, so picking the closest-matching branch would report "event must be
    // child_lifecycle" about a capability_decision. That is fail-closed but
    // misleading, and a misleading contract error costs a reader real time.
    const skeletal = { ledgerVersion: 2, event: "capability_decision", ts: "2026-08-20T12:00:01.000Z", childId: "d0.1" };
    expect(() => normalizePiDaddyLedger(line(skeletal))).toThrow(/capability_decision.*parentId is required/);
    expect(() => normalizePiDaddyLedger(line(skeletal))).not.toThrow(/must be "child_lifecycle"/);
    expect(() => normalizePiDaddyLedger(line({ ...skeletal, event: "check_receipt" }))).toThrow(/check_receipt.*receiptId is required/);
  });

  it("fails closed when any required field of any variant goes missing", () => {
    for (const name of CANONICAL_FIXTURES) {
      const record = canonicalFixture(name);
      const required = (branchOf(String(record.event)) as any).required as string[];
      expect(required.length).toBeGreaterThan(4);
      for (const field of required) {
        const dropped = { ...record };
        delete dropped[field];
        expect(() => normalizePiDaddyLedger(line(dropped)), `${name} accepted a record missing ${field}`).toThrow();
      }
      // `ts` is pre-empted by chronology validation, and `event`/`ledgerVersion` by
      // dispatch; every other required field must be named by the contract layer.
      for (const field of required.filter((candidate) => !["ts", "event", "ledgerVersion"].includes(candidate))) {
        const dropped = { ...record };
        delete dropped[field];
        expect(() => normalizePiDaddyLedger(line(dropped)), `${name} missing ${field}`).toThrow(new RegExp(`${field} is required`));
      }
    }
  });

  it("keeps the harness-only workflow join requirement after schema validation", () => {
    // pi-daddy itself permits an uncorrelated v2 line: `correlation` is optional in
    // the closed schema. The harness still refuses it, because an event it cannot
    // join to run/task evidence is not usable as trajectory evidence — and that is a
    // harness requirement, not a contract violation, so it must be reported after
    // the record has been admitted by the producer's schema.
    for (const name of CANONICAL_FIXTURES) {
      const record = canonicalFixture(name);
      delete record.correlation;
      expect(validateClosedSchema(PI_DADDY_LEDGER_V2_SCHEMA, record), `${name} without correlation should satisfy the producer schema`).toEqual([]);
      expect(() => normalizePiDaddyLedger(line(record))).toThrow(
        new RegExp(`${String(record.event)}.*correlation\\.run_id.*correlation\\.task_id`, "i"),
      );
      expect(() => normalizePiDaddyLedger(line(record))).not.toThrow(/closed contract violation/);
    }
    for (const field of ["run_id", "task_id"]) {
      const record = canonicalFixture("workspace-lease");
      delete (record.correlation as Record<string, unknown>)[field];
      expect(validateClosedSchema(PI_DADDY_LEDGER_V2_SCHEMA, record)).toEqual([]);
      expect(() => normalizePiDaddyLedger(line(record))).toThrow(/correlation\.run_id and correlation\.task_id are required for workflow joins/);
    }
  });

  it("leaves unversioned 0.17 grant records outside the v2 contract, as the producer documents", () => {
    const legacy = {
      ts: "2026-08-20T12:00:00.000Z", parentId: "d0", childId: "d0.1", depth: 1, executor: "process", blocked: false,
      requested: ["tool:read"], parentGrant: ["tool:read"], effective: ["tool:read"], denied: [], clipped: [], gatedBlocked: [],
    };
    const events = normalizePiDaddyLedger(line(legacy));
    expect(events.every((event) => event.source === "pi-daddy-0.17")).toBe(true);
    expect(events.find((event) => event.type === "child_started")).toBeDefined();
    // A legacy record is not validated against — nor rejected by — the v2 schema.
    expect(validateClosedSchema(PI_DADDY_LEDGER_V2_SCHEMA, legacy).length).toBeGreaterThan(0);
    // An explicit non-2 version is never reinterpreted as a legacy grant line.
    expect(() => normalizePiDaddyLedger(line({ ...legacy, ledgerVersion: 3 }))).toThrow(/unsupported pi-daddy ledgerVersion 3/);
    // Nor is a legacy body admitted by stamping the current version on it: it has no
    // discriminator, which the producer's dispatch rules also require to fail closed.
    expect(() => normalizePiDaddyLedger(line({ ...legacy, ledgerVersion: 2 })))
      .toThrow(/event must be capability_decision, workspace_lease, child_lifecycle, or check_receipt/);
    expect(() => normalizePiDaddyLedger(line({ ...legacy, ledgerVersion: 2, event: "grant" })))
      .toThrow(/event must be capability_decision, workspace_lease, child_lifecycle, or check_receipt/);
    expect(() => normalizePiDaddyLedger(line({ ...legacy, ledgerVersion: 2, event: "workspace_lease" })))
      .toThrow(/closed contract violation/);
  });
});
