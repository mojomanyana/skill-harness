import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  attestQualificationPiJsonl as attestPiJsonl,
  openQualificationBoundedCapture as openBoundedCapture,
  qualificationOutputReceipt as outputReceipt,
  redactQualificationOutput,
  spawnQualificationCapture as spawnCapture,
  verifyQualificationOutputReceipt as verifyOutputReceipt,
  type QualificationArtifactAttestation as ArtifactAttestation,
  type QualificationBoundedCapture as BoundedCapture,
  type QualificationOutputReceipt,
} from "./qualification-capture.js";
export { redactQualificationOutput } from "./qualification-capture.js";
export type { QualificationOutputReceipt } from "./qualification-capture.js";
import {
  cleanupQualificationProcessGroupAfterLeaderExit,
  qualificationProcessIdentity,
  qualificationProcessMatches,
  terminateInterruptedQualificationProcessGroup,
  terminateQualificationByIdentity,
  terminateQualificationProcess,
  type QualificationProcessIdentity,
} from "./qualification-process.js";
export { qualificationProcessIdentity, qualificationProcessMatches } from "./qualification-process.js";
export type { QualificationProcessIdentity } from "./qualification-process.js";
import {
  sanitizeQualificationEnvironment,
  qualificationCanonicalJson,
  qualificationSha256,
  verifyQualificationExecutable,
  verifyQualificationPins,
  verifyQualificationResource,
  type QualificationRole,
} from "./qualification-config.js";
import {
  appendQualificationAccountingEvent,
  atomicWriteBytes,
  atomicWriteCanonical,
  fsyncQualificationDirectory,
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
  evidence_sha256: string;
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
  provider_model_identity_observed: boolean;
  successful_execution: boolean;
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
  let agentStat;
  try { agentStat = lstatSync(agentDirectory); }
  catch { throw new Error("qualification OAuth agent directory is missing"); }
  if (agentStat.isSymbolicLink() || !agentStat.isDirectory()) throw new Error("qualification OAuth agent directory must be a regular non-symlink directory");
  if (process.platform !== "win32" && ((agentStat.mode & 0o077) !== 0 || agentStat.uid !== process.getuid?.())) {
    throw new Error("qualification OAuth agent directory must be private and owned by the qualification user");
  }
  const authPath = join(agentDirectory, "auth.json");
  let auth: unknown;
  try { auth = JSON.parse(readPrivateRegularFile(authPath, "qualification OAuth auth.json").toString("utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error("qualification OAuth auth.json is invalid JSON");
    throw error;
  }
  if (!plainObject(auth)) throw new Error("qualification OAuth auth.json must be an object");
  if (qualificationCanonicalJson(Object.keys(auth).sort()) !== qualificationCanonicalJson(["openai-codex"])) {
    throw new Error("qualification dedicated OAuth credential store must contain exactly the openai-codex OAuth credential");
  }
  const codex = auth["openai-codex"];
  if (!plainObject(codex) || codex.type !== "oauth") throw new Error("qualification openai-codex credential is missing or is not OAuth");
  const modelsPath = join(agentDirectory, "models.json");
  if (existsSync(modelsPath)) {
    let models: unknown;
    try { models = JSON.parse(readPrivateRegularFile(modelsPath, "qualification Pi models.json").toString("utf8")); }
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
  const paths = qualificationSpoolPaths(options.spool_dir, options.invocation_id);
  const initialLifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
  if (initialLifecycle.phase === "terminal" || existsSync(paths.terminal!)) {
    throw new Error(`qualification authentication cannot be refreshed after invocation ${invocation.invocation_id} is terminal`);
  }
  const initialSupervisor = latestContinuationSupervisor(paths.invocation!) ?? latestProcessIdentity(initialLifecycle, "supervisor");
  if (initialLifecycle.phase !== "prepared" && initialSupervisor && qualificationProcessMatches(initialSupervisor)) {
    throw new Error(`qualification authentication cannot be refreshed while invocation ${invocation.invocation_id} has a live supervisor`);
  }
  verifyQualificationPins(config);
  assertRunningQualificationRunner(config.mode, config.runner.executable);
  verifyQualificationExecutable(config.runner.executable);
  const executable = verifyQualificationExecutable(arm.executable);
  assertQualificationExecutableIdentity(invocation, executable);
  for (const resource of invocation.execution.resources) verifyQualificationResource(resource);
  assertQualificationWorkingDirectory(invocation);
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
  const evidenceBase: Omit<QualificationAuthEvidenceV1, "evidence_sha256"> = {
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
  const evidence: QualificationAuthEvidenceV1 = {
    ...evidenceBase,
    evidence_sha256: qualificationSha256(qualificationCanonicalJson(evidenceBase)),
  };
  const authPath = join(paths.invocation!, "auth-evidence.json");
  const published = await withAsyncLock(paths.invocationLock!, async () => {
    const lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
    if (lifecycle.phase === "terminal" || existsSync(paths.terminal!)) {
      throw new Error(`qualification authentication cannot be refreshed after invocation ${invocation.invocation_id} is terminal`);
    }
    const activeSupervisor = latestContinuationSupervisor(paths.invocation!) ?? latestProcessIdentity(lifecycle, "supervisor");
    if (lifecycle.phase !== "prepared" && activeSupervisor && qualificationProcessMatches(activeSupervisor)) {
      throw new Error(`qualification authentication cannot be refreshed while invocation ${invocation.invocation_id} has a live supervisor`);
    }
    if (existsSync(authPath)) {
      const existing = readCanonicalJson(authPath, `qualification auth evidence ${options.invocation_id}`) as QualificationAuthEvidenceV1;
      try {
        validateAuthEvidence(existing, invocation, true);
        if (existing.provider !== evidence.provider || existing.model !== evidence.model || existing.executable_sha256 !== evidence.executable_sha256) {
          throw new Error("qualification auth evidence contradicts the current invocation");
        }
        return existing;
      } catch (error) {
        if (!(error instanceof Error) || !/auth evidence.*stale/i.test(error.message)) throw error;
      }
      atomicWriteCanonical(authPath, evidence, false);
      return evidence;
    }
    atomicWriteCanonical(authPath, evidence, true);
    return evidence;
  });
  return { evidence: published, child_env: sanitized.env };
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
  const paths = qualificationSpoolPaths(options.spool_dir, options.invocation_id);
  if (existsSync(paths.terminal!)) {
    reconcileTerminalLifecycle(paths.root, invocation);
    return;
  }
  verifyQualificationPins(config);
  assertRunningQualificationRunner(config.mode, config.runner.executable);
  verifyQualificationExecutable(config.runner.executable);
  assertQualificationExecutableIdentity(invocation, verifyQualificationExecutable(arm.executable));
  for (const resource of invocation.execution.resources) verifyQualificationResource(resource);
  assertQualificationWorkingDirectory(invocation);
  assertInputUnchanged(invocation);
  assertChildEnvironment(options.child_env, arm.allowed_environment_names);
  if (config.mode === "production") assertQualificationOAuthCredentialBoundary(options.child_env);
  const auth = readAuthEvidence(options.spool_dir, invocation);
  const supervisorIdentity = qualificationProcessIdentity(process.pid);
  let ownsLaunch = false;
  let reconcileExistingAttempt = false;
  let accountingEventSha = "";
  let continuationSha: string | null = null;

  await withAsyncLock(paths.lock, async () => {
    await withAsyncLock(paths.invocationLock!, async () => {
      let lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
      if (lifecycle.phase === "terminal" || existsSync(paths.terminal!)) {
        if (existsSync(paths.terminal!)) reconcileTerminalLifecycle(paths.root, invocation);
        return;
      }
      const ledger = readQualificationAccounting(paths.root);
      const existingClaim = ledger.events.find((event) => event.invocation_id === invocation.invocation_id);
      if (existingClaim) {
        accountingEventSha = existingClaim.event_sha256;
        const launchAttemptExists = existsSync(join(paths.invocation!, "launch-attempt.json"));
        const priorSupervisor = latestContinuationSupervisor(paths.invocation!) ?? latestProcessIdentity(lifecycle, "supervisor");
        if (lifecycle.phase !== "prepared" && priorSupervisor && qualificationProcessMatches(priorSupervisor)) return;
        if (!options.continuation_authority) {
          throw new Error("qualification launch claim was interrupted; explicit continuation authority is required and no relaunch is permitted automatically");
        }
        continuationSha = recordContinuationAuthority(paths.root, invocation, options.continuation_authority, priorSupervisor, supervisorIdentity, now());
        if (launchAttemptExists || lifecycle.phase === "running") {
          reconcileExistingAttempt = true;
          ownsLaunch = true;
          return;
        }
        if (lifecycle.phase !== "prepared" && lifecycle.phase !== "launch-claimed") {
          throw new Error(`qualification interrupted lifecycle ${lifecycle.phase} cannot be continued`);
        }
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
      if (lifecycle.phase === "prepared") {
        lifecycle = transitionQualificationLifecycle(lifecycle, "launch-claimed", {
          at: timestamp(now(), "qualification launch claim time"),
          detail: {
            attempt: 1,
            accounting_event_sha256: accountingEventSha,
            supervisor: supervisorIdentity,
            continuation_authority_sha256: continuationSha,
          },
        });
        writeQualificationLifecycle(paths.root, lifecycle);
      }
      ownsLaunch = true;
    });
  });
  if (!ownsLaunch) return;
  if (reconcileExistingAttempt) {
    await reconcileInterruptedAttempt({
      invocation,
      spoolDir: paths.root,
      supervisor: supervisorIdentity,
      auth,
      accountingEventSha,
      continuationSha,
      now: now(),
      status: existsSync(join(paths.invocation!, "abort-request.json")) ? "aborted" : "failed",
      error: existsSync(join(paths.invocation!, "abort-request.json")) ? "aborted during interrupted launch" : "interrupted launch reconciled without replay",
    });
    return;
  }

  const launchAttemptPath = join(paths.invocation!, "launch-attempt.json");
  if (existsSync(launchAttemptPath)) throw new Error("qualification launch attempt already exists; automatic retry is prohibited");
  if (existsSync(join(paths.invocation!, "abort-request.json"))) {
    await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: "aborted", supervisor: supervisorIdentity, auth, now: now(), error: "aborted after launch claim", accountingEventSha, continuationSha });
    return;
  }
  const artifactAbsolute = join(paths.root, invocation.expected_artifact.path);
  const argv = buildQualificationArgv(invocation, artifactAbsolute);
  const attemptAt = timestamp(now(), "qualification launch attempt time");
  try {
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
  } catch (error) {
    await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: "failed", supervisor: supervisorIdentity, auth, now: now(), error: `launch-attempt publication failed: ${safeError(error)}`, accountingEventSha, continuationSha });
    return;
  }

  const stdoutPartial = join(paths.invocation!, "stdout.partial");
  const stderrPartial = join(paths.invocation!, "stderr.partial");
  const credentialValues = config.mode === "production" ? qualificationCredentialRedactionValues(options.child_env) : [];
  const outputRedactor = (text: string) => redactQualificationOutput(text, credentialValues);
  let stdoutCapture: BoundedCapture | null = null;
  let stderrCapture: BoundedCapture | null = null;
  try {
    // The claim and immutable attempt already exist. Revalidate every external
    // production pin and every materialized launch input immediately before spawn.
    verifyQualificationPins(config);
    assertQualificationExecutableIdentity(invocation, verifyQualificationExecutable(arm.executable));
    for (const resource of invocation.execution.resources) verifyQualificationResource(resource);
    assertQualificationWorkingDirectory(invocation);
    assertInputUnchanged(invocation);
    stdoutCapture = openBoundedCapture(stdoutPartial, arm.output_limit_bytes, outputRedactor);
    stderrCapture = openBoundedCapture(stderrPartial, arm.output_limit_bytes, outputRedactor);
  } catch (error) {
    stdoutCapture?.close();
    stderrCapture?.close();
    await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: "failed", supervisor: supervisorIdentity, auth, now: now(), error: `post-claim setup failed: ${safeError(error)}`, accountingEventSha, continuationSha });
    return;
  }
  if (!stdoutCapture || !stderrCapture) throw new Error("qualification output capture setup did not complete");
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
  child.stdout?.on("data", (chunk: Buffer) => stdoutCapture.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderrCapture.write(chunk));
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
  try {
    if (!childIdentity) throw new Error(childIdentityError ?? "child process occurrence identity is unavailable");
    atomicWriteCanonical(join(paths.invocation!, "child-occurrence.json"), {
      schema_version: "qualification-child-occurrence-v1",
      invocation_id: invocation.invocation_id,
      attempt: 1,
      started_at: startedAt,
      deadline_at: deadlineAt,
      child: childIdentity,
    }, true);
    await withAsyncLock(paths.invocationLock!, async () => {
      const lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
      if (lifecycle.phase !== "launch-claimed") throw new Error(`qualification invocation entered ${lifecycle.phase} before process start could be recorded`);
      writeQualificationLifecycle(paths.root, transitionQualificationLifecycle(lifecycle, "running", {
        at: startedAt,
        detail: { attempt: 1, supervisor: supervisorIdentity, child: childIdentity, deadline_at: deadlineAt, continuation_authority_sha256: continuationSha },
      }));
    });
  } catch (error) {
    terminateQualificationProcess(child, childIdentity);
    const outcome = await closed;
    await cleanupQualificationProcessGroupAfterLeaderExit(child.pid, childIdentity);
    stdoutCapture.close();
    stderrCapture.close();
    await finalizeAfterCapture({ invocation, spoolDir: paths.root, terminalStatus: "failed", supervisor: supervisorIdentity, child: childIdentity, auth, accountingEventSha, continuationSha, startedAt, deadlineAt, exitCode: outcome.code, signal: outcome.signal, stdoutCapture, stderrCapture, now: now(), error: `process occurrence publication failed: ${safeError(error)}` });
    return;
  }

  let termination: "exit" | "timeout" | "abort" = "exit";
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
  await cleanupQualificationProcessGroupAfterLeaderExit(child.pid, childIdentity);
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
  if (existsSync(join(paths.terminal!, "receipt.json"))) reconcileTerminalLifecycle(paths.root, invocation);
  const lifecycle = readQualificationLifecycle(spoolDir, invocationId);
  const receipt = existsSync(join(paths.terminal!, "receipt.json")) ? readTerminalReceipt(spoolDir, invocation) : null;
  if (receipt && lifecycle.phase === "terminal" && lifecycle.terminal_status !== receipt.terminal_status) {
    throw new Error(`qualification invocation ${invocationId} terminal receipt contradicts lifecycle state`);
  }
  const latest = lifecycle.events[lifecycle.events.length - 1]?.detail ?? {};
  const supervisor = receipt?.supervisor ?? latestContinuationSupervisor(paths.invocation!) ?? latestProcessIdentity(lifecycle, "supervisor");
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
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.reason)) throw new Error("qualification abort reason must be a bounded identifier");
  const paths = qualificationSpoolPaths(options.spool_dir, options.invocation_id);
  const requestedAt = timestamp((options.now ?? (() => new Date().toISOString()))(), "qualification abort time");
  let childToTerminate: QualificationProcessIdentity | null = null;
  await withAsyncLock(paths.lock, async () => {
    await withAsyncLock(paths.invocationLock!, async () => {
      const invocation = readQualificationInvocation(paths.root, options.invocation_id);
      const lifecycle = readQualificationLifecycle(paths.root, options.invocation_id);
      if (lifecycle.phase === "terminal" || existsSync(paths.terminal!)) {
        if (existsSync(paths.terminal!)) reconcileTerminalLifecycle(paths.root, invocation);
        return;
      }
      const request = { schema_version: "qualification-abort-request-v1", invocation_id: invocation.invocation_id, requested_at: requestedAt, reason: options.reason };
      const abortPath = join(paths.invocation!, "abort-request.json");
      if (!existsSync(abortPath)) atomicWriteCanonical(abortPath, request, true);
      const accountingEvent = readQualificationAccounting(paths.root).events.find((event) => event.invocation_id === invocation.invocation_id);
      const authPath = join(paths.invocation!, "auth-evidence.json");
      const auth = existsSync(authPath) ? readAuthEvidence(paths.root, invocation, false) : null;
      if (lifecycle.phase === "prepared") {
        await finalizeWithoutChild({
          invocation,
          spoolDir: paths.root,
          status: "aborted",
          supervisor: qualificationProcessIdentity(process.pid),
          auth,
          now: requestedAt,
          error: options.reason,
          accountingEventSha: accountingEvent?.event_sha256,
        });
        return;
      }
      if (!accountingEvent) throw new Error(`qualification nonterminal invocation ${invocation.invocation_id} has no accounting claim`);
      const priorSupervisor = latestContinuationSupervisor(paths.invocation!) ?? latestProcessIdentity(lifecycle, "supervisor");
      const child = readChildOccurrence(paths.invocation!, invocation, false)?.child ?? latestProcessIdentity(lifecycle, "child");
      if (priorSupervisor && qualificationProcessMatches(priorSupervisor)) {
        childToTerminate = child;
        return;
      }
      const continuationRecord = readContinuationRecord(paths.invocation!);
      await reconcileInterruptedAttempt({
        invocation,
        spoolDir: paths.root,
        supervisor: qualificationProcessIdentity(process.pid),
        auth,
        accountingEventSha: accountingEvent.event_sha256,
        continuationSha: continuationRecord ? String(continuationRecord.authority_sha256) : null,
        now: requestedAt,
        status: "aborted",
        error: options.reason,
        child,
      });
    });
  });
  if (childToTerminate && qualificationProcessMatches(childToTerminate)) terminateQualificationByIdentity(childToTerminate);
  return qualificationInvocationStatus(paths.root, options.invocation_id);
}

