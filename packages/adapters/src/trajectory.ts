import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ExecutionTraceV1, TrajectoryEventSource, TrajectoryEventV1 } from "@skill-harness/core";
import { TRAJECTORY_EVENT_VERSION, deserializeTrajectoryEvents, matchesGlob, redactArgs, redactText } from "@skill-harness/core";

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
        if (times.every((time) => time !== null)) {
          const highWaterByStream = new Map<string, number>();
          for (let index = 0; index < times.length; index += 1) {
            const stream = source.adapter === "pi-daddy-v1" ? normalizedPiDaddyStreamKey(normalized[index], index) : "source";
            const highWater = highWaterByStream.get(stream);
            if (highWater !== undefined && times[index]! < highWater && !isAllowedPiDaddyReceiptInversion(source.adapter, normalized, index)) {
              throw new Error("native event timestamps move backwards relative to the source's recorded sequence");
            }
            highWaterByStream.set(stream, Math.max(highWater ?? times[index]!, times[index]!));
          }
        }
        streams.push({ file, adapter: source.adapter, events: normalized });
      } catch (error) {
        errors.push(`${source.adapter}:${file}: ${sanitizePersistedError(error)}`);
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
      throw new Error(`unsupported principal assurance schema version ${safeDiagnosticValue(record.schema_version)} at line ${index + 1}; expected \"1.0\"`);
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
 * Normalize pi-daddy's public ledgers: unversioned 0.17 GrantRecord lines and
 * ledgerVersion 2 runtime events emitted by 0.18.0. Version detection precedes
 * the legacy fallback so a new event can never be misdiagnosed as an old grant.
 */
export function normalizePiDaddyLedger(text: string): TrajectoryEventV1[] {
  const records = parseJsonl(text, "pi-daddy");
  validatePiDaddyTimestampOrder(records);
  const out: TrajectoryEventV1[] = [];
  let seq = 1;
  records.forEach((record, index) => {
    if (record.ledgerVersion !== undefined) {
      if (record.ledgerVersion !== 2) {
        throw new Error(`unsupported pi-daddy ledgerVersion ${safeDiagnosticValue(record.ledgerVersion)} at line ${index + 1}; expected 2 or an unversioned 0.17 GrantRecord`);
      }
      for (const event of normalizePiDaddyV2(record, index)) out.push({ ...event, seq: seq++ });
      return;
    }
    if (record.schema_version !== undefined) {
      throw new Error(`pi-daddy schema_version/record_type at line ${index + 1} is not a public pi-daddy ledger format; expected ledgerVersion 2 or an unversioned 0.17 GrantRecord`);
    }
    if (record.event !== undefined) {
      throw new Error(`pi-daddy event [REDACTED invalid value] at line ${index + 1} is missing explicit ledgerVersion 2`);
    }
    for (const event of normalizeLegacyGrant(record, index)) out.push({ ...event, seq: seq++ });
  });
  return out;
}

const V2_LEASE_OUTCOMES = new Set([
  "acquired", "uncontended", "refused", "released", "released-unrecorded", "lost", "retained", "timeout", "recovered",
]);
const V2_EXECUTORS = new Set(["process", "herdr"]);
const V2_RECEIPT_RELEASE_OUTCOMES = new Set(["released", "released-unrecorded", "lost", "timeout"]);
const NORMALIZED_RECEIPT_RELEASE_EVENTS = new Set([
  "writer_lease_released", "writer_lease_released_unrecorded", "writer_lease_lost", "writer_lease_timeout",
]);
const V2_CORRELATION_FIELDS = new Set([
  "schema_version", "run_id", "task_id", "workspace_id", "context_id", "phase", "assurance",
  "assurance_effective", "policy_label", "assurance_source", "assurance_scope", "activated_at",
  "plan_digest", "definition_digest", "task_digest", "base_sha", "head_sha", "tree_sha",
  "event_seq", "last_change_seq", "last_authority_seq", "check_receipt_id",
]);
const V2_CORRELATION_NUMERIC_FIELDS = new Set(["event_seq", "last_change_seq", "last_authority_seq"]);
const V2_APPROVAL_SOURCES = new Set(["prompt", "session", "persisted", "inherited"]);
const V2_APPROVAL_SCOPES = new Set(["once", "session", "always"]);
const V2_REFUSAL_CODES = new Set([
  "CAPABILITY_ESCALATION", "DEFINITION_NOT_AUTHORIZED", "UNDECLARED_TOOLS", "UNKNOWN_TOOL",
  "GATED_UNAPPROVED", "APPROVAL_EXPIRED", "APPROVAL_SCOPE_MISMATCH", "APPROVAL_FLOW_FAILED",
  "DEPTH_EXCEEDED", "FANOUT_EXCEEDED", "EXECUTOR_UNAVAILABLE", "CHILD_TIMED_OUT", "CHILD_CANCELLED",
  "CHILD_EXIT_NONZERO", "TASK_MISSING", "UNKNOWN_DEFINITION", "CEILING_PATTERNS_UNRESOLVED",
  "NARROWING_VIOLATED", "DEFINITION_UNREADABLE", "CORRELATION_TOO_LARGE", "CORRELATION_INVALID",
  "LEDGER_WRITE_FAILED", "FANOUT_FAILED", "WORKSPACE_NOT_REGISTERED", "WORKSPACE_WRITE_CONFLICT",
  "WORKSPACE_LEASE_STALE", "CHECK_NOT_CONFIGURED", "CHECK_CONFIGURATION_INVALID",
  "CHECK_IDENTITY_UNAVAILABLE", "CHECK_IDENTITY_MISMATCH",
]);
const V2_CORRELATION_MAX_BYTES = 32 * 1024;
const V2_CORRELATION_MAX_FIELD_CHARS = 512;
const V2_CORRELATION_MAX_SCOPE_BYTES = 4 * 1024;

function piDaddyStreamKey(record: Record<string, unknown>, index: number): string {
  if (record.ledgerVersion === undefined) return JSON.stringify(["legacy", string(record.childId) ?? `missing-child:${index}`]);
  const correlation = object(record.correlation);
  return JSON.stringify([
    string(correlation?.run_id) ?? `missing-run:${index}`,
    string(correlation?.task_id) ?? `missing-task:${index}`,
    string(record.workspaceId) ?? string(correlation?.workspace_id) ?? "",
    string(record.childId) ?? `missing-child:${index}`,
  ]);
}

function normalizedPiDaddyStreamKey(event: TrajectoryEventV1, index: number): string {
  if (event.source === "pi-daddy-0.17") return JSON.stringify(["legacy", event.child_id ?? `missing-child:${index}`]);
  const correlation = object(event.attributes?.correlation);
  return JSON.stringify([
    event.run_id ?? `missing-run:${index}`,
    event.task_id ?? `missing-task:${index}`,
    event.workspace_id ?? string(correlation?.workspace_id) ?? "",
    event.child_id ?? `missing-child:${index}`,
  ]);
}

function sameRawCorrelationIdentity(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftCorrelation = object(left.correlation);
  const rightCorrelation = object(right.correlation);
  return string(leftCorrelation?.run_id) === string(rightCorrelation?.run_id) &&
    string(leftCorrelation?.task_id) === string(rightCorrelation?.task_id);
}

function validatePiDaddyTimestampOrder(records: Record<string, unknown>[]): void {
  const highWaterByChild = new Map<string, number>();
  records.forEach((record, index) => {
    const supportedV2 = record.ledgerVersion === 2;
    const legacy = record.ledgerVersion === undefined && record.schema_version === undefined && record.event === undefined;
    if (!supportedV2 && !legacy) return;
    const at = string(record.ts);
    if (!validTime(at)) throw new Error(`invalid pi-daddy ledger timestamp at line ${index + 1}: ts must be a date-time`);
    const time = Date.parse(at!);
    const child = piDaddyStreamKey(record, index);
    const highWater = highWaterByChild.get(child);
    if (highWater !== undefined && time < highWater && !isRawPiDaddyReceiptInversion(records, index, time)) {
      throw new Error(`pi-daddy ledger timestamp moves backwards at line ${index + 1}`);
    }
    highWaterByChild.set(child, Math.max(highWater ?? time, time));
  });
}

function isRawPiDaddyReceiptInversion(records: Record<string, unknown>[], index: number, receiptTime: number): boolean {
  const receipt = records[index];
  const release = records[index - 1];
  if (receipt?.ledgerVersion !== 2 || receipt.event !== "check_receipt" || release?.ledgerVersion !== 2 || release.event !== "workspace_lease") return false;
  if (receipt.childId !== release.childId || receipt.workspaceId !== release.workspaceId || !sameRawCorrelationIdentity(receipt, release) || !V2_RECEIPT_RELEASE_OUTCOMES.has(string(release.outcome) ?? "")) return false;
  const previousLease = records.slice(0, index - 1).reverse().find((record) =>
    record.ledgerVersion === 2 && record.event === "workspace_lease" && record.childId === receipt.childId &&
    record.workspaceId === receipt.workspaceId && sameRawCorrelationIdentity(receipt, record),
  );
  return Boolean(
    previousLease && new Set(["acquired", "recovered"]).has(string(previousLease.outcome) ?? "") &&
    validTime(string(previousLease.ts)) && Date.parse(string(previousLease.ts)!) <= receiptTime,
  );
}

function isAllowedPiDaddyReceiptInversion(
  adapter: TrajectoryEventSource["adapter"],
  events: TrajectoryEventV1[],
  index: number,
): boolean {
  if (adapter !== "pi-daddy-v1") return false;
  const receipt = events[index];
  const release = events[index - 1];
  if (receipt?.type !== "check_receipt_recorded" || !NORMALIZED_RECEIPT_RELEASE_EVENTS.has(release?.type)) return false;
  if (receipt.child_id !== release.child_id || receipt.workspace_id !== release.workspace_id || receipt.run_id !== release.run_id || receipt.task_id !== release.task_id || !validTime(receipt.at)) return false;
  const receiptTime = Date.parse(receipt.at!);
  const previousLease = events.slice(0, index - 1).reverse().find((event) =>
    event.attributes?.native_event === "workspace_lease" && event.child_id === receipt.child_id &&
    event.workspace_id === receipt.workspace_id && event.run_id === receipt.run_id && event.task_id === receipt.task_id,
  );
  return Boolean(
    previousLease && new Set(["writer_lease_acquired", "writer_lease_recovered"]).has(previousLease.type) &&
    validTime(previousLease.at) && Date.parse(previousLease.at!) <= receiptTime,
  );
}

function normalizePiDaddyV2(record: Record<string, unknown>, index: number): Omit<TrajectoryEventV1, "seq">[] {
  const line = index + 1;
  const nativeEvent = string(record.event);
  if (!nativeEvent || !new Set(["capability_decision", "workspace_lease", "child_lifecycle", "check_receipt"]).has(nativeEvent)) {
    throw new Error(`invalid pi-daddy v2 event at line ${line}: event must be capability_decision, workspace_lease, child_lifecycle, or check_receipt`);
  }
  const at = requireV2String(record, "ts", nativeEvent, line);
  const childId = requireV2String(record, "childId", nativeEvent, line);
  const correlation = requireV2Correlation(record, nativeEvent, line);
  const carriesTopWorkspace = nativeEvent === "workspace_lease" || nativeEvent === "check_receipt";
  if (!carriesTopWorkspace && record.workspaceId !== undefined) {
    throw new Error(`invalid pi-daddy v2 ${nativeEvent} at line ${line}: workspaceId is not part of the public variant`);
  }
  const topWorkspace = carriesTopWorkspace ? string(record.workspaceId) : undefined;
  const correlationWorkspace = string(correlation.workspace_id);
  if (topWorkspace && correlationWorkspace && topWorkspace !== correlationWorkspace) {
    throw new Error(`invalid pi-daddy v2 ${nativeEvent} at line ${line}: workspaceId disagrees with correlation.workspace_id`);
  }

  if (nativeEvent !== "capability_decision" && (record.taskDigest !== undefined || record.definitionDigest !== undefined)) {
    throw new Error(`invalid pi-daddy v2 ${nativeEvent} at line ${line}: taskDigest and definitionDigest belong only to capability_decision`);
  }
  const definition = nativeEvent === "capability_decision" ? object(record.definitionDigest) : undefined;
  const trustedTask = nativeEvent === "capability_decision" ? string(record.taskDigest) : undefined;
  const trustedDefinition = nativeEvent === "capability_decision" ? string(definition?.sha256) : undefined;
  const common = {
    event_version: TRAJECTORY_EVENT_VERSION,
    source: "pi-daddy-v2",
    at,
    run_id: string(correlation.run_id),
    task_id: string(correlation.task_id),
    // correlation.workspace_id is a controller-supplied join label, not proof that
    // pi-daddy resolved or leased that workspace. Only a top-level runtime identity
    // is promoted into the adapter-neutral authoritative-looking field.
    workspace_id: topWorkspace,
    context_id: string(correlation.context_id),
    child_id: childId,
    phase: string(correlation.phase),
    digests: anyDefined({
      task: trustedTask,
      definition: trustedDefinition,
      correlation_plan: string(correlation.plan_digest),
      correlation_task: string(correlation.task_digest),
      correlation_definition: string(correlation.definition_digest),
      correlation_base: string(correlation.base_sha),
      correlation_head: string(correlation.head_sha),
      correlation_tree: string(correlation.tree_sha),
    }),
  } as const;
  const commonAttributes = safeAttributes({
    ledger_version: 2,
    native_event: nativeEvent,
    correlation: sanitizeAttributes(correlation),
    event_seq: finiteNumber(correlation.event_seq),
    last_change_seq: finiteNumber(correlation.last_change_seq),
    last_authority_seq: finiteNumber(correlation.last_authority_seq),
    check_receipt_id: string(correlation.check_receipt_id),
    assurance: string(correlation.assurance),
    assurance_effective: string(correlation.assurance_effective),
    policy_label: string(correlation.policy_label),
    assurance_source: string(correlation.assurance_source),
    assurance_scope: correlation.assurance_scope,
    activated_at: string(correlation.activated_at),
  });

  if (nativeEvent === "capability_decision") {
    if (record.definitionDigest !== undefined && (
      !definition || !string(definition.name) || !string(definition.source) || !trustedDefinition || !/^[a-fA-F0-9]{64}$/.test(trustedDefinition)
    )) {
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: definitionDigest requires non-empty name, source, and sha256`);
    }
    const parentId = requireV2String(record, "parentId", nativeEvent, line);
    const executor = requireV2Executor(record, nativeEvent, line);
    const taskDigest = requireV2String(record, "taskDigest", nativeEvent, line);
    if (!/^[a-fA-F0-9]{64}$/.test(taskDigest)) throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: taskDigest must be sha256`);
    if (!Number.isInteger(record.depth) || typeof record.blocked !== "boolean") {
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: depth and blocked are required`);
    }
    const requested = requireV2StringArray(record, "requested", nativeEvent, line);
    const parentGrant = requireV2StringArray(record, "parentGrant", nativeEvent, line);
    const effective = requireV2StringArray(record, "effective", nativeEvent, line);
    const denied = requireV2StringArray(record, "denied", nativeEvent, line);
    const clipped = requireV2StringArray(record, "clipped", nativeEvent, line);
    const gated = requireV2StringArray(record, "gatedBlocked", nativeEvent, line);
    const approved = optionalV2StringArray(record, "approved", nativeEvent, line);
    const agentType = optionalV2SafeString(record.agentType, "agentType", nativeEvent, line);
    const humanDenied = optionalV2Boolean(record, "humanDenied", nativeEvent, line);
    const refusal = structuredRefusal(record.refusal, nativeEvent, line);
    if (!record.blocked && refusal) throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: an allowed decision cannot carry a refusal`);
    validateCapabilityPartition(requested, effective, denied, clipped, gated, approved, Boolean(record.blocked), line);
    const approvalSource = optionalV2Enum(record.approvalSource, "approvalSource", V2_APPROVAL_SOURCES, nativeEvent, line);
    const approvalSources = optionalV2EnumMap(record.approvalSources, "approvalSources", V2_APPROVAL_SOURCES, nativeEvent, line);
    const approvalScope = optionalV2Enum(record.approvalScope, "approvalScope", V2_APPROVAL_SCOPES, nativeEvent, line);
    const approvalScopes = optionalV2EnumMap(record.approvalScopes, "approvalScopes", V2_APPROVAL_SCOPES, nativeEvent, line);
    const approvalExpiresAt = optionalV2StringMap(record.approvalExpiresAt, "approvalExpiresAt", nativeEvent, line, validTime);
    const approvalUses = optionalV2ApprovalUses(record.approvalUses, nativeEvent, line);
    validateApprovalEvidence(approved ?? [], approvalSource, approvalSources, approvalScopes, approvalExpiresAt, approvalUses, line);
    const normalizedRequested = [...new Set(requested)];
    const attributes = safeAttributes({
      ...commonAttributes,
      depth: record.depth,
      agent_type: agentType,
      native_requested: normalizedRequested.length === requested.length ? undefined : requested,
      executor,
      task_from: string(record.taskFrom),
      parent_grant: parentGrant,
      denied,
      clipped,
      gated_blocked: gated,
      blocked: record.blocked,
      reason: string(record.reason),
      approved,
      approval_source: approvalSource,
      approval_sources: approvalSources,
      approval_scope: approvalScope,
      approval_scopes: approvalScopes,
      approval_expires_at: approvalExpiresAt,
      approval_uses: approvalUses,
      human_denied: humanDenied,
      gate_outcome: string(record.gateOutcome),
      definition_name: string(definition?.name),
      definition_source: string(definition?.source),
      structured_refusal: refusal,
    });
    const base = { ...common, parent_id: parentId, requested_capabilities: normalizedRequested, effective_capabilities: effective, attributes };
    const refusalCode = string(refusal?.code);
    const events: Omit<TrajectoryEventV1, "seq">[] = [
      ...normalizedRequested.map((capability) => ({ ...base, type: "capability_requested", capability })),
    ];
    const sources = approvalSources;
    const scopes = approvalScopes;
    const expiries = approvalExpiresAt;
    const uses = approvalUses;
    for (const capability of approved ?? []) {
      events.push(cleanEvent({
        ...base,
        type: "approval_used",
        capability,
        approval: cleanObject({
          capability,
          subject: approvalSubject(agentType),
          source: string(sources?.[capability]) ?? string(record.approvalSource),
          scope: string(scopes?.[capability]) ?? string(record.approvalScope),
          expires_at: string(expiries?.[capability]),
          used_at: at,
        }),
        attributes: safeAttributes({ ...attributes, approval_uses: object(uses?.[capability]) }),
      }) as Omit<TrajectoryEventV1, "seq">);
    }
    const approvedSet = new Set(approved ?? []);
    events.push(
      ...(record.blocked ? [] : effective.map((capability) => ({ ...base, type: "capability_granted", capability }))),
      ...[...new Set([...denied, ...gated.filter((capability) => !approvedSet.has(capability))])].map((capability) => ({
        ...base,
        type: "capability_refused",
        capability,
        refusal_code: denied.includes(capability) ? "CAPABILITY_ESCALATION" : refusalCode,
      })),
    );
    events.push(cleanEvent({
      ...base,
      type: record.blocked ? "child_spawn_refused" : "capability_decision",
      refusal_code: refusalCode,
    }) as Omit<TrajectoryEventV1, "seq">);
    return events;
  }

  if (nativeEvent === "workspace_lease") {
    const workspaceId = requireV2String(record, "workspaceId", nativeEvent, line);
    requireV2String(record, "root", nativeEvent, line);
    const access = requireV2String(record, "access", nativeEvent, line);
    const outcome = requireV2String(record, "outcome", nativeEvent, line);
    if (!new Set(["read", "write"]).has(access) || !V2_LEASE_OUTCOMES.has(outcome)) {
      throw new Error(`invalid pi-daddy v2 workspace_lease at line ${line}: access or outcome is unsupported`);
    }
    if (record.recovered !== undefined && typeof record.recovered !== "boolean" && record.recovered !== "unknown") {
      throw new Error(`invalid pi-daddy v2 workspace_lease at line ${line}: recovered must be boolean or \"unknown\"`);
    }
    const refusal = structuredRefusal(record.refusal, nativeEvent, line);
    const type = access === "read"
      ? `workspace_read_${outcome.replaceAll("-", "_")}`
      : outcome === "refused" && refusal?.code === "WORKSPACE_WRITE_CONFLICT"
        ? "writer_lease_conflict"
        : `writer_lease_${outcome.replaceAll("-", "_")}`;
    return [cleanEvent({
      ...common,
      workspace_id: workspaceId,
      type,
      refusal_code: string(refusal?.code),
      attributes: safeAttributes({
        ...commonAttributes,
        root: string(record.root),
        access,
        outcome,
        recovered: record.recovered,
        release_reason: string(record.releaseReason),
        structured_refusal: refusal,
      }),
    }) as Omit<TrajectoryEventV1, "seq">];
  }

  if (nativeEvent === "child_lifecycle") {
    const state = requireV2String(record, "state", nativeEvent, line);
    const executor = requireV2Executor(record, nativeEvent, line);
    if (!new Set(["starting", "completed", "failed"]).has(state)) {
      throw new Error(`invalid pi-daddy v2 child_lifecycle at line ${line}: state is unsupported`);
    }
    if (record.exitCode !== undefined && record.exitCode !== null && !Number.isInteger(record.exitCode)) {
      throw new Error(`invalid pi-daddy v2 child_lifecycle at line ${line}: exitCode must be an integer or null`);
    }
    const timedOut = optionalV2Boolean(record, "timedOut", nativeEvent, line);
    const aborted = optionalV2Boolean(record, "aborted", nativeEvent, line);
    const truncated = optionalV2Boolean(record, "truncated", nativeEvent, line);
    const type = state === "starting" ? "child_started" : state === "completed" ? "child_completed" : "child_failed";
    return [cleanEvent({
      ...common,
      type,
      exit_code: Number.isInteger(record.exitCode) ? Number(record.exitCode) : undefined,
      attributes: safeAttributes({
        ...commonAttributes,
        state,
        executor,
        exit_code: record.exitCode,
        signal: record.signal,
        timed_out: timedOut,
        aborted,
        truncated,
        reason: string(record.reason),
      }),
    }) as Omit<TrajectoryEventV1, "seq">];
  }

  const workspaceId = requireV2String(record, "workspaceId", nativeEvent, line);
  const receiptId = requireV2String(record, "receiptId", nativeEvent, line);
  if (!/^[a-fA-F0-9]{64}$/.test(receiptId)) {
    throw new Error(`invalid pi-daddy v2 check_receipt at line ${line}: receiptId must be sha256`);
  }
  const checkId = requireV2String(record, "checkId", nativeEvent, line);
  const treeSha = requireV2String(record, "treeSha", nativeEvent, line);
  if (!/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$/.test(treeSha)) {
    throw new Error(`invalid pi-daddy v2 check_receipt at line ${line}: treeSha must be a git object id`);
  }
  const correlationTree = string(correlation.tree_sha);
  if (correlationTree && correlationTree !== treeSha) {
    throw new Error(`invalid pi-daddy v2 check_receipt at line ${line}: treeSha and correlation.tree_sha disagree`);
  }
  return [cleanEvent({
    ...common,
    workspace_id: workspaceId,
    type: "check_receipt_recorded",
    digests: { ...(common.digests ?? {}), tree: treeSha },
    attributes: safeAttributes({
      ...commonAttributes,
      receipt_id: receiptId,
      check_id: checkId,
      check_receipt_id: string(correlation.check_receipt_id),
    }),
  }) as Omit<TrajectoryEventV1, "seq">];
}

function requireV2Correlation(record: Record<string, unknown>, event: string, line: number): Record<string, unknown> {
  const correlation = object(record.correlation);
  if (!correlation) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation.run_id and correlation.task_id are required for workflow joins`);
  }
  const encoded = JSON.stringify(correlation);
  if (Buffer.byteLength(encoded) > V2_CORRELATION_MAX_BYTES) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation exceeds ${V2_CORRELATION_MAX_BYTES} bytes`);
  }
  const undeclared = Object.keys(correlation).filter((key) => !V2_CORRELATION_FIELDS.has(key));
  if (undeclared.length > 0) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation carries fields outside the pinned schema 1.0 contract [REDACTED field names]`);
  }
  for (const [key, value] of Object.entries(correlation)) {
    if (value === undefined || value === null) continue;
    if (key === "assurance_scope") {
      const size = Buffer.byteLength(JSON.stringify(value));
      if (size > V2_CORRELATION_MAX_SCOPE_BYTES) {
        throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation assurance_scope exceeds ${V2_CORRELATION_MAX_SCOPE_BYTES} bytes`);
      }
      continue;
    }
    if (V2_CORRELATION_NUMERIC_FIELDS.has(key)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} must be a finite number`);
      }
      continue;
    }
    if (typeof value !== "string") {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} must be a string`);
    }
    if (value.length > V2_CORRELATION_MAX_FIELD_CHARS) {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} exceeds ${V2_CORRELATION_MAX_FIELD_CHARS} characters`);
    }
    if (redactText(value) !== value) {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation ${key} contains a sensitive value`);
    }
  }
  if (!string(correlation.run_id) || !string(correlation.task_id)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: correlation.run_id and correlation.task_id are required for workflow joins`);
  }
  return Object.fromEntries(Object.entries(correlation).filter(([, value]) => value !== undefined && value !== null));
}

function requireV2String(record: Record<string, unknown>, field: string, event: string, line: number): string {
  const value = string(record[field]);
  if (!value) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} is required`);
  if (redactText(value) !== value) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} contains a sensitive value`);
  return value;
}

function requireV2Executor(record: Record<string, unknown>, event: string, line: number): string {
  const executor = requireV2String(record, "executor", event, line);
  if (!V2_EXECUTORS.has(executor)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: executor must be process or herdr`);
  }
  return executor;
}

