import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute } from "node:path";

export const QUALIFICATION_CONFIG_VERSION = "qualification-config-v1" as const;
export const QUALIFICATION_RUNNER_VERSION = "qualification-runner-v1" as const;
export const QUALIFICATION_REQUEST_VERSION = "qualification-invocation-request-v1" as const;

export const QUALIFICATION_ACCOUNTING_POLICY = {
  wave_a: { subject: 54, judge: 54 },
  complete_program: { subject: 642, judge: 642 },
  ceilings: { subject: 700, judge: 700 },
  initial: { subject: 0, judge: 0 },
} as const;

export type QualificationRole =
  | "holdout-author"
  | "holdout-reviewer"
  | "subject"
  | "judge"
  | "calibration"
  | "canary";
export type QualificationArmKind = "subject" | "judge";
export type QualificationConfigMode = "production" | "test";
export type QualificationConflictPolicy = "refuse" | "remove-and-record";

export interface QualificationExecutablePin {
  path: string;
  sha256: string;
}

export interface QualificationRepositoryPin {
  repository: string;
  commit: string;
  tree: string;
}

export interface QualificationProductPin extends QualificationRepositoryPin {
  package_sha256: string;
  package_bytes: number;
}

export interface QualificationEnginePin extends QualificationRepositoryPin {
  package_sha256: { core: string; adapters: string; cli: string; meta: string };
}

export interface QualificationProducerPin extends QualificationRepositoryPin {
  version: string;
  ledger_version: 3;
}

export interface QualificationResourcePin {
  kind: "extension" | "skill" | "system-prompt";
  path: string;
  sha256: string;
}

export interface QualificationArmV1 {
  id: string;
  kind: QualificationArmKind;
  provider: string;
  model: string;
  authentication: "chatgpt-oauth" | "test-oauth";
  executable: QualificationExecutablePin;
  resources: QualificationResourcePin[];
  arguments: string[];
  allowed_environment_names: string[];
  timeout_ms: number;
  output_limit_bytes: number;
  artifact: { type: "pi-jsonl"; relative_path_template: "artifacts/{invocation_id}.jsonl" };
  fallback: false;
  metered_override: false;
}

export interface QualificationConfigV1 {
  schema_version: typeof QUALIFICATION_CONFIG_VERSION;
  mode: QualificationConfigMode;
  product: QualificationProductPin;
  engine: QualificationEnginePin;
  producer: QualificationProducerPin;
  runner: {
    version: typeof QUALIFICATION_RUNNER_VERSION;
    executable: QualificationExecutablePin;
    conflicting_parent_environment: QualificationConflictPolicy;
  };
  accounting: typeof QUALIFICATION_ACCOUNTING_POLICY;
  arms: QualificationArmV1[];
}

export interface QualificationInvocationRequestV1 {
  schema_version: typeof QUALIFICATION_REQUEST_VERSION;
  measurement_identity_sha256: string;
  invocation_id: string;
  scenario: {
    id: string;
    version: string;
    stimulus_sha256: string;
    rubric_sha256: string;
    input_path: string;
    input_sha256: string;
    working_directory: string;
  };
  role: QualificationRole;
  counts_as_measurement: boolean;
  arms: { subject: string; judge: string };
  selected_arm: string;
  repetition: number;
}

const SHA256_RE = /^[a-f0-9]{64}$/i;
const GIT_SHA_RE = /^[a-f0-9]{40}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENV_RE = /^[A-Z_][A-Z0-9_]*$/;
const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;
const ALLOWED_ARGUMENT_PLACEHOLDERS = new Set(["input_path", "scenario_id", "invocation_id", "artifact_path"]);
const PROHIBITED_ARGUMENT_FLAGS = [
  "--api-key", "--provider", "--model", "--models", "--thinking", "--mode", "--print", "-p",
  "--session", "--session-id", "--session-dir", "--continue", "--resume", "--fork",
  "--extension", "-e", "--skill", "--append-system-prompt",
  "--allow-metered-judge",
] as const;

/**
 * Names that can alter provider credentials/routing or inject code into the child.
 * Qualification children start from an allow-list regardless; this predicate also
 * makes a dirty parent shell observable by NAME without ever retaining its value.
 */
