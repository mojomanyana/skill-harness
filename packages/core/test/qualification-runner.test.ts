import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import {
  QUALIFICATION_ACCOUNTING_POLICY,
  QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
  qualificationCanonicalJson,
  qualificationConfigDigest,
  qualificationSha256,
} from "../src/qualification-config.js";
import {
  appendQualificationAccountingEvent,
  atomicWriteCanonical,
  createQualificationAccountingLedger,
  prepareQualificationInvocation,
  qualificationSpoolPaths,
  readQualificationAccounting,
  readQualificationInvocation,
  readQualificationLifecycle,
  transitionQualificationLifecycle,
  writeQualificationAccounting,
  writeQualificationLifecycle,
} from "../src/qualification-store.js";
import {
  abortQualificationInvocation,
  assertQualificationOAuthCredentialBoundary,
  checkQualificationAuthentication,
  pollQualificationInvocation,
  qualificationInvocationStatus,
  qualificationProcessIdentity,
  qualificationProcessMatches,
  redactQualificationOutput,
  superviseQualificationInvocation,
  validateQualificationRunnerSpool,
} from "../src/qualification-runner.js";

const hex = (value: string, length = 64) => value.repeat(length);
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const CONTINUATION_AUTHORITY = "inert-prebound-continuation-authority";

const FAKE_PI = `#!/usr/bin/env node
const fs = require('node:fs');
const cp = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'check') {
  const provider = args[args.indexOf('--provider') + 1];
  const status = process.env.FAKE_AUTH_STATUS || 'ready';
  if (status === 'nonzero') process.exit(9);
  if (status === 'malformed') { console.log('{bad'); process.exit(0); }
  console.log(JSON.stringify(status === 'ready'
    ? { status: 'ready', provider, authType: process.env.FAKE_AUTH_TYPE || 'oauth', ...(process.env.FAKE_AUTH_MODEL ? { model: process.env.FAKE_AUTH_MODEL } : {}) }
    : { status: 'not_ready', provider, reason: 'credentials_not_configured' }));
  process.exit(0);
}
const get = (name) => args[args.indexOf(name) + 1];
const provider = get('--provider');
const model = get('--model');
const inputArg = args.find((value) => value.startsWith('@')) || args[args.length - 1];
const inputPath = inputArg.startsWith('@') ? inputArg.slice(1) : inputArg;
const command = fs.readFileSync(inputPath, 'utf8').trim();
if (process.env.FAKE_COUNT_FILE) fs.appendFileSync(process.env.FAKE_COUNT_FILE, 'launch\\n');
const line = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
line({ type: 'session', version: 3, id: 'fake-session', timestamp: new Date().toISOString(), cwd: process.cwd(), home: process.env.HOME });
const finish = (actualProvider = provider, actualModel = model, extra = {}) => {
  line({ type: 'message_end', message: { role: 'assistant', provider: actualProvider, model: actualModel, content: [{ type: 'text', text: 'inert' }], stopReason: 'stop', ...extra } });
};
(async () => {
  if (command.startsWith('sleep:')) { await new Promise(r => setTimeout(r, Number(command.slice(6)))); finish(); return; }
  if (command.startsWith('partial:')) { process.stdout.write('{"type":"message_up'); await new Promise(r => setTimeout(r, Number(command.slice(8)))); process.stdout.write('date"}\\n'); finish(); return; }
  if (command.startsWith('grandchild:')) {
    const marker = command.slice('grandchild:'.length);
    cp.spawn(process.execPath, ['-e', 'setTimeout(()=>require("node:fs").writeFileSync(process.argv[1],"late"),500)', marker], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 5000)); finish(); return;
  }
  if (command.startsWith('orphan-grandchild:')) {
    const marker = command.slice('orphan-grandchild:'.length);
    cp.spawn(process.execPath, ['-e', 'setTimeout(()=>require("node:fs").writeFileSync(process.argv[1],"orphan"),500)', marker], { stdio: 'ignore' }).unref();
    finish(); return;
  }
  if (command === 'invalid') { process.stdout.write('{not-json\\n'); return; }
  if (command === 'missing-identity') { line({ type: 'message_end', message: { role: 'assistant', content: [] } }); return; }
  if (command === 'provider-substitution') { finish('openai', model); return; }
  if (command === 'model-substitution') { finish(provider, 'other-model'); return; }
  if (command === 'fallback') { line({ type: 'provider_fallback', from: provider, to: 'openai' }); finish(); return; }
  if (command === 'refused') { line({ type: 'message_end', message: { role: 'assistant', provider, model, content: [], stopReason: 'error', errorMessage: 'model not supported for this subscription' } }); return; }
  if (command === 'fail') { finish(); process.exitCode = 7; return; }
  if (command === 'huge') { process.stdout.write('x'.repeat(200000)); finish(); return; }
  if (command === 'create-models-store') {
    const target = require('node:path').join(process.env.PI_CODING_AGENT_DIR, 'models-store.json');
    fs.writeFileSync(target, 'inert Pi runtime state', { mode: 0o600 }); fs.chmodSync(target, 0o600); finish(); return;
  }
  if (command === 'replace-models-store') {
    const path = require('node:path'); const target = path.join(process.env.PI_CODING_AGENT_DIR, 'models-store.json');
    const temporary = path.join(process.env.PI_CODING_AGENT_DIR, '.models-store.tmp');
    fs.writeFileSync(temporary, 'atomically replaced inert Pi runtime state', { mode: 0o600 }); fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, target); finish(); return;
  }
  if (command === 'create-unexpected-oauth-entry') {
    const target = require('node:path').join(process.env.PI_CODING_AGENT_DIR, 'unexpected.json');
    fs.writeFileSync(target, '{}', { mode: 0o600 }); finish(); return;
  }
  finish();
})().catch((error) => { console.error(error.message); process.exit(8); });
`;

