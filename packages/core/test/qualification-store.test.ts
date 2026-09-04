import { createHash } from "node:crypto";
import { chmodSync, existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUALIFICATION_ACCOUNTING_POLICY, QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2, QUALIFICATION_PANEL_ACCOUNTING_POLICY, QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3, qualificationCanonicalJson, qualificationConfigDigest, qualificationSha256 } from "../src/qualification-config.js";
import { QUALIFICATION_JUDGE_PANEL_POLICY } from "../src/qualification-panels.js";
import {
  appendQualificationAccountingEvent,
  createQualificationAccountingLedger,
  prepareQualificationInvocation,
  readQualificationAccounting,
  readQualificationInvocation,
  readQualificationLifecycle,
  validateQualificationAccountingLedger,
  validateQualificationSpool,
  type QualificationAccountingEventInput,
} from "../src/qualification-store.js";

const hex = (value: string, length = 64) => value.repeat(length);
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

function setupFiles() {
  const root = mkdtempSync(join(tmpdir(), "qualification-store-"));
  const executable = join(root, "fake-pi");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n");
  chmodSync(executable, 0o755);
  const prompt = join(root, "prompt.txt");
  writeFileSync(prompt, "inert prompt\n");
  const config = {
    schema_version: "qualification-config-v1",
    mode: "test",
    product: { repository: "https://example.invalid/product", commit: hex("1", 40), tree: hex("2", 40), checkout_path: root, package_path: executable, package_sha256: hex("3"), package_bytes: 1 },
    engine: { repository: "https://example.invalid/engine", commit: hex("4", 40), tree: hex("5", 40), checkout_path: root, package_paths: { core: executable, adapters: executable, cli: executable, meta: executable }, package_sha256: { core: hex("6"), adapters: hex("7"), cli: hex("8"), meta: hex("9") } },
    producer: { repository: "https://example.invalid/producer", commit: hex("a", 40), tree: hex("b", 40), checkout_path: root, version: "0.20.0", ledger_version: 3, ledger_schema_sha256: hex("a") },
    runner: { version: "qualification-runner-v1", executable: { path: executable, sha256: sha(readFileSync(executable)) }, conflicting_parent_environment: "remove-and-record" },
    accounting: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
    arms: [
      { id: "fake-subject", kind: "subject", provider: "fake", model: "fake-luna", authentication: "test-oauth", executable: { path: executable, sha256: sha(readFileSync(executable)) }, resources: [], arguments: ["{input_path}"], allowed_environment_names: ["HOME", "PATH"], timeout_ms: 1000, output_limit_bytes: 65536, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false },
      { id: "fake-judge", kind: "judge", provider: "fake", model: "fake-sol", authentication: "test-oauth", executable: { path: executable, sha256: sha(readFileSync(executable)) }, resources: [], arguments: ["{input_path}"], allowed_environment_names: ["HOME", "PATH"], timeout_ms: 1000, output_limit_bytes: 65536, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false },
    ],
  };
  const configPath = join(root, "config.json");
  writeFileSync(configPath, `${JSON.stringify(config)}\n`);
  const spool = join(root, "spool");
  return { root, executable, prompt, configPath, spool };
}

function request(files: ReturnType<typeof setupFiles>, id = "invocation-0001", role = "subject", selected = "fake-subject") {
  return {
    schema_version: "qualification-invocation-request-v1",
    measurement_identity_sha256: hex("c"), invocation_id: id,
    continuation_authority_sha256: sha("inert-prebound-continuation-authority"), continuation_authority_expires_at: "2099-01-01T00:00:00.000Z",
    scenario: { id: "fake-A1", version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e"), input_path: files.prompt, input_sha256: sha(readFileSync(files.prompt)), working_directory: files.root },
    role, counts_as_measurement: role === "subject" || role === "judge",
    arms: { subject: "fake-subject", judge: "fake-judge" }, selected_arm: selected, repetition: 0,
  };
}

function prepareV3(command = { command: "complete" }) {
  const files = setupFiles();
  writeFileSync(files.prompt, `${JSON.stringify(command)}\n`);
  const config = JSON.parse(readFileSync(files.configPath, "utf8"));
  config.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  config.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
  writeFileSync(files.configPath, JSON.stringify(config));
  const requestPath = join(files.root, "request-v3.json");
  writeFileSync(requestPath, JSON.stringify(request(files)));
  const prepared = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath });
  return { files, prepared, recordPath: join(files.spool, "invocations", prepared.invocation_id, "invocation.json") };
}

