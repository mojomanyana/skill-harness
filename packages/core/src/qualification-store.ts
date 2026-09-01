import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import {
  qualificationLockOwnerIsLive,
  readQualificationLockOwner,
  reclaimQualificationLock,
  releaseQualificationLock,
  tryPublishQualificationLock,
  type QualificationLockIo,
} from "./qualification-lock.js";
import {
  QUALIFICATION_ACCOUNTING_POLICY,
  type QualificationArmV1,
  type QualificationConfigV1,
  type QualificationInvocationRequestV1,
  type QualificationRole,
  parseQualificationConfig,
  parseQualificationRequest,
  qualificationCanonicalJson,
  qualificationConfigDigest,
  qualificationSha256,
  verifyQualificationExecutable,
  verifyQualificationPins,
  verifyQualificationResource,
} from "./qualification-config.js";

export const QUALIFICATION_INVOCATION_VERSION = "qualification-invocation-v1" as const;
export const QUALIFICATION_LIFECYCLE_VERSION = "qualification-lifecycle-v1" as const;
export const QUALIFICATION_ACCOUNTING_VERSION = "qualification-accounting-v1" as const;
export type QualificationLifecyclePhase = "prepared" | "launch-claimed" | "running" | "terminal";
export type QualificationTerminalStatus = "completed" | "failed" | "timed-out" | "aborted" | "refused" | "invalid-artifact";

export interface QualificationInvocationV1 {
  schema_version: typeof QUALIFICATION_INVOCATION_VERSION;
  invocation_id: string;
  measurement_identity_sha256: string;
  continuation_authority_sha256: string;
  continuation_authority_expires_at: string;
  scenario: QualificationInvocationRequestV1["scenario"];
  role: QualificationRole;
  counts_as_measurement: boolean;
  arms: { subject: string; judge: string; selected: string };
  repetition: number;
  requested: { provider: string; model: string };
  authentication: QualificationArmV1["authentication"];
  pins: {
    product: QualificationConfigV1["product"];
    engine: QualificationConfigV1["engine"];
    producer: QualificationConfigV1["producer"];
    runner: QualificationConfigV1["runner"];
  };
  configuration_sha256: string;
  created_at: string;
  ceiling_policy: typeof QUALIFICATION_ACCOUNTING_POLICY;
  execution: {
    executable: QualificationArmV1["executable"];
    executable_identity: ReturnType<typeof verifyQualificationExecutable>;
    resources: QualificationArmV1["resources"];
    working_directory_identity: { realpath: string; device: number; inode: number };
    arguments: string[];
    allowed_environment_names: string[];
    timeout_ms: number;
    output_limit_bytes: number;
    fallback: false;
    metered_override: false;
  };
  expected_artifact: { path: string; type: "pi-jsonl" };
  /** Self-digest over every preceding field; detects accidental mutation. */
  invocation_sha256: string;
}

export interface QualificationLifecycleEvent {
  seq: number;
  from: QualificationLifecyclePhase | null;
  to: QualificationLifecyclePhase;
  terminal_status: QualificationTerminalStatus | null;
  at: string;
  detail: Record<string, unknown>;
  previous_sha256: string | null;
  event_sha256: string;
}

export interface QualificationLifecycleV1 {
  schema_version: typeof QUALIFICATION_LIFECYCLE_VERSION;
  invocation_id: string;
  phase: QualificationLifecyclePhase;
  terminal_status: QualificationTerminalStatus | null;
  events: QualificationLifecycleEvent[];
  chain_head: string;
}

export interface QualificationAccountingEventInput {
  invocation_id: string;
  role: QualificationRole;
  call_class: "subject" | "judge";
  counts_as_measurement: boolean;
  launched_at: string;
}
export interface QualificationAccountingEvent extends QualificationAccountingEventInput {
  seq: number;
  previous_sha256: string | null;
  event_sha256: string;
}
export interface QualificationAccountingLedgerV1 {
  schema_version: typeof QUALIFICATION_ACCOUNTING_VERSION;
  policy: typeof QUALIFICATION_ACCOUNTING_POLICY;
  events: QualificationAccountingEvent[];
  chain_head: string | null;
}
export interface QualificationAccountingReport {
  counts: { subject: number; judge: number; measurement: number; total: number };
  roles: Partial<Record<QualificationRole, number>>;
  chain_head: string | null;
}
export interface QualificationSpoolValidation {
  ok: true;
  configuration_sha256: string;
  invocations: number;
  accounting: QualificationAccountingReport;
}

