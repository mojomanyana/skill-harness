import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { setTimeout as sleep } from "node:timers/promises";
import { redactText } from "./capture.js";
import {
  sanitizeQualificationEnvironment,
  qualificationCanonicalJson,
  qualificationSha256,
  verifyQualificationExecutable,
  verifyQualificationResource,
  type QualificationRole,
} from "./qualification-config.js";
import {
  appendQualificationAccountingEvent,
  atomicWriteCanonical,
  qualificationSpoolPaths,
  readCanonicalJson,
  readQualificationAccounting,
  readQualificationInvocation,
  readQualificationLifecycle,
  readQualificationSpoolConfig,
  transitionQualificationLifecycle,
  validateQualificationSpool,
  writeQualificationAccounting,
  writeQualificationLifecycle,
  type QualificationInvocationV1,
  type QualificationLifecycleV1,
  type QualificationTerminalStatus,
} from "./qualification-store.js";

export const QUALIFICATION_AUTH_EVIDENCE_VERSION = "qualification-auth-evidence-v1" as const;
export const QUALIFICATION_TERMINAL_RECEIPT_VERSION = "qualification-terminal-receipt-v1" as const;
export const QUALIFICATION_LAUNCH_ATTEMPT_VERSION = "qualification-launch-attempt-v1" as const;

export interface QualificationProcessIdentity {
  pid: number;
  platform: NodeJS.Platform;
  boot_id: string | null;
  start_ticks: string | null;
}

export interface QualificationAuthEvidenceV1 {
  schema_version: typeof QUALIFICATION_AUTH_EVIDENCE_VERSION;
  checked_at: string;
  provider: string;
  model: string;
  status: "ready";
  auth_type: "oauth";
  source: "pi-auth-check-json";
  credentials_included: false;
  readiness_only: true;
  removed_parent_environment_names: string[];
  child_environment_names: string[];
  executable_sha256: string;
}

export interface QualificationOutputReceipt {
  path: string;
  total_bytes: number;
  captured_bytes: number;
  truncated: boolean;
  sha256: string;
}

export interface QualificationTerminalReceiptV1 {
  schema_version: typeof QUALIFICATION_TERMINAL_RECEIPT_VERSION;
  invocation_id: string;
  terminal_status: QualificationTerminalStatus;
  attempt: 0 | 1;
  started_at: string | null;
  finished_at: string;
  deadline_at: string | null;
  requested_timeout_ms: number;
  effective_timeout_ms: number;
  supervisor: QualificationProcessIdentity;
  child: QualificationProcessIdentity | null;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  requested: { provider: string; model: string };
  actual: { provider: string; model: string } | null;
  provider_model_attested: boolean;
  fallback_detected: boolean;
  authentication: {
    evidence_sha256: string;
    status: "ready";
    auth_type: "oauth";
    readiness_only: true;
  } | null;
  accounting_event_sha256: string | null;
  continuation_authority_sha256: string | null;
  stdout: QualificationOutputReceipt;
  stderr: QualificationOutputReceipt;
  artifact: { path: string; type: "pi-jsonl"; bytes: number; sha256: string } | null;
  error: string | null;
}

export interface QualificationInvocationStatus {
  invocation_id: string;
  phase: QualificationLifecycleV1["phase"];
  terminal_status: QualificationTerminalStatus | null;
  attempt: 0 | 1;
  requested: { provider: string; model: string };
  actual: { provider: string; model: string } | null;
  deadline_at: string | null;
  effective_timeout_ms: number | null;
  output: { stdout: QualificationOutputReceipt; stderr: QualificationOutputReceipt } | null;
  supervisor: QualificationProcessIdentity | null;
  child: QualificationProcessIdentity | null;
  supervisor_alive: boolean | null;
  child_alive: boolean | null;
}

/**
 * Verify that the Pi agent directory exposed to a production child contains an
 * OAuth credential for openai-codex, no stored API-key credentials, and no
 * models.json override capable of redirecting that provider. No credential
 * value or digest leaves this function.
 */
export function assertQualificationOAuthCredentialBoundary(env: NodeJS.ProcessEnv): { agent_directory: string; provider: "openai-codex"; auth_type: "oauth" } {
  const agentDirectory = env.PI_CODING_AGENT_DIR
    ?? (env.HOME ? join(env.HOME, ".pi", "agent") : undefined);
  if (!agentDirectory || !isAbsolute(agentDirectory)) throw new Error("qualification OAuth boundary requires an absolute PI_CODING_AGENT_DIR or HOME");
  const authPath = join(agentDirectory, "auth.json");
  let authStat;
  try { authStat = lstatSync(authPath); }
  catch { throw new Error("qualification OAuth credential store is missing auth.json"); }
  if (authStat.isSymbolicLink() || !authStat.isFile()) throw new Error("qualification OAuth auth.json must be a regular non-symlink file");
  if (process.platform !== "win32" && (authStat.mode & 0o077) !== 0) throw new Error("qualification OAuth auth.json must not be group/world accessible");
  let auth: unknown;
  try { auth = JSON.parse(readFileSync(authPath, "utf8")); }
  catch { throw new Error("qualification OAuth auth.json is invalid JSON"); }
  if (!plainObject(auth)) throw new Error("qualification OAuth auth.json must be an object");
  const credentials = Object.values(auth);
  if (credentials.some((credential) => !plainObject(credential) || credential.type !== "oauth")) {
    throw new Error("qualification OAuth credential store contains an API-key or unclassified credential; use a dedicated OAuth-only Pi agent directory");
  }
  const codex = auth["openai-codex"];
  if (!plainObject(codex) || codex.type !== "oauth") throw new Error("qualification openai-codex credential is missing or is not OAuth");
  const modelsPath = join(agentDirectory, "models.json");
  if (existsSync(modelsPath)) {
    assertRegularFile(modelsPath, "qualification Pi models.json");
    let models: unknown;
    try { models = JSON.parse(readFileSync(modelsPath, "utf8")); }
    catch { throw new Error("qualification Pi models.json is invalid JSON"); }
    if (!plainObject(models)) throw new Error("qualification Pi models.json must be an object");
    if (Object.keys(models).length > 0) {
      throw new Error("qualification dedicated OAuth agent directory must not carry models.json overrides or embedded provider credentials");
    }
  }
  return { agent_directory: agentDirectory, provider: "openai-codex", auth_type: "oauth" };
}