const event = (id: string, role: QualificationAccountingEventInput["role"] = "subject", callClass: "subject" | "judge" = "subject"): QualificationAccountingEventInput => ({
  invocation_id: id,
  role,
  call_class: callClass,
  counts_as_measurement: role === "subject" || role === "judge",
  launched_at: "2026-08-28T12:00:00.000Z",
});

describe("qualification preparation", () => {
  it("durably records the complete immutable invocation before any call is consumed", () => {
    const files = setupFiles();
    const requestPath = join(files.root, "request.json");
    writeFileSync(requestPath, JSON.stringify(request(files)));
    const prepared = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath, now: () => "2026-08-28T12:00:00.000Z" });
    expect(prepared.invocation_id).toBe("invocation-0001");
    expect(prepared.schema_version).toBe("qualification-invocation-v1");
    expect(prepared.measurement_identity_sha256).toBe(hex("c"));
    expect(prepared.scenario).toMatchObject({ id: "fake-A1", version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e") });
    expect(prepared.role).toBe("subject");
    expect(prepared.counts_as_measurement).toBe(true);
    expect(prepared.requested).toEqual({ provider: "fake", model: "fake-luna" });
    expect(prepared.pins.product.commit).toBe(hex("1", 40));
    expect(prepared.pins.engine.package_sha256.core).toBe(hex("6"));
    expect(prepared.pins.producer).toMatchObject({ version: "0.20.0", ledger_version: 3 });
    expect(prepared.configuration_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared.ceiling_policy).toEqual(QUALIFICATION_ACCOUNTING_POLICY);
    expect(prepared.expected_artifact).toEqual({ path: "artifacts/invocation-0001.jsonl", type: "pi-jsonl" });
    expect(readQualificationLifecycle(files.spool, prepared.invocation_id)).toMatchObject({ phase: "prepared", terminal_status: null });
    expect(readQualificationInvocation(files.spool, prepared.invocation_id)).toEqual(prepared);
    const report = validateQualificationSpool(files.spool);
    expect(report.ok).toBe(true);
    expect(report.accounting.counts).toMatchObject({ subject: 0, judge: 0, measurement: 0 });
  });

  it("binds explicit policy v2 into both configuration and invocation digests without rebinding a historical spool", () => {
    const files = setupFiles();
    const v2Config = JSON.parse(readFileSync(files.configPath, "utf8"));
    v2Config.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    const v2ConfigPath = join(files.root, "config-v2.json");
    writeFileSync(v2ConfigPath, JSON.stringify(v2Config));
    const firstRequest = join(files.root, "request-v2.json");
    writeFileSync(firstRequest, JSON.stringify(request(files)));
    const prepared = prepareQualificationInvocation({ spool_dir: files.spool, config_path: v2ConfigPath, request_path: firstRequest });
    expect(prepared).toMatchObject({
      schema_version: "qualification-invocation-v2",
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
      configuration_sha256: qualificationConfigDigest(v2Config),
    });
    const { invocation_sha256: recorded, ...digestInput } = prepared;
    expect(recorded).toBe(qualificationSha256(qualificationCanonicalJson(digestInput)));

    const historical = setupFiles();
    const historicalRequest = join(historical.root, "historical-request.json");
    writeFileSync(historicalRequest, JSON.stringify(request(historical)));
    prepareQualificationInvocation({ spool_dir: historical.spool, config_path: historical.configPath, request_path: historicalRequest });
    const superseding = JSON.parse(readFileSync(historical.configPath, "utf8"));
    superseding.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    const supersedingPath = join(historical.root, "superseding-config.json");
    writeFileSync(supersedingPath, JSON.stringify(superseding));
    const laterRequest = join(historical.root, "later-request.json");
    writeFileSync(laterRequest, JSON.stringify(request(historical, "invocation-0002")));
    expect(() => prepareQualificationInvocation({ spool_dir: historical.spool, config_path: supersedingPath, request_path: laterRequest }))
      .toThrow(/spool.*different configuration identity/i);
  });

  it("binds panel identity and the subject artifact into a prospective v4 judge invocation", () => {
    const files = setupFiles();
    writeFileSync(files.prompt, `{\"judge\":\"prompt\",\"subject_artifact_sha256\":\"${hex("c")}\"}\n`);
    const config = JSON.parse(readFileSync(files.configPath, "utf8"));
    config.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    config.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
    config.judge_panel = structuredClone(QUALIFICATION_JUDGE_PANEL_POLICY);
    config.board = { schema_version: "qualification-board-v1", read_only: true, cells: [{ id: "fake-A1-luna", scenario_id: "fake-A1", measurement_identity_sha256: hex("c"), scenario_version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e"), subject_input_sha256: sha(readFileSync(files.prompt)), subject_arm: "fake-subject", judge_arms: ["fake-judge", "fake-judge", "fake-judge"], panels: [{ id: "fake-A1-r0", repetition: 0 }], critical: false, pass_threshold: 1 }] };
    config.accounting = structuredClone(QUALIFICATION_PANEL_ACCOUNTING_POLICY);
    writeFileSync(files.configPath, JSON.stringify(config));
    const value = request(files, "judge-1", "judge", "fake-judge") as any;
    value.panel = { id: "fake-A1-r0", member_ordinal: 1, subject_invocation_id: "subject-1", subject_artifact_sha256: hex("c") };
    const path = join(files.root, "judge-request.json");
    writeFileSync(path, JSON.stringify(value));
    const prepared = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: path });
    expect(prepared).toMatchObject({ schema_version: "qualification-invocation-v4", panel: value.panel, ceiling_policy: QUALIFICATION_PANEL_ACCOUNTING_POLICY });
    expect(readQualificationInvocation(files.spool, prepared.invocation_id)).toEqual(prepared);

    const missing = setupFiles();
    writeFileSync(missing.prompt, '{"judge":"prompt without subject binding"}\n');
    const missingConfig = JSON.parse(readFileSync(missing.configPath, "utf8"));
    missingConfig.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    missingConfig.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
    missingConfig.judge_panel = structuredClone(QUALIFICATION_JUDGE_PANEL_POLICY);
    missingConfig.board = { ...config.board, cells: [{ ...config.board.cells[0], subject_input_sha256: sha(readFileSync(missing.prompt)) }] };
    missingConfig.accounting = structuredClone(QUALIFICATION_PANEL_ACCOUNTING_POLICY);
    writeFileSync(missing.configPath, JSON.stringify(missingConfig));
    const missingValue = request(missing, "judge-1", "judge", "fake-judge") as any;
    missingValue.panel = value.panel;
    const missingPath = join(missing.root, "judge-request.json"); writeFileSync(missingPath, JSON.stringify(missingValue));
    expect(() => prepareQualificationInvocation({ spool_dir: missing.spool, config_path: missing.configPath, request_path: missingPath })).toThrow(/structurally contain.*subject artifact/i);
  });

  it("rejects source replacement between initial validation and governed v3 snapshot", () => {
    const files = setupFiles();
    const original = Buffer.from('{"version":"approved"}\n');
    const replacement = Buffer.from('{"version":"substituted"}\n');
    writeFileSync(files.prompt, original);
    const config = JSON.parse(readFileSync(files.configPath, "utf8"));
    config.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    config.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
    writeFileSync(files.configPath, JSON.stringify(config));
    const requestPath = join(files.root, "request-race.json");
    writeFileSync(requestPath, JSON.stringify(request(files)));
    expect(() => prepareQualificationInvocation({
      spool_dir: files.spool,
      config_path: files.configPath,
      request_path: requestPath,
      test_hooks: { after_initial_input_validation: () => writeFileSync(files.prompt, replacement) },
    })).toThrow(/input digest mismatch/i);
    expect(existsSync(join(files.spool, "invocations", "invocation-0001"))).toBe(false);
    expect(readQualificationAccounting(files.spool).events).toHaveLength(0);
  });

  it("persists and reloads the exact v3 application/json input bytes and occurrence", () => {
    const files = setupFiles();
    const exact = Buffer.from('{"b":2, "a":1}\n');
    writeFileSync(files.prompt, exact);
    const config = JSON.parse(readFileSync(files.configPath, "utf8"));
    config.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    config.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
    writeFileSync(files.configPath, JSON.stringify(config));
    const requestValue = request(files);
    const requestPath = join(files.root, "request-v3.json");
    writeFileSync(requestPath, JSON.stringify(requestValue));
    const prepared = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath });
    expect(prepared).toMatchObject({
      schema_version: "qualification-invocation-v3",
      oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
      terminal_receipt_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3,
      prepared_attempt: 0,
      accounting_event_sha256: null,
      invocation_input: { schema_version: "qualification-invocation-input-binding-v1", content_type: "application/json", bytes: exact.length, sha256: sha(exact) },
      invocation_input_occurrence: { mode: 0o600, link_count: 1, bytes: exact.length, sha256: sha(exact) },
    });
    expect(readFileSync(prepared.scenario.input_path)).toEqual(exact);
    expect(readQualificationInvocation(files.spool, prepared.invocation_id)).toEqual(prepared);

    const semanticallyEqual = Buffer.from('{"a":1,"b":2}\n');
    expect(sha(semanticallyEqual)).not.toBe(prepared.invocation_input?.sha256);
    writeFileSync(prepared.scenario.input_path, semanticallyEqual);
    expect(() => readQualificationInvocation(files.spool, prepared.invocation_id)).toThrow(/input binding mismatch/i);
  });

  it.each([
    ["truncation", (path: string) => writeFileSync(path, '{"a":1}')],
    ["extension", (path: string) => writeFileSync(path, '{"b":2, "a":1}\n ')],
    ["reordered bytes", (path: string) => writeFileSync(path, '{"a":1, "b":2}\n')],
    ["deletion", (path: string) => rmSync(path)],
    ["atomic replacement", (path: string) => { const next = `${path}.next`; writeFileSync(next, '{"b":2, "a":1}\n', { mode: 0o600 }); renameSync(next, path); }],
  ])("rejects governed v3 input %s on deterministic reload", (_name, mutate) => {
    const files = setupFiles();
    writeFileSync(files.prompt, '{"b":2, "a":1}\n');
    const config = JSON.parse(readFileSync(files.configPath, "utf8"));
    config.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    config.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
    writeFileSync(files.configPath, JSON.stringify(config));
    const requestPath = join(files.root, "request-v3.json");
    writeFileSync(requestPath, JSON.stringify(request(files)));
    const prepared = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath });
    mutate(prepared.scenario.input_path);
    expect(() => readQualificationInvocation(files.spool, prepared.invocation_id)).toThrow(/governed invocation input|input binding|input occurrence/i);
  });

  it("rejects forged v3 metadata and refuses to retrofit a stale legacy invocation", () => {
    const files = setupFiles();
    const requestPath = join(files.root, "request.json");
    writeFileSync(requestPath, JSON.stringify(request(files)));
    const legacy = prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath });
    const path = join(files.spool, "invocations", legacy.invocation_id, "invocation.json");
    const forged: any = JSON.parse(readFileSync(path, "utf8"));
    forged.schema_version = "qualification-invocation-v3";
    forged.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    forged.terminal_receipt_version = QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
    forged.invocation_input = { schema_version: "qualification-invocation-input-binding-v1", content_type: "text/plain", bytes: 13, sha256: sha(readFileSync(legacy.scenario.input_path)) };
    forged.invocation_input_occurrence = { path: legacy.scenario.input_path, realpath: legacy.scenario.input_path, device: 0, inode: 0, mode: 0o600, uid: 0, gid: 0, link_count: 1, bytes: 13, sha256: forged.invocation_input.sha256 };
    forged.prepared_attempt = 0;
    forged.accounting_event_sha256 = null;
    const { invocation_sha256: _old, ...digestInput } = forged;
    forged.invocation_sha256 = qualificationSha256(qualificationCanonicalJson(digestInput));
    writeFileSync(path, `${qualificationCanonicalJson(forged)}\n`);
    expect(() => readQualificationInvocation(files.spool, legacy.invocation_id)).toThrow(/content type/i);
  });

  it.each([
    ["path", (record: any) => { record.invocation_input_occurrence.path += ".other"; }],
    ["realpath", (record: any) => { record.invocation_input_occurrence.realpath += ".other"; }],
    ["owner", (record: any) => { record.invocation_input_occurrence.uid += 1; }],
    ["mode", (record: any) => { record.invocation_input_occurrence.mode = 0o644; }],
    ["link count", (record: any) => { record.invocation_input_occurrence.link_count = 2; }],
    ["inode", (record: any) => { record.invocation_input_occurrence.inode += 1; }],
    ["device", (record: any) => { record.invocation_input_occurrence.device += 1; }],
    ["bytes", (record: any) => { record.invocation_input_occurrence.bytes += 1; }],
    ["digest", (record: any) => { record.invocation_input_occurrence.sha256 = hex("f"); }],
  ])("rejects forged governed input occurrence metadata: %s", (_name, mutate) => {
    const { files, prepared, recordPath } = prepareV3();
    const record = JSON.parse(readFileSync(recordPath, "utf8"));
    mutate(record);
    const { invocation_sha256: _old, ...digestInput } = record;
    record.invocation_sha256 = qualificationSha256(qualificationCanonicalJson(digestInput));
    writeFileSync(recordPath, `${qualificationCanonicalJson(record)}\n`);
    expect(() => readQualificationInvocation(files.spool, prepared.invocation_id)).toThrow(/input occurrence|identity/i);
  });

  it("rejects hardlink, symlink, directory, and private-mode substitutions of governed v3 input", () => {
    for (const mutation of ["hardlink", "symlink", "directory", "mode"] as const) {
      const { files, prepared } = prepareV3();
      const path = prepared.scenario.input_path;
      if (mutation === "hardlink") linkSync(path, `${path}.alias`);
      if (mutation === "symlink") { const target = `${path}.target`; renameSync(path, target); symlinkSync(target, path); }
      if (mutation === "directory") { rmSync(path); mkdirSync(path, { mode: 0o700 }); }
      if (mutation === "mode") chmodSync(path, 0o640);
      expect(() => readQualificationInvocation(files.spool, prepared.invocation_id)).toThrow(/hard link|missing, replaced, or unsafe|regular file|private and owned/i);
    }
  });

  it("detects mutation of the immutable invocation record", () => {
    const files = setupFiles();
    const requestPath = join(files.root, "request.json");
    writeFileSync(requestPath, JSON.stringify(request(files)));
    prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath });
    const path = join(files.spool, "invocations", "invocation-0001", "invocation.json");
    const record = JSON.parse(readFileSync(path, "utf8"));
    record.role = "judge";
    writeFileSync(path, `${qualificationCanonicalJson(record)}\n`);
    expect(() => readQualificationInvocation(files.spool, "invocation-0001")).toThrow(/immutable digest mismatch/i);
  });

  it("verifies pinned runner/arm executable bytes before publishing prepared state", () => {
    const files = setupFiles();
    const requestPath = join(files.root, "request.json");
    writeFileSync(requestPath, JSON.stringify(request(files)));
    writeFileSync(files.executable, "#!/bin/sh\nexit 9\n");
    expect(() => prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: requestPath })).toThrow(/executable digest mismatch/i);
    expect(existsSync(files.spool)).toBe(false);
  });

  it("recovers stale and ownerless prepare locks through atomic owner publication", () => {
    const files = setupFiles();
    const firstPath = join(files.root, "request-1.json");
    writeFileSync(firstPath, JSON.stringify(request(files)));
    prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: firstPath });

    const lock = join(files.spool, ".qualification.lock");
    mkdirSync(lock);
    writeFileSync(join(lock, "owner.json"), `${qualificationCanonicalJson({
      schema_version: "qualification-lock-owner-v1", token: "stale", process: { pid: 99999999, platform: process.platform, boot_id: "stale", start_ticks: "1" },
    })}\n`, { mode: 0o600 });
    const secondPath = join(files.root, "request-2.json");
    writeFileSync(secondPath, JSON.stringify(request(files, "invocation-0002")));
    expect(prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: secondPath }).invocation_id).toBe("invocation-0002");

    mkdirSync(lock);
    const thirdPath = join(files.root, "request-3.json");
    writeFileSync(thirdPath, JSON.stringify(request(files, "invocation-0003")));
    expect(prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: thirdPath }).invocation_id).toBe("invocation-0003");
  });

  it("rejects duplicate IDs, changed config identity, input mutation, symlinked input, and pre-existing artifacts", () => {
    const files = setupFiles();
    const firstRequest = join(files.root, "request.json");
    writeFileSync(firstRequest, JSON.stringify(request(files)));
    prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: firstRequest });
    expect(() => prepareQualificationInvocation({ spool_dir: files.spool, config_path: files.configPath, request_path: firstRequest })).toThrow(/duplicate invocation/i);

    const changed = JSON.parse(readFileSync(files.configPath, "utf8"));
    changed.arms[0].timeout_ms += 1;
    const changedPath = join(files.root, "changed-config.json");
    writeFileSync(changedPath, JSON.stringify(changed));
    const second = request(files, "invocation-0002");
    const secondPath = join(files.root, "request-2.json");
    writeFileSync(secondPath, JSON.stringify(second));
    expect(() => prepareQualificationInvocation({ spool_dir: files.spool, config_path: changedPath, request_path: secondPath })).toThrow(/spool.*configuration/i);

    writeFileSync(files.prompt, "mutated prompt\n");
    expect(() => prepareQualificationInvocation({ spool_dir: join(files.root, "new-spool"), config_path: files.configPath, request_path: secondPath })).toThrow(/input digest mismatch/i);

    const linked = setupFiles();
    const target = join(linked.root, "target.txt");
    writeFileSync(target, "inert prompt\n");
    const symlink = join(linked.root, "linked-prompt.txt");
    symlinkSync(target, symlink);
    const linkedRequest = request(linked, "invocation-linked");
    linkedRequest.scenario.input_path = symlink;
    linkedRequest.scenario.input_sha256 = sha(readFileSync(target));
    const linkedPath = join(linked.root, "linked-request.json");
    writeFileSync(linkedPath, JSON.stringify(linkedRequest));
    expect(() => prepareQualificationInvocation({ spool_dir: linked.spool, config_path: linked.configPath, request_path: linkedPath })).toThrow(/regular non-symlink/i);

    const files2 = setupFiles();
    mkdirSync(join(files2.spool, "artifacts"), { recursive: true });
    chmodSync(files2.spool, 0o700);
    writeFileSync(join(files2.spool, "artifacts", "invocation-0003.jsonl"), "occupied");
    const thirdPath = join(files2.root, "request-3.json");
    writeFileSync(thirdPath, JSON.stringify(request(files2, "invocation-0003")));
    expect(() => prepareQualificationInvocation({ spool_dir: files2.spool, config_path: files2.configPath, request_path: thirdPath })).toThrow(/artifact path already exists/i);
  });
});