export function qualificationSpoolPaths(spoolDir: string, invocationId?: string) {
  const root = resolve(spoolDir);
  const invocation = invocationId ? join(root, "invocations", invocationId) : undefined;
  return {
    root,
    configuration: join(root, "configuration.json"),
    accounting: join(root, "accounting.json"),
    lock: join(root, ".qualification.lock"),
    invocations: join(root, "invocations"),
    artifacts: join(root, "artifacts"),
    invocation,
    invocationRecord: invocation ? join(invocation, "invocation.json") : undefined,
    lifecycle: invocation ? join(invocation, "lifecycle.json") : undefined,
    invocationLock: invocation ? join(invocation, ".lock") : undefined,
    terminal: invocation ? join(invocation, "terminal") : undefined,
  };
}

export function prepareQualificationInvocation(options: {
  spool_dir: string;
  config_path: string;
  request_path: string;
  now?: () => string;
}): QualificationInvocationV1 {
  const config = parseQualificationConfig(parseJsonFile(options.config_path, "qualification configuration"));
  const request = parseQualificationRequest(parseJsonFile(options.request_path, "qualification invocation request"), config);
  verifyQualificationPins(config);
  const now = options.now ?? (() => new Date().toISOString());
  assertRegularInput(request.scenario.input_path, request.scenario.input_sha256);
  assertWorkingDirectory(request.scenario.working_directory);
  const paths = qualificationSpoolPaths(options.spool_dir, request.invocation_id);
  mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  assertDirectory(paths.root, "qualification spool");

  return withQualificationFileLock(paths.lock, () => {
    mkdirSync(paths.invocations, { recursive: true, mode: 0o700 });
    mkdirSync(paths.artifacts, { recursive: true, mode: 0o700 });
    const configSha = qualificationConfigDigest(config);
    initializeSpoolConfiguration(paths.configuration, config, configSha);
    initializeAccounting(paths.accounting);
    const expectedArtifact = `artifacts/${request.invocation_id}.jsonl`;
    const artifactPath = join(paths.root, expectedArtifact);
    if (existsSync(artifactPath)) throw new Error(`qualification artifact path already exists: ${expectedArtifact}`);
    try {
      mkdirSync(paths.invocation!, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`duplicate invocation id ${request.invocation_id}`);
      throw error;
    }
    try {
      const selected = config.arms.find((arm) => arm.id === request.selected_arm)!;
      const executableIdentity = verifyQualificationExecutable(selected.executable);
      const preparedResources = selected.resources.map((resource, index) => {
        verifyQualificationResource(resource);
        const suffix = extname(resource.path).replace(/[^A-Za-z0-9.]/g, "");
        const path = join(paths.invocation!, "resources", `${String(index).padStart(4, "0")}${suffix}`);
        atomicWriteBytes(path, readFileSync(resource.path), true);
        return { ...resource, path };
      });
      const workingStat = lstatSync(request.scenario.working_directory);
      const workingDirectoryIdentity = { realpath: realpathSync(request.scenario.working_directory), device: workingStat.dev, inode: workingStat.ino };
      // Snapshot the already-digested private input before publishing the immutable
      // invocation record. The child never races a later edit to the coordinator's
      // source path; the spool copy is the launch material bound by input_sha256.
      const preparedInputPath = join(paths.invocation!, "input.bin");
      atomicWriteBytes(preparedInputPath, readFileSync(request.scenario.input_path), true);
      const baseRecord: Omit<QualificationInvocationV1, "invocation_sha256"> = {
        schema_version: QUALIFICATION_INVOCATION_VERSION,
        invocation_id: request.invocation_id,
        measurement_identity_sha256: request.measurement_identity_sha256,
        continuation_authority_sha256: request.continuation_authority_sha256,
        continuation_authority_expires_at: request.continuation_authority_expires_at,
        scenario: { ...structuredClone(request.scenario), input_path: preparedInputPath },
        role: request.role,
        counts_as_measurement: request.counts_as_measurement,
        arms: { subject: request.arms.subject, judge: request.arms.judge, selected: request.selected_arm },
        repetition: request.repetition,
        requested: { provider: selected.provider, model: selected.model },
        authentication: selected.authentication,
        pins: {
          product: structuredClone(config.product),
          engine: structuredClone(config.engine),
          producer: structuredClone(config.producer),
          runner: structuredClone(config.runner),
        },
        configuration_sha256: configSha,
        created_at: validTimestamp(now(), "qualification creation time"),
        ceiling_policy: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
        execution: {
          executable: structuredClone(selected.executable),
          executable_identity: executableIdentity,
          resources: preparedResources,
          working_directory_identity: workingDirectoryIdentity,
          arguments: [...selected.arguments],
          allowed_environment_names: [...selected.allowed_environment_names],
          timeout_ms: selected.timeout_ms,
          output_limit_bytes: selected.output_limit_bytes,
          fallback: false,
          metered_override: false,
        },
        expected_artifact: { path: expectedArtifact, type: "pi-jsonl" },
      };
      const record: QualificationInvocationV1 = {
        ...baseRecord,
        invocation_sha256: qualificationSha256(qualificationCanonicalJson(baseRecord)),
      };
      atomicWriteCanonical(paths.invocationRecord!, record, true);
      atomicWriteCanonical(paths.lifecycle!, createQualificationLifecycle(record.invocation_id, record.created_at), true);
      return record;
    } catch (error) {
      rmSync(paths.invocation!, { recursive: true, force: true });
      throw error;
    }
  });
}