export async function checkQualificationAuthentication(options: {
  spool_dir: string;
  invocation_id: string;
  parent_env?: NodeJS.ProcessEnv;
  now?: () => string;
}): Promise<{ evidence: QualificationAuthEvidenceV1; child_env: NodeJS.ProcessEnv }> {
  const invocation = readQualificationInvocation(options.spool_dir, options.invocation_id);
  const config = readQualificationSpoolConfig(options.spool_dir);
  const arm = config.arms.find((candidate) => candidate.id === invocation.arms.selected);
  if (!arm) throw new Error(`qualification selected arm ${invocation.arms.selected} disappeared from configuration`);
  verifyQualificationExecutable(config.runner.executable);
  const executable = verifyQualificationExecutable(arm.executable);
  for (const resource of arm.resources) verifyQualificationResource(resource);
  const sanitized = sanitizeQualificationEnvironment(
    options.parent_env ?? process.env,
    arm.allowed_environment_names,
    config.runner.conflicting_parent_environment,
  );
  if (config.mode === "production") assertQualificationOAuthCredentialBoundary(sanitized.env);
  const result = await spawnCapture(
    arm.executable.path,
    ["auth", "check", "--provider", arm.provider, "--model", arm.model, "--json"],
    { cwd: invocation.scenario.working_directory, env: sanitized.env, timeout_ms: Math.min(30_000, arm.timeout_ms), output_limit_bytes: 64 * 1024 },
  );
  if (result.timed_out) throw new Error("qualification OAuth readiness check timed out");
  if (result.code !== 0) throw new Error(`qualification auth check exited ${String(result.code)}`);
  let parsed: unknown;
  try { parsed = JSON.parse(result.stdout.trim()); }
  catch { throw new Error("qualification auth check returned invalid JSON"); }
  if (!plainObject(parsed)) throw new Error("qualification auth check returned a non-object response");
  if (parsed.status !== "ready") throw new Error(`qualification OAuth readiness is not ready for ${arm.provider}:${arm.model}`);
  if (parsed.provider !== arm.provider) throw new Error(`qualification auth check provider substitution: requested ${arm.provider}, reported ${String(parsed.provider)}`);
  if (parsed.authType !== "oauth") throw new Error(`qualification requires OAuth readiness; Pi reported ${String(parsed.authType ?? "missing auth type")}`);
  const evidence: QualificationAuthEvidenceV1 = {
    schema_version: QUALIFICATION_AUTH_EVIDENCE_VERSION,
    checked_at: timestamp((options.now ?? (() => new Date().toISOString()))(), "qualification auth check time"),
    provider: arm.provider,
    model: arm.model,
    status: "ready",
    auth_type: "oauth",
    source: "pi-auth-check-json",
    credentials_included: false,
    readiness_only: true,
    removed_parent_environment_names: sanitized.removed_names,
    child_environment_names: Object.keys(sanitized.env).sort(),
    executable_sha256: executable.sha256,
  };
  const authPath = join(qualificationSpoolPaths(options.spool_dir, options.invocation_id).invocation!, "auth-evidence.json");
  if (existsSync(authPath)) {
    const existing = readCanonicalJson(authPath, `qualification auth evidence ${options.invocation_id}`) as QualificationAuthEvidenceV1;
    validateAuthEvidence(existing, invocation);
    if (existing.provider !== evidence.provider || existing.model !== evidence.model || existing.executable_sha256 !== evidence.executable_sha256) {
      throw new Error("qualification auth evidence contradicts the current invocation");
    }
  } else {
    atomicWriteCanonical(authPath, evidence, true);
  }
  return { evidence, child_env: sanitized.env };
}

/**
 * Execute one previously prepared invocation. There is deliberately no retry
 * parameter and exactly one model-process spawn site in this function.
 */