function requireV2StringArray(record: Record<string, unknown>, field: string, event: string, line: number): string[] {
  const value = stringArray(record[field]);
  if (!value) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be an array of strings`);
  if (value.some((entry) => redactText(entry) !== entry)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} contains a sensitive value`);
  }
  return value;
}

function optionalV2StringArray(record: Record<string, unknown>, field: string, event: string, line: number): string[] | undefined {
  if (record[field] === undefined) return undefined;
  return requireV2StringArray(record, field, event, line);
}

function optionalV2SafeString(value: unknown, field: string, event: string, line: number): string | undefined {
  if (value === undefined) return undefined;
  const parsed = string(value);
  if (!parsed) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be a non-empty string`);
  if (redactText(parsed) !== parsed) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} contains a sensitive value`);
  return parsed;
}

function optionalV2Enum(value: unknown, field: string, allowed: Set<string>, event: string, line: number): string | undefined {
  if (value === undefined) return undefined;
  const parsed = string(value);
  if (!parsed || !allowed.has(parsed)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be one of ${[...allowed].join(", ")}`);
  }
  return parsed;
}

function optionalV2EnumMap(value: unknown, field: string, allowed: Set<string>, event: string, line: number): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const parsed = object(value);
  if (!parsed) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be an object`);
  const entries = Object.entries(parsed);
  if (entries.some(([key, entry]) => !key || typeof entry !== "string" || !allowed.has(entry))) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} values must be one of ${[...allowed].join(", ")}`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function optionalV2StringMap(
  value: unknown,
  field: string,
  event: string,
  line: number,
  validate: (value: string) => boolean = () => true,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const parsed = object(value);
  if (!parsed) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be an object`);
  const entries = Object.entries(parsed);
  if (entries.some(([key, entry]) => !key || typeof entry !== "string" || !validate(entry))) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must map capabilities to valid strings`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

function optionalV2ApprovalUses(value: unknown, event: string, line: number): Record<string, { max: number; remaining: number }> | undefined {
  if (value === undefined) return undefined;
  const parsed = object(value);
  if (!parsed) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: approvalUses must be an object`);
  const output: Record<string, { max: number; remaining: number }> = {};
  for (const [capability, boundsValue] of Object.entries(parsed)) {
    const bounds = object(boundsValue);
    if (!capability || !bounds || !Number.isInteger(bounds.max) || !Number.isInteger(bounds.remaining) ||
        Number(bounds.max) < 0 || Number(bounds.remaining) < 0 || Number(bounds.remaining) > Number(bounds.max)) {
      throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: approvalUses requires integer max/remaining bounds`);
    }
    output[capability] = { max: Number(bounds.max), remaining: Number(bounds.remaining) };
  }
  return output;
}

function validateCapabilityPartition(
  requested: string[], effective: string[], denied: string[], clipped: string[], gated: string[], approved: string[] | undefined,
  blocked: boolean, line: number,
): void {
  const groups = [effective, denied, clipped, gated];
  if (groups.some((values) => new Set(values).size !== values.length)) {
    throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: result capability arrays must not contain duplicates`);
  }
  const requestedSet = new Set(requested);
  if (groups.some((values) => values.some((capability) => !requestedSet.has(capability)))) {
    throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: effective, denied, clipped, and gatedBlocked must partition requested`);
  }
  const flattened = groups.flat();
  if (new Set(flattened).size !== flattened.length) {
    throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: effective, denied, clipped, and gatedBlocked must be disjoint subsets of requested`);
  }
  if ((approved ?? []).some((capability) =>
    !requestedSet.has(capability) || (blocked ? !effective.includes(capability) && !gated.includes(capability) : !effective.includes(capability))
  )) {
    throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: approved capabilities must be requested and reflected in the resolved decision`);
  }
}

function validateApprovalEvidence(
  approved: string[], scalarSource: string | undefined, sources: Record<string, string> | undefined,
  scopes: Record<string, string> | undefined, expiries: Record<string, string> | undefined,
  uses: Record<string, { max: number; remaining: number }> | undefined, line: number,
): void {
  const approvedSet = new Set(approved);
  for (const [field, map] of [["approvalSources", sources], ["approvalScopes", scopes], ["approvalExpiresAt", expiries], ["approvalUses", uses]] as const) {
    if (map && Object.keys(map).some((capability) => !approvedSet.has(capability))) {
      throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: ${field} keys must be approved capabilities`);
    }
  }
  if (approved.some((capability) => !sources?.[capability] && !scalarSource)) {
    throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: each approved capability requires an approval source`);
  }
  if (approved.length === 0 && (scalarSource || sources || scopes || expiries || uses)) {
    throw new Error(`invalid pi-daddy v2 capability_decision at line ${line}: approval evidence requires approved capabilities`);
  }
}

function optionalV2Boolean(record: Record<string, unknown>, field: string, event: string, line: number): boolean | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: ${field} must be boolean`);
  return value;
}