export function readQualificationInvocation(spoolDir: string, invocationId: string): QualificationInvocationV1 {
  const path = qualificationSpoolPaths(spoolDir, invocationId).invocationRecord!;
  const value = readCanonicalJson(path, `qualification invocation ${invocationId}`) as QualificationInvocationV1;
  validateQualificationInvocationRecord(value);
  return value;
}

export function readQualificationLifecycle(spoolDir: string, invocationId: string): QualificationLifecycleV1 {
  const path = qualificationSpoolPaths(spoolDir, invocationId).lifecycle!;
  const value = readCanonicalJson(path, `qualification lifecycle ${invocationId}`);
  return validateQualificationLifecycle(value, invocationId);
}

export function writeQualificationLifecycle(spoolDir: string, lifecycle: QualificationLifecycleV1): void {
  validateQualificationLifecycle(lifecycle, lifecycle.invocation_id);
  atomicWriteCanonical(qualificationSpoolPaths(spoolDir, lifecycle.invocation_id).lifecycle!, lifecycle, false);
}

export function transitionQualificationLifecycle(
  lifecycle: QualificationLifecycleV1,
  to: QualificationLifecyclePhase,
  options: { at: string; terminal_status?: QualificationTerminalStatus | null; detail?: Record<string, unknown> },
): QualificationLifecycleV1 {
  validateQualificationLifecycle(lifecycle, lifecycle.invocation_id);
  const allowed: Record<QualificationLifecyclePhase, QualificationLifecyclePhase[]> = {
    prepared: ["launch-claimed", "terminal"],
    "launch-claimed": ["running", "terminal"],
    running: ["terminal"],
    terminal: [],
  };
  if (!allowed[lifecycle.phase].includes(to)) throw new Error(`illegal qualification lifecycle transition ${lifecycle.phase} -> ${to}`);
  const terminalStatus = to === "terminal" ? options.terminal_status ?? null : null;
  if (to === "terminal" && !terminalStatus) throw new Error("qualification terminal transition requires terminal_status");
  if (to !== "terminal" && options.terminal_status) throw new Error("qualification nonterminal transition cannot carry terminal_status");
  const base = {
    seq: lifecycle.events.length + 1,
    from: lifecycle.phase,
    to,
    terminal_status: terminalStatus,
    at: validTimestamp(options.at, "qualification lifecycle time"),
    detail: sanitizeDetail(options.detail ?? {}),
    previous_sha256: lifecycle.chain_head,
  };
  const event: QualificationLifecycleEvent = { ...base, event_sha256: qualificationSha256(qualificationCanonicalJson(base)) };
  return {
    ...lifecycle,
    phase: to,
    terminal_status: terminalStatus,
    events: [...lifecycle.events, event],
    chain_head: event.event_sha256,
  };
}

