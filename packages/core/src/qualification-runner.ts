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
  type Stats,
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
  qualificationLockOwnerIsLive,
  readQualificationLockOwner,
  reclaimQualificationLock,
  releaseQualificationLock,
  tryPublishQualificationLock,
  type QualificationLockIo,
} from "./qualification-lock.js";
import {
  QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
  qualificationOAuthDirectoryPolicy,
  sanitizeQualificationEnvironment,
  qualificationCanonicalJson,
  qualificationSha256,
  verifyQualificationExecutable,
  verifyQualificationPins,
  verifyQualificationResource,
  type QualificationOAuthDirectoryPolicy,
  type QualificationRole,
} from "./qualification-config.js";
import {
  assertQualificationOAuthDirectoryContinuityV2,
  assertQualificationOAuthDirectoryPolicyV2,
  inspectQualificationOAuthDirectoryPolicyV2,
  invalidateQualificationOAuthDirectoryInventoryV2,
  validateQualificationOAuthDirectoryInventoryV2,
  type QualificationOAuthDirectoryBoundaryV2,
  type QualificationOAuthDirectoryInventoryV2,
  type QualificationOAuthDirectoryValidationPointV2,
} from "./qualification-oauth-directory.js";
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
export const QUALIFICATION_AUTH_EVIDENCE_VERSION_V2 = "qualification-auth-evidence-v2" as const;
export const QUALIFICATION_TERMINAL_RECEIPT_VERSION = "qualification-terminal-receipt-v1" as const;
export const QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2 = "qualification-terminal-receipt-v2" as const;
export const QUALIFICATION_LAUNCH_ATTEMPT_VERSION = "qualification-launch-attempt-v1" as const;

export interface QualificationFilesystemOccurrence {
  realpath: string;
  device: number;
  inode: number;
  mtime_ms: number;
  bytes: number;
}

export interface QualificationAuthEvidenceV1 {
  schema_version: typeof QUALIFICATION_AUTH_EVIDENCE_VERSION;
  checked_at: string;
  provider: string;
  requested_model: string;
  model_identity_observed: false;
  status: "ready";
  auth_type: "oauth";
  source: "pi-auth-check-json";
  credentials_included: false;
  readiness_only: true;
  removed_parent_environment_names: string[];
  child_environment_names: string[];
  executable_sha256: string;
  launch_authority_sha256: string;
  oauth_agent_directory_identity: QualificationFilesystemOccurrence | null;
  oauth_auth_file_identity: QualificationFilesystemOccurrence | null;
  oauth_models_file_identity: QualificationFilesystemOccurrence | null;
  oauth_directory_entries: string[];
  evidence_sha256: string;
}

export interface QualificationAuthEvidenceV2 extends Omit<QualificationAuthEvidenceV1,
  "schema_version" | "oauth_agent_directory_identity" | "oauth_auth_file_identity" | "oauth_models_file_identity" | "oauth_directory_entries"> {
  schema_version: typeof QUALIFICATION_AUTH_EVIDENCE_VERSION_V2;
  oauth_directory_policy: typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  oauth_directory_validations: {
    before_oauth_readiness: QualificationOAuthDirectoryInventoryV2;
    after_oauth_readiness: QualificationOAuthDirectoryInventoryV2;
  };
}

export type QualificationAuthEvidence = QualificationAuthEvidenceV1 | QualificationAuthEvidenceV2;