export async function superviseQualificationInvocation(options: {
  spool_dir: string;
  invocation_id: string;
  child_env: NodeJS.ProcessEnv;
  continuation_authority?: string;
  now?: () => string;
}): Promise<void> {
  const now = options.now ?? (() => new Date().toISOString());
  const invocation = readQualificationInvocation(options.spool_dir, options.invocation_id);
  const config = readQualificationSpoolConfig(options.spool_dir);
  const arm = config.arms.find((candidate) => candidate.id === invocation.arms.selected);
  if (!arm) throw new Error(`qualification selected arm ${invocation.arms.selected} disappeared from configuration`);
  verifyQualificationExecutable(config.runner.executable);
  verifyQualificationExecutable(arm.executable);
  for (const resource of arm.resources) verifyQualificationResource(resource);
  assertInputUnchanged(invocation);
  assertChildEnvironment(options.child_env, arm.allowed_environment_names);
  if (config.mode === "production") assertQualificationOAuthCredentialBoundary(options.child_env);
  const auth = readAuthEvidence(options.spool_dir, invocation);
  const supervisorIdentity = qualificationProcessIdentity(process.pid);
  const paths = qualificationSpoolPaths(options.spool_dir, options.invocation_id);
  let ownsLaunch = false;
  let accountingEventSha = "";
  let continuationSha: string | null = null;

  await withAsyncLock(paths.lock, async () => {
    await withAsyncLock(paths.invocationLock!, async () => {
      let lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
      if (lifecycle.phase === "terminal" || existsSync(paths.terminal!)) return;
      const ledger = readQualificationAccounting(paths.root);
      const existingClaim = ledger.events.find((event) => event.invocation_id === invocation.invocation_id);
      if (existingClaim) {
        accountingEventSha = existingClaim.event_sha256;
        if (lifecycle.phase === "launch-claimed") {
          if (existsSync(join(paths.invocation!, "launch-attempt.json"))) {
            throw new Error("qualification launch attempt already exists; automatic retry is prohibited");
          }
          const priorSupervisor = processIdentityFrom(lifecycle.events.at(-1)?.detail.supervisor);
          if (priorSupervisor && qualificationProcessMatches(priorSupervisor)) return;
          if (!options.continuation_authority) {
            throw new Error("qualification launch-claimed supervisor was interrupted; explicit continuation authority is required and no relaunch is permitted automatically");
          }
          continuationSha = qualificationSha256(options.continuation_authority);
          const continuationPath = join(paths.invocation!, "continuation-authority.json");
          atomicWriteCanonical(continuationPath, {
            schema_version: "qualification-continuation-authority-v1",
            invocation_id: invocation.invocation_id,
            authorized_at: timestamp(now(), "qualification continuation authority time"),
            authority_sha256: continuationSha,
            prior_supervisor: priorSupervisor,
            new_supervisor: supervisorIdentity,
          }, true);
          ownsLaunch = true;
          return;
        }
        if (lifecycle.phase !== "prepared") return;
        if (!options.continuation_authority) {
          throw new Error("qualification launch claim was interrupted; explicit continuation authority is required and no relaunch is permitted automatically");
        }
        continuationSha = qualificationSha256(options.continuation_authority);
      } else {
        if (lifecycle.phase !== "prepared") throw new Error("qualification lifecycle claims launch without an accounting event");
        if (existsSync(join(paths.invocation!, "abort-request.json"))) {
          await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: "aborted", supervisor: supervisorIdentity, auth, now: now(), error: "aborted before launch claim" });
          return;
        }
        const next = appendQualificationAccountingEvent(ledger, {
          invocation_id: invocation.invocation_id,
          role: invocation.role,
          call_class: arm.kind,
          counts_as_measurement: invocation.counts_as_measurement,
          launched_at: timestamp(now(), "qualification launch claim time"),
        });
        writeQualificationAccounting(paths.root, next);
        accountingEventSha = next.chain_head!;
      }
      if (ownsLaunch) return;
      lifecycle = transitionQualificationLifecycle(lifecycle, "launch-claimed", {        at: timestamp(now(), "qualification launch claim time"),
        detail: {
          attempt: 1,
          accounting_event_sha256: accountingEventSha,
          supervisor: supervisorIdentity,
          continuation_authority_sha256: continuationSha,
        },
      });
      writeQualificationLifecycle(paths.root, lifecycle);
      ownsLaunch = true;
    });
  });
  if (!ownsLaunch) return;

  const launchAttemptPath = join(paths.invocation!, "launch-attempt.json");
  if (existsSync(launchAttemptPath)) throw new Error("qualification launch attempt already exists; automatic retry is prohibited");
  if (existsSync(join(paths.invocation!, "abort-request.json"))) {
    await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: "aborted", supervisor: supervisorIdentity, auth, now: now(), error: "aborted after launch claim" , accountingEventSha, continuationSha });
    return;
  }
  verifyQualificationExecutable(arm.executable);
  for (const resource of arm.resources) verifyQualificationResource(resource);
  assertInputUnchanged(invocation);
  const artifactAbsolute = join(paths.root, invocation.expected_artifact.path);
  const argv = buildQualificationArgv(invocation, artifactAbsolute);
  const attemptAt = timestamp(now(), "qualification launch attempt time");
  atomicWriteCanonical(launchAttemptPath, {
    schema_version: QUALIFICATION_LAUNCH_ATTEMPT_VERSION,
    invocation_id: invocation.invocation_id,
    attempt: 1,
    at: attemptAt,
    executable: arm.executable,
    argv,
    environment_names: Object.keys(options.child_env).sort(),
    automatic_retry: false,
  }, true);

  const stdoutPartial = join(paths.invocation!, "stdout.partial");
  const stderrPartial = join(paths.invocation!, "stderr.partial");
  const credentialValues = config.mode === "production" ? qualificationCredentialRedactionValues(options.child_env) : [];
  const outputRedactor = (text: string) => redactQualificationOutput(text, credentialValues);
  const stdoutCapture = openBoundedCapture(stdoutPartial, arm.output_limit_bytes, outputRedactor);
  const stderrCapture = openBoundedCapture(stderrPartial, arm.output_limit_bytes, outputRedactor);
  let child: ChildProcess;
  try {
    child = spawn(arm.executable.path, argv, {
      cwd: invocation.scenario.working_directory,
      env: options.child_env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
  } catch (error) {
    stdoutCapture.close(); stderrCapture.close();
    await finalizeAfterCapture({ invocation, spoolDir: paths.root, terminalStatus: "failed", supervisor: supervisorIdentity, child: null, auth, accountingEventSha, continuationSha, startedAt: attemptAt, deadlineAt: new Date(Date.parse(attemptAt) + arm.timeout_ms).toISOString(), exitCode: null, signal: null, stdoutCapture, stderrCapture, now: now(), error: safeError(error) });
    return;
  }
  child.stdout!.on("data", (chunk: Buffer) => stdoutCapture.write(chunk));
  child.stderr!.on("data", (chunk: Buffer) => stderrCapture.write(chunk));
  let childIdentity: QualificationProcessIdentity | null = null;
  let childIdentityError: string | null = null;
  if (child.pid) {
    try { childIdentity = qualificationProcessIdentity(child.pid); }
    catch (error) { childIdentityError = safeError(error); }
  } else {
    childIdentityError = "child process did not expose a PID occurrence identity";
  }
  const startedAt = timestamp(now(), "qualification process start time");
  const deadlineAt = new Date(Date.parse(startedAt) + arm.timeout_ms).toISOString();
  await withAsyncLock(paths.invocationLock!, async () => {
    const lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
    if (lifecycle.phase !== "launch-claimed") throw new Error(`qualification invocation entered ${lifecycle.phase} before process start could be recorded`);
    writeQualificationLifecycle(paths.root, transitionQualificationLifecycle(lifecycle, "running", {
      at: startedAt,
      detail: { attempt: 1, supervisor: supervisorIdentity, child: childIdentity, deadline_at: deadlineAt },
    }));
  });

  let termination: "exit" | "timeout" | "abort" = "exit";
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: string }>((resolve) => {
    let settled = false;
    const finish = (value: { code: number | null; signal: NodeJS.Signals | null; error?: string }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => finish({ code: null, signal: null, error: safeError(error) }));
    child.once("close", (code, signal) => finish({ code, signal }));
  });
  const timeoutTimer = setTimeout(() => {
    if (termination !== "exit") return;
    termination = "timeout";
    terminateQualificationProcess(child, childIdentity);
  }, arm.timeout_ms);
  const abortTimer = setInterval(() => {
    if (termination !== "exit") return;
    if (existsSync(join(paths.invocation!, "abort-request.json"))) {
      termination = "abort";
      terminateQualificationProcess(child, childIdentity);
    }
  }, 20);
  const outcome = await closed;
  clearTimeout(timeoutTimer);
  clearInterval(abortTimer);
  // An operator can write the durable abort request and signal the process before
  // the supervisor's 20ms watcher observes it. The request, not which callback won
  // that race, is authoritative for terminal classification.
  if (termination === "exit" && existsSync(join(paths.invocation!, "abort-request.json"))) termination = "abort";
  stdoutCapture.close();
  stderrCapture.close();
  const terminationResult = termination as "exit" | "timeout" | "abort";
  const terminalStatus = terminationResult === "timeout" ? "timed-out" : terminationResult === "abort" ? "aborted" : undefined;
  await finalizeAfterCapture({
    invocation,
    spoolDir: paths.root,
    terminalStatus: childIdentityError ? "failed" : terminalStatus,
    supervisor: supervisorIdentity,
    child: childIdentity,
    auth,
    accountingEventSha,
    continuationSha,
    startedAt,
    deadlineAt,
    exitCode: outcome.code,
    signal: outcome.signal,
    stdoutCapture,
    stderrCapture,
    now: now(),
    error: outcome.error ?? childIdentityError,
  });
}