export function isQualificationConflictingEnvironmentName(name: string): boolean {
  const upper = name.toUpperCase();
  if (/^(?:LD_|DYLD_)/.test(upper)) return true;
  if (["NODE_OPTIONS", "BASH_ENV", "ENV", "CDPATH", "GIT_SSH_COMMAND", "SSH_ASKPASS"].includes(upper)) return true;
  if (["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"].includes(upper)) return true;
  if (/^SKILL_(?:HARNESS|CHECK)_ALLOW_METERED_JUDGE$/.test(upper)) return true;
  if (/(?:^|_)(?:API_KEY|ACCESS_KEY|SECRET_KEY|BEARER_TOKEN|AUTH_TOKEN|SESSION_TOKEN)$/.test(upper)) return true;
  if (/^(?:HF_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_BEARER_TOKEN_BEDROCK)$/.test(upper)) return true;
  if (/(?:^|_)(?:BASE_URL|ENDPOINT_URL|RESOURCE_NAME|DEPLOYMENT_NAME_MAP|ORGANIZATION|ORG_ID|PROJECT|PROJECT_ID)$/.test(upper)) return true;
  // Provider-prefixed ambient configuration is excluded as a class, not only
  // for today's documented key names. That closes both credentials and routing
  // knobs added by a future Pi/provider release without inheriting them first.
  if (/^(?:OPENAI|AZURE_OPENAI|ANTHROPIC|ANT_LING|FIREWORKS|DEEPSEEK|OPENROUTER|XAI|GOOGLE|GEMINI|VERTEX|BEDROCK|AWS|CLOUDFLARE|TOGETHER|BASETEN|KIMI|MINIMAX|QWEN|XIAOMI|MISTRAL|GROQ|CEREBRAS|NVIDIA|ZAI|OPENCODE|RADIUS|VERCEL|AI_GATEWAY)_/.test(upper)) return true;
  return false;
}

export function sanitizeQualificationEnvironment(
  parent: NodeJS.ProcessEnv,
  allowedNames: readonly string[],
  conflictPolicy: QualificationConflictPolicy,
): { env: NodeJS.ProcessEnv; removed_names: string[] } {
  const unique = new Set<string>();
  for (const rawName of allowedNames) {
    if (typeof rawName !== "string" || !ENV_RE.test(rawName)) throw new Error(`qualification environment name ${JSON.stringify(rawName)} is invalid`);
    if (unique.has(rawName)) throw new Error(`qualification environment allowlist contains duplicate ${rawName}`);
    if (isQualificationConflictingEnvironmentName(rawName)) throw new Error(`qualification environment allowlist must not allow ${rawName}`);
    unique.add(rawName);
  }
  if (conflictPolicy !== "refuse" && conflictPolicy !== "remove-and-record") {
    throw new Error(`qualification conflicting-parent-environment policy is unsupported: ${String(conflictPolicy)}`);
  }
  const conflicts = Object.keys(parent).filter(isQualificationConflictingEnvironmentName).sort();
  if (conflictPolicy === "refuse" && conflicts.length > 0) {
    throw new Error(`conflicting parent environment variables are present: ${conflicts.join(", ")}`);
  }
  const env: NodeJS.ProcessEnv = {};
  for (const name of allowedNames) {
    const value = parent[name];
    if (value !== undefined) env[name] = value;
  }
  return { env, removed_names: conflicts };
}

export function qualificationCanonicalJson(value: unknown): string {
  return stableStringify(value);
}

export function qualificationSha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function qualificationConfigDigest(config: QualificationConfigV1): string {
  return qualificationSha256(qualificationCanonicalJson(config));
}

export function verifyQualificationResource(pin: QualificationResourcePin): { realpath: string; bytes: number; sha256: string } {
  const path = absolutePath(pin.path, "qualification resource.path");
  const expected = digest(pin.sha256, "qualification resource.sha256");
  let stat;
  try { stat = lstatSync(path); }
  catch { throw new Error(`qualification resource does not exist: ${path}`); }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`qualification resource must be a pinned regular non-symlink file: ${path}`);
  const actual = qualificationSha256(readFileSync(path));
  if (actual !== expected) throw new Error(`qualification resource digest mismatch for ${path}: expected ${expected}, got ${actual}`);
  return { realpath: realpathSync(path), bytes: stat.size, sha256: actual };
}