function setup(command = "complete", overrides: { timeout?: number; output?: number; conflict?: "refuse" | "remove-and-record"; oauthV2?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "qualification-runner-"));
  const executable = join(root, "fake-pi.cjs");
  writeFileSync(executable, FAKE_PI);
  chmodSync(executable, 0o755);
  const prompt = join(root, "prompt.txt");
  writeFileSync(prompt, `${command}\n`);
  const count = join(root, "calls.txt");
  const executablePin = { path: executable, sha256: sha(readFileSync(executable)) };
  const oauthAgent = join(root, "oauth-agent");
  if (overrides.oauthV2) {
    mkdirSync(oauthAgent, { mode: 0o700 });
    chmodSync(oauthAgent, 0o700);
    const authPath = join(oauthAgent, "auth.json");
    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "inert-test-only" } }), { mode: 0o600 });
    chmodSync(authPath, 0o600);
  }
  const envNames = ["HOME", "PATH", "PI_CODING_AGENT_DIR", "FAKE_AUTH_STATUS", "FAKE_AUTH_TYPE", "FAKE_AUTH_MODEL", "FAKE_COUNT_FILE"];
  const config = {
    schema_version: "qualification-config-v1",
    ...(overrides.oauthV2 ? { oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 } : {}),
    mode: "test",
    product: { repository: "https://example.invalid/product", commit: hex("1", 40), tree: hex("2", 40), checkout_path: root, package_path: executable, package_sha256: hex("3"), package_bytes: 1 },
    engine: { repository: "https://example.invalid/engine", commit: hex("4", 40), tree: hex("5", 40), checkout_path: root, package_paths: { core: executable, adapters: executable, cli: executable, meta: executable }, package_sha256: { core: hex("6"), adapters: hex("7"), cli: hex("8"), meta: hex("9") } },
    producer: { repository: "https://example.invalid/producer", commit: hex("a", 40), tree: hex("b", 40), checkout_path: root, version: "0.20.0", ledger_version: 3, ledger_schema_sha256: hex("a") },
    runner: { version: "qualification-runner-v1", executable: executablePin, conflicting_parent_environment: overrides.conflict ?? "remove-and-record" },
    accounting: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
    arms: [
      { id: "fake-subject", kind: "subject", provider: "fake", model: "fake-luna", authentication: "test-oauth", executable: executablePin, resources: [], arguments: ["@{input_path}"], allowed_environment_names: envNames, timeout_ms: overrides.timeout ?? 1000, output_limit_bytes: overrides.output ?? 65536, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false },
      { id: "fake-judge", kind: "judge", provider: "fake", model: "fake-sol", authentication: "test-oauth", executable: executablePin, resources: [], arguments: ["@{input_path}"], allowed_environment_names: envNames, timeout_ms: overrides.timeout ?? 1000, output_limit_bytes: overrides.output ?? 65536, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false },
    ],
  };
  const configPath = join(root, "config.json"); writeFileSync(configPath, JSON.stringify(config));
  const request = {
    schema_version: "qualification-invocation-request-v1", measurement_identity_sha256: hex("c"), invocation_id: "invocation-0001",
    continuation_authority_sha256: sha(CONTINUATION_AUTHORITY), continuation_authority_expires_at: "2099-01-01T00:00:00.000Z",
    scenario: { id: "fake-A1", version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e"), input_path: prompt, input_sha256: sha(readFileSync(prompt)), working_directory: root },
    role: "subject", counts_as_measurement: true, arms: { subject: "fake-subject", judge: "fake-judge" }, selected_arm: "fake-subject", repetition: 0,
  };
  const requestPath = join(root, "request.json"); writeFileSync(requestPath, JSON.stringify(request));
  const spool = join(root, "spool");
  prepareQualificationInvocation({ spool_dir: spool, config_path: configPath, request_path: requestPath });
  const parent_env = {
    HOME: root,
    PATH: process.env.PATH,
    ...(overrides.oauthV2 ? { PI_CODING_AGENT_DIR: oauthAgent } : {}),
    FAKE_AUTH_STATUS: "ready",
    FAKE_COUNT_FILE: count,
    OPENAI_API_KEY: "NEVER-PERSIST-THIS",
  };
  return { root, spool, count, prompt, executable, configPath, requestPath, parent_env, oauthAgent };
}

async function run(files: ReturnType<typeof setup>) {
  const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
  await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, authentication_authority: auth.launch_authority });
  return qualificationInvocationStatus(files.spool, "invocation-0001");
}

function calls(path: string): number { return existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).length : 0; }
async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for test condition");
    await sleep(10);
  }
}