export function qualificationInvocationStatus(spoolDir: string, invocationId: string): QualificationInvocationStatus {
  const invocation = readQualificationInvocation(spoolDir, invocationId);
  const paths = qualificationSpoolPaths(spoolDir, invocationId);
  const lifecycle = readQualificationLifecycle(spoolDir, invocationId);
  const receipt = existsSync(join(paths.terminal!, "receipt.json")) ? readTerminalReceipt(spoolDir, invocation) : null;
  // The receipt directory is published atomically before the lifecycle snapshot
  // is advanced. Concurrent pollers may observe that short, valid publication
  // window; the immutable receipt is already terminal and prevents late success.
  // A lifecycle that is itself terminal with a different status is contradictory.
  if (receipt && lifecycle.phase === "terminal" && lifecycle.terminal_status !== receipt.terminal_status) {
    throw new Error(`qualification invocation ${invocationId} terminal receipt contradicts lifecycle state`);
  }
  const latest = lifecycle.events[lifecycle.events.length - 1]?.detail ?? {};
  const supervisor = receipt?.supervisor ?? processIdentityFrom(latest.supervisor);
  const child = receipt?.child ?? processIdentityFrom(latest.child);
  return {
    invocation_id: invocationId,
    phase: receipt ? "terminal" : lifecycle.phase,
    terminal_status: receipt?.terminal_status ?? lifecycle.terminal_status,
    attempt: (readQualificationAccounting(spoolDir).events.some((event) => event.invocation_id === invocationId) ? 1 : 0),
    requested: invocation.requested,
    actual: receipt?.actual ?? null,
    deadline_at: receipt?.deadline_at ?? stringValue(latest.deadline_at) ?? null,
    effective_timeout_ms: receipt?.effective_timeout_ms ?? null,
    output: receipt ? { stdout: receipt.stdout, stderr: receipt.stderr } : null,
    supervisor,
    child,
    supervisor_alive: supervisor ? qualificationProcessMatches(supervisor) : null,
    child_alive: child ? qualificationProcessMatches(child) : null,
  };
}

export async function pollQualificationInvocation(options: {
  spool_dir: string;
  invocation_id: string;
  wait_ms?: number;
  interval_ms?: number;
}): Promise<QualificationInvocationStatus> {
  const waitMs = options.wait_ms ?? 0;
  const interval = Math.max(5, options.interval_ms ?? 100);
  const deadline = Date.now() + waitMs;
  while (true) {
    const status = qualificationInvocationStatus(options.spool_dir, options.invocation_id);
    if (status.phase === "terminal" || Date.now() >= deadline) return status;
    if (status.supervisor && status.supervisor_alive === false) {
      throw new Error(`qualification invocation ${options.invocation_id} has a stale supervisor identity; it will not be relaunched without explicit continuation authority`);
    }
    await sleep(Math.min(interval, Math.max(1, deadline - Date.now())));
  }
}

export async function abortQualificationInvocation(options: {
  spool_dir: string;
  invocation_id: string;
  reason: string;
  now?: () => string;
}): Promise<QualificationInvocationStatus> {
  const invocation = readQualificationInvocation(options.spool_dir, options.invocation_id);
  const paths = qualificationSpoolPaths(options.spool_dir, options.invocation_id);
  const current = qualificationInvocationStatus(options.spool_dir, options.invocation_id);
  if (current.phase === "terminal") return current;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.reason)) throw new Error("qualification abort reason must be a bounded identifier");
  const request = { schema_version: "qualification-abort-request-v1", invocation_id: invocation.invocation_id, requested_at: timestamp((options.now ?? (() => new Date().toISOString()))(), "qualification abort time"), reason: options.reason };
  const abortPath = join(paths.invocation!, "abort-request.json");
  if (!existsSync(abortPath)) atomicWriteCanonical(abortPath, request, true);
  if (current.child && current.child_alive) terminateByIdentity(current.child);
  if (current.phase === "prepared") {
    const authPath = join(paths.invocation!, "auth-evidence.json");
    const auth = existsSync(authPath) ? readAuthEvidence(paths.root, invocation) : null;
    await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: "aborted", supervisor: qualificationProcessIdentity(process.pid), auth, now: request.requested_at, error: options.reason });
  }
  return qualificationInvocationStatus(paths.root, invocation.invocation_id);
}