function approvalSubject(value: unknown): string {
  const agentType = string(value);
  return agentType === undefined || agentType === "delegate" ? "<delegate>" : agentType;
}

function structuredRefusal(value: unknown, event: string, line: number): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  const parsed = object(value);
  const code = string(parsed?.code);
  if (!parsed || !code || !string(parsed.message)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: refusal requires code and message`);
  }
  if (!V2_REFUSAL_CODES.has(code)) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: refusal has unsupported code ${safeDiagnosticValue(code)}`);
  }
  const unknown = Object.keys(parsed).filter((key) => !new Set(["code", "message", "details"]).has(key));
  if (unknown.length > 0) throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: refusal carries unsupported fields`);
  const details = parsed.details === undefined ? undefined : object(parsed.details);
  if (parsed.details !== undefined && (!details || Object.values(details).some((entry) => !["string", "number", "boolean"].includes(typeof entry) && entry !== null))) {
    throw new Error(`invalid pi-daddy v2 ${event} at line ${line}: refusal.details must contain scalar values`);
  }
  return parsed;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
      throw new Error(`unsupported principal assurance schema version ${safeDiagnosticValue(record.schema_version)} at line ${line}; expected "1.0"`);
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

function safeDiagnosticValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value) && redactText(value) === value) return JSON.stringify(value);
  return "[REDACTED invalid value]";
}

function sanitizePersistedError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactText(raw)
    .replace(/("?(?:password|passwd|secret|token|api[-_]?key|authorization|credential)"?\s*[:=]\s*"?)[^\s,}"']+/gi, "$1[REDACTED]")
    .slice(0, 1_000);
}

function sanitizeAttributes(value: Record<string, unknown>): Record<string, unknown> {
  const redacted = redactArgs(value);
  const sensitiveKey = /(secret|token|password|passphrase|api[_-]?key|authorization|cookie|credential)/i;
  const freeTextKey = /^(request|command|stdout|stderr|output|prompt|content|reason|message|release_reason|diagnostic)$/i;
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
      throw new Error(`${label} ledger line ${index + 1} is invalid JSON [REDACTED parser detail]`);
    }
  });
}
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function string(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function stringArray(value: unknown): string[] | undefined { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined; }
function anyDefined<T extends Record<string, unknown>>(value: T): T | undefined {
  const defined = cleanObject(value);
  return Object.keys(defined).length > 0 ? defined : undefined;
}
function cleanObject<T extends Record<string, unknown>>(value: T): T { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T; }
function safeAttributes<T extends Record<string, unknown>>(value: T): Record<string, unknown> { return sanitizeAttributes(cleanObject(value)); }
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