export function createQualificationAccountingLedger(): QualificationAccountingLedgerV1 {
  return {
    schema_version: QUALIFICATION_ACCOUNTING_VERSION,
    policy: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
    events: [],
    chain_head: null,
  };
}

export function appendQualificationAccountingEvent(
  inputLedger: QualificationAccountingLedgerV1,
  input: QualificationAccountingEventInput,
): QualificationAccountingLedgerV1 {
  const report = validateQualificationAccountingLedger(inputLedger);
  validateAccountingInput(input);
  if (inputLedger.events.some((event) => event.invocation_id === input.invocation_id)) {
    throw new Error(`duplicate invocation id ${input.invocation_id} in qualification accounting ledger`);
  }
  const next = report.counts[input.call_class] + 1;
  const ceiling = QUALIFICATION_ACCOUNTING_POLICY.ceilings[input.call_class];
  if (next > ceiling) throw new Error(`qualification ${input.call_class} ceiling ${ceiling} would be exceeded before launch claim`);
  const base = {
    seq: inputLedger.events.length + 1,
    invocation_id: input.invocation_id,
    role: input.role,
    call_class: input.call_class,
    counts_as_measurement: input.counts_as_measurement,
    launched_at: validTimestamp(input.launched_at, "qualification accounting launch time"),
    previous_sha256: inputLedger.chain_head,
  };
  const event: QualificationAccountingEvent = { ...base, event_sha256: qualificationSha256(qualificationCanonicalJson(base)) };
  return { ...inputLedger, events: [...inputLedger.events, event], chain_head: event.event_sha256 };
}

export function validateQualificationAccountingLedger(value: unknown): QualificationAccountingReport {
  if (!plainObject(value)) throw new Error("qualification accounting ledger must be an object");
  exactObjectKeys(value, ["schema_version", "policy", "events", "chain_head"], "qualification accounting ledger");
  if (value.schema_version !== QUALIFICATION_ACCOUNTING_VERSION) throw new Error(`unsupported qualification accounting schema ${String(value.schema_version)}`);
  if (qualificationCanonicalJson(value.policy) !== qualificationCanonicalJson(QUALIFICATION_ACCOUNTING_POLICY)) throw new Error("qualification accounting policy is corrupt");
  if (!Array.isArray(value.events)) throw new Error("qualification accounting events must be an array");
  let previous: string | null = null;
  const ids = new Set<string>();
  const roles: Partial<Record<QualificationRole, number>> = {};
  const counts = { subject: 0, judge: 0, measurement: 0, total: 0 };
  value.events.forEach((raw, index) => {
    if (!plainObject(raw)) throw new Error(`qualification accounting event ${index + 1} must be an object`);
    exactObjectKeys(raw, ["seq", "invocation_id", "role", "call_class", "counts_as_measurement", "launched_at", "previous_sha256", "event_sha256"], `qualification accounting event ${index + 1}`);
    const input = raw as unknown as QualificationAccountingEvent;
    validateAccountingInput(input);
    if (input.seq !== index + 1) throw new Error(`qualification accounting sequence is reordered or non-contiguous at event ${index + 1}`);
    if (input.previous_sha256 !== previous) throw new Error(`qualification accounting hash chain is broken at event ${index + 1}`);
    const { event_sha256, ...base } = input;
    if (!/^[a-f0-9]{64}$/.test(String(event_sha256)) || qualificationSha256(qualificationCanonicalJson(base)) !== event_sha256) {
      throw new Error(`qualification accounting event ${index + 1} digest mismatch`);
    }
    if (ids.has(input.invocation_id)) throw new Error(`duplicate invocation id ${input.invocation_id} in qualification accounting ledger`);
    ids.add(input.invocation_id);
    previous = event_sha256;
    counts[input.call_class] += 1;
    counts.total += 1;
    if (input.counts_as_measurement) counts.measurement += 1;
    roles[input.role] = (roles[input.role] ?? 0) + 1;
    if (counts[input.call_class] > QUALIFICATION_ACCOUNTING_POLICY.ceilings[input.call_class]) {
      throw new Error(`qualification ${input.call_class} ceiling ${QUALIFICATION_ACCOUNTING_POLICY.ceilings[input.call_class]} exceeded`);
    }
  });
  if (value.chain_head !== previous) throw new Error("qualification accounting chain head does not match the event ledger");
  return { counts, roles, chain_head: previous };
}