export function validateQualificationRunnerSpool(spoolDir: string): ReturnType<typeof validateQualificationSpool> & { terminal: number } {
  const report = validateQualificationSpool(spoolDir);
  const paths = qualificationSpoolPaths(spoolDir);
  const invocationIds = readdirSync(paths.invocations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const expectedArtifacts = new Set<string>();
  let terminal = 0;
  for (const id of invocationIds) {
    const invocation = readQualificationInvocation(paths.root, id);
    assertInputUnchanged(invocation);
    const invocationPaths = qualificationSpoolPaths(paths.root, id);
    expectedArtifacts.add(invocation.expected_artifact.path.split("/").at(-1)!);
    const lifecycle = readQualificationLifecycle(paths.root, id);
    const receiptPath = join(invocationPaths.terminal!, "receipt.json");
    if (existsSync(receiptPath)) {
      terminal += 1;
      const receipt = readTerminalReceipt(paths.root, invocation);
      if (lifecycle.phase !== "terminal" || lifecycle.terminal_status !== receipt.terminal_status) throw new Error(`qualification terminal receipt for ${id} contradicts lifecycle`);
      const receiptDigest = qualificationSha256(`${qualificationCanonicalJson(receipt)}\n`);
      if (lifecycle.events.at(-1)?.detail.receipt_sha256 !== receiptDigest) throw new Error(`qualification terminal receipt for ${id} is not bound by the lifecycle chain`);
      verifyOutputReceipt(paths.root, receipt.stdout);
      verifyOutputReceipt(paths.root, receipt.stderr);
      if (receipt.artifact) {
        const artifactPath = join(paths.root, receipt.artifact.path);
        assertRegularFile(artifactPath, `qualification artifact ${id}`);
        const bytes = readFileSync(artifactPath);
        if (bytes.length !== receipt.artifact.bytes || qualificationSha256(bytes) !== receipt.artifact.sha256) throw new Error(`qualification artifact ${id} digest/size mismatch`);
      }
    } else if (lifecycle.phase === "terminal") {
      throw new Error(`qualification lifecycle ${id} is terminal without an atomic receipt`);
    }
  }
  if (existsSync(paths.artifacts)) {
    for (const entry of readdirSync(paths.artifacts, { withFileTypes: true })) {
      if (!entry.isFile() || !expectedArtifacts.has(entry.name)) throw new Error(`qualification artifacts contain undeclared entry ${entry.name}`);
    }
  }
  return { ...report, terminal };
}

export function qualificationProcessIdentity(pid: number): QualificationProcessIdentity {
  if (!Number.isInteger(pid) || pid < 1) throw new Error(`qualification process ${String(pid)} is not live`);
  if (process.platform === "linux") {
    let stat: string;
    try { stat = readFileSync(`/proc/${pid}/stat`, "utf8"); }
    catch { throw new Error(`qualification process ${pid} is not live`); }
    const close = stat.lastIndexOf(")");
    if (close < 0) throw new Error(`qualification process ${pid} identity is unreadable`);
    const remainder = stat.slice(close + 2).trim().split(/\s+/);
    const startTicks = remainder[19]; // field 22; remainder starts at field 3
    if (!/^\d+$/.test(startTicks ?? "")) throw new Error(`qualification process ${pid} start identity is unreadable`);
    let bootId: string;
    try { bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim(); }
    catch { throw new Error("qualification Linux boot identity is unreadable"); }
    return { pid, platform: process.platform, boot_id: bootId, start_ticks: startTicks };
  }
  try { process.kill(pid, 0); }
  catch { throw new Error(`qualification process ${pid} is not live`); }
  return { pid, platform: process.platform, boot_id: null, start_ticks: null };
}

export function qualificationProcessMatches(identity: QualificationProcessIdentity): boolean {
  try {
    const current = qualificationProcessIdentity(identity.pid);
    return current.platform === identity.platform && current.boot_id === identity.boot_id && current.start_ticks === identity.start_ticks;
  } catch { return false; }
}

function buildQualificationArgv(invocation: QualificationInvocationV1, artifactPath: string): string[] {
  const replacements: Record<string, string> = {
    input_path: invocation.scenario.input_path,
    scenario_id: invocation.scenario.id,
    invocation_id: invocation.invocation_id,
    artifact_path: artifactPath,
  };
  const configured = invocation.execution.arguments.map((argument) => argument.replace(/\{([a-z_]+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`));
  const resources = invocation.execution.resources.flatMap((resource) => resource.kind === "extension"
    ? ["--extension", resource.path]
    : resource.kind === "skill"
      ? ["--skill", resource.path]
      : ["--append-system-prompt", resource.path]);
  return [
    "--provider", invocation.requested.provider,
    "--model", invocation.requested.model,
    "--mode", "json",
    "--print",
    "--no-session",
    "--no-context-files",
    "--no-extensions",
    "--no-skills",
    ...resources,
    ...configured,
  ];
}

async function finalizeAfterCapture(options: {
  invocation: QualificationInvocationV1;
  spoolDir: string;
  terminalStatus?: QualificationTerminalStatus;
  supervisor: QualificationProcessIdentity;
  child: QualificationProcessIdentity | null;
  auth: QualificationAuthEvidenceV1;
  accountingEventSha: string;
  continuationSha: string | null;
  startedAt: string;
  deadlineAt: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutCapture: BoundedCapture;
  stderrCapture: BoundedCapture;
  now: string;
  error: string | null;
}): Promise<void> {
  const paths = qualificationSpoolPaths(options.spoolDir, options.invocation.invocation_id);
  const stdoutFinal = join(paths.invocation!, "stdout.txt");
  const stderrFinal = join(paths.invocation!, "stderr.txt");
  renameSync(options.stdoutCapture.path, stdoutFinal);
  renameSync(options.stderrCapture.path, stderrFinal);
  const stdout = outputReceipt(paths.root, stdoutFinal, options.stdoutCapture);
  const stderr = outputReceipt(paths.root, stderrFinal, options.stderrCapture);
  let artifact: QualificationTerminalReceiptV1["artifact"] = null;
  let attestation: ArtifactAttestation = { ok: false, actual: null, fallback: false, refused: false, error: "artifact was not validated" };
  if (!stdout.truncated) {
    const artifactPath = join(paths.root, options.invocation.expected_artifact.path);
    try {
      atomicWriteRaw(artifactPath, readFileSync(stdoutFinal), true);
      const bytes = readFileSync(artifactPath);
      artifact = { path: options.invocation.expected_artifact.path, type: "pi-jsonl", bytes: bytes.length, sha256: qualificationSha256(bytes) };
      attestation = attestPiJsonl(bytes.toString("utf8"), options.invocation.requested);
    } catch (error) {
      attestation = { ok: false, actual: null, fallback: false, refused: false, error: safeError(error) };
    }
  } else {
    attestation = { ok: false, actual: null, fallback: false, refused: false, error: "stdout exceeded the configured output limit" };
  }
  const status = options.terminalStatus
    ?? (options.exitCode !== 0 ? "failed"
      : attestation.refused ? "refused"
        : attestation.ok ? "completed" : "invalid-artifact");
  const error = options.error ?? (status === "completed" ? null : attestation.error ?? `child exited ${String(options.exitCode)}`);
  const receipt: QualificationTerminalReceiptV1 = {
    schema_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION,
    invocation_id: options.invocation.invocation_id,
    terminal_status: status,
    attempt: 1,
    started_at: options.startedAt,
    finished_at: timestamp(options.now, "qualification terminal time"),
    deadline_at: options.deadlineAt,
    requested_timeout_ms: options.invocation.execution.timeout_ms,
    effective_timeout_ms: options.invocation.execution.timeout_ms,
    supervisor: options.supervisor,
    child: options.child,
    exit_code: options.exitCode,
    signal: options.signal,
    requested: options.invocation.requested,
    actual: attestation.actual,
    provider_model_attested: attestation.ok,
    fallback_detected: attestation.fallback,
    authentication: {
      evidence_sha256: qualificationSha256(`${qualificationCanonicalJson(options.auth)}\n`),
      status: "ready",
      auth_type: "oauth",
      readiness_only: true,
    },
    accounting_event_sha256: options.accountingEventSha,
    continuation_authority_sha256: options.continuationSha,
    stdout,
    stderr,
    artifact,
    error,
  };
  commitTerminalReceipt(paths.root, options.invocation, receipt);
}

async function finalizeWithoutChild(options: {
  invocation: QualificationInvocationV1;
  spoolDir: string;
  status: "aborted" | "failed";
  supervisor: QualificationProcessIdentity;
  auth: QualificationAuthEvidenceV1 | null;
  now: string;
  error: string;
  accountingEventSha?: string;
  continuationSha?: string | null;
}): Promise<void> {
  const paths = qualificationSpoolPaths(options.spoolDir, options.invocation.invocation_id);
  const stdoutPath = join(paths.invocation!, "stdout.txt");
  const stderrPath = join(paths.invocation!, "stderr.txt");
  if (!existsSync(stdoutPath)) atomicWriteRaw(stdoutPath, Buffer.alloc(0), true);
  if (!existsSync(stderrPath)) atomicWriteRaw(stderrPath, Buffer.alloc(0), true);
  const emptyCapture = (path: string): BoundedCapture => ({ path, total_bytes: 0, captured_bytes: 0, truncated: false, write: () => {}, close: () => {} });
  const receipt: QualificationTerminalReceiptV1 = {
    schema_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION,
    invocation_id: options.invocation.invocation_id,
    terminal_status: options.status,
    attempt: options.accountingEventSha ? 1 : 0,
    started_at: null,
    finished_at: timestamp(options.now, "qualification terminal time"),
    deadline_at: null,
    requested_timeout_ms: options.invocation.execution.timeout_ms,
    effective_timeout_ms: options.invocation.execution.timeout_ms,
    supervisor: options.supervisor,
    child: null,
    exit_code: null,
    signal: null,
    requested: options.invocation.requested,
    actual: null,
    provider_model_attested: false,
    fallback_detected: false,
    authentication: options.auth ? {
      evidence_sha256: qualificationSha256(`${qualificationCanonicalJson(options.auth)}\n`),
      status: "ready",
      auth_type: "oauth",
      readiness_only: true,
    } : null,
    accounting_event_sha256: options.accountingEventSha ?? null,
    continuation_authority_sha256: options.continuationSha ?? null,
    stdout: outputReceipt(paths.root, stdoutPath, emptyCapture(stdoutPath)),
    stderr: outputReceipt(paths.root, stderrPath, emptyCapture(stderrPath)),
    artifact: null,
    error: options.error,
  };
  commitTerminalReceipt(paths.root, options.invocation, receipt);
}

function commitTerminalReceipt(spoolDir: string, invocation: QualificationInvocationV1, receipt: QualificationTerminalReceiptV1): void {
  const paths = qualificationSpoolPaths(spoolDir, invocation.invocation_id);
  if (existsSync(paths.terminal!)) {
    const existing = readTerminalReceipt(spoolDir, invocation);
    if (qualificationCanonicalJson(existing) !== qualificationCanonicalJson(receipt)) throw new Error(`qualification terminal receipt for ${invocation.invocation_id} is immutable`);
    return;
  }
  const temp = join(paths.invocation!, `.terminal-${randomBytes(10).toString("hex")}`);
  mkdirSync(temp, { mode: 0o700 });
  try {
    atomicWriteCanonical(join(temp, "receipt.json"), receipt, true);
    renameSync(temp, paths.terminal!);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  const lifecycle = readQualificationLifecycle(spoolDir, invocation.invocation_id);
  if (lifecycle.phase !== "terminal") {
    writeQualificationLifecycle(spoolDir, transitionQualificationLifecycle(lifecycle, "terminal", {
      at: receipt.finished_at,
      terminal_status: receipt.terminal_status,
      detail: { receipt_sha256: qualificationSha256(`${qualificationCanonicalJson(receipt)}\n`) },
    }));
  }
}

function readTerminalReceipt(spoolDir: string, invocation: QualificationInvocationV1): QualificationTerminalReceiptV1 {
  const path = join(qualificationSpoolPaths(spoolDir, invocation.invocation_id).terminal!, "receipt.json");
  const value = readCanonicalJson(path, `qualification terminal receipt ${invocation.invocation_id}`);
  validateTerminalReceipt(value, invocation);
  return value as QualificationTerminalReceiptV1;
}

function validateTerminalReceipt(value: unknown, invocation: QualificationInvocationV1): void {
  if (!plainObject(value)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} must be an object`);
  const required = ["schema_version", "invocation_id", "terminal_status", "attempt", "started_at", "finished_at", "deadline_at", "requested_timeout_ms", "effective_timeout_ms", "supervisor", "child", "exit_code", "signal", "requested", "actual", "provider_model_attested", "fallback_detected", "authentication", "accounting_event_sha256", "continuation_authority_sha256", "stdout", "stderr", "artifact", "error"];
  exactKeys(value, required, `qualification terminal receipt ${invocation.invocation_id}`);
  if (value.schema_version !== QUALIFICATION_TERMINAL_RECEIPT_VERSION || value.invocation_id !== invocation.invocation_id || (value.attempt !== 0 && value.attempt !== 1)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} identity/version mismatch`);
  if (!["completed", "failed", "timed-out", "aborted", "refused", "invalid-artifact"].includes(String(value.terminal_status))) throw new Error(`qualification terminal receipt ${invocation.invocation_id} has unknown status`);
  if (qualificationCanonicalJson(value.requested) !== qualificationCanonicalJson(invocation.requested)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} requested identity mismatch`);
}

function readAuthEvidence(spoolDir: string, invocation: QualificationInvocationV1): QualificationAuthEvidenceV1 {
  const path = join(qualificationSpoolPaths(spoolDir, invocation.invocation_id).invocation!, "auth-evidence.json");
  const evidence = readCanonicalJson(path, `qualification auth evidence ${invocation.invocation_id}`) as QualificationAuthEvidenceV1;
  validateAuthEvidence(evidence, invocation);
  return evidence;
}
function validateAuthEvidence(evidence: QualificationAuthEvidenceV1, invocation: QualificationInvocationV1): void {
  if (!plainObject(evidence)) throw new Error("qualification auth evidence must be an object");
  const keys = ["schema_version", "checked_at", "provider", "model", "status", "auth_type", "source", "credentials_included", "readiness_only", "removed_parent_environment_names", "child_environment_names", "executable_sha256"];
  exactKeys(evidence as unknown as Record<string, unknown>, keys, `qualification auth evidence ${invocation.invocation_id}`);
  if (evidence.schema_version !== QUALIFICATION_AUTH_EVIDENCE_VERSION || evidence.provider !== invocation.requested.provider || evidence.model !== invocation.requested.model || evidence.status !== "ready" || evidence.auth_type !== "oauth" || evidence.credentials_included !== false || evidence.readiness_only !== true) {
    throw new Error(`qualification auth evidence contradicts invocation ${invocation.invocation_id}`);
  }
}

export function redactQualificationOutput(text: string, secretValues: readonly string[] = []): string {
  let output = text;
  for (const secret of [...new Set(secretValues)].sort((left, right) => right.length - left.length)) {
    if (secret.length >= 8) output = output.split(secret).join("[REDACTED credential]");
  }
  output = output
    .replace(/\b([A-Z][A-Z0-9_]*(?:API_KEY|ACCESS_KEY|SECRET_KEY|AUTH_TOKEN|BEARER_TOKEN|SESSION_TOKEN))\s*[:=]\s*[^\s,;"']+/gi, "$1=[REDACTED credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED credential]")
    .replace(/\b(?:sk|sess|key|token)-[A-Za-z0-9._-]{8,}/gi, "[REDACTED credential]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED credential]");
  return redactText(output);
}

function qualificationCredentialRedactionValues(env: NodeJS.ProcessEnv): string[] {
  const agentDirectory = env.PI_CODING_AGENT_DIR ?? (env.HOME ? join(env.HOME, ".pi", "agent") : undefined);
  if (!agentDirectory) return [];
  let auth: unknown;
  try { auth = JSON.parse(readFileSync(join(agentDirectory, "auth.json"), "utf8")); }
  catch { return []; }
  const credential = plainObject(auth) ? auth["openai-codex"] : undefined;
  const values: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string" && value.length >= 8) values.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (plainObject(value)) Object.values(value).forEach(visit);
  };
  visit(credential);
  return values;
}

interface BoundedCapture {
  path: string;
  total_bytes: number;
  captured_bytes: number;
  truncated: boolean;
  write(chunk: Buffer): void;
  close(): void;
}
function openBoundedCapture(path: string, limit: number, redact: (text: string) => string): BoundedCapture {
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let acceptedRawBytes = 0;
  let closed = false;
  const persist = (text: string) => {
    if (!text) return;
    const sanitized = Buffer.from(redact(text), "utf8");
    const remaining = Math.max(0, limit - state.captured_bytes);
    const part = sanitized.subarray(0, remaining);
    if (part.length > 0) {
      writeSync(fd, part);
      state.captured_bytes += part.length;
      fsyncSync(fd);
    }
    if (sanitized.length > remaining) state.truncated = true;
  };
  const flushLines = () => {
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      persist(pending.slice(0, newline + 1));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  };
  const state: BoundedCapture = {
    path, total_bytes: 0, captured_bytes: 0, truncated: false,
    write(chunk) {
      state.total_bytes += chunk.length;
      const remainingRaw = Math.max(0, limit - acceptedRawBytes);
      const accepted = chunk.subarray(0, remainingRaw);
      acceptedRawBytes += accepted.length;
      if (accepted.length > 0) {
        pending += decoder.write(accepted);
        flushLines();
      }
      if (chunk.length > remainingRaw) state.truncated = true;
    },
    close() {
      if (closed) return;
      pending += decoder.end();
      persist(pending);
      pending = "";
      fsyncSync(fd);
      closeSync(fd);
      closed = true;
    },
  };
  return state;
}

function outputReceipt(spoolRoot: string, path: string, capture: BoundedCapture): QualificationOutputReceipt {
  const bytes = readFileSync(path);
  return {
    path: path.slice(spoolRoot.length + 1),
    total_bytes: capture.total_bytes,
    captured_bytes: bytes.length,
    truncated: capture.truncated,
    sha256: qualificationSha256(bytes),
  };
}
function verifyOutputReceipt(spoolRoot: string, receipt: QualificationOutputReceipt): void {
  const path = join(spoolRoot, receipt.path);
  assertRegularFile(path, `qualification output ${receipt.path}`);
  const bytes = readFileSync(path);
  if (bytes.length !== receipt.captured_bytes || qualificationSha256(bytes) !== receipt.sha256) throw new Error(`qualification output ${receipt.path} digest/size mismatch`);
}

interface ArtifactAttestation {
  ok: boolean;
  actual: { provider: string; model: string } | null;
  fallback: boolean;
  refused: boolean;
  error: string | null;
}
function attestPiJsonl(text: string, requested: { provider: string; model: string }): ArtifactAttestation {
  const records: Record<string, unknown>[] = [];
  try {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const value = JSON.parse(line) as unknown;
      if (!plainObject(value)) throw new Error("event is not an object");
      records.push(value);
    }
  } catch {
    return { ok: false, actual: null, fallback: false, refused: false, error: "artifact is not valid JSONL" };
  }
  const fallback = records.some((record) => record.type === "provider_fallback" || record.type === "model_fallback" || Object.hasOwn(record, "fallback_provider") || Object.hasOwn(record, "fallback_model"));
  const messages = records
    .filter((record) => record.type === "message_end" && plainObject(record.message) && record.message.role === "assistant")
    .map((record) => record.message as Record<string, unknown>);
  if (messages.length === 0) return { ok: false, actual: null, fallback, refused: false, error: "artifact has no authoritative assistant provider/model identity" };
  const identities = messages.map((message) => ({ provider: stringValue(message.provider), model: stringValue(message.model) }));
  if (identities.some((identity) => !identity.provider || !identity.model)) return { ok: false, actual: null, fallback, refused: false, error: "artifact assistant identity is missing provider or model" };
  const actual = { provider: identities.at(-1)!.provider!, model: identities.at(-1)!.model! };
  if (fallback) return { ok: false, actual, fallback: true, refused: false, error: "artifact reports provider/model fallback" };
  if (identities.some((identity) => identity.provider !== requested.provider)) return { ok: false, actual, fallback: false, refused: false, error: `provider substitution: requested ${requested.provider}, observed ${actual.provider}` };
  if (identities.some((identity) => identity.model !== requested.model)) return { ok: false, actual, fallback: false, refused: false, error: `model substitution: requested ${requested.model}, observed ${actual.model}` };
  const terminal = messages.at(-1)!;
  const errorMessage = stringValue(terminal.errorMessage) ?? "";
  const refused = terminal.stopReason === "error" && /(?:refus|not supported|not available|subscription|usage limit|unauthor)/i.test(errorMessage);
  if (terminal.stopReason === "error" && !refused) return { ok: false, actual, fallback: false, refused: false, error: errorMessage || "assistant ended with an error" };
  return { ok: true, actual, fallback: false, refused, error: refused ? errorMessage : null };
}

function assertInputUnchanged(invocation: QualificationInvocationV1): void {
  assertRegularFile(invocation.scenario.input_path, `qualification input ${invocation.invocation_id}`);
  const digest = qualificationSha256(readFileSync(invocation.scenario.input_path));
  if (digest !== invocation.scenario.input_sha256) throw new Error(`qualification input changed after preparation for ${invocation.invocation_id}`);
}
function assertChildEnvironment(env: NodeJS.ProcessEnv, allowedNames: readonly string[]): void {
  const allowed = new Set(allowedNames);
  const extra = Object.keys(env).find((name) => !allowed.has(name));
  if (extra) throw new Error(`qualification child environment contains undeclared name ${extra}`);
  // Re-run the policy over the already-sanitized map so a caller cannot bypass
  // the parent-boundary function by invoking the supervisor directly.
  sanitizeQualificationEnvironment(env, allowedNames, "refuse");
}

function terminateQualificationProcess(child: ChildProcess, identity: QualificationProcessIdentity | null): void {
  if (identity && !qualificationProcessMatches(identity)) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch { /* process already exited */ }
  setTimeout(() => {
    if (identity && !qualificationProcessMatches(identity)) return;
    try {
      if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch { /* process already exited */ }
  }, 75).unref();
}
function terminateByIdentity(identity: QualificationProcessIdentity): void {
  if (!qualificationProcessMatches(identity)) throw new Error(`qualification process identity for pid ${identity.pid} is stale or reused`);
  try {
    if (process.platform !== "win32") process.kill(-identity.pid, "SIGTERM");
    else process.kill(identity.pid, "SIGTERM");
  } catch { /* supervisor will reconcile the terminal state */ }
  setTimeout(() => {
    if (!qualificationProcessMatches(identity)) return;
    try {
      if (process.platform !== "win32") process.kill(-identity.pid, "SIGKILL");
      else process.kill(identity.pid, "SIGKILL");
    } catch { /* process already exited */ }
  }, 75).unref();
}

async function spawnCapture(command: string, argv: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeout_ms: number; output_limit_bytes: number }): Promise<{ stdout: string; stderr: string; code: number | null; timed_out: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), timedOut = false;
    const append = (current: Buffer, chunk: Buffer) => Buffer.concat([current, chunk]).subarray(0, options.output_limit_bytes);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, options.timeout_ms);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), code, timed_out: timedOut }); });
  });
}

