import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PI_DADDY_QUALIFICATION_PRODUCER_PIN, PRINCIPAL_QUALIFICATION_PRODUCT_PIN, QUALIFICATION_ACCOUNTING_POLICY, QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2, QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3, parseQualificationConfig, parseQualificationRequest } from "../src/qualification-config.js";

const root = join(__dirname, "../../../schemas");

describe("versioned public schemas", () => {
  it.each([
    ["specification-v1.schema.json", "https://skill-harness.dev/schemas/specification-v1.schema.json"],
    ["trajectory-event-v1.schema.json", "https://skill-harness.dev/schemas/trajectory-event-v1.schema.json"],
    ["results-v2.schema.json", "https://skill-harness.dev/schemas/results-v2.schema.json"],
    ["qualification-config-v1.schema.json", "https://skill-harness.dev/schemas/qualification-config-v1.schema.json"],
    ["qualification-invocation-request-v1.schema.json", "https://skill-harness.dev/schemas/qualification-invocation-request-v1.schema.json"],
  ])("ships parseable %s", (file, id) => {
    const schema = JSON.parse(readFileSync(join(root, file), "utf8"));
    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toBe(id);
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

  it("types every trajectory assertion class instead of accepting arbitrary objects", () => {
    const schema = JSON.parse(readFileSync(join(root, "specification-v1.schema.json"), "utf8"));
    for (const key of ["correlate", "freshness", "unique", "forbid_after", "approvals", "coverage"]) {
      expect(schema.$defs.trajectory.properties[key].items.$ref, key).toMatch(/^#\/\$defs\//);
    }
    expect(schema.$defs.selector.properties.count).toBeUndefined();
    expect(schema.$defs.requiredSelector.properties.count.$ref).toBe("#/$defs/count");
  });
});
