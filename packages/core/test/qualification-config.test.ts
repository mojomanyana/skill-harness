import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PI_DADDY_QUALIFICATION_PRODUCER_PIN,
  PRINCIPAL_QUALIFICATION_PRODUCT_PIN,
  QUALIFICATION_ACCOUNTING_POLICY,
  QUALIFICATION_OAUTH_DIRECTORY_POLICY_V1,
  QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
  QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3,
  parseQualificationConfig,
  parseQualificationRequest,
  qualificationConfigDigest,
  qualificationOAuthDirectoryPolicy,
  isQualificationConflictingEnvironmentName,
  sanitizeQualificationEnvironment,
  verifyQualificationExecutable,
  verifyQualificationResource,
} from "../src/qualification-config.js";

const h = (character: string, size = 64) => character.repeat(size);

function executable() {
  const dir = mkdtempSync(join(tmpdir(), "qualification-config-executable-"));
  const path = join(dir, "fake-pi");
  writeFileSync(path, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const sha256 = createHash("sha256").update("#!/bin/sh\nexit 0\n").digest("hex");
  return { path, sha256 };
}

function config() {
  const command = executable();
  return {
    schema_version: "qualification-config-v1",
    mode: "test",
    product: {
      repository: "https://example.invalid/principal-pi-skills",
      commit: h("1", 40), tree: h("2", 40), checkout_path: "/tmp", package_path: command.path,
      package_sha256: h("3"), package_bytes: 110168,
    },
    engine: {
      repository: "https://example.invalid/skill-harness",
      commit: h("4", 40), tree: h("5", 40), checkout_path: "/tmp",
      package_paths: { core: command.path, adapters: command.path, cli: command.path, meta: command.path },
      package_sha256: { core: h("6"), adapters: h("7"), cli: h("8"), meta: h("9") },
    },
    producer: {
      repository: "https://example.invalid/pi-daddy",
      commit: h("a", 40), tree: h("b", 40), checkout_path: "/tmp", version: "0.20.0", ledger_version: 3,
      ledger_schema_sha256: h("a"),
    },
    runner: {
      version: "qualification-runner-v1",
      executable: command,
      conflicting_parent_environment: "remove-and-record",
    },
    accounting: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
    arms: [
      {
        id: "fake-luna-subject", kind: "subject", provider: "fake", model: "fake-luna",
        authentication: "test-oauth", executable: command, resources: [],
        arguments: ["{input_path}"], allowed_environment_names: ["HOME", "PATH", "FAKE_AUTH_STATUS"],
        timeout_ms: 1000, output_limit_bytes: 65536,
        artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" },
        fallback: false, metered_override: false,
      },
      {
        id: "fake-sol-judge", kind: "judge", provider: "fake", model: "fake-sol",
        authentication: "test-oauth", executable: command, resources: [],
        arguments: ["{input_path}"], allowed_environment_names: ["HOME", "PATH", "FAKE_AUTH_STATUS"],
        timeout_ms: 1000, output_limit_bytes: 65536,
        artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" },
        fallback: false, metered_override: false,
      },
    ],
  };
}

function request() {
  return {
    schema_version: "qualification-invocation-request-v1",
    measurement_identity_sha256: h("c"),
    invocation_id: "invocation-0001",
    continuation_authority_sha256: h("b"), continuation_authority_expires_at: "2099-01-01T00:00:00.000Z",
    scenario: {
      id: "fake-A1", version: "1", stimulus_sha256: h("d"), rubric_sha256: h("e"),
      input_path: "/tmp/inert-prompt.txt", input_sha256: h("f"), working_directory: "/tmp",
    },
    role: "subject",
    counts_as_measurement: true,
    arms: { subject: "fake-luna-subject", judge: "fake-sol-judge" },
    selected_arm: "fake-luna-subject",
    repetition: 0,
  };
}

describe("qualification configuration v1", () => {
  it("accepts a closed inert configuration and hashes its canonical meaning", () => {
    const parsed = parseQualificationConfig(config());
    expect(parsed.mode).toBe("test");
    expect(parsed.accounting).toEqual(QUALIFICATION_ACCOUNTING_POLICY);
    expect(qualificationConfigDigest(parsed)).toMatch(/^[a-f0-9]{64}$/);
    expect(qualificationConfigDigest(parsed)).toBe(qualificationConfigDigest(structuredClone(parsed)));
    expect(verifyQualificationExecutable(parsed.runner.executable).realpath).toBe(parsed.runner.executable.path);
    const withResource = config();
    (withResource.arms[0] as any).resources = [{ kind: "extension", path: withResource.runner.executable.path, sha256: withResource.runner.executable.sha256 }];
    const resource = parseQualificationConfig(withResource).arms[0].resources[0];
    expect(verifyQualificationResource(resource).sha256).toBe(resource.sha256);
  });

  it("preserves omitted historical policy bytes while explicit v2 changes configuration identity", () => {
    const historical = parseQualificationConfig(config());
    expect(historical).not.toHaveProperty("oauth_directory_policy");
    expect(qualificationOAuthDirectoryPolicy(historical)).toBe(QUALIFICATION_OAUTH_DIRECTORY_POLICY_V1);
    const v2Value = config() as any;
    v2Value.oauth_directory_policy = QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
    const v2 = parseQualificationConfig(v2Value);
    expect(v2.oauth_directory_policy).toBe(QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2);
    expect(qualificationOAuthDirectoryPolicy(v2)).toBe(QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2);
    expect(qualificationConfigDigest(v2)).not.toBe(qualificationConfigDigest(historical));
    expect(() => parseQualificationConfig({ ...config(), oauth_directory_policy: "qualification-oauth-directory-policy-v3" }))
      .toThrow(/oauth_directory_policy.*v2/i);
  });

  it("selects terminal receipt v3 prospectively without upgrading historical configurations", () => {
    const historical = parseQualificationConfig(config());
    expect(historical).not.toHaveProperty("terminal_receipt_version");
    const selectedValue = { ...config(), terminal_receipt_version: QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3 };
    const selected = parseQualificationConfig(selectedValue);
    expect(selected.terminal_receipt_version).toBe(QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3);
    expect(qualificationConfigDigest(selected)).not.toBe(qualificationConfigDigest(historical));
    expect(() => parseQualificationConfig({ ...config(), terminal_receipt_version: "qualification-terminal-receipt-v4" }))
      .toThrow(/terminal_receipt_version.*v3/i);
  });

  it("fails closed on unknown fields, duplicate arms, unpinned repositories, and policy drift", () => {
    expect(() => parseQualificationConfig({ ...config(), surprise: true })).toThrow(/unknown field.*surprise/i);
    const duplicate = config();
    duplicate.arms.push(structuredClone(duplicate.arms[0]));
    expect(() => parseQualificationConfig(duplicate)).toThrow(/duplicate arm/i);
    const unpinned = config();
    unpinned.product.commit = "main";
    expect(() => parseQualificationConfig(unpinned)).toThrow(/product\.commit.*40/i);
    const ceiling = config();
    ceiling.accounting.ceilings.subject = 701;
    expect(() => parseQualificationConfig(ceiling)).toThrow(/accounting.*canonical policy/i);
  });

  it("refuses direct OpenAI, API-key auth, fallbacks, metered overrides, and provider flags hidden in arm argv", () => {
    for (const mutate of [
      (value: any) => { value.mode = "production"; value.arms[0].provider = "openai"; value.arms[0].authentication = "chatgpt-oauth"; },
      (value: any) => { value.arms[0].authentication = "api-key"; },
      (value: any) => { value.arms[0].fallback = true; },
      (value: any) => { value.arms[0].metered_override = true; },
      (value: any) => { value.arms[0].arguments = ["--provider", "openai-codex", "{input_path}"]; },
      (value: any) => { value.arms[0].arguments = ["--api-key", "not-a-real-key", "{input_path}"]; },
      (value: any) => { value.arms[0].arguments = ["--extension", "/tmp/unpinned.js", "{input_path}"]; },
      (value: any) => { value.arms[0].arguments = ["-e/tmp/unpinned.js", "{input_path}"]; },
      (value: any) => { value.arms[0].arguments = ["-popenai-codex", "{input_path}"]; },
    ]) {
      const value = config();
      mutate(value);
      expect(() => parseQualificationConfig(value)).toThrow();
    }
  });

  it("requires production arms to use exact openai-codex ChatGPT OAuth", () => {
    const value = config();
    value.mode = "production";
    Object.assign(value.product, PRINCIPAL_QUALIFICATION_PRODUCT_PIN);
    Object.assign(value.producer, PI_DADDY_QUALIFICATION_PRODUCER_PIN);
    value.engine.repository = "https://github.com/mojomanyana/skill-harness";
    for (const arm of value.arms) {
      arm.provider = "openai-codex";
      arm.model = arm.kind === "subject" ? "gpt-5.6-luna" : "gpt-5.6-sol";
      arm.authentication = "chatgpt-oauth";
    }
    expect(parseQualificationConfig(value).arms.map((arm) => arm.provider)).toEqual(["openai-codex", "openai-codex"]);
    value.arms[0].provider = "OpenAI-Codex";
    expect(() => parseQualificationConfig(value)).toThrow(/exact.*openai-codex/i);
    value.arms[0].provider = "openai-codex";
    value.arms[0].model = "openai/gpt-5.6-luna";
    expect(() => parseQualificationConfig(value)).toThrow(/exact Principal qualification model.*aliases/i);
  });

  it("parses a closed request and rejects holdout measurement, arm mismatch, and unknown fields", () => {
    const parsedConfig = parseQualificationConfig(config());
    expect(parseQualificationRequest(request(), parsedConfig).selected_arm).toBe("fake-luna-subject");
    expect(() => parseQualificationRequest({ ...request(), extra: 1 }, parsedConfig)).toThrow(/unknown field.*extra/i);
    expect(() => parseQualificationRequest({ ...request(), role: "holdout-author", counts_as_measurement: true }, parsedConfig))
      .toThrow(/holdout.*non-measurement/i);
    expect(() => parseQualificationRequest({ ...request(), role: "subject", counts_as_measurement: false }, parsedConfig))
      .toThrow(/subject.*measurement/i);
    expect(() => parseQualificationRequest({ ...request(), role: "calibration", counts_as_measurement: true }, parsedConfig))
      .toThrow(/calibration.*non-measurement/i);
    expect(() => parseQualificationRequest({ ...request(), selected_arm: "fake-sol-judge" }, parsedConfig))
      .toThrow(/subject.*subject arm/i);
  });
});

describe("qualification child environment", () => {
  it("starts from an allowlist, removes and records credential/routing variables by name only", () => {
    const result = sanitizeQualificationEnvironment({
      HOME: "/home/test", PATH: "/bin", LANG: "C", OPENAI_API_KEY: "sentinel-api-value", OPENAI_BASE_URL: "https://proxy.invalid",
      OPENAI_ORG_ID: "org", SKILL_HARNESS_ALLOW_METERED_JUDGE: "0", NODE_OPTIONS: "--require evil",
      FAKE_AUTH_STATUS: "ready",
    }, ["HOME", "PATH", "LANG", "FAKE_AUTH_STATUS"], "remove-and-record");
    expect(result.env).toEqual({ HOME: "/home/test", PATH: "/bin", LANG: "C", FAKE_AUTH_STATUS: "ready" });
    expect(result.removed_names).toEqual(expect.arrayContaining([
      "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "SKILL_HARNESS_ALLOW_METERED_JUDGE", "NODE_OPTIONS",
    ]));
    expect(JSON.stringify(result)).not.toContain("sentinel-api-value");
    expect(JSON.stringify(result)).not.toContain("proxy.invalid");
  });

  it("can refuse a dirty parent environment before launch", () => {
    expect(() => sanitizeQualificationEnvironment({ PATH: "/bin", OPENAI_API_KEY: "sentinel-api-value" }, ["PATH"], "refuse"))
      .toThrow(/conflicting parent environment.*OPENAI_API_KEY/i);
  });

  it("classifies every Pi-documented provider credential plus routing/loader overrides as conflicting", () => {
    const documented = [
      "ANTHROPIC_API_KEY", "ANT_LING_API_KEY", "AZURE_OPENAI_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY",
      "NVIDIA_API_KEY", "GEMINI_API_KEY", "AWS_BEARER_TOKEN_BEDROCK", "MISTRAL_API_KEY", "GROQ_API_KEY",
      "CEREBRAS_API_KEY", "CLOUDFLARE_API_KEY", "XAI_API_KEY", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY",
      "ZAI_API_KEY", "ZAI_CODING_CN_API_KEY", "OPENCODE_API_KEY", "RADIUS_API_KEY", "HF_TOKEN",
      "FIREWORKS_API_KEY", "TOGETHER_API_KEY", "BASETEN_API_KEY", "KIMI_API_KEY", "MINIMAX_API_KEY",
      "MINIMAX_CN_API_KEY", "QWEN_TOKEN_PLAN_API_KEY", "QWEN_TOKEN_PLAN_CN_API_KEY", "XIAOMI_API_KEY",
      "XIAOMI_TOKEN_PLAN_CN_API_KEY", "XIAOMI_TOKEN_PLAN_AMS_API_KEY", "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
      "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_PROJECT_ID", "AZURE_OPENAI_BASE_URL", "AZURE_OPENAI_API_VERSION",
      "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN", "AWS_PROFILE", "AWS_REGION", "AWS_ENDPOINT_URL_BEDROCK_RUNTIME", "HTTP_PROXY", "HTTPS_PROXY",
      "SKILL_HARNESS_ALLOW_METERED_JUDGE", "SKILL_CHECK_ALLOW_METERED_JUDGE", "NODE_OPTIONS", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES",
    ];
    expect(documented.length).toBeGreaterThan(40);
    for (const name of documented) {
      expect(isQualificationConflictingEnvironmentName(name), name).toBe(true);
      expect(() => sanitizeQualificationEnvironment({}, [name], "remove-and-record"), name).toThrow(/must not allow/i);
    }
    expect(isQualificationConflictingEnvironmentName("PI_CODING_AGENT_DIR")).toBe(false);
    expect(isQualificationConflictingEnvironmentName("HOME")).toBe(false);
  });
});