async function withAsyncLock<T>(path: string, action: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const token = randomBytes(16).toString("hex");
  while (true) {
    try {
      mkdirSync(path, { mode: 0o700 });
      atomicWriteCanonical(join(path, "owner.json"), {
        schema_version: "qualification-lock-owner-v1",
        token,
        process: qualificationProcessIdentity(process.pid),
      }, true);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const ownerPath = join(path, "owner.json");
      // Give the winning mkdir a moment to publish its owner receipt. An empty
      // persistent lock is contradictory state, not permission to delete it.
      if (!existsSync(ownerPath)) {
        if (Date.now() >= deadline) throw new Error(`qualification state lock has no owner receipt: ${path}`);
        await sleep(10);
        continue;
      }
      const owner = readCanonicalJson(ownerPath, `qualification lock owner ${path}`);
      const identity = plainObject(owner) ? processIdentityFrom(owner.process) : null;
      if (!identity) throw new Error(`qualification state lock owner is corrupt: ${path}`);
      if (!qualificationProcessMatches(identity)) {
        const stale = `${path}.stale-${token}`;
        try { renameSync(path, stale); }
        catch (renameError) {
          if ((renameError as NodeJS.ErrnoException).code === "ENOENT") continue;
          throw renameError;
        }
        rmSync(stale, { recursive: true, force: true });
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`qualification state lock timed out: ${path}`);
      await sleep(10);
    }
  }
  try { return await action(); }
  finally {
    const ownerPath = join(path, "owner.json");
    if (existsSync(ownerPath)) {
      const owner = readCanonicalJson(ownerPath, `qualification lock owner ${path}`) as Record<string, unknown>;
      if (owner.token === token) rmSync(path, { recursive: true, force: true });
    }
  }
}