export function validateQualificationRunnerSpool(spoolDir: string): ReturnType<typeof validateQualificationSpool> & { terminal: number } {
  const report = validateQualificationSpool(spoolDir);
  const paths = qualificationSpoolPaths(spoolDir);
  const invocationIds = readdirSync(paths.invocations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const accountingLedger = readQualificationAccounting(paths.root);
  const expectedArtifacts = new Set<string>();
  let terminal = 0;
  for (const id of invocationIds) {
    const invocation = readQualificationInvocation(paths.root, id);
    assertInputUnchanged(invocation);
    for (const resource of invocation.execution.resources) verifyQualificationResource(resource);
    const invocationPaths = qualificationSpoolPaths(paths.root, id);
    if (existsSync(join(invocationPaths.terminal!, "receipt.json"))) reconcileTerminalLifecycle(paths.root, invocation);
    const lifecycle = readQualificationLifecycle(paths.root, id);
    const accountingEvent = accountingLedger.events.find((event) => event.invocation_id === id);
    const launchAttemptPath = join(invocationPaths.invocation!, "launch-attempt.json");
    const hasLaunchAttempt = existsSync(launchAttemptPath);
    if (hasLaunchAttempt) {
      const attempt = readCanonicalJson(launchAttemptPath, `qualification launch attempt ${id}`);
      validateLaunchAttempt(attempt, invocation, paths.root);
      if (!accountingEvent) throw new Error(`qualification launch attempt ${id} has no accounting claim`);
    }
    if ((lifecycle.phase === "launch-claimed" || lifecycle.phase === "running") && !accountingEvent) {
      throw new Error(`qualification lifecycle ${id} advanced without an accounting claim`);
    }
    const continuationRecord = readContinuationRecord(invocationPaths.invocation!);
    if (continuationRecord && continuationRecord.invocation_id !== id) throw new Error(`qualification continuation authority ${id} has the wrong invocation identity`);
    const childOccurrence = readChildOccurrence(invocationPaths.invocation!, invocation, false);
    if (childOccurrence && (!hasLaunchAttempt || !accountingEvent)) throw new Error(`qualification child occurrence ${id} has no launch/accounting claim`);
    if (lifecycle.phase === "running" && (!childOccurrence || qualificationCanonicalJson(latestProcessIdentity(lifecycle, "child")) !== qualificationCanonicalJson(childOccurrence.child))) {
      throw new Error(`qualification running lifecycle ${id} is not bound to its child occurrence`);
    }
    const receiptPath = join(invocationPaths.terminal!, "receipt.json");
    if (existsSync(receiptPath)) {
      terminal += 1;
      const receipt = readTerminalReceipt(paths.root, invocation);
      if (lifecycle.phase !== "terminal" || lifecycle.terminal_status !== receipt.terminal_status) throw new Error(`qualification terminal receipt for ${id} contradicts lifecycle`);
      const receiptDigest = qualificationSha256(`${qualificationCanonicalJson(receipt)}\n`);
      if (lifecycle.events.at(-1)?.detail.receipt_sha256 !== receiptDigest) throw new Error(`qualification terminal receipt for ${id} is not bound by the lifecycle chain`);
      const expectedAttempt = accountingEvent ? 1 : 0;
      if (receipt.attempt !== expectedAttempt) throw new Error(`qualification terminal receipt for ${id} attempt contradicts accounting`);
      if (receipt.accounting_event_sha256 !== (accountingEvent?.event_sha256 ?? null)) throw new Error(`qualification terminal receipt for ${id} accounting digest mismatch`);
      if (receipt.started_at !== null && !hasLaunchAttempt) throw new Error(`qualification started terminal receipt for ${id} has no immutable launch attempt`);
      if (receipt.attempt === 0 && hasLaunchAttempt) throw new Error(`qualification attempt-zero receipt for ${id} has a launch-attempt record`);
      if (childOccurrence && (qualificationCanonicalJson(receipt.child) !== qualificationCanonicalJson(childOccurrence.child) || receipt.started_at !== childOccurrence.started_at || receipt.deadline_at !== childOccurrence.deadline_at)) {
        throw new Error(`qualification terminal receipt for ${id} contradicts child occurrence evidence`);
      }
      const expectedContinuationSha = continuationRecord ? String(continuationRecord.authority_sha256) : null;
      if (receipt.continuation_authority_sha256 !== expectedContinuationSha) throw new Error(`qualification terminal receipt for ${id} continuation authority mismatch`);
      if (receipt.authentication) {
        const authEvidence = readAuthEvidence(paths.root, invocation, false);
        const authDigest = qualificationSha256(`${qualificationCanonicalJson(authEvidence)}\n`);
        if (receipt.authentication.evidence_sha256 !== authDigest) throw new Error(`qualification terminal receipt for ${id} authentication evidence mismatch`);
      } else if (receipt.attempt !== 0 || receipt.terminal_status !== "aborted") {
        throw new Error(`qualification terminal receipt for ${id} is missing authentication evidence`);
      }
      verifyOutputReceipt(paths.root, receipt.stdout);
      verifyOutputReceipt(paths.root, receipt.stderr);
      if (receipt.artifact) {
        expectedArtifacts.add(receipt.artifact.path.split("/").at(-1)!);
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

interface QualificationChildOccurrence {
  schema_version: "qualification-child-occurrence-v1";
  invocation_id: string;
  attempt: 1;
  started_at: string;
  deadline_at: string;
  child: QualificationProcessIdentity;
}

function readChildOccurrence(invocationDir: string, invocation: QualificationInvocationV1, required: boolean): QualificationChildOccurrence | null {
  const path = join(invocationDir, "child-occurrence.json");
  if (!existsSync(path)) {
    if (required) throw new Error(`qualification child occurrence for ${invocation.invocation_id} is missing`);
    return null;
  }
  const value = readCanonicalJson(path, `qualification child occurrence ${invocation.invocation_id}`);
  if (!plainObject(value)) throw new Error(`qualification child occurrence ${invocation.invocation_id} must be an object`);
  exactKeys(value, ["schema_version", "invocation_id", "attempt", "started_at", "deadline_at", "child"], `qualification child occurrence ${invocation.invocation_id}`);
  const child = processIdentityFrom(value.child);
  if (value.schema_version !== "qualification-child-occurrence-v1" || value.invocation_id !== invocation.invocation_id || value.attempt !== 1 || !child) {
    throw new Error(`qualification child occurrence ${invocation.invocation_id} identity/version mismatch`);
  }
  const startedAt = timestamp(String(value.started_at), `qualification child occurrence ${invocation.invocation_id} start time`);
  const deadlineAt = timestamp(String(value.deadline_at), `qualification child occurrence ${invocation.invocation_id} deadline`);
  if (Date.parse(deadlineAt) < Date.parse(startedAt)) throw new Error(`qualification child occurrence ${invocation.invocation_id} deadline precedes start`);
  return { schema_version: "qualification-child-occurrence-v1", invocation_id: invocation.invocation_id, attempt: 1, started_at: startedAt, deadline_at: deadlineAt, child };
}

function latestProcessIdentity(lifecycle: QualificationLifecycleV1, field: "supervisor" | "child"): QualificationProcessIdentity | null {
  for (let index = lifecycle.events.length - 1; index >= 0; index -= 1) {
    const identity = processIdentityFrom(lifecycle.events[index].detail[field]);
    if (identity) return identity;
  }
  return null;
}

function readContinuationRecord(invocationDir: string): Record<string, unknown> | null {
  const directory = join(invocationDir, "continuations");
  if (!existsSync(directory)) return null;
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("qualification continuation authority directory is invalid");
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  let previousSha: string | null = null;
  let latest: Record<string, unknown> | null = null;
  entries.forEach((entry, index) => {
    const expectedName = `${String(index + 1).padStart(6, "0")}.json`;
    if (!entry.isFile() || entry.name !== expectedName) throw new Error("qualification continuation authority sequence is non-contiguous");
    const value = readCanonicalJson(join(directory, entry.name), `qualification continuation authority ${index + 1}`);
    if (!plainObject(value)) throw new Error("qualification continuation authority must be an object");
    exactKeys(value, ["schema_version", "invocation_id", "seq", "authorized_at", "authority_sha256", "previous_record_sha256", "prior_supervisor", "new_supervisor", "record_sha256"], "qualification continuation authority");
    const { record_sha256: digest, ...base } = value;
    if (value.schema_version !== "qualification-continuation-authority-v1" || value.seq !== index + 1 || value.previous_record_sha256 !== previousSha ||
        typeof digest !== "string" || qualificationSha256(qualificationCanonicalJson(base)) !== digest ||
        !/^[a-f0-9]{64}$/.test(String(value.authority_sha256)) || !processIdentityFrom(value.new_supervisor)) {
      throw new Error("qualification continuation authority is corrupt");
    }
    timestamp(String(value.authorized_at), "qualification continuation authority time");
    previousSha = digest;
    latest = value;
  });
  return latest;
}

function latestContinuationSupervisor(invocationDir: string): QualificationProcessIdentity | null {
  const record = readContinuationRecord(invocationDir);
  return record ? processIdentityFrom(record.new_supervisor) : null;
}

function recordContinuationAuthority(
  spoolDir: string,
  invocation: QualificationInvocationV1,
  authority: string,
  priorSupervisor: QualificationProcessIdentity | null,
  newSupervisor: QualificationProcessIdentity,
  authorizedAt: string,
): string {
  if (!authority.trim() || Buffer.byteLength(authority, "utf8") > 4096) throw new Error("qualification continuation authority must be nonblank and at most 4096 bytes");
  const paths = qualificationSpoolPaths(spoolDir, invocation.invocation_id);
  const directory = join(paths.invocation!, "continuations");
  const previous = readContinuationRecord(paths.invocation!);
  if (previous && previous.invocation_id !== invocation.invocation_id) throw new Error("qualification continuation authority invocation mismatch");
  const authoritySha = qualificationSha256(authority);
  const base = {
    schema_version: "qualification-continuation-authority-v1",
    invocation_id: invocation.invocation_id,
    seq: previous ? Number(previous.seq) + 1 : 1,
    authorized_at: timestamp(authorizedAt, "qualification continuation authority time"),
    authority_sha256: authoritySha,
    previous_record_sha256: previous ? String(previous.record_sha256) : null,
    prior_supervisor: priorSupervisor,
    new_supervisor: newSupervisor,
  };
  const nextPath = join(directory, `${String(base.seq).padStart(6, "0")}.json`);
  atomicWriteCanonical(nextPath, { ...base, record_sha256: qualificationSha256(qualificationCanonicalJson(base)) }, true);
  return authoritySha;
}

async function reconcileInterruptedAttempt(options: {
  invocation: QualificationInvocationV1;
  spoolDir: string;
  supervisor: QualificationProcessIdentity;
  auth: QualificationAuthEvidenceV1 | null;
  accountingEventSha: string;
  continuationSha: string | null;
  now: string;
  status: "aborted" | "failed";
  error: string;
  child?: QualificationProcessIdentity | null;
}): Promise<void> {
  if (!options.accountingEventSha) throw new Error(`qualification interrupted invocation ${options.invocation.invocation_id} has no accounting claim`);
  const paths = qualificationSpoolPaths(options.spoolDir, options.invocation.invocation_id);
  const occurrence = readChildOccurrence(paths.invocation!, options.invocation, false);
  const child = options.child ?? occurrence?.child ?? latestProcessIdentity(readQualificationLifecycle(paths.root, options.invocation.invocation_id), "child");
  if (child) {
    await terminateInterruptedQualificationProcessGroup(child);
    if (qualificationProcessMatches(child)) throw new Error(`qualification interrupted child ${child.pid} could not be terminated safely`);
  }
  await finalizeWithoutChild({
    invocation: options.invocation,
    spoolDir: paths.root,
    status: options.status,
    supervisor: options.supervisor,
    auth: options.auth,
    now: options.now,
    error: options.error,
    accountingEventSha: options.accountingEventSha,
    continuationSha: options.continuationSha,
    child,
    startedAt: occurrence?.started_at ?? null,
    deadlineAt: occurrence?.deadline_at ?? null,
    outputIncomplete: Boolean(occurrence) || existsSync(join(paths.invocation!, "launch-attempt.json")),
  });
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
  const stdoutFinal = join(paths.invocation!, "stdout.partial");
  const stderrFinal = join(paths.invocation!, "stderr.partial");
  if (options.stdoutCapture.path !== stdoutFinal || options.stderrCapture.path !== stderrFinal) {
    throw new Error("qualification output capture paths do not match the durable partial-output contract");
  }
  const stdout = outputReceipt(paths.root, stdoutFinal, options.stdoutCapture);
  const stderr = outputReceipt(paths.root, stderrFinal, options.stderrCapture);
  let artifact: QualificationTerminalReceiptV1["artifact"] = null;
  let attestation: ArtifactAttestation = { ok: false, actual: null, fallback: false, refused: false, error: "artifact was not validated" };
  if (!stdout.truncated) {
    const artifactPath = join(paths.root, options.invocation.expected_artifact.path);
    try {
      atomicWriteBytes(artifactPath, readFileSync(stdoutFinal), true);
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
    provider_model_identity_observed: attestation.ok,
    successful_execution: status === "completed",
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
  child?: QualificationProcessIdentity | null;
  startedAt?: string | null;
  deadlineAt?: string | null;
  outputIncomplete?: boolean;
}): Promise<void> {
  const paths = qualificationSpoolPaths(options.spoolDir, options.invocation.invocation_id);
  const stdoutPath = join(paths.invocation!, "stdout.partial");
  const stderrPath = join(paths.invocation!, "stderr.partial");
  if (!existsSync(stdoutPath)) atomicWriteBytes(stdoutPath, Buffer.alloc(0), true);
  if (!existsSync(stderrPath)) atomicWriteBytes(stderrPath, Buffer.alloc(0), true);
  const existingCapture = (path: string): BoundedCapture => {
    assertRegularFile(path, `qualification interrupted output ${path}`);
    const bytes = readFileSync(path).length;
    return { path, total_bytes: bytes, captured_bytes: bytes, truncated: options.outputIncomplete === true, write: () => {}, close: () => {} };
  };
  const interruptedArtifactPath = join(paths.root, options.invocation.expected_artifact.path);
  let interruptedArtifact: QualificationTerminalReceiptV1["artifact"] = null;
  if (existsSync(interruptedArtifactPath)) {
    assertRegularFile(interruptedArtifactPath, `qualification interrupted artifact ${options.invocation.invocation_id}`);
    const bytes = readFileSync(interruptedArtifactPath);
    interruptedArtifact = { path: options.invocation.expected_artifact.path, type: "pi-jsonl", bytes: bytes.length, sha256: qualificationSha256(bytes) };
  }
  const receipt: QualificationTerminalReceiptV1 = {
    schema_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION,
    invocation_id: options.invocation.invocation_id,
    terminal_status: options.status,
    attempt: options.accountingEventSha ? 1 : 0,
    started_at: options.startedAt ?? null,
    finished_at: timestamp(options.now, "qualification terminal time"),
    deadline_at: options.deadlineAt ?? null,
    requested_timeout_ms: options.invocation.execution.timeout_ms,
    effective_timeout_ms: options.invocation.execution.timeout_ms,
    supervisor: options.supervisor,
    child: options.child ?? null,
    exit_code: null,
    signal: null,
    requested: options.invocation.requested,
    actual: null,
    provider_model_identity_observed: false,
    successful_execution: false,
    fallback_detected: false,
    authentication: options.auth ? {
      evidence_sha256: qualificationSha256(`${qualificationCanonicalJson(options.auth)}\n`),
      status: "ready",
      auth_type: "oauth",
      readiness_only: true,
    } : null,
    accounting_event_sha256: options.accountingEventSha ?? null,
    continuation_authority_sha256: options.continuationSha ?? null,
    stdout: outputReceipt(paths.root, stdoutPath, existingCapture(stdoutPath)),
    stderr: outputReceipt(paths.root, stderrPath, existingCapture(stderrPath)),
    artifact: interruptedArtifact,
    error: options.error,
  };
  commitTerminalReceipt(paths.root, options.invocation, receipt);
}

function commitTerminalReceipt(spoolDir: string, invocation: QualificationInvocationV1, receipt: QualificationTerminalReceiptV1): void {
  const paths = qualificationSpoolPaths(spoolDir, invocation.invocation_id);
  if (existsSync(paths.terminal!)) {
    const existing = readTerminalReceipt(spoolDir, invocation);
    if (qualificationCanonicalJson(existing) !== qualificationCanonicalJson(receipt)) throw new Error(`qualification terminal receipt for ${invocation.invocation_id} is immutable`);
    reconcileTerminalLifecycle(spoolDir, invocation);
    return;
  }
  const temp = join(paths.invocation!, `.terminal-${randomBytes(10).toString("hex")}`);
  mkdirSync(temp, { mode: 0o700 });
  try {
    atomicWriteCanonical(join(temp, "receipt.json"), receipt, true);
    renameSync(temp, paths.terminal!);
    fsyncQualificationDirectory(paths.invocation!);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
  reconcileTerminalLifecycle(spoolDir, invocation);
}

function reconcileTerminalLifecycle(spoolDir: string, invocation: QualificationInvocationV1): void {
  const paths = qualificationSpoolPaths(spoolDir, invocation.invocation_id);
  if (!existsSync(join(paths.terminal!, "receipt.json"))) return;
  const receipt = readTerminalReceipt(spoolDir, invocation);
  assertTerminalReceiptCrossBindings(spoolDir, invocation, receipt);
  const lifecycle = readQualificationLifecycle(spoolDir, invocation.invocation_id);
  if (lifecycle.phase === "terminal") {
    if (lifecycle.terminal_status !== receipt.terminal_status || lifecycle.events.at(-1)?.detail.receipt_sha256 !== qualificationSha256(`${qualificationCanonicalJson(receipt)}\n`)) {
      throw new Error(`qualification terminal receipt for ${invocation.invocation_id} contradicts lifecycle`);
    }
    return;
  }
  writeQualificationLifecycle(spoolDir, transitionQualificationLifecycle(lifecycle, "terminal", {
    at: receipt.finished_at,
    terminal_status: receipt.terminal_status,
    detail: { receipt_sha256: qualificationSha256(`${qualificationCanonicalJson(receipt)}\n`) },
  }));
}

function validateLaunchAttempt(value: unknown, invocation: QualificationInvocationV1, spoolRoot: string): void {
  if (!plainObject(value)) throw new Error(`qualification launch attempt ${invocation.invocation_id} must be an object`);
  exactKeys(value, ["schema_version", "invocation_id", "attempt", "at", "executable", "argv", "environment_names", "automatic_retry"], `qualification launch attempt ${invocation.invocation_id}`);
  if (value.schema_version !== QUALIFICATION_LAUNCH_ATTEMPT_VERSION || value.invocation_id !== invocation.invocation_id || value.attempt !== 1 || value.automatic_retry !== false) {
    throw new Error(`qualification launch attempt ${invocation.invocation_id} identity/version/retry policy mismatch`);
  }
  timestamp(String(value.at), `qualification launch attempt ${invocation.invocation_id} time`);
  if (qualificationCanonicalJson(value.executable) !== qualificationCanonicalJson(invocation.execution.executable)) throw new Error(`qualification launch attempt ${invocation.invocation_id} executable mismatch`);
  const expectedArgv = buildQualificationArgv(invocation, join(spoolRoot, invocation.expected_artifact.path));
  if (qualificationCanonicalJson(value.argv) !== qualificationCanonicalJson(expectedArgv)) throw new Error(`qualification launch attempt ${invocation.invocation_id} argv mismatch`);
  if (!Array.isArray(value.environment_names) || value.environment_names.some((name) => typeof name !== "string") ||
      new Set(value.environment_names).size !== value.environment_names.length ||
      value.environment_names.some((name) => !invocation.execution.allowed_environment_names.includes(name))) {
    throw new Error(`qualification launch attempt ${invocation.invocation_id} environment-name set is invalid`);
  }
}

function readTerminalReceipt(spoolDir: string, invocation: QualificationInvocationV1): QualificationTerminalReceiptV1 {
  const path = join(qualificationSpoolPaths(spoolDir, invocation.invocation_id).terminal!, "receipt.json");
  const value = readCanonicalJson(path, `qualification terminal receipt ${invocation.invocation_id}`);
  validateTerminalReceipt(value, invocation);
  return value as QualificationTerminalReceiptV1;
}

function assertTerminalReceiptCrossBindings(spoolDir: string, invocation: QualificationInvocationV1, receipt: QualificationTerminalReceiptV1): void {
  const paths = qualificationSpoolPaths(spoolDir, invocation.invocation_id);
  const accountingEvent = readQualificationAccounting(paths.root).events.find((event) => event.invocation_id === invocation.invocation_id);
  const expectedAttempt = accountingEvent ? 1 : 0;
  if (receipt.attempt !== expectedAttempt || receipt.accounting_event_sha256 !== (accountingEvent?.event_sha256 ?? null)) {
    throw new Error(`qualification terminal receipt for ${invocation.invocation_id} contradicts accounting`);
  }
  const launchAttemptPath = join(paths.invocation!, "launch-attempt.json");
  const hasLaunchAttempt = existsSync(launchAttemptPath);
  if (hasLaunchAttempt) validateLaunchAttempt(readCanonicalJson(launchAttemptPath, `qualification launch attempt ${invocation.invocation_id}`), invocation, paths.root);
  if (receipt.started_at !== null && !hasLaunchAttempt) throw new Error(`qualification started terminal receipt for ${invocation.invocation_id} has no launch attempt`);
  if (receipt.attempt === 0 && hasLaunchAttempt) throw new Error(`qualification attempt-zero receipt for ${invocation.invocation_id} has a launch attempt`);
  const occurrence = readChildOccurrence(paths.invocation!, invocation, false);
  if (occurrence && (qualificationCanonicalJson(receipt.child) !== qualificationCanonicalJson(occurrence.child) || receipt.started_at !== occurrence.started_at || receipt.deadline_at !== occurrence.deadline_at)) {
    throw new Error(`qualification terminal receipt for ${invocation.invocation_id} contradicts child occurrence evidence`);
  }
  const continuation = readContinuationRecord(paths.invocation!);
  if (receipt.continuation_authority_sha256 !== (continuation ? String(continuation.authority_sha256) : null)) {
    throw new Error(`qualification terminal receipt for ${invocation.invocation_id} continuation authority mismatch`);
  }
  if (receipt.authentication) {
    const evidence = readAuthEvidence(paths.root, invocation, false);
    if (receipt.authentication.evidence_sha256 !== qualificationSha256(`${qualificationCanonicalJson(evidence)}\n`)) {
      throw new Error(`qualification terminal receipt for ${invocation.invocation_id} authentication evidence mismatch`);
    }
  }
  verifyOutputReceipt(paths.root, receipt.stdout);
  verifyOutputReceipt(paths.root, receipt.stderr);
  if (receipt.artifact) {
    const artifactPath = join(paths.root, receipt.artifact.path);
    assertRegularFile(artifactPath, `qualification artifact ${invocation.invocation_id}`);
    const bytes = readFileSync(artifactPath);
    if (bytes.length !== receipt.artifact.bytes || qualificationSha256(bytes) !== receipt.artifact.sha256) {
      throw new Error(`qualification artifact ${invocation.invocation_id} digest/size mismatch`);
    }
  }
}

function validateTerminalReceipt(value: unknown, invocation: QualificationInvocationV1): void {
  if (!plainObject(value)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} must be an object`);
  const required = ["schema_version", "invocation_id", "terminal_status", "attempt", "started_at", "finished_at", "deadline_at", "requested_timeout_ms", "effective_timeout_ms", "supervisor", "child", "exit_code", "signal", "requested", "actual", "provider_model_identity_observed", "successful_execution", "fallback_detected", "authentication", "accounting_event_sha256", "continuation_authority_sha256", "stdout", "stderr", "artifact", "error"];
  exactKeys(value, required, `qualification terminal receipt ${invocation.invocation_id}`);
  if (value.schema_version !== QUALIFICATION_TERMINAL_RECEIPT_VERSION || value.invocation_id !== invocation.invocation_id || (value.attempt !== 0 && value.attempt !== 1)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} identity/version mismatch`);
  if (!["completed", "failed", "timed-out", "aborted", "refused", "invalid-artifact"].includes(String(value.terminal_status))) throw new Error(`qualification terminal receipt ${invocation.invocation_id} has unknown status`);
  timestamp(String(value.finished_at), `qualification terminal receipt ${invocation.invocation_id} finish time`);
  if (value.started_at !== null) timestamp(String(value.started_at), `qualification terminal receipt ${invocation.invocation_id} start time`);
  if (value.deadline_at !== null) timestamp(String(value.deadline_at), `qualification terminal receipt ${invocation.invocation_id} deadline`);
  if ((value.started_at === null) !== (value.deadline_at === null)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} start/deadline mismatch`);
  if (value.requested_timeout_ms !== invocation.execution.timeout_ms || value.effective_timeout_ms !== invocation.execution.timeout_ms) throw new Error(`qualification terminal receipt ${invocation.invocation_id} timeout policy mismatch`);
  if (!processIdentityFrom(value.supervisor) || (value.child !== null && !processIdentityFrom(value.child))) throw new Error(`qualification terminal receipt ${invocation.invocation_id} process identity is invalid`);
  if (qualificationCanonicalJson(value.requested) !== qualificationCanonicalJson(invocation.requested)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} requested identity mismatch`);
  if (value.actual !== null && (!plainObject(value.actual) || Object.keys(value.actual).sort().join(",") !== "model,provider" || typeof value.actual.provider !== "string" || typeof value.actual.model !== "string")) {
    throw new Error(`qualification terminal receipt ${invocation.invocation_id} actual identity is invalid`);
  }
  if (value.exit_code !== null && !Number.isInteger(value.exit_code)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} exit code is invalid`);
  if (value.signal !== null && typeof value.signal !== "string") throw new Error(`qualification terminal receipt ${invocation.invocation_id} signal is invalid`);
  if (value.successful_execution !== (value.terminal_status === "completed")) throw new Error(`qualification terminal receipt ${invocation.invocation_id} successful-execution flag contradicts terminal status`);
  if (typeof value.provider_model_identity_observed !== "boolean" || typeof value.fallback_detected !== "boolean") throw new Error(`qualification terminal receipt ${invocation.invocation_id} identity/fallback flags are invalid`);
  if (value.provider_model_identity_observed && qualificationCanonicalJson(value.actual) !== qualificationCanonicalJson(invocation.requested)) {
    throw new Error(`qualification terminal receipt ${invocation.invocation_id} observed identity does not match the request`);
  }
  if (value.terminal_status === "completed" && (!value.provider_model_identity_observed || value.fallback_detected || value.actual === null || value.artifact === null)) {
    throw new Error(`qualification terminal receipt ${invocation.invocation_id} completed without exact identity/artifact evidence`);
  }
  if (value.attempt === 0 && (value.terminal_status !== "aborted" || value.started_at !== null || value.child !== null || value.authentication !== null || value.accounting_event_sha256 !== null)) {
    throw new Error(`qualification terminal receipt ${invocation.invocation_id} attempt-zero evidence is contradictory`);
  }
  if (value.attempt === 1 && (!/^[a-f0-9]{64}$/.test(String(value.accounting_event_sha256)) || !plainObject(value.authentication))) {
    throw new Error(`qualification terminal receipt ${invocation.invocation_id} attempt-one evidence is incomplete`);
  }
  if (value.authentication !== null) {
    if (!plainObject(value.authentication)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} authentication evidence is invalid`);
    exactKeys(value.authentication, ["evidence_sha256", "status", "auth_type", "readiness_only"], `qualification terminal receipt ${invocation.invocation_id} authentication`);
    if (!/^[a-f0-9]{64}$/.test(String(value.authentication.evidence_sha256)) || value.authentication.status !== "ready" || value.authentication.auth_type !== "oauth" || value.authentication.readiness_only !== true) {
      throw new Error(`qualification terminal receipt ${invocation.invocation_id} authentication evidence is invalid`);
    }
  }
  if (value.continuation_authority_sha256 !== null && !/^[a-f0-9]{64}$/.test(String(value.continuation_authority_sha256))) throw new Error(`qualification terminal receipt ${invocation.invocation_id} continuation digest is invalid`);
  validateOutputReceiptShape(value.stdout, invocation.invocation_id, "stdout.partial");
  validateOutputReceiptShape(value.stderr, invocation.invocation_id, "stderr.partial");
  if (value.artifact !== null) {
    if (!plainObject(value.artifact) || value.artifact.path !== invocation.expected_artifact.path || value.artifact.type !== "pi-jsonl" || !Number.isSafeInteger(value.artifact.bytes) || Number(value.artifact.bytes) < 0 || !/^[a-f0-9]{64}$/.test(String(value.artifact.sha256))) {
      throw new Error(`qualification terminal receipt ${invocation.invocation_id} artifact evidence is invalid`);
    }
  }
  if (value.error !== null && typeof value.error !== "string") throw new Error(`qualification terminal receipt ${invocation.invocation_id} error field is invalid`);
}

function validateOutputReceiptShape(value: unknown, invocationId: string, fileName: string): void {
  if (!plainObject(value)) throw new Error(`qualification terminal receipt ${invocationId} output evidence is invalid`);
  exactKeys(value, ["path", "total_bytes", "captured_bytes", "truncated", "sha256"], `qualification terminal receipt ${invocationId} output`);
  if (value.path !== `invocations/${invocationId}/${fileName}` || !Number.isSafeInteger(value.total_bytes) || !Number.isSafeInteger(value.captured_bytes) ||
      Number(value.total_bytes) < Number(value.captured_bytes) || Number(value.captured_bytes) < 0 || typeof value.truncated !== "boolean" || !/^[a-f0-9]{64}$/.test(String(value.sha256))) {
    throw new Error(`qualification terminal receipt ${invocationId} output evidence is invalid`);
  }
}

function readAuthEvidence(spoolDir: string, invocation: QualificationInvocationV1, requireFresh = true): QualificationAuthEvidenceV1 {
  const path = join(qualificationSpoolPaths(spoolDir, invocation.invocation_id).invocation!, "auth-evidence.json");
  const evidence = readCanonicalJson(path, `qualification auth evidence ${invocation.invocation_id}`) as QualificationAuthEvidenceV1;
  validateAuthEvidence(evidence, invocation, requireFresh);
  return evidence;
}
function validateAuthEvidence(evidence: QualificationAuthEvidenceV1, invocation: QualificationInvocationV1, requireFresh = true): void {
  if (!plainObject(evidence)) throw new Error("qualification auth evidence must be an object");
  const keys = ["schema_version", "checked_at", "provider", "model", "status", "auth_type", "source", "credentials_included", "readiness_only", "removed_parent_environment_names", "child_environment_names", "executable_sha256", "evidence_sha256"];
  exactKeys(evidence as unknown as Record<string, unknown>, keys, `qualification auth evidence ${invocation.invocation_id}`);
  if (evidence.schema_version !== QUALIFICATION_AUTH_EVIDENCE_VERSION || evidence.provider !== invocation.requested.provider || evidence.model !== invocation.requested.model || evidence.status !== "ready" || evidence.auth_type !== "oauth" || evidence.credentials_included !== false || evidence.readiness_only !== true) {
    throw new Error(`qualification auth evidence contradicts invocation ${invocation.invocation_id}`);
  }
  const { evidence_sha256: recorded, ...digestInput } = evidence;
  if (!/^[a-f0-9]{64}$/.test(recorded) || qualificationSha256(qualificationCanonicalJson(digestInput)) !== recorded) {
    throw new Error(`qualification auth evidence digest mismatch for ${invocation.invocation_id}`);
  }
  const checkedAt = Date.parse(timestamp(evidence.checked_at, "qualification auth evidence time"));
  if (requireFresh && (checkedAt > Date.now() + 60_000 || Date.now() - checkedAt > 5 * 60_000)) {
    throw new Error(`qualification auth evidence for ${invocation.invocation_id} is stale; run start to perform a fresh Pi auth check`);
  }
}

function qualificationCredentialRedactionValues(env: NodeJS.ProcessEnv): string[] {
  const agentDirectory = env.PI_CODING_AGENT_DIR ?? (env.HOME ? join(env.HOME, ".pi", "agent") : undefined);
  if (!agentDirectory) return [];
  let auth: unknown;
  try { auth = JSON.parse(readPrivateRegularFile(join(agentDirectory, "auth.json"), "qualification OAuth auth.json").toString("utf8")); }
  catch { throw new Error("qualification OAuth credential values could not be reopened for output redaction"); }
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

function assertRunningQualificationRunner(mode: "production" | "test", pin: { path: string; sha256: string }): void {
  if (mode !== "production") return;
  const script = process.argv[1];
  if (!script || realpathSync(script) !== verifyQualificationExecutable(pin).realpath) {
    throw new Error("qualification production core must run through the pinned source-built runner executable");
  }
}

function assertQualificationExecutableIdentity(
  invocation: QualificationInvocationV1,
  current: ReturnType<typeof verifyQualificationExecutable>,
): void {
  if (qualificationCanonicalJson(current) !== qualificationCanonicalJson(invocation.execution.executable_identity)) {
    throw new Error(`qualification executable filesystem identity changed after preparation for ${invocation.invocation_id}`);
  }
}

function assertQualificationWorkingDirectory(invocation: QualificationInvocationV1): void {
  let stat;
  try { stat = lstatSync(invocation.scenario.working_directory); }
  catch { throw new Error(`qualification working directory disappeared after preparation for ${invocation.invocation_id}`); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`qualification working directory changed type after preparation for ${invocation.invocation_id}`);
  const current = { realpath: realpathSync(invocation.scenario.working_directory), device: stat.dev, inode: stat.ino };
  if (qualificationCanonicalJson(current) !== qualificationCanonicalJson(invocation.execution.working_directory_identity)) {
    throw new Error(`qualification working directory identity changed after preparation for ${invocation.invocation_id}`);
  }
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

async function withAsyncLock<T>(path: string, action: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  const token = randomBytes(16).toString("hex");
  while (true) {
    const candidate = `${path}.candidate-${token}`;
    try {
      mkdirSync(candidate, { mode: 0o700 });
      atomicWriteCanonical(join(candidate, "owner.json"), {
        schema_version: "qualification-lock-owner-v1",
        token,
        process: qualificationProcessIdentity(process.pid),
      }, true);
      renameSync(candidate, path);
      break;
    } catch (error) {
      rmSync(candidate, { recursive: true, force: true });
      if (!["EEXIST", "ENOTEMPTY"].includes(String((error as NodeJS.ErrnoException).code))) throw error;
      const ownerPath = join(path, "owner.json");
      // A lock is published only after its owner receipt is durable, so a visible
      // ownerless lock is corruption rather than a live publication window.
      if (!existsSync(ownerPath)) throw new Error(`qualification state lock has no owner receipt: ${path}`);
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

function readPrivateRegularFile(path: string, ctx: string): Buffer {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`${ctx} must be a regular non-symlink file`);
    if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) {
      throw new Error(`${ctx} must be private and owned by the qualification user`);
    }
    return readFileSync(fd);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(ctx)) throw error;
    throw new Error(`${ctx} is missing, unreadable, or a symlink`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function assertRegularFile(path: string, ctx: string): void {
  let stat;
  try { stat = lstatSync(path); }
  catch { throw new Error(`${ctx} is missing`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${ctx} must be a regular non-symlink file`);
}
function processIdentityFrom(value: unknown): QualificationProcessIdentity | null {
  if (!plainObject(value) || !Number.isInteger(value.pid) || typeof value.platform !== "string" ||
      (value.boot_id !== null && typeof value.boot_id !== "string") || (value.start_ticks !== null && typeof value.start_ticks !== "string")) return null;
  return { pid: Number(value.pid), platform: value.platform as NodeJS.Platform, boot_id: value.boot_id, start_ticks: value.start_ticks };
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