export interface QualificationOAuthDirectoryValidationsV2 {
  before_oauth_readiness: QualificationOAuthDirectoryInventoryV2 | null;
  after_oauth_readiness: QualificationOAuthDirectoryInventoryV2 | null;
  before_launch_claim: QualificationOAuthDirectoryInventoryV2 | null;
  immediately_before_pi_launch: QualificationOAuthDirectoryInventoryV2 | null;
  after_child_termination: QualificationOAuthDirectoryInventoryV2 | null;
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

export interface QualificationTerminalReceiptV2 extends Omit<QualificationTerminalReceiptV1, "schema_version"> {
  schema_version: typeof QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2;
  oauth_directory_policy: typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  oauth_directory_validations: QualificationOAuthDirectoryValidationsV2;
}

export type QualificationTerminalReceipt = QualificationTerminalReceiptV1 | QualificationTerminalReceiptV2;

type QualificationChildOutcome = { code: number | null; signal: NodeJS.Signals | null; error?: string };

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
export function assertQualificationOAuthCredentialBoundary(env: NodeJS.ProcessEnv): {
  agent_directory: string;
  provider: "openai-codex";
  auth_type: "oauth";
  agent_directory_identity: QualificationFilesystemOccurrence;
  auth_file_identity: QualificationFilesystemOccurrence;
  models_file_identity: QualificationFilesystemOccurrence | null;
  directory_entries: string[];
} {
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
  const directoryEntries = readdirSync(agentDirectory, { withFileTypes: true }).map((entry) => entry.name).sort();
  if (directoryEntries.some((entry) => entry !== "auth.json" && entry !== "models.json")) {
    throw new Error("qualification dedicated OAuth agent directory contains undeclared entries");
  }
  const authPath = join(agentDirectory, "auth.json");
  const openedAuth = readPrivateRegularFileOccurrence(authPath, "qualification OAuth auth.json");
  let auth: unknown;
  try { auth = JSON.parse(openedAuth.bytes.toString("utf8")); }
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
  let modelsIdentity: QualificationFilesystemOccurrence | null = null;
  if (existsSync(modelsPath)) {
    const openedModels = readPrivateRegularFileOccurrence(modelsPath, "qualification Pi models.json");
    modelsIdentity = openedModels.identity;
    let models: unknown;
    try { models = JSON.parse(openedModels.bytes.toString("utf8")); }
    catch { throw new Error("qualification Pi models.json is invalid JSON"); }
    if (!plainObject(models)) throw new Error("qualification Pi models.json must be an object");
    if (Object.keys(models).length > 0) {
      throw new Error("qualification dedicated OAuth agent directory must not carry models.json overrides or embedded provider credentials");
    }
  }
  const finalAgentStat = lstatSync(agentDirectory);
  if (finalAgentStat.dev !== agentStat.dev || finalAgentStat.ino !== agentStat.ino || finalAgentStat.mtimeMs !== agentStat.mtimeMs) {
    throw new Error("qualification OAuth agent directory changed while it was verified");
  }
  return {
    agent_directory: agentDirectory,
    provider: "openai-codex",
    auth_type: "oauth",
    agent_directory_identity: filesystemOccurrence(agentDirectory, agentStat),
    auth_file_identity: openedAuth.identity,
    models_file_identity: modelsIdentity,
    directory_entries: directoryEntries,
  };
}

type QualificationOAuthBoundaryV1 = ReturnType<typeof assertQualificationOAuthCredentialBoundary>;
type QualificationOAuthBoundary = QualificationOAuthBoundaryV1 | QualificationOAuthDirectoryBoundaryV2 | null;

function assertConfiguredOAuthBoundary(
  mode: "production" | "test",
  policy: QualificationOAuthDirectoryPolicy,
  env: NodeJS.ProcessEnv,
  validationPoint: QualificationOAuthDirectoryValidationPointV2,
  now?: () => string,
): QualificationOAuthBoundary {
  if (policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    return assertQualificationOAuthDirectoryPolicyV2(env, { validation_point: validationPoint, now });
  }
  return mode === "production" ? assertQualificationOAuthCredentialBoundary(env) : null;
}

function isOAuthBoundaryV2(value: QualificationOAuthBoundary): value is QualificationOAuthDirectoryBoundaryV2 {
  return value !== null && "policy" in value && value.policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
}

export async function checkQualificationAuthentication(options: {
  spool_dir: string;
  invocation_id: string;
  parent_env?: NodeJS.ProcessEnv;
  now?: () => string;
}): Promise<{ evidence: QualificationAuthEvidence; child_env: NodeJS.ProcessEnv; launch_authority: string }> {
  const invocation = readQualificationInvocation(options.spool_dir, options.invocation_id);
  const config = readQualificationSpoolConfig(options.spool_dir);
  const arm = config.arms.find((candidate) => candidate.id === invocation.arms.selected);
  if (!arm) throw new Error(`qualification selected arm ${invocation.arms.selected} disappeared from configuration`);
  const paths = qualificationSpoolPaths(options.spool_dir, options.invocation_id);
  const initialLifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
  if (initialLifecycle.phase === "terminal" || existsSync(paths.terminal!)) {
    throw new Error(`qualification authentication cannot be refreshed after invocation ${invocation.invocation_id} is terminal`);
  }
  const initialSupervisor = latestContinuationSupervisor(paths.invocation!, invocation) ?? latestProcessIdentity(initialLifecycle, "supervisor");
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
  const oauthPolicy = qualificationOAuthDirectoryPolicy(config);
  const beforeOAuthBoundary = assertConfiguredOAuthBoundary(
    config.mode,
    oauthPolicy,
    sanitized.env,
    "before-oauth-readiness",
    options.now,
  );
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
  const unknownAuthField = Object.keys(parsed).find((key) => !["status", "provider", "reason", "authType", "model"].includes(key));
  if (unknownAuthField) throw new Error(`qualification auth check returned unknown field ${unknownAuthField}`);
  if (parsed.status !== "ready") throw new Error(`qualification OAuth readiness is not ready for ${arm.provider}:${arm.model}`);
  if (parsed.provider !== arm.provider) throw new Error(`qualification auth check provider substitution: requested ${arm.provider}, reported ${String(parsed.provider)}`);
  if (parsed.model !== undefined && parsed.model !== arm.model) throw new Error(`qualification auth check model substitution: requested ${arm.model}, reported ${String(parsed.model)}`);
  if (parsed.authType !== "oauth") throw new Error(`qualification requires OAuth readiness; Pi reported ${String(parsed.authType ?? "missing auth type")}`);
  const afterOAuthBoundary = assertConfiguredOAuthBoundary(
    config.mode,
    oauthPolicy,
    sanitized.env,
    "after-oauth-readiness",
    options.now,
  );
  if (oauthPolicy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    if (!isOAuthBoundaryV2(beforeOAuthBoundary) || !isOAuthBoundaryV2(afterOAuthBoundary)) {
      throw new Error("qualification OAuth directory policy v2 did not produce both readiness inventories");
    }
    // The auth metadata subprocess is an authorized Pi execution. It may create
    // or atomically replace Pi's own runtime-state file, but not auth/models.
    assertQualificationOAuthDirectoryContinuityV2(beforeOAuthBoundary.inventory, afterOAuthBoundary.inventory, { allow_models_store_change: true });
  }
  const launchAuthority = randomBytes(32).toString("base64url");
  const commonEvidence = {
    checked_at: timestamp((options.now ?? (() => new Date().toISOString()))(), "qualification auth check time"),
    provider: arm.provider,
    requested_model: arm.model,
    model_identity_observed: false as const,
    status: "ready" as const,
    auth_type: "oauth" as const,
    source: "pi-auth-check-json" as const,
    credentials_included: false as const,
    readiness_only: true as const,
    removed_parent_environment_names: sanitized.removed_names,
    child_environment_names: Object.keys(sanitized.env).sort(),
    executable_sha256: executable.sha256,
    launch_authority_sha256: qualificationSha256(launchAuthority),
  };
  let evidence: QualificationAuthEvidence;
  if (oauthPolicy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    if (!isOAuthBoundaryV2(beforeOAuthBoundary) || !isOAuthBoundaryV2(afterOAuthBoundary)) throw new Error("qualification OAuth directory policy v2 evidence is incomplete");
    const evidenceBase: Omit<QualificationAuthEvidenceV2, "evidence_sha256"> = {
      schema_version: QUALIFICATION_AUTH_EVIDENCE_VERSION_V2,
      ...commonEvidence,
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
      oauth_directory_validations: {
        before_oauth_readiness: beforeOAuthBoundary.inventory,
        after_oauth_readiness: afterOAuthBoundary.inventory,
      },
    };
    evidence = { ...evidenceBase, evidence_sha256: qualificationSha256(qualificationCanonicalJson(evidenceBase)) };
  } else {
    const oauthBoundary = afterOAuthBoundary && !isOAuthBoundaryV2(afterOAuthBoundary) ? afterOAuthBoundary : null;
    const evidenceBase: Omit<QualificationAuthEvidenceV1, "evidence_sha256"> = {
      schema_version: QUALIFICATION_AUTH_EVIDENCE_VERSION,
      ...commonEvidence,
      oauth_agent_directory_identity: oauthBoundary?.agent_directory_identity ?? null,
      oauth_auth_file_identity: oauthBoundary?.auth_file_identity ?? null,
      oauth_models_file_identity: oauthBoundary?.models_file_identity ?? null,
      oauth_directory_entries: oauthBoundary?.directory_entries ?? [],
    };
    evidence = { ...evidenceBase, evidence_sha256: qualificationSha256(qualificationCanonicalJson(evidenceBase)) };
  }
  const authPath = join(paths.invocation!, "auth-evidence.json");
  const published = await withAsyncLock(paths.invocationLock!, async () => {
    const lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
    if (lifecycle.phase === "terminal" || existsSync(paths.terminal!)) {
      throw new Error(`qualification authentication cannot be refreshed after invocation ${invocation.invocation_id} is terminal`);
    }
    const activeSupervisor = latestContinuationSupervisor(paths.invocation!, invocation) ?? latestProcessIdentity(lifecycle, "supervisor");
    if (lifecycle.phase !== "prepared" && activeSupervisor && qualificationProcessMatches(activeSupervisor)) {
      throw new Error(`qualification authentication cannot be refreshed while invocation ${invocation.invocation_id} has a live supervisor`);
    }
    if (existsSync(authPath)) {
      const existing = readCanonicalJson(authPath, `qualification auth evidence ${options.invocation_id}`) as QualificationAuthEvidence;
      try {
        validateAuthEvidence(existing, invocation, true);
        if (existing.provider !== evidence.provider || existing.requested_model !== evidence.requested_model || existing.executable_sha256 !== evidence.executable_sha256) {
          throw new Error("qualification auth evidence contradicts the current invocation");
        }
        // A separately computed child environment must never reuse another
        // start contender's evidence. Validation above is corruption checking;
        // this contender always publishes its own opaque launch binding.
      } catch (error) {
        if (!(error instanceof Error) || !/auth evidence.*stale/i.test(error.message)) throw error;
      }
      atomicWriteCanonical(authPath, evidence, false);
      return evidence;
    }
    atomicWriteCanonical(authPath, evidence, true);
    return evidence;
  });
  return { evidence: published, child_env: sanitized.env, launch_authority: launchAuthority };
}

/**
 * Execute one previously prepared invocation. There is deliberately no retry
 * parameter and exactly one model-process spawn site in this function.
 */
export async function superviseQualificationInvocation(options: {
  spool_dir: string;
  invocation_id: string;
  child_env: NodeJS.ProcessEnv;
  authentication_authority?: string;
  continuation_authority?: string;
  now?: () => string;
}): Promise<void> {
  const now = options.now ?? (() => new Date().toISOString());
  const invocation = readQualificationInvocation(options.spool_dir, options.invocation_id);
  const config = readQualificationSpoolConfig(options.spool_dir);
  const oauthPolicy = qualificationOAuthDirectoryPolicy(config);
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
  if (config.mode === "production" && oauthPolicy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    assertQualificationOAuthCredentialBoundary(options.child_env);
  }
  let auth: QualificationAuthEvidence | undefined;
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
      const currentAuth = readAuthEvidence(options.spool_dir, invocation);
      const claimBoundary = assertConfiguredOAuthBoundary(
        config.mode,
        oauthPolicy,
        options.child_env,
        "before-launch-claim",
        options.now,
      );
      assertConfiguredOAuthBoundaryMatchesEvidence(currentAuth, claimBoundary, false);
      if (config.mode === "production" && !options.authentication_authority) {
        throw new Error("qualification production launch requires the private authentication authority from its auth check");
      }
      if (options.authentication_authority && qualificationSha256(options.authentication_authority) !== currentAuth.launch_authority_sha256) {
        throw new Error("qualification authentication authority does not bind the current auth evidence");
      }
      auth = currentAuth;
      const ledger = readQualificationAccounting(paths.root);
      const existingClaim = ledger.events.find((event) => event.invocation_id === invocation.invocation_id);
      if (oauthPolicy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
        if (!isOAuthBoundaryV2(claimBoundary)) throw new Error("qualification OAuth directory v2 launch-claim inventory is missing");
        if (existingClaim) {
          readOAuthDirectoryCheckpointV2(paths.invocation!, invocation, "before-launch-claim");
        } else {
          // Published before the accounting append. A crash before the append may
          // replace this unclaimed checkpoint; once an event exists it is immutable.
          writeOAuthDirectoryCheckpointV2(paths.invocation!, invocation, "before-launch-claim", claimBoundary.inventory, false);
        }
      }
      if (existingClaim) {
        accountingEventSha = existingClaim.event_sha256;
        const launchAttemptExists = existsSync(join(paths.invocation!, "launch-attempt.json"));
        const priorSupervisor = latestContinuationSupervisor(paths.invocation!, invocation) ?? latestProcessIdentity(lifecycle, "supervisor");
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
  if (!auth) throw new Error("qualification launch ownership lacks authentication evidence");
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
    const prelaunchBoundary = assertConfiguredOAuthBoundary(
      config.mode,
      oauthPolicy,
      options.child_env,
      "immediately-before-pi-launch",
      options.now,
    );
    assertConfiguredOAuthBoundaryMatchesEvidence(auth, prelaunchBoundary, false);
    if (oauthPolicy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
      if (!isOAuthBoundaryV2(prelaunchBoundary)) throw new Error("qualification OAuth directory v2 prelaunch inventory is missing");
      const recordedClaim = readOAuthDirectoryCheckpointV2(paths.invocation!, invocation, "before-launch-claim");
      assertQualificationOAuthDirectoryContinuityV2(recordedClaim, prelaunchBoundary.inventory, {
        // A continuation performs a fresh authorized Pi auth check after the
        // original claim. That subprocess may legitimately update runtime state.
        allow_models_store_change: continuationSha !== null,
      });
      writeOAuthDirectoryCheckpointV2(paths.invocation!, invocation, "immediately-before-pi-launch", prelaunchBoundary.inventory, true);
    }
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
  let child: ChildProcess | null = null;
  let closed: Promise<QualificationChildOutcome> | null = null;
  let childIdentity: QualificationProcessIdentity | null = null;
  let childIdentityError: string | null = null;
  let startedAt = attemptAt;
  let deadlineAt = new Date(Date.parse(attemptAt) + arm.timeout_ms).toISOString();
  try {
    await withAsyncLock(paths.invocationLock!, async () => {
      if (existsSync(join(paths.invocation!, "abort-request.json"))) throw new Error("aborted before process spawn");
      const lifecycle = readQualificationLifecycle(paths.root, invocation.invocation_id);
      if (lifecycle.phase !== "launch-claimed") throw new Error(`qualification invocation entered ${lifecycle.phase} before process start could be recorded`);
      child = spawn(arm.executable.path, argv, {
        cwd: invocation.scenario.working_directory,
        env: options.child_env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
      });
      const launchedChild = child;
      closed = new Promise((resolve) => {
        let settled = false;
        const finish = (value: { code: number | null; signal: NodeJS.Signals | null; error?: string }) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        launchedChild!.once("error", (error) => finish({ code: null, signal: null, error: safeError(error) }));
        launchedChild!.once("close", (code, signal) => finish({ code, signal }));
      });
      launchedChild.stdout?.on("data", (chunk: Buffer) => stdoutCapture.write(chunk));
      launchedChild.stderr?.on("data", (chunk: Buffer) => stderrCapture.write(chunk));
      if (launchedChild.pid) {
        try { childIdentity = qualificationProcessIdentity(launchedChild.pid); }
        catch (error) { childIdentityError = safeError(error); }
      } else {
        childIdentityError = "child process did not expose a PID occurrence identity";
      }
      startedAt = timestamp(now(), "qualification process start time");
      deadlineAt = new Date(Date.parse(startedAt) + arm.timeout_ms).toISOString();
      if (!childIdentity) throw new Error(childIdentityError ?? "child process occurrence identity is unavailable");
      atomicWriteCanonical(join(paths.invocation!, "child-occurrence.json"), {
        schema_version: "qualification-child-occurrence-v1",
        invocation_id: invocation.invocation_id,
        attempt: 1,
        started_at: startedAt,
        deadline_at: deadlineAt,
        child: childIdentity,
      }, true);
      writeQualificationLifecycle(paths.root, transitionQualificationLifecycle(lifecycle, "running", {
        at: startedAt,
        detail: { attempt: 1, supervisor: supervisorIdentity, child: childIdentity, deadline_at: deadlineAt, continuation_authority_sha256: continuationSha },
      }));
    });
  } catch (error) {
    const aborted = existsSync(join(paths.invocation!, "abort-request.json"));
    const failedChild = child as unknown as ChildProcess | null;
    const failedClosed = closed as unknown as Promise<QualificationChildOutcome> | null;
    if (!failedChild || !failedClosed) {
      stdoutCapture.close();
      stderrCapture.close();
      await finalizeWithoutChild({ invocation, spoolDir: paths.root, status: aborted ? "aborted" : "failed", supervisor: supervisorIdentity, auth, now: now(), error: safeError(error), accountingEventSha, continuationSha });
      return;
    }
    terminateQualificationProcess(failedChild, childIdentity);
    const outcome = await failedClosed;
    await cleanupQualificationProcessGroupAfterLeaderExit(failedChild.pid, childIdentity);
    stdoutCapture.close();
    stderrCapture.close();
    await finalizeAfterCapture({ invocation, spoolDir: paths.root, terminalStatus: aborted ? "aborted" : "failed", supervisor: supervisorIdentity, child: childIdentity, auth, accountingEventSha, continuationSha, startedAt, deadlineAt, exitCode: outcome.code, signal: outcome.signal, stdoutCapture, stderrCapture, now: now(), error: `process occurrence publication failed: ${safeError(error)}` });
    return;
  }
  const runningChild = child as unknown as ChildProcess | null;
  const runningClosed = closed as unknown as Promise<QualificationChildOutcome> | null;
  if (!runningChild || !runningClosed) throw new Error("qualification process launch did not publish a child occurrence");

  let termination: "exit" | "timeout" | "abort" = "exit";
  const timeoutTimer = setTimeout(() => {
    if (termination !== "exit") return;
    termination = "timeout";
    terminateQualificationProcess(runningChild, childIdentity);
  }, arm.timeout_ms);
  const abortTimer = setInterval(() => {
    if (termination !== "exit") return;
    if (existsSync(join(paths.invocation!, "abort-request.json"))) {
      termination = "abort";
      terminateQualificationProcess(runningChild, childIdentity);
    }
  }, 20);
  const outcome = await runningClosed;
  clearTimeout(timeoutTimer);
  clearInterval(abortTimer);
  await cleanupQualificationProcessGroupAfterLeaderExit(runningChild.pid, childIdentity);
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
  const supervisor = receipt?.supervisor ?? latestContinuationSupervisor(paths.invocation!, invocation) ?? latestProcessIdentity(lifecycle, "supervisor");
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
      const priorSupervisor = latestContinuationSupervisor(paths.invocation!, invocation) ?? latestProcessIdentity(lifecycle, "supervisor");
      const child = readChildOccurrence(paths.invocation!, invocation, false)?.child ?? latestProcessIdentity(lifecycle, "child");
      if (priorSupervisor && qualificationProcessMatches(priorSupervisor)) {
        if (child) {
          childToTerminate = child;
          return;
        }
        if (priorSupervisor.pid === process.pid) return;
        await terminateInterruptedQualificationProcessGroup(priorSupervisor);
        if (qualificationProcessMatches(priorSupervisor)) throw new Error(`qualification live supervisor ${priorSupervisor.pid} could not be terminated for abort reconciliation`);
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
          child: null,
        });
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
    if (continuationRecord) assertContinuationRecordBound(continuationRecord, invocation);
    const childOccurrence = readChildOccurrence(invocationPaths.invocation!, invocation, false);
    if (childOccurrence && (!hasLaunchAttempt || !accountingEvent)) throw new Error(`qualification child occurrence ${id} has no launch/accounting claim`);
    if (invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
      const claimPath = oauthCheckpointPath(invocationPaths.invocation!, "before-launch-claim");
      const prelaunchPath = oauthCheckpointPath(invocationPaths.invocation!, "immediately-before-pi-launch");
      if (accountingEvent && !existsSync(claimPath) && !existsSync(join(invocationPaths.terminal!, "receipt.json"))) {
        throw new Error(`qualification invocation ${id} launch-claim OAuth checkpoint is missing`);
      }
      if (existsSync(claimPath)) readOAuthDirectoryCheckpointV2(invocationPaths.invocation!, invocation, "before-launch-claim");
      if (existsSync(prelaunchPath)) readOAuthDirectoryCheckpointV2(invocationPaths.invocation!, invocation, "immediately-before-pi-launch");
      if (childOccurrence && !existsSync(prelaunchPath) && !existsSync(join(invocationPaths.terminal!, "receipt.json"))) {
        throw new Error(`qualification invocation ${id} child occurrence lacks its prelaunch OAuth checkpoint`);
      }
    }
    if (lifecycle.phase === "running" && (!childOccurrence || qualificationCanonicalJson(latestProcessIdentity(lifecycle, "child")) !== qualificationCanonicalJson(childOccurrence.child))) {
      throw new Error(`qualification running lifecycle ${id} is not bound to its child occurrence`);
    }
    const receiptPath = join(invocationPaths.terminal!, "receipt.json");
    if (existsSync(receiptPath)) {
      terminal += 1;
      const receipt = readTerminalReceipt(paths.root, invocation);
      if (invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 && accountingEvent &&
          !existsSync(oauthCheckpointPath(invocationPaths.invocation!, "before-launch-claim"))) {
        const handledMissingClaim = receipt.schema_version === QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2 &&
          receipt.oauth_directory_validations.before_launch_claim === null && receipt.artifact === null &&
          receipt.terminal_status !== "completed" && receipt.terminal_status !== "refused";
        if (!handledMissingClaim) throw new Error(`qualification terminal receipt for ${id} did not fail closed over its missing launch-claim OAuth checkpoint`);
      }
      if (invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 && childOccurrence &&
          !existsSync(oauthCheckpointPath(invocationPaths.invocation!, "immediately-before-pi-launch"))) {
        const handledMissingCheckpoint = receipt.schema_version === QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2 &&
          receipt.oauth_directory_validations.immediately_before_pi_launch === null && receipt.artifact === null &&
          receipt.terminal_status !== "completed" && receipt.terminal_status !== "refused";
        if (!handledMissingCheckpoint) throw new Error(`qualification terminal receipt for ${id} did not fail closed over its missing prelaunch OAuth checkpoint`);
      }
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

const QUALIFICATION_OAUTH_DIRECTORY_CHECKPOINT_VERSION = "qualification-oauth-directory-checkpoint-v2" as const;

type QualificationOAuthCheckpointPointV2 = "before-launch-claim" | "immediately-before-pi-launch";

function oauthCheckpointPath(invocationDir: string, point: QualificationOAuthCheckpointPointV2): string {
  return join(invocationDir, point === "before-launch-claim" ? "oauth-directory-launch-claim.json" : "oauth-directory-prelaunch.json");
}

function writeOAuthDirectoryCheckpointV2(
  invocationDir: string,
  invocation: QualificationInvocationV1,
  point: QualificationOAuthCheckpointPointV2,
  inventory: QualificationOAuthDirectoryInventoryV2,
  exclusive: boolean,
): void {
  if (invocation.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) throw new Error("qualification OAuth directory checkpoint requires a v2 invocation");
  validateQualificationOAuthDirectoryInventoryV2(inventory, point);
  if (!inventory.valid) throw new Error(`qualification OAuth directory ${point} checkpoint cannot bind an invalid inventory`);
  const base = {
    schema_version: QUALIFICATION_OAUTH_DIRECTORY_CHECKPOINT_VERSION,
    invocation_id: invocation.invocation_id,
    oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
    validation_point: point,
    inventory,
  };
  atomicWriteCanonical(
    oauthCheckpointPath(invocationDir, point),
    { ...base, checkpoint_sha256: qualificationSha256(qualificationCanonicalJson(base)) },
    exclusive,
  );
}

function readOAuthDirectoryCheckpointV2(
  invocationDir: string,
  invocation: QualificationInvocationV1,
  point: QualificationOAuthCheckpointPointV2,
): QualificationOAuthDirectoryInventoryV2 {
  const value = readCanonicalJson(oauthCheckpointPath(invocationDir, point), `qualification OAuth directory ${point} checkpoint ${invocation.invocation_id}`);
  if (!plainObject(value)) throw new Error(`qualification OAuth directory ${point} checkpoint must be an object`);
  exactKeys(value, ["schema_version", "invocation_id", "oauth_directory_policy", "validation_point", "inventory", "checkpoint_sha256"], `qualification OAuth directory ${point} checkpoint`);
  const { checkpoint_sha256: recorded, ...base } = value;
  if (value.schema_version !== QUALIFICATION_OAUTH_DIRECTORY_CHECKPOINT_VERSION || value.invocation_id !== invocation.invocation_id ||
      invocation.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 || value.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 ||
      value.validation_point !== point || typeof recorded !== "string" || qualificationSha256(qualificationCanonicalJson(base)) !== recorded) {
    throw new Error(`qualification OAuth directory ${point} checkpoint identity/digest mismatch`);
  }
  validateQualificationOAuthDirectoryInventoryV2(value.inventory, point);
  if (!value.inventory.valid) throw new Error(`qualification OAuth directory ${point} checkpoint is invalid`);
  return value.inventory;
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
  if (entries.length > 1) throw new Error("qualification continuation authority is one-time but multiple records exist");
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

function assertContinuationRecordBound(record: Record<string, unknown>, invocation: QualificationInvocationV1): void {
  if (record.invocation_id !== invocation.invocation_id || record.authority_sha256 !== invocation.continuation_authority_sha256 ||
      Date.parse(String(record.authorized_at)) > Date.parse(invocation.continuation_authority_expires_at)) {
    throw new Error(`qualification continuation authority for ${invocation.invocation_id} is not bound to its immutable capability/expiry`);
  }
}

function latestContinuationSupervisor(invocationDir: string, invocation: QualificationInvocationV1): QualificationProcessIdentity | null {
  const record = readContinuationRecord(invocationDir);
  if (!record) return null;
  assertContinuationRecordBound(record, invocation);
  return processIdentityFrom(record.new_supervisor);
}

function recordContinuationAuthority(
  spoolDir: string,
  invocation: QualificationInvocationV1,
  authority: string,
  priorSupervisor: QualificationProcessIdentity | null,
  newSupervisor: QualificationProcessIdentity,
  authorizedAt: string,
): string {
  if (!authority.trim() || Buffer.byteLength(authority, "utf8") < 32 || Buffer.byteLength(authority, "utf8") > 4096) throw new Error("qualification continuation authority must be a 32..4096 byte one-time capability");
  const paths = qualificationSpoolPaths(spoolDir, invocation.invocation_id);
  const directory = join(paths.invocation!, "continuations");
  const previous = readContinuationRecord(paths.invocation!);
  if (previous) throw new Error("qualification continuation authority was already consumed");
  const authoritySha = qualificationSha256(authority);
  if (authoritySha !== invocation.continuation_authority_sha256) throw new Error("qualification continuation authority does not match the immutable invocation capability");
  if (Date.parse(authorizedAt) > Date.parse(invocation.continuation_authority_expires_at)) throw new Error("qualification continuation authority is expired");
  const base = {
    schema_version: "qualification-continuation-authority-v1",
    invocation_id: invocation.invocation_id,
    seq: 1,
    authorized_at: timestamp(authorizedAt, "qualification continuation authority time"),
    authority_sha256: authoritySha,
    previous_record_sha256: null,
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
  auth: QualificationAuthEvidence | null;
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

function collectOAuthDirectoryValidationsV2(
  invocation: QualificationInvocationV1,
  spoolDir: string,
  auth: QualificationAuthEvidence | null,
  terminalTime: string,
  validateTerminal: boolean,
): { validations: QualificationOAuthDirectoryValidationsV2; artifact_eligible: boolean; error: string | null } | null {
  if (invocation.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) return null;
  const validations: QualificationOAuthDirectoryValidationsV2 = {
    before_oauth_readiness: null,
    after_oauth_readiness: null,
    before_launch_claim: null,
    immediately_before_pi_launch: null,
    after_child_termination: null,
  };
  const errors: string[] = [];
  if (auth?.schema_version === QUALIFICATION_AUTH_EVIDENCE_VERSION_V2 && auth.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    validations.before_oauth_readiness = auth.oauth_directory_validations.before_oauth_readiness;
    validations.after_oauth_readiness = auth.oauth_directory_validations.after_oauth_readiness;
  } else if (auth !== null) {
    errors.push("v2 authentication evidence is missing or historical");
  }
  const invocationDir = qualificationSpoolPaths(spoolDir, invocation.invocation_id).invocation!;
  for (const point of ["before-launch-claim", "immediately-before-pi-launch"] as const) {
    const path = oauthCheckpointPath(invocationDir, point);
    if (!existsSync(path)) continue;
    try {
      const inventory = readOAuthDirectoryCheckpointV2(invocationDir, invocation, point);
      if (point === "before-launch-claim") validations.before_launch_claim = inventory;
      else validations.immediately_before_pi_launch = inventory;
    } catch (error) {
      errors.push(safeError(error));
    }
  }
  if (validateTerminal) {
    if (validations.before_launch_claim === null) errors.push("launch-claim OAuth directory checkpoint is missing after accounting");
    if (validations.immediately_before_pi_launch === null) errors.push("prelaunch OAuth directory checkpoint is missing after child start");
    const source = validations.immediately_before_pi_launch ?? validations.before_launch_claim ?? validations.after_oauth_readiness;
    if (!source) {
      errors.push("no earlier v2 OAuth directory occurrence exists for terminal continuity");
    } else {
      try {
        let terminal = inspectQualificationOAuthDirectoryPolicyV2(
          { PI_CODING_AGENT_DIR: source.directory.path },
          { validation_point: "after-child-termination", now: () => terminalTime },
        ).inventory;
        if (terminal.valid) {
          try {
            // Pi may create or atomically replace only models-store.json during
            // the authorized child. Auth and models occurrences remain bound.
            assertQualificationOAuthDirectoryContinuityV2(source, terminal, { allow_models_store_change: true });
          } catch (error) {
            terminal = invalidateQualificationOAuthDirectoryInventoryV2(terminal, safeError(error));
          }
        }
        validations.after_child_termination = terminal;
        if (!terminal.valid) errors.push(...terminal.errors);
      } catch (error) {
        errors.push(`terminal OAuth directory occurrence could not be inspected: ${safeError(error)}`);
      }
    }
  }
  return {
    validations,
    artifact_eligible: errors.length === 0,
    error: errors.length > 0 ? `qualification OAuth terminal inventory validation failed: ${errors[0]}` : null,
  };
}

function terminalReceiptForPolicy(
  invocation: QualificationInvocationV1,
  base: Omit<QualificationTerminalReceiptV1, "schema_version">,
  oauth: ReturnType<typeof collectOAuthDirectoryValidationsV2>,
): QualificationTerminalReceipt {
  if (invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    if (!oauth) throw new Error("qualification terminal receipt v2 lacks OAuth directory evidence");
    return {
      schema_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2,
      ...base,
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
      oauth_directory_validations: oauth.validations,
    };
  }
  return { schema_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION, ...base };
}

async function finalizeAfterCapture(options: {
  invocation: QualificationInvocationV1;
  spoolDir: string;
  terminalStatus?: QualificationTerminalStatus;
  supervisor: QualificationProcessIdentity;
  child: QualificationProcessIdentity | null;
  auth: QualificationAuthEvidence;
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
  const finishedAt = timestamp(options.now, "qualification terminal time");
  const oauth = collectOAuthDirectoryValidationsV2(options.invocation, paths.root, options.auth, finishedAt, true);
  const artifactEligible = oauth?.artifact_eligible ?? true;
  let artifact: QualificationTerminalReceiptV1["artifact"] = null;
  let attestation: ArtifactAttestation = { ok: false, actual: null, fallback: false, refused: false, error: "artifact was not validated" };
  if (!stdout.truncated && artifactEligible) {
    const artifactPath = join(paths.root, options.invocation.expected_artifact.path);
    try {
      atomicWriteBytes(artifactPath, readFileSync(stdoutFinal), true);
      const bytes = readFileSync(artifactPath);
      artifact = { path: options.invocation.expected_artifact.path, type: "pi-jsonl", bytes: bytes.length, sha256: qualificationSha256(bytes) };
      attestation = attestPiJsonl(bytes.toString("utf8"), options.invocation.requested);
    } catch (error) {
      attestation = { ok: false, actual: null, fallback: false, refused: false, error: safeError(error) };
    }
  } else if (!artifactEligible) {
    attestation = { ok: false, actual: null, fallback: false, refused: false, error: oauth?.error ?? "OAuth directory terminal inventory is invalid" };
  } else {
    attestation = { ok: false, actual: null, fallback: false, refused: false, error: "stdout exceeded the configured output limit" };
  }
  const status = options.terminalStatus
    ?? (options.exitCode !== 0 ? "failed"
      : !artifactEligible ? "invalid-artifact"
        : attestation.refused ? "refused"
          : attestation.ok ? "completed" : "invalid-artifact");
  const error = options.error ?? (status === "completed" ? null : oauth?.error ?? attestation.error ?? `child exited ${String(options.exitCode)}`);
  const receipt = terminalReceiptForPolicy(options.invocation, {
    invocation_id: options.invocation.invocation_id,
    terminal_status: status,
    attempt: 1,
    started_at: options.startedAt,
    finished_at: finishedAt,
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
  }, oauth);
  commitTerminalReceipt(paths.root, options.invocation, receipt);
}

async function finalizeWithoutChild(options: {
  invocation: QualificationInvocationV1;
  spoolDir: string;
  status: "aborted" | "failed";
  supervisor: QualificationProcessIdentity;
  auth: QualificationAuthEvidence | null;
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
  const finishedAt = timestamp(options.now, "qualification terminal time");
  const oauth = collectOAuthDirectoryValidationsV2(
    options.invocation,
    paths.root,
    options.auth,
    finishedAt,
    Boolean(options.child || options.startedAt),
  );
  const interruptedArtifactPath = join(paths.root, options.invocation.expected_artifact.path);
  let interruptedArtifact: QualificationTerminalReceiptV1["artifact"] = null;
  let interruptedAttestation: ArtifactAttestation = { ok: false, actual: null, fallback: false, refused: false, error: null };
  if (existsSync(interruptedArtifactPath) && options.invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    // This path did not complete the normal post-child terminal validation,
    // so no pre-existing artifact can become eligible under policy v2.
    rmSync(interruptedArtifactPath, { force: true });
  } else if (existsSync(interruptedArtifactPath) && (oauth?.artifact_eligible ?? true)) {
    assertRegularFile(interruptedArtifactPath, `qualification interrupted artifact ${options.invocation.invocation_id}`);
    const bytes = readFileSync(interruptedArtifactPath);
    interruptedArtifact = { path: options.invocation.expected_artifact.path, type: "pi-jsonl", bytes: bytes.length, sha256: qualificationSha256(bytes) };
    interruptedAttestation = attestPiJsonl(bytes.toString("utf8"), options.invocation.requested);
  } else if (existsSync(interruptedArtifactPath)) {
    rmSync(interruptedArtifactPath, { force: true });
  }
  const receipt = terminalReceiptForPolicy(options.invocation, {
    invocation_id: options.invocation.invocation_id,
    terminal_status: options.status,
    attempt: options.accountingEventSha ? 1 : 0,
    started_at: options.startedAt ?? null,
    finished_at: finishedAt,
    deadline_at: options.deadlineAt ?? null,
    requested_timeout_ms: options.invocation.execution.timeout_ms,
    effective_timeout_ms: options.invocation.execution.timeout_ms,
    supervisor: options.supervisor,
    child: options.child ?? null,
    exit_code: null,
    signal: null,
    requested: options.invocation.requested,
    actual: interruptedAttestation.actual,
    provider_model_identity_observed: interruptedAttestation.ok,
    successful_execution: false,
    fallback_detected: interruptedAttestation.fallback,
    authentication: options.accountingEventSha && options.auth ? {
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
    error: oauth?.error ?? options.error,
  }, oauth);
  commitTerminalReceipt(paths.root, options.invocation, receipt);
}

function commitTerminalReceipt(spoolDir: string, invocation: QualificationInvocationV1, receipt: QualificationTerminalReceipt): void {
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

function readTerminalReceipt(spoolDir: string, invocation: QualificationInvocationV1): QualificationTerminalReceipt {
  const path = join(qualificationSpoolPaths(spoolDir, invocation.invocation_id).terminal!, "receipt.json");
  const value = readCanonicalJson(path, `qualification terminal receipt ${invocation.invocation_id}`);
  validateTerminalReceipt(value, invocation);
  return value as QualificationTerminalReceipt;
}

function assertTerminalReceiptCrossBindings(spoolDir: string, invocation: QualificationInvocationV1, receipt: QualificationTerminalReceipt): void {
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
  if (continuation) assertContinuationRecordBound(continuation, invocation);
  if (receipt.continuation_authority_sha256 !== (continuation ? String(continuation.authority_sha256) : null)) {
    throw new Error(`qualification terminal receipt for ${invocation.invocation_id} continuation authority mismatch`);
  }
  let authEvidence: QualificationAuthEvidence | null = null;
  if (receipt.authentication) {
    authEvidence = readAuthEvidence(paths.root, invocation, false);
    if (receipt.authentication.evidence_sha256 !== qualificationSha256(`${qualificationCanonicalJson(authEvidence)}\n`)) {
      throw new Error(`qualification terminal receipt for ${invocation.invocation_id} authentication evidence mismatch`);
    }
  }
  if (receipt.schema_version === QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2) {
    if (invocation.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) throw new Error(`qualification terminal receipt for ${invocation.invocation_id} reinterprets historical policy as v2`);
    const validations = receipt.oauth_directory_validations;
    if (authEvidence?.schema_version === QUALIFICATION_AUTH_EVIDENCE_VERSION_V2) {
      if (qualificationCanonicalJson(validations.before_oauth_readiness) !== qualificationCanonicalJson(authEvidence.oauth_directory_validations.before_oauth_readiness) ||
          qualificationCanonicalJson(validations.after_oauth_readiness) !== qualificationCanonicalJson(authEvidence.oauth_directory_validations.after_oauth_readiness)) {
        throw new Error(`qualification terminal receipt for ${invocation.invocation_id} OAuth readiness occurrence mismatch`);
      }
    } else if (receipt.attempt === 1) {
      throw new Error(`qualification terminal receipt for ${invocation.invocation_id} lacks v2 auth occurrence evidence`);
    }
    if (receipt.attempt === 1) {
      const claimPath = oauthCheckpointPath(paths.invocation!, "before-launch-claim");
      if (existsSync(claimPath)) {
        const claim = readOAuthDirectoryCheckpointV2(paths.invocation!, invocation, "before-launch-claim");
        if (qualificationCanonicalJson(validations.before_launch_claim) !== qualificationCanonicalJson(claim)) {
          throw new Error(`qualification terminal receipt for ${invocation.invocation_id} launch-claim OAuth occurrence mismatch`);
        }
      } else if (validations.before_launch_claim !== null || receipt.artifact !== null ||
          receipt.terminal_status === "completed" || receipt.terminal_status === "refused") {
        throw new Error(`qualification terminal receipt for ${invocation.invocation_id} did not fail closed over missing launch-claim OAuth evidence`);
      }
      if (existsSync(oauthCheckpointPath(paths.invocation!, "immediately-before-pi-launch"))) {
        const prelaunch = readOAuthDirectoryCheckpointV2(paths.invocation!, invocation, "immediately-before-pi-launch");
        if (qualificationCanonicalJson(validations.immediately_before_pi_launch) !== qualificationCanonicalJson(prelaunch)) {
          throw new Error(`qualification terminal receipt for ${invocation.invocation_id} prelaunch OAuth occurrence mismatch`);
        }
      } else if (validations.immediately_before_pi_launch !== null) {
        throw new Error(`qualification terminal receipt for ${invocation.invocation_id} invents missing prelaunch OAuth occurrence evidence`);
      }
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
    const stdoutBytes = readFileSync(join(paths.root, receipt.stdout.path));
    if (!bytes.equals(stdoutBytes)) throw new Error(`qualification artifact ${invocation.invocation_id} does not equal retained stdout evidence`);
    const attestation = attestPiJsonl(bytes.toString("utf8"), invocation.requested);
    if (qualificationCanonicalJson(receipt.actual) !== qualificationCanonicalJson(attestation.actual) ||
        receipt.provider_model_identity_observed !== attestation.ok || receipt.fallback_detected !== attestation.fallback) {
      throw new Error(`qualification artifact ${invocation.invocation_id} semantic identity contradicts terminal receipt`);
    }
    if (receipt.terminal_status === "completed" && (receipt.exit_code !== 0 || receipt.stdout.truncated || !attestation.ok || attestation.refused)) {
      throw new Error(`qualification artifact ${invocation.invocation_id} cannot substantiate completed execution`);
    }
    if (receipt.terminal_status === "refused" && (receipt.exit_code !== 0 || receipt.stdout.truncated || !attestation.ok || !attestation.refused)) {
      throw new Error(`qualification artifact ${invocation.invocation_id} cannot substantiate refusal`);
    }
    if (receipt.terminal_status === "invalid-artifact" && receipt.exit_code === 0 && !receipt.stdout.truncated && attestation.ok) {
      throw new Error(`qualification artifact ${invocation.invocation_id} contradicts invalid-artifact classification`);
    }
  } else if (receipt.terminal_status === "completed" || receipt.terminal_status === "refused") {
    throw new Error(`qualification terminal ${receipt.terminal_status} for ${invocation.invocation_id} has no semantic artifact evidence`);
  }
}

function validateTerminalReceipt(value: unknown, invocation: QualificationInvocationV1): void {
  if (!plainObject(value)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} must be an object`);
  const historical = ["schema_version", "invocation_id", "terminal_status", "attempt", "started_at", "finished_at", "deadline_at", "requested_timeout_ms", "effective_timeout_ms", "supervisor", "child", "exit_code", "signal", "requested", "actual", "provider_model_identity_observed", "successful_execution", "fallback_detected", "authentication", "accounting_event_sha256", "continuation_authority_sha256", "stdout", "stderr", "artifact", "error"];
  const policyV2 = invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  if (policyV2) {
    if (value.schema_version !== QUALIFICATION_TERMINAL_RECEIPT_VERSION_V2) {
      throw new Error(`qualification v2 terminal receipt ${invocation.invocation_id} identity/policy mismatch; historical receipts are not reinterpreted`);
    }
    exactKeys(value, [...historical, "oauth_directory_policy", "oauth_directory_validations"], `qualification terminal receipt ${invocation.invocation_id}`);
    if (value.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
      throw new Error(`qualification v2 terminal receipt ${invocation.invocation_id} identity/policy mismatch; historical receipts are not reinterpreted`);
    }
    validateTerminalOAuthDirectoryValidationsV2(value.oauth_directory_validations, invocation.invocation_id);
  } else {
    exactKeys(value, historical, `qualification terminal receipt ${invocation.invocation_id}`);
    if (value.schema_version !== QUALIFICATION_TERMINAL_RECEIPT_VERSION) throw new Error(`qualification historical terminal receipt ${invocation.invocation_id} identity/version mismatch`);
  }
  if (value.invocation_id !== invocation.invocation_id || (value.attempt !== 0 && value.attempt !== 1)) throw new Error(`qualification terminal receipt ${invocation.invocation_id} identity/version mismatch`);
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
  if (policyV2) {
    const validations = value.oauth_directory_validations as unknown as QualificationOAuthDirectoryValidationsV2;
    const terminal = validations.after_child_termination;
    if (value.started_at !== null && terminal === null) throw new Error(`qualification terminal receipt ${invocation.invocation_id} lacks post-child OAuth inventory evidence`);
    if (value.attempt === 1 && validations.before_launch_claim === null &&
        (value.terminal_status === "completed" || value.terminal_status === "refused" || value.artifact !== null)) {
      throw new Error(`qualification terminal receipt ${invocation.invocation_id} accepts an artifact without launch-claim OAuth checkpoint evidence`);
    }
    if (value.started_at !== null && validations.immediately_before_pi_launch === null &&
        (value.terminal_status === "completed" || value.terminal_status === "refused" || value.artifact !== null)) {
      throw new Error(`qualification terminal receipt ${invocation.invocation_id} accepts an artifact without prelaunch OAuth checkpoint evidence`);
    }
    if (terminal?.valid === false && value.artifact !== null) throw new Error(`qualification terminal receipt ${invocation.invocation_id} accepts an artifact after invalid OAuth inventory`);
    if ((value.terminal_status === "completed" || value.terminal_status === "refused") && terminal?.valid !== true) {
      throw new Error(`qualification terminal receipt ${invocation.invocation_id} successful/refused artifact lacks valid terminal OAuth inventory`);
    }
  }
}

function validateTerminalOAuthDirectoryValidationsV2(value: unknown, invocationId: string): asserts value is QualificationOAuthDirectoryValidationsV2 {
  if (!plainObject(value)) throw new Error(`qualification terminal receipt ${invocationId} OAuth directory validations are invalid`);
  const fields: Array<[keyof QualificationOAuthDirectoryValidationsV2, QualificationOAuthDirectoryValidationPointV2]> = [
    ["before_oauth_readiness", "before-oauth-readiness"],
    ["after_oauth_readiness", "after-oauth-readiness"],
    ["before_launch_claim", "before-launch-claim"],
    ["immediately_before_pi_launch", "immediately-before-pi-launch"],
    ["after_child_termination", "after-child-termination"],
  ];
  exactKeys(value, fields.map(([name]) => name), `qualification terminal receipt ${invocationId} OAuth directory validations`);
  for (const [name, point] of fields) {
    const inventory = value[name];
    if (inventory !== null) validateQualificationOAuthDirectoryInventoryV2(inventory, point);
  }
}

function validateOutputReceiptShape(value: unknown, invocationId: string, fileName: string): void {
  if (!plainObject(value)) throw new Error(`qualification terminal receipt ${invocationId} output evidence is invalid`);
  exactKeys(value, ["path", "total_bytes", "captured_bytes", "truncated", "sha256"], `qualification terminal receipt ${invocationId} output`);
  if (value.path !== `invocations/${invocationId}/${fileName}` || !Number.isSafeInteger(value.total_bytes) || !Number.isSafeInteger(value.captured_bytes) ||
      Number(value.total_bytes) < Number(value.captured_bytes) || Number(value.captured_bytes) < 0 || typeof value.truncated !== "boolean" || !/^[a-f0-9]{64}$/.test(String(value.sha256))) {
    throw new Error(`qualification terminal receipt ${invocationId} output evidence is invalid`);
  }
}

function readAuthEvidence(spoolDir: string, invocation: QualificationInvocationV1, requireFresh = true): QualificationAuthEvidence {
  const path = join(qualificationSpoolPaths(spoolDir, invocation.invocation_id).invocation!, "auth-evidence.json");
  const evidence = readCanonicalJson(path, `qualification auth evidence ${invocation.invocation_id}`) as QualificationAuthEvidence;
  validateAuthEvidence(evidence, invocation, requireFresh);
  return evidence;
}
function validateAuthEvidence(evidence: QualificationAuthEvidence, invocation: QualificationInvocationV1, requireFresh = true): void {
  if (!plainObject(evidence)) throw new Error("qualification auth evidence must be an object");
  const commonKeys = ["schema_version", "checked_at", "provider", "requested_model", "model_identity_observed", "status", "auth_type", "source", "credentials_included", "readiness_only", "removed_parent_environment_names", "child_environment_names", "executable_sha256", "launch_authority_sha256", "evidence_sha256"];
  const policyV2 = invocation.oauth_directory_policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  if (policyV2) {
    exactKeys(evidence as unknown as Record<string, unknown>, [...commonKeys, "oauth_directory_policy", "oauth_directory_validations"], `qualification auth evidence ${invocation.invocation_id}`);
    if (evidence.schema_version !== QUALIFICATION_AUTH_EVIDENCE_VERSION_V2 || evidence.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
      throw new Error(`qualification auth evidence v2 policy contradicts invocation ${invocation.invocation_id}`);
    }
    if (!plainObject(evidence.oauth_directory_validations)) throw new Error(`qualification auth evidence v2 inventories are missing for ${invocation.invocation_id}`);
    exactKeys(evidence.oauth_directory_validations, ["before_oauth_readiness", "after_oauth_readiness"], `qualification auth evidence v2 inventories ${invocation.invocation_id}`);
    validateQualificationOAuthDirectoryInventoryV2(evidence.oauth_directory_validations.before_oauth_readiness, "before-oauth-readiness");
    validateQualificationOAuthDirectoryInventoryV2(evidence.oauth_directory_validations.after_oauth_readiness, "after-oauth-readiness");
    if (!evidence.oauth_directory_validations.before_oauth_readiness.valid || !evidence.oauth_directory_validations.after_oauth_readiness.valid) {
      throw new Error(`qualification auth evidence v2 inventory is invalid for ${invocation.invocation_id}`);
    }
    assertQualificationOAuthDirectoryContinuityV2(
      evidence.oauth_directory_validations.before_oauth_readiness,
      evidence.oauth_directory_validations.after_oauth_readiness,
      { allow_models_store_change: true },
    );
  } else {
    exactKeys(evidence as unknown as Record<string, unknown>, [...commonKeys, "oauth_agent_directory_identity", "oauth_auth_file_identity", "oauth_models_file_identity", "oauth_directory_entries"], `qualification auth evidence ${invocation.invocation_id}`);
    if (evidence.schema_version !== QUALIFICATION_AUTH_EVIDENCE_VERSION) {
      throw new Error(`qualification historical auth evidence cannot be reinterpreted for invocation ${invocation.invocation_id}`);
    }
    const productionAuth = invocation.authentication === "chatgpt-oauth";
    if (productionAuth) {
      if (!isFilesystemOccurrence(evidence.oauth_agent_directory_identity) || !isFilesystemOccurrence(evidence.oauth_auth_file_identity) ||
          (evidence.oauth_models_file_identity !== null && !isFilesystemOccurrence(evidence.oauth_models_file_identity)) ||
          !Array.isArray(evidence.oauth_directory_entries) || evidence.oauth_directory_entries.some((entry) => typeof entry !== "string")) {
        throw new Error(`qualification auth evidence OAuth filesystem occurrence is invalid for ${invocation.invocation_id}`);
      }
    } else if (evidence.oauth_agent_directory_identity !== null || evidence.oauth_auth_file_identity !== null || evidence.oauth_models_file_identity !== null ||
        !Array.isArray(evidence.oauth_directory_entries) || evidence.oauth_directory_entries.length !== 0) {
      throw new Error(`qualification test auth evidence must not claim a production OAuth filesystem occurrence`);
    }
  }
  if (evidence.provider !== invocation.requested.provider || evidence.requested_model !== invocation.requested.model || evidence.model_identity_observed !== false ||
      evidence.status !== "ready" || evidence.auth_type !== "oauth" || evidence.credentials_included !== false || evidence.readiness_only !== true ||
      !/^[a-f0-9]{64}$/.test(evidence.launch_authority_sha256)) {
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

function isFilesystemOccurrence(value: unknown): value is QualificationFilesystemOccurrence {
  return plainObject(value) && typeof value.realpath === "string" && Number.isSafeInteger(value.device) && Number.isSafeInteger(value.inode) &&
    typeof value.mtime_ms === "number" && Number.isFinite(value.mtime_ms) && Number.isSafeInteger(value.bytes) && Number(value.bytes) >= 0;
}

function assertConfiguredOAuthBoundaryMatchesEvidence(
  evidence: QualificationAuthEvidence,
  current: QualificationOAuthBoundary,
  allowModelsStoreChange: boolean,
): void {
  if (evidence.schema_version === QUALIFICATION_AUTH_EVIDENCE_VERSION_V2) {
    if (!isOAuthBoundaryV2(current) || evidence.oauth_directory_policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
      throw new Error("qualification OAuth directory policy v2 evidence cannot be matched to a historical boundary");
    }
    assertQualificationOAuthDirectoryContinuityV2(
      evidence.oauth_directory_validations.after_oauth_readiness,
      current.inventory,
      { allow_models_store_change: allowModelsStoreChange },
    );
    return;
  }
  if (current === null) return;
  if (isOAuthBoundaryV2(current)) throw new Error("qualification historical OAuth evidence cannot be reinterpreted under policy v2");
  assertOAuthBoundaryMatchesEvidence(evidence, current);
}

function assertOAuthBoundaryMatchesEvidence(
  evidence: QualificationAuthEvidenceV1,
  current: ReturnType<typeof assertQualificationOAuthCredentialBoundary>,
): void {
  const expected = {
    agent: evidence.oauth_agent_directory_identity,
    auth: evidence.oauth_auth_file_identity,
    models: evidence.oauth_models_file_identity,
    entries: evidence.oauth_directory_entries,
  };
  const observed = {
    agent: current.agent_directory_identity,
    auth: current.auth_file_identity,
    models: current.models_file_identity,
    entries: current.directory_entries,
  };
  if (qualificationCanonicalJson(expected) !== qualificationCanonicalJson(observed)) {
    throw new Error("qualification OAuth credential occurrence changed between auth check and launch");
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
  const io: QualificationLockIo = { read: readCanonicalJson, write: atomicWriteCanonical };
  while (true) {
    if (tryPublishQualificationLock(path, token, io)) break;
    const owner = readQualificationLockOwner(path, io);
    if (!owner) continue;
    if (!qualificationLockOwnerIsLive(owner)) {
      reclaimQualificationLock(path, owner.token, token, io);
      continue;
    }
    if (Date.now() >= deadline) throw new Error(`qualification state lock timed out: ${path}`);
    await sleep(10);
  }
  try { return await action(); }
  finally { releaseQualificationLock(path, token, io); }
}

function filesystemOccurrence(path: string, stat: Stats): QualificationFilesystemOccurrence {
  return { realpath: realpathSync(path), device: stat.dev, inode: stat.ino, mtime_ms: stat.mtimeMs, bytes: stat.size };
}

function readPrivateRegularFileOccurrence(path: string, ctx: string): { bytes: Buffer; identity: QualificationFilesystemOccurrence } {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    const pathStat = lstatSync(path);
    if (!stat.isFile() || pathStat.isSymbolicLink() || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) throw new Error(`${ctx} must be a stable regular non-symlink file`);
    if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) {
      throw new Error(`${ctx} must be private and owned by the qualification user`);
    }
    const bytes = readFileSync(fd);
    const finalStat = lstatSync(path);
    if (finalStat.isSymbolicLink() || finalStat.dev !== stat.dev || finalStat.ino !== stat.ino || finalStat.mtimeMs !== stat.mtimeMs || finalStat.size !== stat.size) {
      throw new Error(`${ctx} changed while it was opened`);
    }
    return { bytes, identity: filesystemOccurrence(path, stat) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(ctx)) throw error;
    throw new Error(`${ctx} is missing, unreadable, or a symlink`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function readPrivateRegularFile(path: string, ctx: string): Buffer {
  return readPrivateRegularFileOccurrence(path, ctx).bytes;
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