function publishInterruptedClaim(files: ReturnType<typeof setup>, environmentNames: string[], options: {
  launchAttempt?: boolean;
  child?: ReturnType<typeof qualificationProcessIdentity>;
  supervisor?: ReturnType<typeof qualificationProcessIdentity>;
  startedAt?: string;
  deadlineAt?: string;
} = {}): void {
  const invocation = readQualificationInvocation(files.spool, "invocation-0001");
  const claim = appendQualificationAccountingEvent(createQualificationAccountingLedger(), {
    invocation_id: invocation.invocation_id,
    role: invocation.role,
    call_class: "subject",
    counts_as_measurement: invocation.counts_as_measurement,
    launched_at: "2026-08-28T12:00:00.000Z",
  });
  writeQualificationAccounting(files.spool, claim);
  let lifecycle = transitionQualificationLifecycle(readQualificationLifecycle(files.spool, invocation.invocation_id), "launch-claimed", {
    at: "2026-08-28T12:00:00.000Z",
    detail: { attempt: 1, accounting_event_sha256: claim.chain_head, supervisor: options.supervisor ?? { pid: 99999999, platform: process.platform, boot_id: "stale", start_ticks: "1" }, continuation_authority_sha256: null },
  });
  if (options.launchAttempt) {
    const artifact = join(files.spool, invocation.expected_artifact.path);
    atomicWriteCanonical(join(files.spool, "invocations", invocation.invocation_id, "launch-attempt.json"), {
      schema_version: "qualification-launch-attempt-v1",
      invocation_id: invocation.invocation_id,
      attempt: 1,
      at: "2026-08-28T12:00:00.000Z",
      executable: invocation.execution.executable,
      argv: ["--provider", invocation.requested.provider, "--model", invocation.requested.model, "--mode", "json", "--print", "--no-session", "--no-context-files", "--no-extensions", "--no-skills", `@${invocation.scenario.input_path}`],
      environment_names: [...environmentNames].sort(),
      automatic_retry: false,
    }, true);
  }
  if (options.child) {
    const startedAt = options.startedAt ?? new Date().toISOString();
    const deadlineAt = options.deadlineAt ?? new Date(Date.parse(startedAt) + 10_000).toISOString();
    atomicWriteCanonical(join(files.spool, "invocations", invocation.invocation_id, "child-occurrence.json"), {
      schema_version: "qualification-child-occurrence-v1", invocation_id: invocation.invocation_id, attempt: 1,
      started_at: startedAt, deadline_at: deadlineAt, child: options.child,
    }, true);
    lifecycle = transitionQualificationLifecycle(lifecycle, "running", {
      at: startedAt,
      detail: { attempt: 1, supervisor: options.supervisor ?? { pid: 99999999, platform: process.platform, boot_id: "stale", start_ticks: "1" }, child: options.child, deadline_at: deadlineAt },
    });
  }
  writeQualificationLifecycle(files.spool, lifecycle);
}