function atomicWriteRaw(path: string, bytes: Buffer, exclusive: boolean): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${randomBytes(12).toString("hex")}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    writeFileSync(fd, bytes);
    fsyncSync(fd);
    closeSync(fd); fd = undefined;
    if (exclusive) { linkSync(temp, path); unlinkSync(temp); }
    else renameSync(temp, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`qualification immutable artifact already exists: ${path}`);
    throw error;
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temp, { force: true });
  }
}
function assertRegularFile(path: string, ctx: string): void {
  let stat;
  try { stat = lstatSync(path); }
  catch { throw new Error(`${ctx} is missing`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${ctx} must be a regular non-symlink file`);
}
function processIdentityFrom(value: unknown): QualificationProcessIdentity | null {
  if (!plainObject(value) || !Number.isInteger(value.pid)) return null;
  return { pid: Number(value.pid), platform: String(value.platform) as NodeJS.Platform, boot_id: stringValue(value.boot_id) ?? null, start_ticks: stringValue(value.start_ticks) ?? null };
}
function plainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], ctx: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${ctx} contains unknown field ${unknown}`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${ctx} is missing field ${missing}`);
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function timestamp(value: string, ctx: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${ctx} is not an RFC 3339 UTC timestamp`);
  return value;
}
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(?:sk|key|token)-[A-Za-z0-9._-]+/gi, "[REDACTED]").slice(0, 2048);
}