export function readQualificationAccounting(spoolDir: string): QualificationAccountingLedgerV1 {
  const path = qualificationSpoolPaths(spoolDir).accounting;
  const value = readCanonicalJson(path, "qualification accounting ledger");
  validateQualificationAccountingLedger(value);
  return value as QualificationAccountingLedgerV1;
}

export function writeQualificationAccounting(spoolDir: string, ledger: QualificationAccountingLedgerV1): void {
  validateQualificationAccountingLedger(ledger);
  atomicWriteCanonical(qualificationSpoolPaths(spoolDir).accounting, ledger, false);
}

export function validateQualificationSpool(spoolDir: string): QualificationSpoolValidation {
  const paths = qualificationSpoolPaths(spoolDir);
  const envelope = readCanonicalJson(paths.configuration, "qualification spool configuration");
  if (!plainObject(envelope)) throw new Error("qualification spool configuration must be an object");
  exactObjectKeys(envelope, ["schema_version", "configuration_sha256", "configuration"], "qualification spool configuration");
  if (envelope.schema_version !== "qualification-spool-config-v1") throw new Error("qualification spool configuration schema is unsupported");
  const config = parseQualificationConfig(envelope.configuration);
  const configSha = qualificationConfigDigest(config);
  if (envelope.configuration_sha256 !== configSha) throw new Error("qualification spool configuration digest mismatch");
  const ledger = readQualificationAccounting(paths.root);
  const accounting = validateQualificationAccountingLedger(ledger);
  const invocationEntries = existsSync(paths.invocations) ? readdirSync(paths.invocations, { withFileTypes: true }) : [];
  const invalidEntry = invocationEntries.find((entry) => !entry.isDirectory());
  if (invalidEntry) throw new Error(`qualification invocations contain undeclared non-directory entry ${invalidEntry.name}`);
  const dirs = invocationEntries.map((entry) => entry.name).sort();
  const records = new Map<string, QualificationInvocationV1>();
  for (const id of dirs) {
    const record = readQualificationInvocation(paths.root, id);
    if (record.configuration_sha256 !== configSha) throw new Error(`qualification invocation ${id} has the wrong configuration digest`);
    const lifecycle = readQualificationLifecycle(paths.root, id);
    if (lifecycle.invocation_id !== id) throw new Error(`qualification invocation ${id} lifecycle identity mismatch`);
    records.set(id, record);
  }
  for (const event of ledger.events) {
    const record = records.get(event.invocation_id);
    if (!record) throw new Error(`qualification accounting event references missing invocation ${event.invocation_id}`);
    const arm = config.arms.find((candidate) => candidate.id === record.arms.selected);
    if (!arm || arm.kind !== event.call_class || record.role !== event.role || record.counts_as_measurement !== event.counts_as_measurement) {
      throw new Error(`qualification accounting event contradicts invocation ${event.invocation_id}`);
    }
  }
  return { ok: true, configuration_sha256: configSha, invocations: records.size, accounting };
}