describe("qualification OAuth boundary", () => {
  it("requires a dedicated stored OAuth credential and refuses stored API keys or Codex routing overrides", () => {
    const home = mkdtempSync(join(tmpdir(), "qualification-oauth-home-"));
    const agent = join(home, ".pi", "agent");
    mkdirSync(agent, { recursive: true });
    chmodSync(agent, 0o700);
    const authPath = join(agent, "auth.json");
    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value", refresh: "sentinel-refresh-value" } }), { mode: 0o600 });
    const result = assertQualificationOAuthCredentialBoundary({ HOME: home });
    expect(result).toMatchObject({ agent_directory: agent, provider: "openai-codex", auth_type: "oauth", directory_entries: ["auth.json"] });
    expect(result.auth_file_identity).toMatchObject({ realpath: authPath });
    expect(JSON.stringify(result)).not.toContain("sentinel-oauth-value");

    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value" }, openai: { type: "api_key", key: "sentinel-api-value" } }), { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/dedicated OAuth credential store.*exactly.*openai-codex/i);

    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value" }, "claude-code": { type: "oauth", access: "unrelated-oauth-value" } }), { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/exactly.*openai-codex/i);

    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value" } }), { mode: 0o600 });
    const undeclared = join(agent, "settings.json");
    writeFileSync(undeclared, "{}", { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/undeclared entries/i);
    rmSync(undeclared);
    const historicalRuntimeState = join(agent, "models-store.json");
    writeFileSync(historicalRuntimeState, "{}", { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/undeclared entries/i);
    rmSync(historicalRuntimeState);
    writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { "openai-codex": { baseUrl: "https://proxy.invalid" } } }), { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/dedicated OAuth agent directory.*must not carry models\.json/i);
  });

  it("binds the v2 absent-to-Pi-generated lifecycle and accepts the same entry on the next invocation", async () => {
    const files = setup("create-models-store", { oauthV2: true });
    const first = await run(files);
    expect(first.terminal_status).toBe("completed");
    expect(calls(files.count)).toBe(1);
    const firstReceipt = JSON.parse(readFileSync(join(files.spool, "invocations", "invocation-0001", "terminal", "receipt.json"), "utf8"));
    expect(firstReceipt).toMatchObject({
      schema_version: "qualification-terminal-receipt-v2",
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
      successful_execution: true,
    });
    expect([
      firstReceipt.oauth_directory_validations.before_oauth_readiness.validation_point,
      firstReceipt.oauth_directory_validations.after_oauth_readiness.validation_point,
      firstReceipt.oauth_directory_validations.before_launch_claim.validation_point,
      firstReceipt.oauth_directory_validations.immediately_before_pi_launch.validation_point,
      firstReceipt.oauth_directory_validations.after_child_termination.validation_point,
    ]).toEqual(["before-oauth-readiness", "after-oauth-readiness", "before-launch-claim", "immediately-before-pi-launch", "after-child-termination"]);
    expect(firstReceipt.oauth_directory_validations.before_oauth_readiness.entries[2]).toMatchObject({ basename: "models-store.json", present: false });
    expect(firstReceipt.oauth_directory_validations.after_child_termination.entries[2]).toMatchObject({ basename: "models-store.json", present: true, mode: "0600", validated_at: expect.stringMatching(/Z$/) });
    expect(firstReceipt.oauth_directory_validations.after_child_termination.entries[2]).not.toHaveProperty("sha256");
    expect(firstReceipt.artifact).not.toBeNull();

    const secondRequest = JSON.parse(readFileSync(files.requestPath, "utf8"));
    secondRequest.invocation_id = "invocation-0002";
    const secondRequestPath = join(files.root, "request-2.json");
    writeFileSync(secondRequestPath, JSON.stringify(secondRequest));
    const secondInvocation = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: secondRequestPath });
    expect(secondInvocation).toMatchObject({
      schema_version: "qualification-invocation-v2",
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
    });
    const secondAuth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0002", parent_env: files.parent_env });
    expect(secondAuth.evidence).toMatchObject({
      schema_version: "qualification-auth-evidence-v2",
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
    });
    expect((secondAuth.evidence as any).oauth_directory_validations.before_oauth_readiness.entries[2].present).toBe(true);
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0002", child_env: secondAuth.child_env, authentication_authority: secondAuth.launch_authority });
    expect(qualificationInvocationStatus(files.spool, "invocation-0002").terminal_status).toBe("completed");
    expect(calls(files.count)).toBe(2);
    expect(validateQualificationRunnerSpool(files.spool).terminal).toBe(2);
  });

  it("accepts an authorized atomic replacement and binds only the final models-store occurrence", async () => {
    const files = setup("replace-models-store", { oauthV2: true });
    const store = join(files.oauthAgent, "models-store.json");
    writeFileSync(store, "pre-existing inert state", { mode: 0o600 });
    chmodSync(store, 0o600);
    const beforeInode = String(lstatSync(store).ino);
    const status = await run(files);
    expect(status.terminal_status).toBe("completed");
    const receipt = JSON.parse(readFileSync(join(files.spool, "invocations", "invocation-0001", "terminal", "receipt.json"), "utf8"));
    expect(receipt.oauth_directory_validations.immediately_before_pi_launch.entries[2].inode).toBe(beforeInode);
    expect(receipt.oauth_directory_validations.after_child_termination.entries[2].inode).not.toBe(beforeInode);
    expect(receipt.oauth_directory_validations.after_child_termination.entries[2].present).toBe(true);
  });

  it("makes an unexpected terminal entry artifact-ineligible while retaining exactly-once accounting and no retry", async () => {
    const files = setup("create-unexpected-oauth-entry", { oauthV2: true });
    const status = await run(files);
    expect(status).toMatchObject({ terminal_status: "invalid-artifact", attempt: 1 });
    expect(calls(files.count)).toBe(1);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
    const receipt = JSON.parse(readFileSync(join(files.spool, "invocations", "invocation-0001", "terminal", "receipt.json"), "utf8"));
    expect(receipt.artifact).toBeNull();
    expect(receipt.successful_execution).toBe(false);
    expect(receipt.oauth_directory_validations.after_child_termination).toMatchObject({ valid: false, unexpected_entries: ["unexpected.json"] });
    expect(existsSync(join(files.spool, "artifacts", "invocation-0001.jsonl"))).toBe(false);
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: {} })).resolves.toBeUndefined();
    expect(calls(files.count)).toBe(1);
  });

  it("does not reinterpret a historical v1 terminal receipt after a stale policy rebind", async () => {
    const files = setup();
    await run(files);
    const receiptPath = join(files.spool, "invocations", "invocation-0001", "terminal", "receipt.json");
    expect(JSON.parse(readFileSync(receiptPath, "utf8"))).not.toHaveProperty("oauth_directory_policy");

    const configurationPath = join(files.spool, "configuration.json");
    const envelope = JSON.parse(readFileSync(configurationPath, "utf8"));
    envelope.configuration.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    envelope.configuration_sha256 = qualificationConfigDigest(envelope.configuration);
    atomicWriteCanonical(configurationPath, envelope, false);
    const invocationPath = join(files.spool, "invocations", "invocation-0001", "invocation.json");
    const invocation = JSON.parse(readFileSync(invocationPath, "utf8"));
    invocation.schema_version = "qualification-invocation-v2";
    invocation.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    invocation.configuration_sha256 = envelope.configuration_sha256;
    const { invocation_sha256: _oldDigest, ...digestInput } = invocation;
    invocation.invocation_sha256 = qualificationSha256(qualificationCanonicalJson(digestInput));
    atomicWriteCanonical(invocationPath, invocation, false);
    expect(() => validateQualificationRunnerSpool(files.spool)).toThrow(/v2.*terminal receipt|terminal receipt.*v2/i);
  });

  it("redacts exact OAuth values and secret-shaped output before persistence", () => {
    const token = ["eyJhbGciOiJIUzI1NiJ9", "sentinelpayloadvalue", "sentinelsignaturevalue"].join(".");
    const apiValue = "sentinel-api-value-for-redaction";
    const redacted = redactQualificationOutput(`token=${token} OPENAI_API_KEY=${apiValue}`, [token]);
    expect(redacted).not.toContain(token);
    expect(redacted).not.toContain(apiValue);
    expect(redacted).toContain("REDACTED");
  });

  it("refuses stale replayed auth evidence and refreshes it through a new metadata check", async () => {
    const files = setup();
    const first = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const path = join(files.spool, "invocations", "invocation-0001", "auth-evidence.json");
    const evidence = JSON.parse(readFileSync(path, "utf8"));
    evidence.checked_at = "2026-01-01T00:00:00.000Z";
    const { evidence_sha256: _old, ...base } = evidence;
    evidence.evidence_sha256 = qualificationSha256(qualificationCanonicalJson(base));
    writeFileSync(path, `${qualificationCanonicalJson(evidence)}\n`);
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: first.child_env })).rejects.toThrow(/auth evidence.*stale/i);
    const refreshed = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: refreshed.child_env });
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("completed");
  });

  it("serializes concurrent auth refreshes so launch and receipt bind one immutable evidence record", async () => {
    const files = setup();
    const [one, two] = await Promise.all([
      checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: { ...files.parent_env, HOME: join(files.root, "auth-home-a") } }),
      checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: { ...files.parent_env, HOME: join(files.root, "auth-home-b") } }),
    ]);
    expect(one.evidence.launch_authority_sha256).not.toBe(two.evidence.launch_authority_sha256);
    const settled = await Promise.allSettled([
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: one.child_env, authentication_authority: one.launch_authority }),
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: two.child_env, authentication_authority: two.launch_authority }),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(calls(files.count)).toBe(1);
    const persisted = JSON.parse(readFileSync(join(files.spool, "invocations", "invocation-0001", "auth-evidence.json"), "utf8"));
    const winner = persisted.launch_authority_sha256 === one.evidence.launch_authority_sha256 ? one : two;
    expect(readFileSync(join(files.spool, "artifacts", "invocation-0001.jsonl"), "utf8")).toContain(`"home":${JSON.stringify(winner.child_env.HOME)}`);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("records metadata-only OAuth readiness and only environment names, never values", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    expect(auth.evidence).toMatchObject({ status: "ready", provider: "fake", requested_model: "fake-luna", model_identity_observed: false, auth_type: "oauth", credentials_included: false, readiness_only: true });
    expect(auth.evidence.removed_parent_environment_names).toContain("OPENAI_API_KEY");
    expect(auth.child_env.OPENAI_API_KEY).toBeUndefined();
    expect(JSON.stringify(auth.evidence)).not.toContain("NEVER-PERSIST-THIS");
    expect(JSON.stringify(auth.evidence)).not.toContain(auth.launch_authority);
    expect(auth.evidence.launch_authority_sha256).toBe(qualificationSha256(auth.launch_authority));
  });

  it.each([
    [{ FAKE_AUTH_STATUS: "missing" }, /not ready/i],
    [{ FAKE_AUTH_STATUS: "malformed" }, /invalid JSON/i],
    [{ FAKE_AUTH_STATUS: "nonzero" }, /auth check exited/i],
    [{ FAKE_AUTH_STATUS: "ready", FAKE_AUTH_TYPE: "api_key" }, /OAuth/i],
    [{ FAKE_AUTH_STATUS: "ready", FAKE_AUTH_MODEL: "other-model" }, /model substitution/i],
  ])("refuses missing/malformed/non-OAuth readiness before accounting or launch", async (override, expected) => {
    const files = setup();
    await expect(checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: { ...files.parent_env, ...override } })).rejects.toThrow(expected);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(0);
    expect(calls(files.count)).toBe(0);
  });
});

