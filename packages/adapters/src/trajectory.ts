import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionTraceV1, TrajectoryEventSource, TrajectoryEventV1 } from "@skill-harness/core";
import { TRAJECTORY_EVENT_VERSION, deserializeTrajectoryEvents, matchesGlob, redactArgs } from "@skill-harness/core";

export interface CollectedTrajectorySources {
  events: TrajectoryEventV1[];
  errors: string[];
}

/** Read and normalize declared workspace-local native ledger files. */
export function collectTrajectorySources(cwd: string, sources: TrajectoryEventSource[]): CollectedTrajectorySources {
  const files = walkFiles(cwd);
  const streams: Array<{ file: string; adapter: TrajectoryEventSource["adapter"]; events: TrajectoryEventV1[] }> = [];
  const errors: string[] = [];
  const seenFiles = new Set<string>();
  for (const source of sources) {
    const matched = files.filter((file) => matchesGlob(source.path, file));
    if (matched.length === 0) {
      if (source.required) errors.push(`required event source ${source.adapter}:${source.path} is missing`);
      continue;
    }
    for (const file of matched.sort()) {
      const sourceFile = `${source.adapter}:${file}`;
      if (seenFiles.has(sourceFile)) {
        errors.push(`event source ${sourceFile} was declared more than once`);
        continue;
      }
      seenFiles.add(sourceFile);
      try {
        const text = readFileSync(join(cwd, file), "utf8");
        const normalized = source.adapter === "principal-assurance-v1"
          ? normalizePrincipalAssuranceLedger(text)
          : source.adapter === "pi-daddy-v1"
            ? normalizePiDaddyLedger(text)
            : deserializeTrajectoryEvents(text);
        if (!normalized) throw new Error("normalized-v1 source is empty, malformed, or unsupported");
        const times = normalized.map((event) => validTime(event.at) ? Date.parse(event.at!) : null);
        if (times.every((time) => time !== null) && times.some((time, index) => index > 0 && time! < times[index - 1]!)) {
          throw new Error("native event timestamps move backwards relative to the source's recorded sequence");
        }
        streams.push({ file, adapter: source.adapter, events: normalized });
      } catch (error) {
        errors.push(`${source.adapter}:${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (streams.length > 1) {
    if (streams.some((stream) => stream.events.some((event) => !validTime(event.at)))) {
      errors.push("multiple native event files cannot be globally ordered because at least one event has no valid `at` timestamp");
    }
    const owners = new Map<string, Set<string>>();
    for (const stream of streams) for (const event of stream.events) {
      if (!event.at) continue;
      const instant = String(Date.parse(event.at));
      const filesAtTime = owners.get(instant) ?? new Set<string>();
      filesAtTime.add(stream.file);
      owners.set(instant, filesAtTime);
    }
    if ([...owners.values()].some((filesAtTime) => filesAtTime.size > 1)) {
      errors.push("native event files contain equal timestamps, so strict cross-source order is ambiguous");
    }
    const principalRuns = new Map<string, string>();
    for (const stream of streams.filter((entry) => entry.adapter === "principal-assurance-v1")) {
      for (const runId of new Set(stream.events.map((event) => event.run_id).filter((value): value is string => Boolean(value)))) {
        const prior = principalRuns.get(runId);
        if (prior && prior !== stream.file) errors.push(`principal assurance run ${runId} appears in multiple ledger files (${prior}, ${stream.file})`);
        else principalRuns.set(runId, stream.file);
      }
    }
  }
  return { events: resequence(streams.flatMap((stream) => stream.events)), errors };
}

/** Combine independently sequenced sources by recorded time while retaining each native sequence. */
export function resequence(events: TrajectoryEventV1[]): TrajectoryEventV1[] {
  const native = events.map((event, index) => ({
    event,
    index,
    at: validTime(event.at) ? Date.parse(event.at!) : null,
  }));
  if (native.every((entry) => entry.at !== null)) native.sort((a, b) => a.at! - b.at! || a.index - b.index);
  return native.map(({ event }, index) => ({
    ...event,
    seq: index + 1,
    attributes: { native_seq: event.seq, ...(event.attributes ?? {}) },
  }));
}

/** Normalize pi's structured calls into adapter-neutral start/completion events. */
export function normalizePiTraces(traces: ExecutionTraceV1[]): TrajectoryEventV1[] {
  const events: TrajectoryEventV1[] = [];
  let seq = 1;
  for (const trace of [...traces].sort((a, b) => a.turn - b.turn)) {
    const base = { scenario_id: trace.scenario_id, rep: trace.rep, turn: trace.turn };
    const calls = [...trace.tool_calls].sort((a, b) => a.issueIndex - b.issueIndex);
    for (const call of calls) {
      events.push({
        event_version: TRAJECTORY_EVENT_VERSION,
        seq: seq++,
        type: "tool_started",
        source: "pi",
        at: call.started_at,
        tool: call.name,
        attributes: { ...base, tool_call_id: call.id, args: call.args, issue_index: call.issueIndex },
      });
    }
    for (const call of calls.filter((item) => item.completionIndex >= 0).sort((a, b) => a.completionIndex - b.completionIndex)) {
      events.push({
        event_version: TRAJECTORY_EVENT_VERSION,
        seq: seq++,
        type: "tool_completed",
        source: "pi",
        at: call.completed_at,
        tool: call.name,
        attributes: {
          ...base,
          tool_call_id: call.id,
          success: !call.isError,
          issue_index: call.issueIndex,
          completion_index: call.completionIndex,
          result_sha256: call.result.sha256,
          ...(call.result.details ? { details: call.result.details } : {}),
        },
      });
    }
  }
  return events;
}

/** Normalize principal-pi-skills' immutable assurance event schema v1.0. */
export function normalizePrincipalAssuranceLedger(text: string): TrajectoryEventV1[] {
  const records = parseJsonl(text, "principal assurance");
  validatePrincipalIntegrity(records);
  return records.map((record, index) => {
    if (record.schema_version !== "1.0") {
      throw new Error(`unsupported principal assurance schema version ${JSON.stringify(record.schema_version)} at line ${index + 1}; expected \"1.0\"`);
    }
    if (!Number.isInteger(record.seq) || Number(record.seq) < 1 || typeof record.type !== "string" || typeof record.run_id !== "string") {
      throw new Error(`invalid principal assurance v1 event at line ${index + 1}: seq, type, and run_id are required`);
    }
    const packet = object(record.packet);
    const definitionDigests = object(packet?.definition_digests);
    const definition = typeof record.definition_digest === "string"
      ? record.definition_digest
      : typeof definitionDigests?.["skill:build"] === "string"
        ? definitionDigests["skill:build"]
        : undefined;
    const taskId = string(record.task_id) ?? string(packet?.task_id);
    const workspaceId = string(record.workspace_id) ?? string(packet?.workspace_id);
    const plan = string(record.plan_digest) ?? string(packet?.plan_digest);
    const head = string(record.head_sha);
    const tree = string(record.tree_sha);
    const attributes = without(record, [
      "schema_version", "seq", "type", "at", "run_id", "task_id", "workspace_id", "context_id",
      "finding_id", "phase", "plan_digest", "definition_digest", "head_sha", "tree_sha", "exit_code",
    ]);
    return cleanEvent({
      event_version: TRAJECTORY_EVENT_VERSION,
      seq: Number(record.seq),
      type: record.type,
      source: "principal-assurance-v1",
      at: string(record.at),
      run_id: record.run_id,
      task_id: taskId,
      workspace_id: workspaceId,
      context_id: string(record.context_id),
      finding_id: string(record.finding_id),
      phase: string(record.phase),
      exit_code: Number.isInteger(record.exit_code) ? Number(record.exit_code) : undefined,
      digests: anyDefined({ plan, definition, head, tree }),
      requirements: stringArray(record.requirements),
      attributes: sanitizeAttributes(attributes),
    });
  });
}

/**
 * Normalize both the current unversioned pi-daddy 0.17 grant ledger and the
 * explicit v1 governance supplement. Legacy omissions remain omissions: no
 * task/workspace/expiry field is ever inferred as successful governance.
 */
export function normalizePiDaddyLedger(text: string): TrajectoryEventV1[] {
  const records = parseJsonl(text, "pi-daddy");
  const out: TrajectoryEventV1[] = [];
  let seq = 1;
  records.forEach((record, index) => {
    if (record.schema_version !== undefined && record.schema_version !== "1.0") {
      throw new Error(`unsupported pi-daddy ledger schema version ${JSON.stringify(record.schema_version)} at line ${index + 1}; expected unversioned 0.17 grant records or \"1.0\" governance records`);
    }
    if (record.schema_version === "1.0") {
      out.push(normalizePiDaddyV1(record, seq++, index));
      return;
    }
    for (const event of normalizeLegacyGrant(record, index)) out.push({ ...event, seq: seq++ });
  });
  return out;
}

function normalizeLegacyGrant(record: Record<string, unknown>, index: number): Omit<TrajectoryEventV1, "seq">[] {
  const requiredArrays = ["requested", "parentGrant", "effective", "denied", "clipped", "gatedBlocked"];
  if (typeof record.ts !== "string" || typeof record.parentId !== "string" || typeof record.childId !== "string" ||
      !Number.isInteger(record.depth) || typeof record.blocked !== "boolean" || typeof record.executor !== "string" ||
      requiredArrays.some((field) => !Array.isArray(record[field]) || !(record[field] as unknown[]).every((value) => typeof value === "string"))) {
    throw new Error(`invalid unversioned pi-daddy grant record at line ${index + 1}; expected the 0.17 GrantRecord shape`);
  }
  const requested = record.requested as string[];
  const effective = record.effective as string[];
  const denied = record.denied as string[];
  const gated = record.gatedBlocked as string[];
  const digest = object(record.definitionDigest);
  const common = {
    event_version: TRAJECTORY_EVENT_VERSION,
    source: "pi-daddy-0.17",
    at: record.ts as string,
    parent_id: record.parentId as string,
    child_id: record.childId as string,
  } as const;
  const attributes = sanitizeAttributes({
    native_record: index + 1,
    depth: record.depth,
    agent_type: record.agentType,
    executor: record.executor,
    parent_grant: record.parentGrant,
    clipped: record.clipped,
    gated_blocked: gated,
    gate_outcome: record.gateOutcome,
    human_denied: record.humanDenied === true,
    reason: record.reason,
    definition_name: digest?.name,
    legacy_schema: "pi-daddy-grant-ledger/0.17",
  });
  const refusal = record.blocked ? legacyRefusalCode(record) : undefined;
  const spawn: Omit<TrajectoryEventV1, "seq"> = cleanEvent({
    ...common,
    type: record.blocked ? "child_spawn_refused" : "child_started",
    requested_capabilities: requested,
    effective_capabilities: effective,
    refusal_code: refusal,
    digests: anyDefined({ definition: string(digest?.sha256) }),
    attributes,
  }) as Omit<TrajectoryEventV1, "seq">;
  const events: Omit<TrajectoryEventV1, "seq">[] = [
    ...requested.map((capability) => ({ ...common, type: "capability_requested", capability, requested_capabilities: requested, effective_capabilities: effective, attributes })),
    ...effective.map((capability) => ({ ...common, type: "capability_granted", capability, requested_capabilities: requested, effective_capabilities: effective, attributes })),
    ...[...new Set([...denied, ...gated])].map((capability) => ({ ...common, type: "capability_refused", capability, requested_capabilities: requested, effective_capabilities: effective, refusal_code: denied.includes(capability) ? "CAPABILITY_ESCALATION" : refusal, attributes })),
  ];
  const sources = object(record.approvalSources);
  const scopes = object(record.approvalScopes);
  for (const capability of stringArray(record.approved) ?? []) {
    events.push(cleanEvent({
      ...common,
      type: "approval_used",
      capability,
      approval: {
        capability,
        source: string(sources?.[capability]) ?? string(record.approvalSource),
        scope: string(scopes?.[capability]) ?? string(record.approvalScope),
        used_at: record.ts as string,
      },
      attributes,
    }) as Omit<TrajectoryEventV1, "seq">);
  }
  events.push(spawn);
  return events;
}

function normalizePiDaddyV1(record: Record<string, unknown>, seq: number, index: number): TrajectoryEventV1 {
  const recordType = string(record.record_type);
  const action = string(record.action);
  if (!recordType || !action || !string(record.ts)) throw new Error(`invalid pi-daddy governance v1 record at line ${index + 1}: record_type, action, and ts are required`);
  let type: string;
  if (recordType === "writer_lease") {
    if (!new Set(["acquired", "refused", "conflict", "released"]).has(action)) throw new Error(`invalid writer_lease action ${JSON.stringify(action)} at line ${index + 1}`);
    type = action === "conflict" ? "writer_lease_conflict" : `writer_lease_${action}`;
  } else if (recordType === "approval") {
    if (!new Set(["granted", "used", "refused"]).has(action)) throw new Error(`invalid approval action ${JSON.stringify(action)} at line ${index + 1}`);
    type = `approval_${action}`;
  } else if (recordType === "child_lifecycle") {
    if (!new Set(["started", "completed", "refused"]).has(action)) throw new Error(`invalid child_lifecycle action ${JSON.stringify(action)} at line ${index + 1}`);
    type = action === "refused" ? "child_spawn_refused" : `child_${action}`;
  } else if (recordType === "capability") {
    if (!new Set(["requested", "granted", "refused"]).has(action)) throw new Error(`invalid capability action ${JSON.stringify(action)} at line ${index + 1}`);
    type = `capability_${action}`;
  } else {
    throw new Error(`unsupported pi-daddy governance v1 record_type ${JSON.stringify(recordType)} at line ${index + 1}`);
  }
  return cleanEvent({
    event_version: TRAJECTORY_EVENT_VERSION,
    seq,
    type,
    source: "pi-daddy-v1",
    at: string(record.ts),
    run_id: string(record.run_id),
    task_id: string(record.task_id),
    workspace_id: string(record.workspace_id),
    context_id: string(record.context_id),
    parent_id: string(record.parent_id),
    child_id: string(record.child_id),
    capability: string(record.capability),
    requested_capabilities: stringArray(record.requested),
    effective_capabilities: stringArray(record.effective),
    refusal_code: string(record.refusal_code),
    digests: anyDefined({ task: string(record.task_digest), definition: string(record.definition_digest) }),
    approval: recordType === "approval" ? cleanObject({
      id: string(record.approval_id),
      capability: string(record.capability),
      subject: string(record.subject),
      source: string(record.source),
      scope: string(record.scope),
      approved_at: string(record.approved_at),
      expires_at: string(record.expires_at),
      used_at: string(record.used_at),
    }) : undefined,
    attributes: sanitizeAttributes(without(record, ["schema_version", "record_type", "ts", "action", "run_id", "task_id", "workspace_id", "context_id", "parent_id", "child_id", "capability", "requested", "effective", "refusal_code", "task_digest", "definition_digest", "approval_id", "subject", "source", "scope", "approved_at", "expires_at", "used_at"])),
  });
}

function legacyRefusalCode(record: Record<string, unknown>): string {
  const denied = stringArray(record.denied) ?? [];
  const gated = stringArray(record.gatedBlocked) ?? [];
  const reason = string(record.reason) ?? "";
  if (denied.length) return "CAPABILITY_ESCALATION";
  if (/declares no `allowed-tools`/i.test(reason)) return "UNDECLARED_CAPABILITIES";
  if (/unknown capabilit/i.test(reason)) return "UNKNOWN_CAPABILITY";
  if (/depth limit/i.test(reason)) return "DEPTH_LIMIT";
  if (/needs a task/i.test(reason)) return "MISSING_TASK";
  if (/universal capability|cannot narrow/i.test(reason)) return "NON_NARROWING_GRANT";
  if (gated.length) {
    if (record.humanDenied === true || record.gateOutcome === "declined") return "APPROVAL_DECLINED";
    if (record.gateOutcome === "no-ui") return "APPROVAL_NO_UI";
    if (record.gateOutcome === "dismissed") return "APPROVAL_DISMISSED";
    if (record.gateOutcome === "error") return "APPROVAL_ERROR";
    return "APPROVAL_REQUIRED";
  }
  return "LEGACY_UNCLASSIFIED";
}

function validatePrincipalIntegrity(records: Record<string, unknown>[]): void {
  let previous: string | null = null;
  let previousTime: number | null = null;
  let runId: string | null = null;
  records.forEach((record, index) => {
    const line = index + 1;
    if (record.schema_version !== "1.0") {
      throw new Error(`unsupported principal assurance schema version ${JSON.stringify(record.schema_version)} at line ${line}; expected "1.0"`);
    }
    if (record.seq !== line) throw new Error(`principal assurance integrity failure at line ${line}: sequence mismatch`);
    if (index === 0 && record.type !== "run_initialized") throw new Error("principal assurance integrity failure: first event must initialize the run");
    if (typeof record.run_id !== "string" || !record.run_id) throw new Error(`principal assurance integrity failure at line ${line}: run_id is missing`);
    if (runId === null) runId = record.run_id;
    else if (record.run_id !== runId) throw new Error(`principal assurance integrity failure at line ${line}: run_id changed`);
    if (record.prev_digest !== previous) throw new Error(`principal assurance integrity failure at line ${line}: previous digest mismatch`);
    if (typeof record.event_digest !== "string" || !/^[a-f0-9]{64}$/i.test(record.event_digest)) {
      throw new Error(`principal assurance integrity failure at line ${line}: event_digest is invalid`);
    }
    const copy = { ...record };
    delete copy.event_digest;
    const expected = createHash("sha256").update(canonicalJson(copy)).digest("hex");
    if (record.event_digest !== expected) throw new Error(`principal assurance integrity failure at line ${line}: event digest mismatch`);
    if (!validTime(typeof record.at === "string" ? record.at : undefined)) throw new Error(`invalid principal assurance v1 event at line ${line}: at must be a date-time`);
    const at = Date.parse(record.at as string);
    if (previousTime !== null && at < previousTime) throw new Error(`principal assurance integrity failure at line ${line}: timestamp moves backwards`);
    previousTime = at;
    previous = record.event_digest;
  });
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("principal assurance event contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("principal assurance event contains a non-JSON value");
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function validTime(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function sanitizeAttributes(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactArgs(value);
  const sensitiveKey = /(secret|token|password|passphrase|api[_-]?key|authorization|cookie|credential)/i;
  const freeTextKey = /^(request|command|stdout|stderr|output|prompt|content)$/i;
  const walk = (current: unknown, key = ""): unknown => {
    if (sensitiveKey.test(key)) return "[REDACTED]";
    if (typeof current === "string" && freeTextKey.test(key)) {
      return `[REDACTED sha256:${createHash("sha256").update(current).digest("hex")}]`;
    }
    if (Array.isArray(current)) return current.map((entry) => walk(entry));
    if (current && typeof current === "object") return Object.fromEntries(Object.entries(current as Record<string, unknown>).map(([childKey, entry]) => [childKey, walk(entry, childKey)]));
    return current;
  };
  return walk(redacted) as Record<string, unknown>;
}

function parseJsonl(text: string, label: string): Record<string, unknown>[] {
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.length) throw new Error(`${label} ledger is empty`);
  return lines.map((line, index) => {
    try {
      const value = JSON.parse(line) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record is not an object");
      return value as Record<string, unknown>;
    } catch (error) {
      throw new Error(`${label} ledger line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : error}`);
    }
  });
}
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function string(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function stringArray(value: unknown): string[] | undefined { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined; }
function anyDefined<T extends Record<string, unknown>>(value: T): T | undefined { return Object.values(value).some((entry) => entry !== undefined) ? value : undefined; }
function cleanObject<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T; }
function cleanEvent<T extends Record<string, unknown>>(event: T): T { return cleanObject(event); }
function without(record: Record<string, unknown>, keys: string[]): Record<string, unknown> { const omitted = new Set(keys); return Object.fromEntries(Object.entries(record).filter(([key, value]) => !omitted.has(key) && value !== undefined)); }
function walkFiles(root: string, relative = ""): string[] {
  const out: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try { entries = readdirSync(join(root, relative), { withFileTypes: true }) as never; }
  catch { return out; }
  for (const entry of entries as unknown as import("node:fs").Dirent[]) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(root, path));
    else if (entry.isFile()) out.push(path);
    // Symlinks are not followed: an event source is workspace-local evidence,
    // not a route for a spec to read an arbitrary host path.
  }
  return out;
}