describe("qualification accounting", () => {
  it("does not count reservations and counts each launch exactly once, including non-measurement roles", () => {
    let ledger = createQualificationAccountingLedger();
    expect(validateQualificationAccountingLedger(ledger).counts).toMatchObject({ subject: 0, judge: 0, measurement: 0, total: 0 });
    ledger = appendQualificationAccountingEvent(ledger, event("subject-1"));
    ledger = appendQualificationAccountingEvent(ledger, event("judge-1", "judge", "judge"));
    ledger = appendQualificationAccountingEvent(ledger, event("author-1", "holdout-author", "subject"));
    ledger = appendQualificationAccountingEvent(ledger, event("reviewer-1", "holdout-reviewer", "judge"));
    ledger = appendQualificationAccountingEvent(ledger, event("calibration-1", "calibration", "subject"));
    ledger = appendQualificationAccountingEvent(ledger, event("canary-1", "canary", "subject"));
    const report = validateQualificationAccountingLedger(ledger);
    expect(report.counts).toMatchObject({ subject: 4, judge: 2, measurement: 2, total: 6 });
    expect(report.roles).toMatchObject({ subject: 1, judge: 1, "holdout-author": 1, "holdout-reviewer": 1, calibration: 1, canary: 1 });
    expect(() => appendQualificationAccountingEvent(ledger, event("subject-1"))).toThrow(/duplicate invocation/i);
  });

  it("records the panel call budget in the ledger and counts every member independently", () => {
    let ledger = createQualificationAccountingLedger(QUALIFICATION_PANEL_ACCOUNTING_POLICY);
    ledger = appendQualificationAccountingEvent(ledger, event("panel-1", "judge", "judge"));
    ledger = appendQualificationAccountingEvent(ledger, event("panel-2", "judge", "judge"));
    ledger = appendQualificationAccountingEvent(ledger, event("panel-3", "judge", "judge"));
    expect(validateQualificationAccountingLedger(ledger)).toMatchObject({ counts: { judge: 3, measurement: 3, total: 3 } });
    expect(ledger.policy).toEqual(QUALIFICATION_PANEL_ACCOUNTING_POLICY);
  });

  it("enforces the exact 700/700 ceiling before claim", () => {
    let ledger = createQualificationAccountingLedger();
    for (let index = 0; index < 700; index += 1) ledger = appendQualificationAccountingEvent(ledger, event(`subject-${index}`));
    expect(validateQualificationAccountingLedger(ledger).counts.subject).toBe(700);
    expect(() => appendQualificationAccountingEvent(ledger, event("subject-701"))).toThrow(/subject ceiling 700/i);
    ledger = appendQualificationAccountingEvent(ledger, event("judge-at-subject-ceiling", "judge", "judge"));
    expect(validateQualificationAccountingLedger(ledger).counts.judge).toBe(1);
  });

  it("detects deletion, insertion, reordering, duplication, and mutation", () => {
    let ledger = createQualificationAccountingLedger();
    for (const id of ["a", "b", "c"]) ledger = appendQualificationAccountingEvent(ledger, event(id));
    const mutations: unknown[] = [];
    const deleted = structuredClone(ledger); deleted.events.splice(1, 1); mutations.push(deleted);
    const inserted = structuredClone(ledger); inserted.events.splice(1, 0, structuredClone(inserted.events[0])); mutations.push(inserted);
    const reordered = structuredClone(ledger); [reordered.events[0], reordered.events[1]] = [reordered.events[1], reordered.events[0]]; mutations.push(reordered);
    const duplicated = structuredClone(ledger); duplicated.events.push(structuredClone(duplicated.events[2])); mutations.push(duplicated);
    const mutated = structuredClone(ledger); mutated.events[1].role = "judge"; mutations.push(mutated);
    for (const value of mutations) expect(() => validateQualificationAccountingLedger(value)).toThrow();
    expect(qualificationCanonicalJson(ledger)).not.toContain("undefined");
  });
});