describe("qualification durable execution", () => {
  it("launches the prepared input snapshot, not a later edit to the coordinator source path", async () => {
    const files = setup();
    writeFileSync(files.prompt, "provider-substitution\n");
    const status = await run(files);
    expect(status.terminal_status).toBe("completed");
    expect(status.actual).toEqual({ provider: "fake", model: "fake-luna" });
  });

  it("claims, runs, attests provider/model, and completes exactly once", async () => {
    const files = setup();
    const status = await run(files);
    expect(status).toMatchObject({ phase: "terminal", terminal_status: "completed", attempt: 1, requested: { provider: "fake", model: "fake-luna" }, actual: { provider: "fake", model: "fake-luna" } });
    expect(calls(files.count)).toBe(1);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
    const artifact = join(files.spool, "artifacts", "invocation-0001.jsonl");
    expect(readFileSync(artifact, "utf8")).toContain('"provider":"fake"');
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: {} })).resolves.toBeUndefined();
    expect(calls(files.count)).toBe(1);
  });

  it.each([
    ["fail", "failed"],
    ["invalid", "invalid-artifact"],
    ["provider-substitution", "invalid-artifact"],
    ["model-substitution", "invalid-artifact"],
    ["fallback", "invalid-artifact"],
    ["missing-identity", "invalid-artifact"],
    ["refused", "refused"],
    ["huge", "invalid-artifact"],
  ])("makes %s a consumed one-attempt %s terminal", async (command, terminal) => {
    const files = setup(command, command === "huge" ? { output: 1024 } : {});
    const status = await run(files);
    expect(status.terminal_status).toBe(terminal);
    expect(status.attempt).toBe(1);
    expect(calls(files.count)).toBe(1);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
    if (command === "huge") expect(status.output.stdout.truncated).toBe(true);
    expect(existsSync(join(files.spool, "invocations", "invocation-0001", "stdout.partial"))).toBe(true);
    expect(existsSync(join(files.spool, "invocations", "invocation-0001", "stdout.txt"))).toBe(false);
    if (command === "refused") {
      const receipt = JSON.parse(readFileSync(join(files.spool, "invocations", "invocation-0001", "terminal", "receipt.json"), "utf8"));
      expect(receipt).toMatchObject({ provider_model_identity_observed: true, successful_execution: false, terminal_status: "refused" });
    }
  });

  it("terminalizes a post-claim pin/setup failure as one consumed call without spawning", async () => {
    const files = setup();
    const originalExecutable = readFileSync(files.executable);
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    let mutated = false;
    await superviseQualificationInvocation({
      spool_dir: files.spool,
      invocation_id: "invocation-0001",
      child_env: auth.child_env,
      now: () => {
        if (!mutated) {
          mutated = true;
          writeFileSync(files.executable, `${originalExecutable.toString("utf8")}\n// post-claim mutation\n`);
        }
        return new Date().toISOString();
      },
    });
    writeFileSync(files.executable, originalExecutable);
    chmodSync(files.executable, 0o755);
    expect(qualificationInvocationStatus(files.spool, "invocation-0001")).toMatchObject({ terminal_status: "failed", attempt: 1 });
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
    expect(calls(files.count)).toBe(0);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("retains durable partial output while running and permits safe concurrent polling", async () => {
    const files = setup("partial:180");
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const supervisor = superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env });
    const partial = join(files.spool, "invocations", "invocation-0001", "stdout.partial");
    await waitFor(() => readQualificationLifecycle(files.spool, "invocation-0001").phase === "running" &&
      existsSync(partial) && readFileSync(partial, "utf8").includes('"type":"session"'));
    // Only complete sanitized lines are made durable; the preceding session line
    // proves partial progress without ever flushing a split credential/token.
    expect(readFileSync(partial, "utf8")).toContain('"type":"session"');
    const [one, two] = await Promise.all([
      pollQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", wait_ms: 2000, interval_ms: 10 }),
      pollQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", wait_ms: 2000, interval_ms: 13 }),
    ]);
    await supervisor;
    expect(one.terminal_status).toBe("completed");
    expect(two.terminal_status).toBe("completed");
    expect(calls(files.count)).toBe(1);
  });

  it("requires explicit continuation authority after an interrupted atomic accounting claim", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const interrupted = appendQualificationAccountingEvent(createQualificationAccountingLedger(), {
      invocation_id: "invocation-0001", role: "subject", call_class: "subject", counts_as_measurement: true,
      launched_at: "2026-08-28T12:00:00.000Z",
    });
    writeQualificationAccounting(files.spool, interrupted);
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }))
      .rejects.toThrow(/explicit continuation authority/i);
    expect(calls(files.count)).toBe(0);
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: "unbound-authority-which-is-at-least-thirty-two-bytes" }))
      .rejects.toThrow(/immutable invocation capability/i);
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: CONTINUATION_AUTHORITY });
    expect(calls(files.count)).toBe(1);
    const lifecycle = readQualificationLifecycle(files.spool, "invocation-0001");
    expect(JSON.stringify(lifecycle)).not.toContain(CONTINUATION_AUTHORITY);
    expect(lifecycle.events[1].detail.continuation_authority_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("continues a v2 claim interrupted after accounting without replaying or losing its OAuth checkpoint", async () => {
    const files = setup("complete", { oauthV2: true });
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    let nowCalls = 0;
    await expect(superviseQualificationInvocation({
      spool_dir: files.spool,
      invocation_id: "invocation-0001",
      child_env: auth.child_env,
      now: () => {
        nowCalls += 1;
        if (nowCalls === 3) throw new Error("injected post-accounting interruption");
        return new Date().toISOString();
      },
    })).rejects.toThrow(/injected post-accounting interruption/i);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
    expect(readQualificationLifecycle(files.spool, "invocation-0001").phase).toBe("prepared");
    expect(calls(files.count)).toBe(0);
    await superviseQualificationInvocation({
      spool_dir: files.spool,
      invocation_id: "invocation-0001",
      child_env: auth.child_env,
      continuation_authority: CONTINUATION_AUTHORITY,
    });
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("completed");
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
    expect(calls(files.count)).toBe(1);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("resumes a stale launch-claimed supervisor only with explicit continuation authority", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const claim = appendQualificationAccountingEvent(createQualificationAccountingLedger(), {
      invocation_id: "invocation-0001", role: "subject", call_class: "subject", counts_as_measurement: true,
      launched_at: "2026-08-28T12:00:00.000Z",
    });
    writeQualificationAccounting(files.spool, claim);
    const prepared = readQualificationLifecycle(files.spool, "invocation-0001");
    writeQualificationLifecycle(files.spool, transitionQualificationLifecycle(prepared, "launch-claimed", {
      at: "2026-08-28T12:00:00.000Z",
      detail: { attempt: 1, accounting_event_sha256: claim.chain_head, supervisor: { pid: 99999999, platform: process.platform, boot_id: "stale", start_ticks: "1" }, continuation_authority_sha256: null },
    }));
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }))
      .rejects.toThrow(/launch claim.*continuation authority/i);
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: CONTINUATION_AUTHORITY });
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("completed");
    expect(calls(files.count)).toBe(1);
  });

  it("reconciles an existing launch attempt without replay only under explicit continuation authority", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    publishInterruptedClaim(files, Object.keys(auth.child_env), { launchAttempt: true });
    await expect(superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }))
      .rejects.toThrow(/continuation authority/i);
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: CONTINUATION_AUTHORITY });
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("failed");
    expect(calls(files.count)).toBe(0);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("terminates and reconciles a live recorded child occurrence without replay", async () => {
    if (process.platform !== "linux") return;
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
    if (!child.pid) throw new Error("inert child did not expose a pid");
    const childIdentity = qualificationProcessIdentity(child.pid);
    publishInterruptedClaim(files, Object.keys(auth.child_env), { launchAttempt: true, child: childIdentity });
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: CONTINUATION_AUTHORITY });
    expect(qualificationProcessMatches(childIdentity)).toBe(false);
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("failed");
    expect(calls(files.count)).toBe(0);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("removes a stale PID-bound filesystem lock without treating that as launch authority", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const lock = qualificationSpoolPaths(files.spool).lock;
    mkdirSync(lock);
    atomicWriteCanonical(join(lock, "owner.json"), {
      schema_version: "qualification-lock-owner-v1", token: "stale-owner",
      process: { pid: 99999999, platform: process.platform, boot_id: "stale", start_ticks: "1" },
    }, true);
    await Promise.all([
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }),
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }),
    ]);
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("completed");
    expect(calls(files.count)).toBe(1);
  });

  it("serializes concurrent supervisors into one launch claim", async () => {
    const files = setup("sleep:100");
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    await Promise.all([
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }),
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env }),
    ]);
    expect(calls(files.count)).toBe(1);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(1);
  });

  it("serializes concurrent ceiling claims so the 701st subject cannot launch", async () => {
    const files = setup("complete");
    const secondRequest = JSON.parse(readFileSync(files.requestPath, "utf8"));
    secondRequest.invocation_id = "invocation-0002";
    const secondPath = join(files.root, "request-2.json");
    writeFileSync(secondPath, JSON.stringify(secondRequest));
    prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: secondPath });
    const authOne = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const authTwo = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0002", parent_env: files.parent_env });
    let ledger = createQualificationAccountingLedger();
    for (let index = 0; index < 699; index += 1) {
      ledger = appendQualificationAccountingEvent(ledger, {
        invocation_id: `prior-${index}`, role: "subject", call_class: "subject", counts_as_measurement: true,
        launched_at: "2026-08-28T11:00:00.000Z",
      });
    }
    writeQualificationAccounting(files.spool, ledger);
    const settled = await Promise.allSettled([
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: authOne.child_env }),
      superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0002", child_env: authTwo.child_env }),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(String((settled.find((result) => result.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/subject ceiling 700/i);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(700);
    expect(calls(files.count)).toBe(1);
  }, 10_000);

  it("cleans up inherited process-group descendants even when the group leader exits first", async () => {
    const markerRoot = mkdtempSync(join(tmpdir(), "qualification-orphan-marker-"));
    const marker = join(markerRoot, "orphan.txt");
    const files = setup(`orphan-grandchild:${marker}`, { timeout: 2000 });
    const status = await run(files);
    expect(status.terminal_status).toBe("completed");
    await sleep(700);
    expect(existsSync(marker)).toBe(false);
  });

  it("times out once, retains partial output, kills the process group, and never accepts late completion", async () => {
    const markerRoot = mkdtempSync(join(tmpdir(), "qualification-grandchild-marker-"));
    const marker = join(markerRoot, "late.txt");
    const files = setup(`grandchild:${marker}`, { timeout: 100 });
    const status = await run(files);
    expect(status.terminal_status).toBe("timed-out");
    expect(status.deadline_at).toMatch(/Z$/);
    expect(status.effective_timeout_ms).toBe(100);
    expect(calls(files.count)).toBe(1);
    await sleep(700);
    expect(existsSync(marker)).toBe(false);
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("timed-out");
  });

  it("serializes an abort racing the launch claim into one internally consistent terminal", async () => {
    const files = setup("sleep:100");
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const supervisor = superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env });
    const abort = abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-request" });
    await Promise.allSettled([supervisor, abort]);
    const status = qualificationInvocationStatus(files.spool, "invocation-0001");
    expect(status.terminal_status).toBe("aborted");
    expect(status.attempt).toBe(readQualificationAccounting(files.spool).events.length ? 1 : 0);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
    expect(calls(files.count)).toBeLessThanOrEqual(1);
  });

  it("terminalizes abort for a stale launch claim with no live supervisor or child", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    publishInterruptedClaim(files, Object.keys(auth.child_env));
    const status = await abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-reconcile-abort" });
    expect(status).toMatchObject({ phase: "terminal", terminal_status: "aborted", attempt: 1 });
    expect(calls(files.count)).toBe(0);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("terminates a live external supervisor with no child before reconciling abort", async () => {
    if (process.platform !== "linux") return;
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const supervisor = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
    if (!supervisor.pid) throw new Error("inert supervisor did not expose a pid");
    const identity = qualificationProcessIdentity(supervisor.pid);
    publishInterruptedClaim(files, Object.keys(auth.child_env), { supervisor: identity });
    const status = await abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-live-supervisor-abort" });
    expect(status).toMatchObject({ phase: "terminal", terminal_status: "aborted", attempt: 1 });
    expect(qualificationProcessMatches(identity)).toBe(false);
    expect(calls(files.count)).toBe(0);
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("aborts a prepared reservation without consuming a call", async () => {
    const files = setup("sleep:5000");
    const status = await abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-request" });
    expect(status).toMatchObject({ phase: "terminal", terminal_status: "aborted", attempt: 0 });
    expect(readQualificationAccounting(files.spool).events).toHaveLength(0);
    expect(calls(files.count)).toBe(0);
  });

  it("aborts a running process group without relaunch", async () => {
    const files = setup("sleep:5000", { timeout: 10000 });
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const supervisor = superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env });
    await waitFor(() => qualificationInvocationStatus(files.spool, "invocation-0001").phase === "running" && calls(files.count) === 1);
    await abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-request" });
    await supervisor;
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("aborted");
    expect(calls(files.count)).toBe(1);
  });

  it("rejects a receipt whose attempt/accounting claim disagree even when each file is canonical", async () => {
    const files = setup();
    await abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-request" });
    const contradictory = appendQualificationAccountingEvent(createQualificationAccountingLedger(), {
      invocation_id: "invocation-0001", role: "subject", call_class: "subject", counts_as_measurement: true,
      launched_at: "2026-08-28T12:00:00.000Z",
    });
    writeQualificationAccounting(files.spool, contradictory);
    expect(() => validateQualificationRunnerSpool(files.spool)).toThrow(/contradicts accounting/i);
  });

  it("idempotently reconciles a published terminal receipt after lifecycle publication interruption", async () => {
    const files = setup();
    await run(files);
    const lifecyclePath = join(files.spool, "invocations", "invocation-0001", "lifecycle.json");
    const lifecycle = JSON.parse(readFileSync(lifecyclePath, "utf8"));
    lifecycle.events.pop();
    const prior = lifecycle.events.at(-1);
    lifecycle.phase = prior.to;
    lifecycle.terminal_status = prior.terminal_status;
    lifecycle.chain_head = prior.event_sha256;
    atomicWriteCanonical(lifecyclePath, lifecycle, false);
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("completed");
    expect(readQualificationLifecycle(files.spool, "invocation-0001").phase).toBe("terminal");
    expect(validateQualificationRunnerSpool(files.spool).ok).toBe(true);
  });

  it("re-attests retained artifact semantics instead of trusting a self-consistent completed receipt", async () => {
    const files = setup();
    await run(files);
    const artifactPath = join(files.spool, "artifacts", "invocation-0001.jsonl");
    const stdoutPath = join(files.spool, "invocations", "invocation-0001", "stdout.partial");
    const receiptPath = join(files.spool, "invocations", "invocation-0001", "terminal", "receipt.json");
    const refusedBytes = Buffer.from([
      JSON.stringify({ type: "session", version: 3, id: "fake", timestamp: new Date().toISOString(), cwd: files.root }),
      JSON.stringify({ type: "message_end", message: { role: "assistant", provider: "fake", model: "fake-luna", content: [], stopReason: "error", errorMessage: "model not supported for this subscription" } }),
      "",
    ].join("\n"));
    writeFileSync(artifactPath, refusedBytes);
    writeFileSync(stdoutPath, refusedBytes);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.artifact.bytes = refusedBytes.length;
    receipt.artifact.sha256 = qualificationSha256(refusedBytes);
    receipt.stdout.total_bytes = refusedBytes.length;
    receipt.stdout.captured_bytes = refusedBytes.length;
    receipt.stdout.sha256 = qualificationSha256(refusedBytes);
    writeFileSync(receiptPath, `${qualificationCanonicalJson(receipt)}\n`);
    expect(() => validateQualificationRunnerSpool(files.spool)).toThrow(/cannot substantiate completed execution/i);
  });

  it("detects artifact mutation after atomic terminal publication", async () => {
    const files = setup();
    await run(files);
    const artifact = join(files.spool, "artifacts", "invocation-0001.jsonl");
    writeFileSync(artifact, `${readFileSync(artifact, "utf8")}mutated\n`);
    expect(() => validateQualificationRunnerSpool(files.spool)).toThrow(/artifact.*digest\/size mismatch/i);
  });

  it("binds process identity to Linux start ticks to defend against stale/reused PIDs", () => {
    const current = qualificationProcessIdentity(process.pid);
    expect(current.pid).toBe(process.pid);
    if (process.platform === "linux") {
      expect(current.start_ticks).toMatch(/^\d+$/);
      expect(current.boot_id).toMatch(/^[a-f0-9-]+$/);
      expect(qualificationProcessMatches({ ...current, start_ticks: String(Number(current.start_ticks) + 1) })).toBe(false);
    }
    expect(() => qualificationProcessIdentity(99999999)).toThrow(/not live/i);
  });

  it("fails closed when canonical lifecycle state is corrupted", async () => {
    const files = setup();
    await run(files);
    const path = join(files.spool, "invocations", "invocation-0001", "lifecycle.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    value.phase = "running";
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    expect(() => qualificationInvocationStatus(files.spool, "invocation-0001")).toThrow(/canonical|contradict/i);
  });
});