export function verifyQualificationExecutable(pin: QualificationExecutablePin): { realpath: string; bytes: number; sha256: string } {
  const parsed = parseExecutablePin(pin, "executable");
  let stat;
  try {
    stat = lstatSync(parsed.path);
  } catch {
    throw new Error(`qualification executable does not exist: ${parsed.path}`);
  }
  if (stat.isSymbolicLink()) throw new Error(`qualification executable path must be a pinned regular file, not a symlink: ${parsed.path}`);
  if (!stat.isFile()) throw new Error(`qualification executable path is not a regular file: ${parsed.path}`);
  if (process.platform !== "win32" && (stat.mode & 0o111) === 0) throw new Error(`qualification executable is not executable: ${parsed.path}`);
  const digest = qualificationSha256(readFileSync(parsed.path));
  if (digest !== parsed.sha256) throw new Error(`qualification executable digest mismatch for ${parsed.path}: expected ${parsed.sha256}, got ${digest}`);
  return { realpath: realpathSync(parsed.path), bytes: stat.size, sha256: digest };
}

export function parseQualificationConfig(value: unknown): QualificationConfigV1 {
  const root = object(value, "qualification configuration");
  exactKeys(root, ["schema_version", "mode", "product", "engine", "producer", "runner", "accounting", "arms"], "qualification configuration");
  if (root.schema_version !== QUALIFICATION_CONFIG_VERSION) throw new Error(`qualification configuration schema_version must be ${QUALIFICATION_CONFIG_VERSION}`);
  const mode = enumValue(root.mode, ["production", "test"], "qualification configuration mode") as QualificationConfigMode;
  const productObject = object(root.product, "qualification configuration product");
  exactKeys(productObject, ["repository", "commit", "tree", "package_sha256", "package_bytes"], "qualification configuration product");
  const product: QualificationProductPin = {
    ...parseRepositoryPin(productObject, "product"),
    package_sha256: digest(productObject.package_sha256, "product.package_sha256"),
    package_bytes: positiveInteger(productObject.package_bytes, "product.package_bytes"),
  };
  const engineObject = object(root.engine, "qualification configuration engine");
  exactKeys(engineObject, ["repository", "commit", "tree", "package_sha256"], "qualification configuration engine");
  const packageObject = object(engineObject.package_sha256, "engine.package_sha256");
  exactKeys(packageObject, ["core", "adapters", "cli", "meta"], "engine.package_sha256");
  const engine: QualificationEnginePin = {
    ...parseRepositoryPin(engineObject, "engine"),
    package_sha256: {
      core: digest(packageObject.core, "engine.package_sha256.core"),
      adapters: digest(packageObject.adapters, "engine.package_sha256.adapters"),
      cli: digest(packageObject.cli, "engine.package_sha256.cli"),
      meta: digest(packageObject.meta, "engine.package_sha256.meta"),
    },
  };
  const producerObject = object(root.producer, "qualification configuration producer");
  exactKeys(producerObject, ["repository", "commit", "tree", "version", "ledger_version"], "qualification configuration producer");
  if (producerObject.ledger_version !== 3) throw new Error("qualification producer.ledger_version must be 3");
  const producer: QualificationProducerPin = {
    ...parseRepositoryPin(producerObject, "producer"),
    version: nonEmpty(producerObject.version, "producer.version"),
    ledger_version: 3,
  };
  const runnerObject = object(root.runner, "qualification configuration runner");
  exactKeys(runnerObject, ["version", "executable", "conflicting_parent_environment"], "qualification configuration runner");
  if (runnerObject.version !== QUALIFICATION_RUNNER_VERSION) throw new Error(`qualification runner.version must be ${QUALIFICATION_RUNNER_VERSION}`);
  const conflictPolicy = enumValue(runnerObject.conflicting_parent_environment, ["refuse", "remove-and-record"], "runner.conflicting_parent_environment") as QualificationConflictPolicy;

  const accounting = object(root.accounting, "qualification accounting");
  if (qualificationCanonicalJson(accounting) !== qualificationCanonicalJson(QUALIFICATION_ACCOUNTING_POLICY)) {
    throw new Error("qualification accounting must equal the canonical policy (Wave A 54/54, complete 642/642, ceilings 700/700, initial 0/0)");
  }

  if (!Array.isArray(root.arms) || root.arms.length === 0) throw new Error("qualification configuration arms must be a non-empty array");
  const arms = root.arms.map((entry, index) => parseArm(entry, mode, index));
  const ids = new Set<string>();
  const tuples = new Set<string>();
  for (const arm of arms) {
    if (ids.has(arm.id)) throw new Error(`duplicate arm id ${arm.id} in qualification configuration`);
    ids.add(arm.id);
    const tuple = `${arm.kind}\0${arm.provider}\0${arm.model}`;
    if (tuples.has(tuple)) throw new Error(`duplicate arm ${arm.kind}:${arm.provider}:${arm.model} in qualification configuration`);
    tuples.add(tuple);
  }
  if (!arms.some((arm) => arm.kind === "subject") || !arms.some((arm) => arm.kind === "judge")) {
    throw new Error("qualification configuration requires at least one subject arm and one judge arm");
  }

  return {
    schema_version: QUALIFICATION_CONFIG_VERSION,
    mode,
    product,
    engine,
    producer,
    runner: {
      version: QUALIFICATION_RUNNER_VERSION,
      executable: parseExecutablePin(runnerObject.executable, "runner.executable"),
      conflicting_parent_environment: conflictPolicy,
    },
    accounting: structuredClone(QUALIFICATION_ACCOUNTING_POLICY),
    arms,
  };
}