export function readQualificationSpoolConfig(spoolDir: string): QualificationConfigV1 {
  const envelope = readCanonicalJson(qualificationSpoolPaths(spoolDir).configuration, "qualification spool configuration") as Record<string, unknown>;
  if (!plainObject(envelope) || !Object.hasOwn(envelope, "configuration")) throw new Error("qualification spool configuration is malformed");
  const config = parseQualificationConfig(envelope.configuration);
  if (envelope.configuration_sha256 !== qualificationConfigDigest(config)) throw new Error("qualification spool configuration digest mismatch");
  return config;
}

export function withQualificationFileLock<T>(lockPath: string, action: () => T): T {
  const token = randomBytes(16).toString("hex");
  const io: QualificationLockIo = { read: readCanonicalJson, write: atomicWriteCanonical };
  while (true) {
    if (tryPublishQualificationLock(lockPath, token, io)) break;
    const owner = readQualificationLockOwner(lockPath, io);
    if (!owner) continue;
    if (qualificationLockOwnerIsLive(owner)) throw new Error(`qualification state is busy: lock exists at ${lockPath}`);
    reclaimQualificationLock(lockPath, owner.token, token, io);
  }
  try { return action(); }
  finally { releaseQualificationLock(lockPath, token, io); }
}

export function atomicWriteCanonical(path: string, value: unknown, exclusive: boolean): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const text = `${qualificationCanonicalJson(value)}\n`;
  const temporary = join(dirname(path), `.${randomBytes(12).toString("hex")}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, text, "utf8");
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (exclusive) {
      try {
        linkSync(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`qualification immutable record already exists: ${path}`);
        throw error;
      }
      unlinkSync(temporary);
    } else {
      renameSync(temporary, path);
    }
    fsyncQualificationDirectory(dirname(path));
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

export function atomicWriteBytes(path: string, bytes: Buffer, exclusive: boolean): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(path), `.${randomBytes(12).toString("hex")}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    if (exclusive) { linkSync(temporary, path); unlinkSync(temporary); }
    else renameSync(temporary, path);
    fsyncQualificationDirectory(dirname(path));
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

export function readCanonicalJson(path: string, ctx: string): unknown {
  let text: string;
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${ctx} is not a regular file`);
    text = readFileSync(fd, "utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("not a regular file")) throw error;
    throw new Error(`${ctx} is missing or unreadable: ${path}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${ctx} contains invalid JSON`); }
  if (text !== `${qualificationCanonicalJson(value)}\n`) throw new Error(`${ctx} is not canonical JSON`);
  return value;
}

function initializeSpoolConfiguration(path: string, config: QualificationConfigV1, digest: string): void {
  const envelope = { schema_version: "qualification-spool-config-v1", configuration_sha256: digest, configuration: config };
  if (!existsSync(path)) {
    atomicWriteCanonical(path, envelope, true);
    return;
  }
  const existing = readCanonicalJson(path, "qualification spool configuration");
  if (qualificationCanonicalJson(existing) !== qualificationCanonicalJson(envelope)) {
    throw new Error("qualification spool is already bound to a different configuration identity");
  }
}

function initializeAccounting(path: string): void {
  if (!existsSync(path)) atomicWriteCanonical(path, createQualificationAccountingLedger(), true);
  else validateQualificationAccountingLedger(readCanonicalJson(path, "qualification accounting ledger"));
}

function createQualificationLifecycle(invocationId: string, at: string): QualificationLifecycleV1 {
  const base = { seq: 1, from: null, to: "prepared" as const, terminal_status: null, at, detail: {}, previous_sha256: null };
  const event: QualificationLifecycleEvent = { ...base, event_sha256: qualificationSha256(qualificationCanonicalJson(base)) };
  return {
    schema_version: QUALIFICATION_LIFECYCLE_VERSION,
    invocation_id: invocationId,
    phase: "prepared",
    terminal_status: null,
    events: [event],
    chain_head: event.event_sha256,
  };
}

function validateQualificationLifecycle(value: unknown, invocationId: string): QualificationLifecycleV1 {
  if (!plainObject(value)) throw new Error(`qualification lifecycle ${invocationId} must be an object`);
  exactObjectKeys(value, ["schema_version", "invocation_id", "phase", "terminal_status", "events", "chain_head"], `qualification lifecycle ${invocationId}`);
  if (value.schema_version !== QUALIFICATION_LIFECYCLE_VERSION || value.invocation_id !== invocationId) throw new Error(`qualification lifecycle ${invocationId} identity/version mismatch`);
  if (!Array.isArray(value.events) || value.events.length === 0) throw new Error(`qualification lifecycle ${invocationId} has no events`);
  let previous: string | null = null;
  let phase: QualificationLifecyclePhase | null = null;
  let terminal: QualificationTerminalStatus | null = null;
  const allowed: Record<string, string[]> = { "<root>": ["prepared"], prepared: ["launch-claimed", "terminal"], "launch-claimed": ["running", "terminal"], running: ["terminal"], terminal: [] };
  value.events.forEach((raw, index) => {
    if (!plainObject(raw)) throw new Error(`qualification lifecycle ${invocationId} event ${index + 1} must be an object`);
    exactObjectKeys(raw, ["seq", "from", "to", "terminal_status", "at", "detail", "previous_sha256", "event_sha256"], `qualification lifecycle ${invocationId} event ${index + 1}`);
    const event = raw as unknown as QualificationLifecycleEvent;
    if (event.seq !== index + 1 || event.from !== phase || !allowed[phase ?? "<root>"].includes(event.to)) throw new Error(`qualification lifecycle ${invocationId} is reordered or contradictory at event ${index + 1}`);
    if (event.previous_sha256 !== previous) throw new Error(`qualification lifecycle ${invocationId} hash chain is broken at event ${index + 1}`);
    validTimestamp(event.at, `qualification lifecycle ${invocationId} event time`);
    if (!plainObject(event.detail)) throw new Error(`qualification lifecycle ${invocationId} event detail must be an object`);
    const { event_sha256, ...base } = event;
    if (qualificationSha256(qualificationCanonicalJson(base)) !== event_sha256) throw new Error(`qualification lifecycle ${invocationId} event digest mismatch`);
    if (event.to === "terminal" && !isTerminalStatus(event.terminal_status)) throw new Error(`qualification lifecycle ${invocationId} terminal event lacks status`);
    if (event.to !== "terminal" && event.terminal_status !== null) throw new Error(`qualification lifecycle ${invocationId} nonterminal event carries status`);
    phase = event.to;
    terminal = event.terminal_status;
    previous = event.event_sha256;
  });
  if (value.phase !== phase || value.terminal_status !== terminal || value.chain_head !== previous) throw new Error(`qualification lifecycle ${invocationId} snapshot contradicts its event chain`);
  return value as unknown as QualificationLifecycleV1;
}

function validateQualificationInvocationRecord(value: unknown): asserts value is QualificationInvocationV1 {
  if (!plainObject(value)) throw new Error("qualification invocation record must be an object");
  const required = ["schema_version", "invocation_id", "measurement_identity_sha256", "continuation_authority_sha256", "continuation_authority_expires_at", "scenario", "role", "counts_as_measurement", "arms", "repetition", "requested", "authentication", "pins", "configuration_sha256", "created_at", "ceiling_policy", "execution", "expected_artifact", "invocation_sha256"];
  exactObjectKeys(value, required, `qualification invocation ${String(value.invocation_id)}`);
  if (value.schema_version !== QUALIFICATION_INVOCATION_VERSION || typeof value.invocation_id !== "string") throw new Error("qualification invocation version/identity is invalid");
  if (!/^[a-f0-9]{64}$/.test(String(value.measurement_identity_sha256)) || !/^[a-f0-9]{64}$/.test(String(value.continuation_authority_sha256)) || !/^[a-f0-9]{64}$/.test(String(value.configuration_sha256))) throw new Error(`qualification invocation ${value.invocation_id} digest identity is invalid`);
  validTimestamp(String(value.continuation_authority_expires_at), `qualification invocation ${value.invocation_id} continuation authority expiry`);
  validTimestamp(String(value.created_at), `qualification invocation ${value.invocation_id} creation time`);
  if (qualificationCanonicalJson(value.ceiling_policy) !== qualificationCanonicalJson(QUALIFICATION_ACCOUNTING_POLICY)) throw new Error(`qualification invocation ${value.invocation_id} ceiling policy is corrupt`);
  const { invocation_sha256: recordedDigest, ...digestInput } = value;
  if (typeof recordedDigest !== "string" || !/^[a-f0-9]{64}$/.test(recordedDigest) || qualificationSha256(qualificationCanonicalJson(digestInput)) !== recordedDigest) {
    throw new Error(`qualification invocation ${value.invocation_id} immutable digest mismatch`);
  }
}

function validateAccountingInput(value: QualificationAccountingEventInput): void {
  if (!value || typeof value !== "object") throw new Error("qualification accounting event input must be an object");
  if (typeof value.invocation_id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.invocation_id)) throw new Error("qualification accounting invocation_id is invalid");
  if (!["holdout-author", "holdout-reviewer", "subject", "judge", "calibration", "canary"].includes(value.role)) throw new Error("qualification accounting role is invalid");
  if (value.call_class !== "subject" && value.call_class !== "judge") throw new Error("qualification accounting call_class is invalid");
  if (typeof value.counts_as_measurement !== "boolean") throw new Error("qualification accounting measurement flag is invalid");
  const requiredMeasurement = value.role === "subject" || value.role === "judge";
  if (value.counts_as_measurement !== requiredMeasurement) {
    throw new Error(`qualification ${value.role} accounting must be ${requiredMeasurement ? "measurement" : "non-measurement"}`);
  }
  validTimestamp(value.launched_at, "qualification accounting launch time");
}

function assertRegularInput(path: string, expectedSha: string): void {
  let stat;
  try { stat = lstatSync(path); }
  catch { throw new Error(`qualification input file does not exist: ${path}`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`qualification input must be a regular non-symlink file: ${path}`);
  const actual = qualificationSha256(readFileSync(path));
  if (actual !== expectedSha) throw new Error(`qualification input digest mismatch: expected ${expectedSha}, got ${actual}`);
}
function assertWorkingDirectory(path: string): void {
  let stat;
  try { stat = lstatSync(path); }
  catch { throw new Error(`qualification working directory does not exist: ${path}`); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`qualification working directory must be a regular directory: ${path}`);
}
function assertDirectory(path: string, ctx: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${ctx} must be a non-symlink directory: ${path}`);
  if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) {
    throw new Error(`${ctx} must be private and owned by the qualification user: ${path}`);
  }
}
function parseJsonFile(path: string, ctx: string): unknown {
  let text: string;
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${ctx} path is not a regular file`);
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && error.message.includes("not a regular file")) throw error;
    throw new Error(`${ctx} is missing or unreadable: ${path}`);
  }
  try { return JSON.parse(text); }
  catch { throw new Error(`${ctx} contains invalid JSON`); }
}
function validTimestamp(value: string, ctx: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${ctx} must be an RFC 3339 UTC timestamp`);
  return value;
}
function isTerminalStatus(value: unknown): value is QualificationTerminalStatus {
  return ["completed", "failed", "timed-out", "aborted", "refused", "invalid-artifact"].includes(String(value));
}
function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactObjectKeys(value: Record<string, unknown>, keys: readonly string[], ctx: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${ctx} contains unknown field ${unknown}`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${ctx} is missing field ${missing}`);
}
function sanitizeDetail(value: Record<string, unknown>): Record<string, unknown> {
  const encoded = qualificationCanonicalJson(value);
  if (Buffer.byteLength(encoded) > 16 * 1024) throw new Error("qualification lifecycle detail exceeds 16384 bytes");
  const secretLike = Object.keys(value).find((key) => /(?:secret|token|credential|api.?key)/i.test(key));
  if (secretLike) throw new Error(`qualification lifecycle detail must not contain secret-like field ${secretLike}`);
  return JSON.parse(encoded) as Record<string, unknown>;
}
export function fsyncQualificationDirectory(path: string): void {
  if (process.platform === "win32") return;
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY);
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
