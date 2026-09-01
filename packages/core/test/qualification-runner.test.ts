import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { QUALIFICATION_ACCOUNTING_POLICY } from "../src/qualification-config.js";
import {
  appendQualificationAccountingEvent,
  atomicWriteCanonical,
  createQualificationAccountingLedger,
  prepareQualificationInvocation,
  qualificationSpoolPaths,
  readQualificationAccounting,
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
    ? { status: 'ready', provider, authType: process.env.FAKE_AUTH_TYPE || 'oauth' }
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
line({ type: 'session', version: 3, id: 'fake-session', timestamp: new Date().toISOString(), cwd: process.cwd() });
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
  if (command === 'invalid') { process.stdout.write('{not-json\\n'); return; }
  if (command === 'missing-identity') { line({ type: 'message_end', message: { role: 'assistant', content: [] } }); return; }
  if (command === 'provider-substitution') { finish('openai', model); return; }
  if (command === 'model-substitution') { finish(provider, 'other-model'); return; }
  if (command === 'fallback') { line({ type: 'provider_fallback', from: provider, to: 'openai' }); finish(); return; }
  if (command === 'refused') { line({ type: 'message_end', message: { role: 'assistant', provider, model, content: [], stopReason: 'error', errorMessage: 'model not supported for this subscription' } }); return; }
  if (command === 'fail') { finish(); process.exitCode = 7; return; }
  if (command === 'huge') { process.stdout.write('x'.repeat(200000)); finish(); return; }
  finish();
})().catch((error) => { console.error(error.message); process.exit(8); });
`;

function setup(command = "complete", overrides: { timeout?: number; output?: number; conflict?: "refuse" | "remove-and-record" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "qualification-runner-"));
  const executable = join(root, "fake-pi.cjs");
  writeFileSync(executable, FAKE_PI);
  chmodSync(executable, 0o755);
  const prompt = join(root, "prompt.txt");
  writeFileSync(prompt, `${command}\n`);
  const count = join(root, "calls.txt");
  const executablePin = { path: executable, sha256: sha(readFileSync(executable)) };
  const envNames = ["HOME", "PATH", "FAKE_AUTH_STATUS", "FAKE_AUTH_TYPE", "FAKE_COUNT_FILE"];
  const config = {
    schema_version: "qualification-config-v1", mode: "test",
    product: { repository: "https://example.invalid/product", commit: hex("1", 40), tree: hex("2", 40), package_sha256: hex("3"), package_bytes: 1 },
    engine: { repository: "https://example.invalid/engine", commit: hex("4", 40), tree: hex("5", 40), package_sha256: { core: hex("6"), adapters: hex("7"), cli: hex("8"), meta: hex("9") } },
    producer: { repository: "https://example.invalid/producer", commit: hex("a", 40), tree: hex("b", 40), version: "0.20.0", ledger_version: 3 },
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
    scenario: { id: "fake-A1", version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e"), input_path: prompt, input_sha256: sha(readFileSync(prompt)), working_directory: root },
    role: "subject", counts_as_measurement: true, arms: { subject: "fake-subject", judge: "fake-judge" }, selected_arm: "fake-subject", repetition: 0,
  };
  const requestPath = join(root, "request.json"); writeFileSync(requestPath, JSON.stringify(request));
  const spool = join(root, "spool");
  prepareQualificationInvocation({ spool_dir: spool, config_path: configPath, request_path: requestPath });
  const parent_env = { HOME: root, PATH: process.env.PATH, FAKE_AUTH_STATUS: "ready", FAKE_COUNT_FILE: count, OPENAI_API_KEY: "NEVER-PERSIST-THIS" };
  return { root, spool, count, prompt, executable, configPath, requestPath, parent_env };
}

async function run(files: ReturnType<typeof setup>) {
  const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
  await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env });
  return qualificationInvocationStatus(files.spool, "invocation-0001");
}

function calls(path: string): number { return existsSync(path) ? readFileSync(path, "utf8").trim().split("\n").filter(Boolean).length : 0; }

describe("qualification OAuth boundary", () => {
  it("requires a dedicated stored OAuth credential and refuses stored API keys or Codex routing overrides", () => {
    const home = mkdtempSync(join(tmpdir(), "qualification-oauth-home-"));
    const agent = join(home, ".pi", "agent");
    mkdirSync(agent, { recursive: true });
    const authPath = join(agent, "auth.json");
    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value", refresh: "sentinel-refresh-value" } }), { mode: 0o600 });
    const result = assertQualificationOAuthCredentialBoundary({ HOME: home });
    expect(result).toEqual({ agent_directory: agent, provider: "openai-codex", auth_type: "oauth" });
    expect(JSON.stringify(result)).not.toContain("sentinel-oauth-value");

    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value" }, openai: { type: "api_key", key: "sentinel-api-value" } }), { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/API-key or unclassified.*dedicated OAuth-only/i);

    writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "sentinel-oauth-value" } }), { mode: 0o600 });
    writeFileSync(join(agent, "models.json"), JSON.stringify({ providers: { "openai-codex": { baseUrl: "https://proxy.invalid" } } }), { mode: 0o600 });
    expect(() => assertQualificationOAuthCredentialBoundary({ HOME: home })).toThrow(/dedicated OAuth agent directory.*must not carry models\.json/i);
  });

  it("redacts exact OAuth values and secret-shaped output before persistence", () => {
    const token = ["eyJhbGciOiJIUzI1NiJ9", "sentinelpayloadvalue", "sentinelsignaturevalue"].join(".");
    const apiValue = "sentinel-api-value-for-redaction";
    const redacted = redactQualificationOutput(`token=${token} OPENAI_API_KEY=${apiValue}`, [token]);
    expect(redacted).not.toContain(token);
    expect(redacted).not.toContain(apiValue);
    expect(redacted).toContain("REDACTED");
  });

  it("records metadata-only OAuth readiness and only environment names, never values", async () => {
    const files = setup();
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    expect(auth.evidence).toMatchObject({ status: "ready", provider: "fake", auth_type: "oauth", credentials_included: false, readiness_only: true });
    expect(auth.evidence.removed_parent_environment_names).toContain("OPENAI_API_KEY");
    expect(auth.child_env.OPENAI_API_KEY).toBeUndefined();
    expect(JSON.stringify(auth.evidence)).not.toContain("NEVER-PERSIST-THIS");
  });

  it.each([
    [{ FAKE_AUTH_STATUS: "missing" }, /not ready/i],
    [{ FAKE_AUTH_STATUS: "malformed" }, /invalid JSON/i],
    [{ FAKE_AUTH_STATUS: "nonzero" }, /auth check exited/i],
    [{ FAKE_AUTH_STATUS: "ready", FAKE_AUTH_TYPE: "api_key" }, /OAuth/i],
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
  });

  it("retains durable partial output while running and permits safe concurrent polling", async () => {
    const files = setup("partial:180");
    const auth = await checkQualificationAuthentication({ spool_dir: files.spool, invocation_id: "invocation-0001", parent_env: files.parent_env });
    const supervisor = superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env });
    await sleep(60);
    expect(readQualificationLifecycle(files.spool, "invocation-0001").phase).toBe("running");
    const partial = join(files.spool, "invocations", "invocation-0001", "stdout.partial");
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
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: "operator-authority-1" });
    expect(calls(files.count)).toBe(1);
    const lifecycle = readQualificationLifecycle(files.spool, "invocation-0001");
    expect(JSON.stringify(lifecycle)).not.toContain("operator-authority-1");
    expect(lifecycle.events[1].detail.continuation_authority_sha256).toMatch(/^[a-f0-9]{64}$/);
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
      .rejects.toThrow(/launch-claimed supervisor.*continuation authority/i);
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env, continuation_authority: "operator-authority-2" });
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("completed");
    expect(calls(files.count)).toBe(1);
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
    await superviseQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", child_env: auth.child_env });
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
    await sleep(60);
    await abortQualificationInvocation({ spool_dir: files.spool, invocation_id: "invocation-0001", reason: "operator-request" });
    await supervisor;
    expect(qualificationInvocationStatus(files.spool, "invocation-0001").terminal_status).toBe("aborted");
    expect(calls(files.count)).toBe(1);
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
