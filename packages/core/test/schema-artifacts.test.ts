import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PI_DADDY_QUALIFICATION_PRODUCER_PIN, PRINCIPAL_QUALIFICATION_PRODUCT_PIN, QUALIFICATION_ACCOUNTING_POLICY, QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2, QUALIFICATION_PANEL_ACCOUNTING_POLICY, QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3, parseQualificationConfig, parseQualificationRequest } from "../src/qualification-config.js";
import { QUALIFICATION_JUDGE_PANEL_POLICY } from "../src/qualification-panels.js";

const root = join(__dirname, "../../../schemas");

describe("versioned public schemas", () => {
  it.each([
    ["specification-v1.schema.json", "https://skill-harness.dev/schemas/specification-v1.schema.json"],
    ["trajectory-event-v1.schema.json", "https://skill-harness.dev/schemas/trajectory-event-v1.schema.json"],
    ["results-v2.schema.json", "https://skill-harness.dev/schemas/results-v2.schema.json"],
    ["results-v3.schema.json", "https://skill-harness.dev/schemas/results-v3.schema.json"],
    ["qualification-config-v1.schema.json", "https://skill-harness.dev/schemas/qualification-config-v1.schema.json"],
    ["qualification-invocation-request-v1.schema.json", "https://skill-harness.dev/schemas/qualification-invocation-request-v1.schema.json"],
    ["qualification-judge-panel-result-v1.schema.json", "https://skill-harness.dev/schemas/qualification-judge-panel-result-v1.schema.json"],
    ["qualification-cell-result-v1.schema.json", "https://skill-harness.dev/schemas/qualification-cell-result-v1.schema.json"],
  ])("ships parseable %s", (file, id) => {
    const schema = JSON.parse(readFileSync(join(root, file), "utf8"));
    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toBe(id);
  });

  it("requires self-screening observations in results v3 while keeping v2 valid (breaks if schema bump becomes cosmetic)", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const v2Schema = JSON.parse(readFileSync(join(root, "results-v2.schema.json"), "utf8"));
    const v3Schema = JSON.parse(readFileSync(join(root, "results-v3.schema.json"), "utf8"));
    const v2 = { schema: 2, skill: "x", harness: "pi", model: "p:m", judge: { provider: "p", model: "j" }, timestamp: "t", label: null, mode: "red", effective_grade: { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: "" }, scenarios: [] };
    expect(ajv.compile(v2Schema)(v2)).toBe(true);
    const validateV3 = ajv.compile(v3Schema);
    expect(validateV3({ ...v2, schema: 3 })).toBe(false);
    const h = "a".repeat(64);
    const v3 = { ...v2, schema: 3, subject_invocations: [{ scenario_id: "A1", repetition: 0, prompt: { capture_version: "prompt-provenance-v1", request_index: 0, raw_sha256: h, normalized_sha256: h, normalization_rule: "cwd-line-v1", bytes: 1, contract_sha256: h, contract_bytes: 1, contract_occurrences: 0, mechanism: "none", status: "PASS" } }], scenarios: [{ id: "A1", criterion_count: 1, judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "", objective: { status: "PASS", assertions: [{ kind: "skill_delivered", status: "PASS", detail: "observed" }] }, rep_judgments: [{ repetition: 0, recorded_verdict: "PASS", objective: { status: "PASS", assertions: [{ kind: "skill_delivered", status: "PASS", detail: "observed" }] }, judgments: [{ ordinal: 1, judge: { provider: "p", model: "j" }, verdict: "PASS", reason: "ok", suspect: false, criteria: [{ index: 1, verdict: "PASS", reason: "ok" }] }] }] }] };
    expect(validateV3(v3), JSON.stringify(validateV3.errors)).toBe(true);
    const noInvocations = structuredClone(v3); delete (noInvocations as any).subject_invocations;
    expect(validateV3(noInvocations)).toBe(false);
    const noStatus = structuredClone(v3); delete (noStatus as any).subject_invocations[0].prompt.status;
    expect(validateV3(noStatus)).toBe(false);
    const noRepObjective = structuredClone(v3); delete (noRepObjective as any).scenarios[0].rep_judgments[0].objective;
    expect(validateV3(noRepObjective)).toBe(false);
    const noScenarioObjective = structuredClone(v3); delete (noScenarioObjective as any).scenarios[0].objective;
    expect(validateV3(noScenarioObjective)).toBe(false);
  });

  it("accepts legacy 1.0 events, emits 1.1 fields only under 1.1, and stays closed", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
    const schema = JSON.parse(readFileSync(join(root, "trajectory-event-v1.schema.json"), "utf8"));
    const validate = ajv.compile(schema);
    expect(validate({ event_version: "1.0", seq: 1, type: "legacy", source: "test" })).toBe(true);
    expect(validate({ event_version: "1.0", seq: 1, type: "legacy", source: "test", execution_id: "exec:one" })).toBe(false);
    expect(validate({ event_version: "1.1", seq: 1, type: "current", source: "test", execution_id: "exec:one", parent_execution_id: null })).toBe(true);
    expect(validate({ event_version: "1.1", seq: 1, type: "current", source: "test", invented: true })).toBe(false);
  });

  it("keeps qualification schema fixtures aligned with runtime parsing and documents semantic-only joins", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const configSchema = JSON.parse(readFileSync(join(root, "qualification-config-v1.schema.json"), "utf8"));
    const requestSchema = JSON.parse(readFileSync(join(root, "qualification-invocation-request-v1.schema.json"), "utf8"));
    const validateConfig = ajv.compile(configSchema);
    const validateRequest = ajv.compile(requestSchema);
    const h = (value: string, length = 64) => value.repeat(length);
    const executable = { path: "/bin/true", sha256: h("1") };
    const config: any = {
      schema_version: "qualification-config-v1", mode: "test",
      product: { repository: "https://example.invalid/product", commit: h("2", 40), tree: h("3", 40), checkout_path: "/tmp/product", package_path: "/tmp/product.tgz", package_sha256: h("4"), package_bytes: 1 },
      engine: { repository: "https://example.invalid/engine", commit: h("5", 40), tree: h("6", 40), checkout_path: "/tmp/engine", package_paths: { core: "/tmp/core.tgz", adapters: "/tmp/adapters.tgz", cli: "/tmp/cli.tgz", meta: "/tmp/meta.tgz" }, package_sha256: { core: h("7"), adapters: h("8"), cli: h("9"), meta: h("a") } },
      producer: { repository: "https://example.invalid/producer", commit: h("b", 40), tree: h("c", 40), checkout_path: "/tmp/producer", version: "0.20.0", ledger_version: 3, ledger_schema_sha256: h("d") },
      runner: { version: "qualification-runner-v1", executable, conflicting_parent_environment: "remove-and-record" },
      accounting: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
      arms: [
        { id: "subject", kind: "subject", provider: "fake", model: "fake-luna", authentication: "test-oauth", executable, resources: [], arguments: ["{input_path}"], allowed_environment_names: ["HOME"], timeout_ms: 1000, output_limit_bytes: 1024, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false },
        { id: "judge", kind: "judge", provider: "fake", model: "fake-sol", authentication: "test-oauth", executable, resources: [], arguments: ["{input_path}"], allowed_environment_names: ["HOME"], timeout_ms: 1000, output_limit_bytes: 1024, artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" }, fallback: false, metered_override: false },
      ],
    };
    const request: any = {
      schema_version: "qualification-invocation-request-v1", measurement_identity_sha256: h("e"), invocation_id: "invocation-1",
      continuation_authority_sha256: h("a"), continuation_authority_expires_at: "2099-01-01T00:00:00.000Z",
      scenario: { id: "A1", version: "1", stimulus_sha256: h("f"), rubric_sha256: h("0"), input_path: "/tmp/input", input_sha256: h("1"), working_directory: "/tmp" },
      role: "subject", counts_as_measurement: true, arms: { subject: "subject", judge: "judge" }, selected_arm: "subject", repetition: 0,
    };
    expect(validateConfig(config), JSON.stringify(validateConfig.errors)).toBe(true);
    const v2Config = { ...config, oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 };
    expect(validateConfig(v2Config), JSON.stringify(validateConfig.errors)).toBe(true);
    expect(parseQualificationConfig(v2Config).oauth_directory_policy).toBe(QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2);
    const unknownOAuthPolicy = { ...config, oauth_directory_policy: "qualification-oauth-directory-policy-v3" };
    expect(validateConfig(unknownOAuthPolicy)).toBe(false);
    expect(() => parseQualificationConfig(unknownOAuthPolicy)).toThrow(/oauth_directory_policy/i);
    const receiptV3Config = { ...config, oauth_directory_policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2, terminal_receipt_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3 };
    expect(validateConfig(receiptV3Config), JSON.stringify(validateConfig.errors)).toBe(true);
    expect(parseQualificationConfig(receiptV3Config).terminal_receipt_version).toBe(QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3);
    const panelConfig = {
      ...receiptV3Config,
      judge_panel: structuredClone(QUALIFICATION_JUDGE_PANEL_POLICY),
      board: { schema_version: "qualification-board-v1", read_only: true, cells: [{ id: "A1-subject", scenario_id: "A1", measurement_identity_sha256: h("e"), scenario_version: "1", stimulus_sha256: h("f"), rubric_sha256: h("0"), subject_input_sha256: h("1"), subject_arm: "subject", judge_arms: ["judge", "judge", "judge"], panels: [{ id: "A1-r0", repetition: 0 }], critical: false, pass_threshold: 1 }] },
      accounting: structuredClone(QUALIFICATION_PANEL_ACCOUNTING_POLICY),
    };
    expect(validateConfig(panelConfig), JSON.stringify(validateConfig.errors)).toBe(true);
    expect(parseQualificationConfig(panelConfig).board?.cells[0].panels[0]).toEqual({ id: "A1-r0", repetition: 0 });
    const panelJudgeRequest = { ...request, role: "judge", selected_arm: "judge", panel: { id: "A1-r0", member_ordinal: 1, subject_invocation_id: "subject-r0", subject_artifact_sha256: h("a") } };
    expect(validateRequest(panelJudgeRequest), JSON.stringify(validateRequest.errors)).toBe(true);
    expect(parseQualificationRequest(panelJudgeRequest, parseQualificationConfig(panelConfig)).panel?.member_ordinal).toBe(1);
    const panelOnSubject = { ...request, panel: panelJudgeRequest.panel };
    expect(validateRequest(panelOnSubject)).toBe(false);
    expect(() => parseQualificationRequest(panelOnSubject, parseQualificationConfig(panelConfig))).toThrow(/only for judge/i);

    const unknownReceiptVersion = { ...config, terminal_receipt_version: "qualification-terminal-receipt-v4" };
    expect(validateConfig(unknownReceiptVersion)).toBe(false);
    expect(() => parseQualificationConfig(unknownReceiptVersion)).toThrow(/terminal_receipt_version/i);
    const parsed = parseQualificationConfig(config);
    expect(validateRequest(request), JSON.stringify(validateRequest.errors)).toBe(true);
    expect(parseQualificationRequest(request, parsed).selected_arm).toBe("subject");

    const production = structuredClone(config);
    production.mode = "production";
    Object.assign(production.product, PRINCIPAL_QUALIFICATION_PRODUCT_PIN);
    Object.assign(production.producer, PI_DADDY_QUALIFICATION_PRODUCER_PIN);
    production.engine.repository = "https://github.com/mojomanyana/skill-harness";
    production.arms.forEach((arm: any) => {
      arm.provider = "openai-codex";
      arm.authentication = "chatgpt-oauth";
      arm.model = arm.kind === "subject" ? "gpt-5.6-luna" : "gpt-5.6-sol";
    });
    expect(validateConfig(production), JSON.stringify(validateConfig.errors)).toBe(true);
    expect(parseQualificationConfig(production).mode).toBe("production");
    const wrongProductionPin = structuredClone(production); wrongProductionPin.product.commit = h("f", 40);
    expect(validateConfig(wrongProductionPin)).toBe(false);
    expect(() => parseQualificationConfig(wrongProductionPin)).toThrow(/authorized principal-pi-skills/i);

    const optionInjection = structuredClone(config); optionInjection.arms[0].arguments = ["-e/tmp/unpinned", "{input_path}"];
    expect(validateConfig(optionInjection)).toBe(false);
    expect(() => parseQualificationConfig(optionInjection)).toThrow(/positional inputs/i);
    const unknownPlaceholder = structuredClone(config); unknownPlaceholder.arms[0].arguments = ["{future_path}", "{input_path}"];
    expect(validateConfig(unknownPlaceholder)).toBe(false);
    expect(() => parseQualificationConfig(unknownPlaceholder)).toThrow(/unknown placeholder/i);
    const relativeExecutable = structuredClone(config); relativeExecutable.arms[0].executable.path = "relative/pi";
    expect(validateConfig(relativeExecutable)).toBe(false);
    expect(() => parseQualificationConfig(relativeExecutable)).toThrow(/absolute path/i);
    const duplicateResource = structuredClone(config);
    duplicateResource.arms[0].resources = [
      { kind: "skill", path: "/tmp/skill.md", sha256: h("2") },
      { kind: "skill", path: "/tmp/skill.md", sha256: h("2") },
    ];
    expect(validateConfig(duplicateResource)).toBe(false);
    expect(() => parseQualificationConfig(duplicateResource)).toThrow(/duplicate kind\/path/i);
    const contradictoryRole = { ...request, role: "calibration", counts_as_measurement: true };
    expect(validateRequest(contradictoryRole)).toBe(false);
    expect(() => parseQualificationRequest(contradictoryRole, parsed)).toThrow(/non-measurement/i);
    const badExpiry = { ...request, continuation_authority_expires_at: "tomorrow" };
    expect(validateRequest(badExpiry)).toBe(false);
    expect(() => parseQualificationRequest(badExpiry, parsed)).toThrow(/RFC 3339/i);
    const unknown = { ...config, surprise: true };
    expect(validateConfig(unknown)).toBe(false);
    expect(() => parseQualificationConfig(unknown)).toThrow(/unknown field/i);

    // Cross-object ID joins and duplicate arm tuples are intentionally runtime-only:
    // JSON Schema validates shape; the parser binds selected_arm to role and arm kind.
    const wrongJoin = { ...request, selected_arm: "judge" };
    expect(validateRequest(wrongJoin)).toBe(true);
    expect(() => parseQualificationRequest(wrongJoin, parsed)).toThrow(/subject arm/i);
  });

  it("validates the closed qualification panel and cell output shapes", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const panelSchema = JSON.parse(readFileSync(join(root, "qualification-judge-panel-result-v1.schema.json"), "utf8"));
    const cellSchema = JSON.parse(readFileSync(join(root, "qualification-cell-result-v1.schema.json"), "utf8"));
    ajv.addSchema(panelSchema);
    const validatePanel = ajv.getSchema(panelSchema.$id)!;
    const validateCell = ajv.compile(cellSchema);
    const h = (value: string) => value.repeat(64);
    const member = (ordinal: number, verdict: string) => ({ invocation_id: `judge-${ordinal}`, ordinal, judge: { provider: "fake", model: "fake-sol" }, verdict, reason: "r", suspect: false, artifact: { sha256: h(String(ordinal)), bytes: 1 }, terminal_receipt_sha256: h(String(ordinal + 3)) });
    const panel = { schema_version: "qualification-judge-panel-result-v1", panel_id: "A1-r0", scenario_id: "A1", subject_arm: "subject", repetition: 0, critical: false, state: "confirmed", verdict: "PASS", members: [member(1, "PASS"), member(2, "PASS")], judge_calls: 2, clean_votes: 2, disagreement: { initial_split: false, minority_rate: 0 }, acceptance: "pass", collection: "continue" };
    expect(validatePanel(panel), JSON.stringify(validatePanel.errors)).toBe(true);
    const cell = { schema_version: "qualification-cell-result-v1", cell_id: "A1-subject", scenario_id: "A1", subject_arm: "subject", critical: false, pass_threshold: 1, panels: [panel], verdict: "PASS", critical_failure: false, acceptance: "pass", collection: "continue", disagreement: { judge_calls: 2, clean_votes: 2, split_artifacts: 0, artifacts_with_two_clean_initial_votes: 1, unresolved_artifacts: 0, judge_split_rate: 0 } };
    expect(validateCell(cell), JSON.stringify(validateCell.errors)).toBe(true);
    expect(validatePanel({ ...panel, state: "unresolved", acceptance: "inconclusive" })).toBe(false);
    expect(validatePanel({ ...panel, judge_calls: 3 })).toBe(false);
    expect(validatePanel({ ...panel, state: "unresolved", verdict: undefined, acceptance: "inconclusive", members: [member(1, "PASS"), member(2, "FAIL")], disagreement: { initial_split: true, minority_rate: 0.5 } })).toBe(false);
    expect(validatePanel({ ...panel, collection: "halt" })).toBe(false);
    expect(validateCell({ ...cell, acceptance: "pass", verdict: "FAIL" })).toBe(false);
    expect(validateCell({ ...cell, collection: "halt" })).toBe(false);
  });

  it("types every trajectory assertion class instead of accepting arbitrary objects", () => {
    const schema = JSON.parse(readFileSync(join(root, "specification-v1.schema.json"), "utf8"));
    for (const key of ["correlate", "freshness", "unique", "forbid_after", "approvals", "coverage"]) {
      expect(schema.$defs.trajectory.properties[key].items.$ref, key).toMatch(/^#\/\$defs\//);
    }
    expect(schema.$defs.selector.properties.count).toBeUndefined();
    expect(schema.$defs.requiredSelector.properties.count.$ref).toBe("#/$defs/count");
  });
});