export function parseQualificationRequest(value: unknown, config: QualificationConfigV1): QualificationInvocationRequestV1 {
  const root = object(value, "qualification invocation request");
  exactKeys(root, ["schema_version", "measurement_identity_sha256", "invocation_id", "scenario", "role", "counts_as_measurement", "arms", "selected_arm", "repetition"], "qualification invocation request");
  if (root.schema_version !== QUALIFICATION_REQUEST_VERSION) throw new Error(`qualification request schema_version must be ${QUALIFICATION_REQUEST_VERSION}`);
  const scenarioObject = object(root.scenario, "qualification request scenario");
  exactKeys(scenarioObject, ["id", "version", "stimulus_sha256", "rubric_sha256", "input_path", "input_sha256", "working_directory"], "qualification request scenario");
  const armsObject = object(root.arms, "qualification request arms");
  exactKeys(armsObject, ["subject", "judge"], "qualification request arms");
  const role = enumValue(root.role, ["holdout-author", "holdout-reviewer", "subject", "judge", "calibration", "canary"], "qualification role") as QualificationRole;
  if (typeof root.counts_as_measurement !== "boolean") throw new Error("qualification counts_as_measurement must be boolean");
  if ((role === "holdout-author" || role === "holdout-reviewer") && root.counts_as_measurement) {
    throw new Error(`${role} calls must be recorded as non-measurement`);
  }
  const subjectArm = identifier(armsObject.subject, "qualification request subject arm");
  const judgeArm = identifier(armsObject.judge, "qualification request judge arm");
  const selectedArm = identifier(root.selected_arm, "qualification request selected arm");
  const selected = config.arms.find((arm) => arm.id === selectedArm);
  if (!selected) throw new Error(`qualification request selected arm ${selectedArm} is not declared`);
  if (!config.arms.some((arm) => arm.id === subjectArm && arm.kind === "subject")) throw new Error(`qualification request subject arm ${subjectArm} is not a declared subject arm`);
  if (!config.arms.some((arm) => arm.id === judgeArm && arm.kind === "judge")) throw new Error(`qualification request judge arm ${judgeArm} is not a declared judge arm`);
  if (role === "subject" && (selectedArm !== subjectArm || selected.kind !== "subject")) throw new Error("qualification subject role must select the request's subject arm");
  if (role === "judge" && (selectedArm !== judgeArm || selected.kind !== "judge")) throw new Error("qualification judge role must select the request's judge arm");
  if (![subjectArm, judgeArm].includes(selectedArm)) throw new Error("qualification selected arm must be the bound subject or judge arm");
  const inputPath = absolutePath(scenarioObject.input_path, "scenario.input_path");
  const workingDirectory = absolutePath(scenarioObject.working_directory, "scenario.working_directory");
  return {
    schema_version: QUALIFICATION_REQUEST_VERSION,
    measurement_identity_sha256: digest(root.measurement_identity_sha256, "measurement_identity_sha256"),
    invocation_id: identifier(root.invocation_id, "invocation_id"),
    scenario: {
      id: identifier(scenarioObject.id, "scenario.id"),
      version: identifier(scenarioObject.version, "scenario.version"),
      stimulus_sha256: digest(scenarioObject.stimulus_sha256, "scenario.stimulus_sha256"),
      rubric_sha256: digest(scenarioObject.rubric_sha256, "scenario.rubric_sha256"),
      input_path: inputPath,
      input_sha256: digest(scenarioObject.input_sha256, "scenario.input_sha256"),
      working_directory: workingDirectory,
    },
    role,
    counts_as_measurement: root.counts_as_measurement,
    arms: { subject: subjectArm, judge: judgeArm },
    selected_arm: selectedArm,
    repetition: nonNegativeInteger(root.repetition, "repetition"),
  };
}

