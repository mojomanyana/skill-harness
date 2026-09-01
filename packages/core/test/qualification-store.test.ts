import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUALIFICATION_ACCOUNTING_POLICY, qualificationCanonicalJson } from "../src/qualification-config.js";
import {
  appendQualificationAccountingEvent,
  createQualificationAccountingLedger,
  prepareQualificationInvocation,
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
    product: { repository: "https://example.invalid/product", commit: hex("1", 40), tree: hex("2", 40), package_sha256: hex("3"), package_bytes: 1 },
    engine: { repository: "https://example.invalid/engine", commit: hex("4", 40), tree: hex("5", 40), package_sha256: { core: hex("6"), adapters: hex("7"), cli: hex("8"), meta: hex("9") } },
    producer: { repository: "https://example.invalid/producer", commit: hex("a", 40), tree: hex("b", 40), version: "0.20.0", ledger_version: 3 },
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
    scenario: { id: "fake-A1", version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e"), input_path: files.prompt, input_sha256: sha(readFileSync(files.prompt)), working_directory: files.root },
    role, counts_as_measurement: role === "subject" || role === "judge",
    arms: { subject: "fake-subject", judge: "fake-judge" }, selected_arm: selected, repetition: 0,
  };
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
