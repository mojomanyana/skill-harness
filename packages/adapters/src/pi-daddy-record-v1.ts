/** Read the separately pinned pi-daddy 0.46.1 record format. No compatibility guessing. */
import { createHash } from "node:crypto";
import { TRAJECTORY_EVENT_VERSION, deserializeTrajectoryEvents, redactArgs, redactText, type TrajectoryEventV1 } from "@skill-harness/core";
import { assertSupportedSchemaV3, declaredPropertyNames, validateClosedSchemaV3 } from "./closed-schema.js";
import { PI_DADDY_RECORD_V1_SCHEMA, PI_DADDY_RECORD_V1_GOVERNANCE_SCHEMA, PI_DADDY_RECORD_V1_COMMIT } from "./pi-daddy-record-v1-contract.js";
type ObjectValue = Record<string, unknown>;
const sha = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
function object(value: unknown): ObjectValue | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined; }
function text(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
/** Reject sensitive authority/identity text instead of silently changing what it names. */
function hasSensitiveIdentity(value: unknown): boolean {
  if (typeof value === "string") return redactText(value) !== value;
  if (Array.isArray(value)) return value.some(hasSensitiveIdentity);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => redactText(key) !== key || hasSensitiveIdentity(item));
  }
  return false;
}
const schemaNames = new WeakMap<object, Set<string>>();
function validate(schema: unknown, value: unknown, label: string): void {
  if (!schemaNames.has(schema as object)) {
    assertSupportedSchemaV3(schema, label);
    schemaNames.set(schema as object, declaredPropertyNames(schema));
  }
  const issues = validateClosedSchemaV3(schema as ObjectValue, value, { knownFieldNames: schemaNames.get(schema as object) });
  if (issues.length) throw new Error(`${label}: ${redactText(issues[0].path || "(record)")} ${redactText(issues[0].message)} [pi-daddy ${PI_DADDY_RECORD_V1_COMMIT.slice(0, 12)}]`);
}
/**
 * Current native grants.jsonl ingestion. Envelope and body contracts are separate,
 * exact producer pins. An invalid line rejects the entire source, never a green
 * intact prefix. Digests detect inconsistency, not authenticity or billing truth.
 * One normalized observation per native body: no synthetic grants/approvals.
 */
export function normalizePiDaddyRecordLedgerV1(raw: string): TrajectoryEventV1[] {
  if (!raw || !raw.endsWith("\n")) throw new Error("pi-daddy record-v1 source is empty or has an unterminated tail");
  const lines = raw.slice(0, -1).split("\n");
  const events: TrajectoryEventV1[] = [];
  const highWater = new Map<string, number>();
  const ids = new Set<string>();
  let previous: string | null = null;
  for (const [index, line] of lines.entries()) {
    const where = `pi-daddy record-v1 line ${index + 1}`;
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new Error(`${where}: malformed JSON`); }
    validate(PI_DADDY_RECORD_V1_SCHEMA, parsed, where);
    const record = parsed as ObjectValue;
    if (record.seq !== index + 1) throw new Error(`${where}: sequence gap`);
    if (record.prev !== previous) throw new Error(`${where}: previous line hash mismatch`);
    const { digest, ...unsigned } = record;
    if (sha(canonical(unsigned)) !== digest) throw new Error(`${where}: record digest mismatch`);
    if (ids.has(record.id as string)) throw new Error(`${where}: duplicate record identity`);
    ids.add(record.id as string);
    validate(PI_DADDY_RECORD_V1_GOVERNANCE_SCHEMA, record.body, `${where} governance body`);
    const body = record.body as ObjectValue;
    const native = body.event as string;
    const expectedKind = native === "capability_decision" ? "capability" : native === "child_lifecycle" ? "lifecycle" : native === "workspace_lease" ? "lease" : "fact";
    if (record.kind !== expectedKind) throw new Error(`${where}: envelope kind disagrees with governance event`);
    if (body.executionId !== undefined && body.parentExecutionId === body.executionId) throw new Error(`${where}: execution cannot be its own parent`);
    const at = body.ts as string;
    const stream = text(body.executionId) ?? text(body.episodeId) ?? native;
    const instant = Date.parse(at);
    if (!Number.isFinite(instant)) throw new Error(`${where}: unsupported native timestamp`);
    if (instant < (highWater.get(stream) ?? -Infinity)) throw new Error(`${where}: native timestamps move backwards within execution`);
    highWater.set(stream, instant);
    const uses = object(body.approvalUses);
    for (const use of Object.values(uses ?? {})) {
      const item = use as { max: number; remaining: number };
      if (item.remaining > item.max) throw new Error(`${where}: approval remaining exceeds maximum`);
    }
    // These arrays name capability authority, even when retained only as attributes.
    for (const field of ["requested", "parentGrant", "effective", "denied", "clipped", "gatedBlocked", "approved"]) {
      if (hasSensitiveIdentity(body[field])) throw new Error(`${where}: capability identity contains sensitive content`);
    }
    const correlation = object(body.correlation) ?? {};
    const definition = object(body.definitionDigest) ?? {};
    const refusal = object(body.refusal) ?? {};
    const lifecycle: Record<string, string> = { starting: "child_started", running: "child_running", completed: "child_completed", failed: "child_failed" };
    const type = native === "child_lifecycle" ? lifecycle[body.state as string]
      : native === "capability_decision" && body.blocked === true ? "child_spawn_refused" : native;
    const defined = (value: ObjectValue): ObjectValue => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
    const attributes = redactArgs({ ...body, record_seq: record.seq, record_id: record.id, record_digest: record.digest, record_at: record.at, record_format: 1, native_event: native, contract_commit: PI_DADDY_RECORD_V1_COMMIT });
    const event = defined({
      event_version: TRAJECTORY_EVENT_VERSION, seq: index + 1, type, source: "pi-daddy-record-v1", at,
      run_id: text(correlation.run_id), task_id: text(correlation.task_id), context_id: text(correlation.context_id), phase: text(correlation.phase),
      workspace_id: text(body.workspaceId), parent_id: text(body.parentId), child_id: text(body.childId),
      execution_id: text(body.executionId), parent_execution_id: body.parentExecutionId, task_from_execution_id: text(body.taskFromExecutionId),
      deadline_at: text(body.deadlineAt), exit_code: Number.isInteger(body.exitCode) ? body.exitCode : undefined,
      requested_capabilities: Array.isArray(body.requested) ? [...new Set(body.requested)] : undefined,
      effective_capabilities: Array.isArray(body.effective) ? [...new Set(body.effective)] : undefined,
      refusal_code: text(refusal.code),
      digests: defined({task:text(body.taskDigest),definition:text(definition.sha256),skill_definition:text(body.definitionHash)}), attributes,
    });
    // Free text was already redacted above. Check every retained string and map key,
    // including normalized identity arrays that deliberately preserve exact values.
    if (hasSensitiveIdentity(event)) throw new Error(`${where}: normalized identity contains sensitive content`);
    events.push(event as unknown as TrajectoryEventV1);
    previous = sha(line);
  }
  if (!deserializeTrajectoryEvents(events.map(event => JSON.stringify(event)).join("\n") + "\n")) {
    throw new Error("pi-daddy record-v1 cannot represent this source in the normalized trajectory contract");
  }
  return events;
}