function parseArm(value: unknown, mode: QualificationConfigMode, index: number): QualificationArmV1 {
  const ctx = `qualification arm ${index}`;
  const arm = object(value, ctx);
  exactKeys(arm, ["id", "kind", "provider", "model", "authentication", "executable", "resources", "arguments", "allowed_environment_names", "timeout_ms", "output_limit_bytes", "artifact", "fallback", "metered_override"], ctx);
  const kind = enumValue(arm.kind, ["subject", "judge"], `${ctx}.kind`) as QualificationArmKind;
  const provider = nonEmpty(arm.provider, `${ctx}.provider`);
  const model = nonEmpty(arm.model, `${ctx}.model`);
  if (provider === "openai") throw new Error(`${ctx} direct openai provider is prohibited`);
  const authentication = enumValue(arm.authentication, ["chatgpt-oauth", "test-oauth"], `${ctx}.authentication`) as QualificationArmV1["authentication"];
  if (mode === "production" && (provider !== "openai-codex" || authentication !== "chatgpt-oauth")) {
    throw new Error(`${ctx} production qualification requires exact provider openai-codex and ChatGPT OAuth`);
  }
  const allowedProductionModels = kind === "subject" ? new Set(["gpt-5.6-luna", "gpt-5.6-terra"]) : new Set(["gpt-5.6-sol"]);
  if (mode === "production" && !allowedProductionModels.has(model)) {
    throw new Error(`${ctx} production ${kind} model must be an exact Principal qualification model (${[...allowedProductionModels].join(", ")}); provider-qualified aliases and fallbacks are prohibited`);
  }
  if (mode === "test" && (provider !== "fake" || authentication !== "test-oauth")) {
    throw new Error(`${ctx} test configuration permits only the inert fake provider and test-oauth metadata`);
  }
  if (arm.fallback !== false) throw new Error(`${ctx}.fallback must be false`);
  if (arm.metered_override !== false) throw new Error(`${ctx}.metered_override must be false`);
  if (!Array.isArray(arm.resources)) throw new Error(`${ctx}.resources must be an array`);
  const resources = arm.resources.map((entry, resourceIndex) => {
    const resource = object(entry, `${ctx}.resources[${resourceIndex}]`);
    exactKeys(resource, ["kind", "path", "sha256"], `${ctx}.resources[${resourceIndex}]`);
    return {
      kind: enumValue(resource.kind, ["extension", "skill", "system-prompt"], `${ctx}.resources[${resourceIndex}].kind`) as QualificationResourcePin["kind"],
      path: absolutePath(resource.path, `${ctx}.resources[${resourceIndex}].path`),
      sha256: digest(resource.sha256, `${ctx}.resources[${resourceIndex}].sha256`),
    };
  });
  const resourceKeys = resources.map((resource) => `${resource.kind}\0${resource.path}`);
  if (new Set(resourceKeys).size !== resourceKeys.length) throw new Error(`${ctx}.resources contains a duplicate kind/path`);
  if (!Array.isArray(arm.arguments) || arm.arguments.some((entry) => typeof entry !== "string")) throw new Error(`${ctx}.arguments must be an array of strings`);
  const argumentsList = arm.arguments as string[];
  const lowerArgs = argumentsList.map((entry) => entry.toLowerCase());
  const prohibited = PROHIBITED_ARGUMENT_FLAGS.find((flag) => lowerArgs.some((entry) => entry === flag || entry.startsWith(`${flag}=`)));
  if (prohibited) throw new Error(`${ctx}.arguments must not supply ${prohibited}; the runner binds provider/model/auth policy`);
  const placeholders = argumentsList.flatMap((entry) => [...entry.matchAll(PLACEHOLDER_RE)].map((match) => match[1]));
  const unknownPlaceholder = placeholders.find((name) => !ALLOWED_ARGUMENT_PLACEHOLDERS.has(name));
  if (unknownPlaceholder) throw new Error(`${ctx}.arguments contains unknown placeholder {${unknownPlaceholder}}`);
  if (!placeholders.includes("input_path")) throw new Error(`${ctx}.arguments must contain {input_path}`);
  if (!Array.isArray(arm.allowed_environment_names)) throw new Error(`${ctx}.allowed_environment_names must be an array`);
  // Validation is intentionally shared with launch-time sanitation, including
  // the sensitive-name and duplicate guards.
  sanitizeQualificationEnvironment({}, arm.allowed_environment_names as string[], "remove-and-record");
  if (mode === "production" && !(arm.allowed_environment_names as string[]).some((name) => name === "HOME" || name === "PI_CODING_AGENT_DIR")) {
    throw new Error(`${ctx}.allowed_environment_names must include HOME or PI_CODING_AGENT_DIR for the dedicated OAuth credential store`);
  }
  const artifact = object(arm.artifact, `${ctx}.artifact`);
  exactKeys(artifact, ["type", "relative_path_template"], `${ctx}.artifact`);
  if (artifact.type !== "pi-jsonl") throw new Error(`${ctx}.artifact.type must be pi-jsonl`);
  if (artifact.relative_path_template !== "artifacts/{invocation_id}.jsonl") {
    throw new Error(`${ctx}.artifact.relative_path_template must be artifacts/{invocation_id}.jsonl`);
  }
  return {
    id: identifier(arm.id, `${ctx}.id`),
    kind,
    provider,
    model,
    authentication,
    executable: parseExecutablePin(arm.executable, `${ctx}.executable`),
    resources,
    arguments: [...argumentsList],
    allowed_environment_names: [...arm.allowed_environment_names as string[]],
    timeout_ms: boundedInteger(arm.timeout_ms, 1, 24 * 60 * 60 * 1000, `${ctx}.timeout_ms`),
    output_limit_bytes: boundedInteger(arm.output_limit_bytes, 1, 100 * 1024 * 1024, `${ctx}.output_limit_bytes`),
    artifact: { type: "pi-jsonl", relative_path_template: "artifacts/{invocation_id}.jsonl" },
    fallback: false,
    metered_override: false,
  };
}

