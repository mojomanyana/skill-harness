#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.length !== 3 || !isAbsolute(resolve(process.argv[2]))) {
  console.error("usage: node examples/qualification-runner-v1/make-example.mjs <output-directory>");
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const fake = realpathSync(join(here, "fake-pi.cjs"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const hex = (character, size = 64) => character.repeat(size);
const executable = { path: fake, sha256: sha(readFileSync(fake)) };
const arm = (id, kind, model) => ({
  id, kind, provider: "fake", model, authentication: "test-oauth", executable, resources: [],
  arguments: ["@{input_path}"], allowed_environment_names: ["HOME", "PATH", "PI_CODING_AGENT_DIR"],
  timeout_ms: 5000, output_limit_bytes: 65536,
  artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" },
  fallback: false, metered_override: false,
});
const oauthAgentDirectory = join(output, "oauth-agent");
mkdirSync(oauthAgentDirectory, { mode: 0o700 });
chmodSync(oauthAgentDirectory, 0o700);
const authPath = join(oauthAgentDirectory, "auth.json");
writeFileSync(authPath, JSON.stringify({ "openai-codex": { type: "oauth", access: "INERT-TEST-ONLY" } }), { mode: 0o600 });
chmodSync(authPath, 0o600);
const configuration = {
  schema_version: "qualification-config-v1",
  oauth_directory_policy: "qualification-oauth-directory-policy-v2",
  mode: "test",
  product: { repository: "https://example.invalid/inert-product", commit: hex("1", 40), tree: hex("2", 40), checkout_path: output, package_path: fake, package_sha256: hex("3"), package_bytes: 1 },
  engine: { repository: "https://example.invalid/inert-engine", commit: hex("4", 40), tree: hex("5", 40), checkout_path: output, package_paths: { core: fake, adapters: fake, cli: fake, meta: fake }, package_sha256: { core: hex("6"), adapters: hex("7"), cli: hex("8"), meta: hex("9") } },
  producer: { repository: "https://example.invalid/inert-producer", commit: hex("a", 40), tree: hex("b", 40), checkout_path: output, version: "0.0.0-inert", ledger_version: 3, ledger_schema_sha256: hex("a") },
  runner: { version: "qualification-runner-v1", executable, conflicting_parent_environment: "remove-and-record" },
  accounting: { wave_a: { subject: 54, judge: 54 }, complete_program: { subject: 642, judge: 642 }, ceilings: { subject: 700, judge: 700 }, initial: { subject: 0, judge: 0 } },
  arms: [arm("inert-subject", "subject", "fake-luna"), arm("inert-judge", "judge", "fake-sol")],
};
const promptPath = join(output, "inert-prompt.txt");
writeFileSync(promptPath, "INERT PROCESS FIXTURE — NO MODEL\n");
const request = {
  schema_version: "qualification-invocation-request-v1",
  measurement_identity_sha256: hex("c"),
  invocation_id: "inert-calibration-1",
  continuation_authority_sha256: sha("inert-example-continuation-authority"),
  continuation_authority_expires_at: "2099-01-01T00:00:00.000Z",
  scenario: {
    id: "inert-A1", version: "1", stimulus_sha256: hex("d"), rubric_sha256: hex("e"),
    input_path: promptPath, input_sha256: sha(readFileSync(promptPath)), working_directory: output,
  },
  role: "calibration", counts_as_measurement: false,
  arms: { subject: "inert-subject", judge: "inert-judge" }, selected_arm: "inert-subject", repetition: 0,
};
writeFileSync(join(output, "configuration.json"), `${JSON.stringify(configuration, null, 2)}\n`);
writeFileSync(join(output, "request.json"), `${JSON.stringify(request, null, 2)}\n`);
console.log(output);