function parseRepositoryPin(value: Record<string, unknown>, ctx: string): QualificationRepositoryPin {
  return {
    repository: nonEmpty(value.repository, `${ctx}.repository`),
    commit: gitSha(value.commit, `${ctx}.commit`),
    tree: gitSha(value.tree, `${ctx}.tree`),
  };
}

function parseExecutablePin(value: unknown, ctx: string): QualificationExecutablePin {
  const objectValue = object(value, ctx);
  exactKeys(objectValue, ["path", "sha256"], ctx);
  return { path: absolutePath(objectValue.path, `${ctx}.path`), sha256: digest(objectValue.sha256, `${ctx}.sha256`) };
}

function object(value: unknown, ctx: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${ctx} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${ctx} must be a plain object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], ctx: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${ctx} contains unknown field ${unknown}`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${ctx} is missing required field ${missing}`);
}

function nonEmpty(value: unknown, ctx: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${ctx} must be a non-empty string`);
  return value;
}
function identifier(value: unknown, ctx: string): string {
  const text = nonEmpty(value, ctx);
  if (!ID_RE.test(text)) throw new Error(`${ctx} must be a bounded ASCII identifier`);
  return text;
}
function digest(value: unknown, ctx: string): string {
  const text = nonEmpty(value, ctx);
  if (!SHA256_RE.test(text)) throw new Error(`${ctx} must be a 64-character SHA-256 hex digest`);
  return text.toLowerCase();
}
function gitSha(value: unknown, ctx: string): string {
  const text = nonEmpty(value, ctx);
  if (!GIT_SHA_RE.test(text)) throw new Error(`${ctx} must be a pinned 40-character Git object id`);
  return text.toLowerCase();
}
function absolutePath(value: unknown, ctx: string): string {
  const text = nonEmpty(value, ctx);
  if (!isAbsolute(text)) throw new Error(`${ctx} must be an absolute path`);
  return text;
}
function positiveInteger(value: unknown, ctx: string): number { return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER, ctx); }
function nonNegativeInteger(value: unknown, ctx: string): number { return boundedInteger(value, 0, Number.MAX_SAFE_INTEGER, ctx); }
function boundedInteger(value: unknown, min: number, max: number, ctx: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`${ctx} must be an integer in [${min}, ${max}]`);
  return Number(value);
}
function enumValue(value: unknown, allowed: readonly string[], ctx: string): string {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${ctx} must be one of ${allowed.join(", ")}`);
  return value;
}
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}
