import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, realpathSync, type Stats } from "node:fs";
import { isAbsolute, join } from "node:path";
import { QUALIFICATION_JUDGE_PANEL_POLICY } from "./qualification-panels.js";

export const QUALIFICATION_CONFIG_VERSION = "qualification-config-v1" as const;
export const QUALIFICATION_RUNNER_VERSION = "qualification-runner-v1" as const;
export const QUALIFICATION_REQUEST_VERSION = "qualification-invocation-request-v1" as const;
export const QUALIFICATION_BOARD_VERSION = "qualification-board-v1" as const;
export const QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3 = "qualification-terminal-receipt-v3" as const;
/** Historical configurations omit this field and retain the original closed policy. */
export const QUALIFICATION_OAUTH_DIRECTORY_POLICY_V1 = "qualification-oauth-directory-policy-v1" as const;
/** New qualification configurations select this policy explicitly. */
export const QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 = "qualification-oauth-directory-policy-v2" as const;
export type QualificationOAuthDirectoryPolicy =
  | typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V1
  | typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
export const PRINCIPAL_QUALIFICATION_PRODUCT_PIN = {
  repository: "https://github.com/mojomanyana/principal-pi-skills",
  commit: "a6596950d64a3a525f95329d5dbd3e38948be408",
  tree: "960359d69deb6f216724b86e13eef67e2f6a6aa1",
  package_sha256: "3677f76fb31dcaf6a28c9e8b9cf9d6358f998b78bd370f0a0f250d05e136fcc8",
  package_bytes: 110168,
} as const;
/** Immutable pi-daddy ledger-v3 producer merge head. */
export const PI_DADDY_QUALIFICATION_PRODUCER_PIN = {
  repository: "https://github.com/mojomanyana/pi-daddy",
  commit: "4a9524394ca995fd74ed9bbb836dc4e73cda3b8c",
  tree: "7c006bff213142634f0f911ba9bd6add363ecaae",
  version: "0.21.1",
  ledger_version: 3,
  ledger_schema_sha256: "64e3d875e74bc32fa43fb96892605548259cd16f6ed6678646d73cc56280c511",
} as const;

export const QUALIFICATION_ACCOUNTING_POLICY = {
  wave_a: { subject: 54, judge: 54 },
  complete_program: { subject: 642, judge: 642 },
  ceilings: { subject: 700, judge: 700 },
  initial: { subject: 0, judge: 0 },
} as const;

/** Prospective call ceilings for the universal two-plus-conditional-third panel. */
export const QUALIFICATION_PANEL_ACCOUNTING_POLICY = {
  wave_a: { subject: 54, judge: 162 },
  complete_program: { subject: 642, judge: 1926 },
  ceilings: { subject: 700, judge: 2100 },
  initial: { subject: 0, judge: 0 },
} as const;
export type QualificationAccountingPolicy =
  | typeof QUALIFICATION_ACCOUNTING_POLICY
  | typeof QUALIFICATION_PANEL_ACCOUNTING_POLICY;

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
  checkout_path: string;
  package_path: string;
  package_sha256: string;
  package_bytes: number;
}

export interface QualificationEnginePin extends QualificationRepositoryPin {
  checkout_path: string;
  package_paths: { core: string; adapters: string; cli: string; meta: string };
  package_sha256: { core: string; adapters: string; cli: string; meta: string };
}

export interface QualificationProducerPin extends QualificationRepositoryPin {
  checkout_path: string;
  version: string;
  ledger_version: 3;
  ledger_schema_sha256: string;
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

export interface QualificationBoardV1 {
  schema_version: typeof QUALIFICATION_BOARD_VERSION;
  read_only: true;
  cells: {
    id: string;
    scenario_id: string;
    measurement_identity_sha256: string;
    scenario_version: string;
    stimulus_sha256: string;
    rubric_sha256: string;
    subject_input_sha256: string;
    subject_arm: string;
    judge_arms: [string, string, string];
    panels: { id: string; repetition: number }[];
    critical: boolean;
    pass_threshold: number;
  }[];
}

export interface QualificationConfigV1 {
  schema_version: typeof QUALIFICATION_CONFIG_VERSION;
  /** Omission is the historical v1 policy and is preserved in canonical digests. */
  oauth_directory_policy?: typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  /** Omission preserves historical v1/v2 terminal-receipt selection. */
  terminal_receipt_version?: typeof QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3;
  /** Omission preserves the historical single-draw judge methodology. */
  judge_panel?: typeof QUALIFICATION_JUDGE_PANEL_POLICY;
  /** Externally approved board authority; required with judge_panel. */
  board?: QualificationBoardV1;
  mode: QualificationConfigMode;
  product: QualificationProductPin;
  engine: QualificationEnginePin;
  producer: QualificationProducerPin;
  runner: {
    version: typeof QUALIFICATION_RUNNER_VERSION;
    executable: QualificationExecutablePin;
    conflicting_parent_environment: QualificationConflictPolicy;
  };
  accounting: QualificationAccountingPolicy;
  arms: QualificationArmV1[];
}

export interface QualificationInvocationRequestV1 {
  schema_version: typeof QUALIFICATION_REQUEST_VERSION;
  measurement_identity_sha256: string;
  invocation_id: string;
  continuation_authority_sha256: string;
  continuation_authority_expires_at: string;
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
  /** Present only for judge calls under the prospective panel policy. */
  panel?: {
    id: string;
    member_ordinal: 1 | 2 | 3;
    subject_invocation_id: string;
    subject_artifact_sha256: string;
  };
}

const SHA256_RE = /^[a-f0-9]{64}$/i;
const GIT_SHA_RE = /^[a-f0-9]{40}$/i;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ENV_RE = /^[A-Z_][A-Z0-9_]*$/;
const PLACEHOLDER_RE = /\{([a-z_]+)\}/g;
const ALLOWED_ARGUMENT_PLACEHOLDERS = new Set(["input_path", "scenario_id", "invocation_id", "artifact_path"]);

/**
 * Names that can alter provider credentials/routing or inject code into the child.
 * Qualification children start from an allow-list regardless; this predicate also
 * makes a dirty parent shell observable by NAME without ever retaining its value.
 */
export function isQualificationConflictingEnvironmentName(name: string): boolean {
  const upper = name.toUpperCase();
  if (/^(?:LD_|DYLD_)/.test(upper)) return true;
  if (upper.startsWith("PI_") && upper !== "PI_CODING_AGENT_DIR") return true;
  if (["NODE_OPTIONS", "BASH_ENV", "ENV", "CDPATH", "GIT_SSH_COMMAND", "SSH_ASKPASS"].includes(upper)) return true;
  if (["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"].includes(upper)) return true;
  if (/^SKILL_(?:HARNESS|CHECK)_ALLOW_METERED_JUDGE$/.test(upper)) return true;
  if (/(?:^|_)(?:API_KEY|ACCESS_KEY|SECRET_KEY|BEARER_TOKEN|AUTH_TOKEN|SESSION_TOKEN)$/.test(upper)) return true;
  if (/^(?:HF_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_BEARER_TOKEN_BEDROCK)$/.test(upper)) return true;
  if (/(?:^|_)(?:BASE_URL|ENDPOINT_URL|RESOURCE_NAME|DEPLOYMENT_NAME_MAP|ORGANIZATION|ORG_ID|PROJECT|PROJECT_ID)$/.test(upper)) return true;
  // Provider-prefixed ambient configuration is excluded as a class, not only
  // for today's documented key names. That closes both credentials and routing
  // knobs added by a future Pi/provider release without inheriting them first.
  if (/^(?:OPENAI|AZURE_OPENAI|CODEX|CHATGPT|ANTHROPIC|ANT_LING|FIREWORKS|DEEPSEEK|OPENROUTER|XAI|GOOGLE|GEMINI|VERTEX|BEDROCK|AWS|CLOUDFLARE|TOGETHER|BASETEN|KIMI|MINIMAX|QWEN|XIAOMI|MISTRAL|GROQ|CEREBRAS|NVIDIA|ZAI|OPENCODE|RADIUS|VERCEL|AI_GATEWAY)_/.test(upper)) return true;
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

export function qualificationOAuthDirectoryPolicy(config: QualificationConfigV1): QualificationOAuthDirectoryPolicy {
  return config.oauth_directory_policy ?? QUALIFICATION_OAUTH_DIRECTORY_POLICY_V1;
}

export function verifyQualificationPins(config: QualificationConfigV1): void {
  verifyQualificationExecutable(config.runner.executable);
  for (const arm of config.arms) {
    verifyQualificationExecutable(arm.executable);
    for (const resource of arm.resources) verifyQualificationResource(resource);
  }
  if (config.mode !== "production") return;
  if (process.platform !== "linux") throw new Error("qualification production execution requires Linux process-occurrence and process-group identity support");
  verifyRepository(config.product, "product");
  verifyRepository(config.engine, "engine");
  verifyRepository(config.producer, "producer");
  verifyFileIdentity(config.product.package_path, config.product.package_sha256, config.product.package_bytes, "product package");
  for (const name of ["core", "adapters", "cli", "meta"] as const) {
    verifyFileIdentity(config.engine.package_paths[name], config.engine.package_sha256[name], undefined, `engine ${name} package`);
  }
  const producerPackagePath = join(config.producer.checkout_path, "packages", "pi-daddy", "package.json");
  let producerPackage: unknown;
  try { producerPackage = JSON.parse(readFileSync(producerPackagePath, "utf8")); }
  catch { throw new Error("qualification producer package.json is missing or invalid"); }
  const producerManifest = object(producerPackage, "qualification producer package.json");
  if (producerManifest.version !== config.producer.version) throw new Error("qualification producer package version does not match its pin");
  verifyFileIdentity(
    join(config.producer.checkout_path, "packages", "pi-daddy", "contracts", "ledger", "v3", "ledger-event.schema.json"),
    config.producer.ledger_schema_sha256,
    undefined,
    "producer ledger-v3 schema",
  );
}

function verifyRepository(pin: QualificationRepositoryPin & { checkout_path: string }, label: string): void {
  let checkoutStat: Stats;
  try { checkoutStat = lstatSync(pin.checkout_path); }
  catch { throw new Error(`qualification ${label} checkout is missing`); }
  if (checkoutStat.isSymbolicLink() || !checkoutStat.isDirectory()) throw new Error(`qualification ${label} checkout must be a regular non-symlink directory`);
  let head: string, tree: string, dirty: string, remote: string;
  try {
    const gitOptions = { encoding: "utf8" as const, timeout: 30_000, killSignal: "SIGKILL" as const };
    head = execFileSync("git", ["-C", pin.checkout_path, "rev-parse", "HEAD"], gitOptions).trim();
    tree = execFileSync("git", ["-C", pin.checkout_path, "rev-parse", "HEAD^{tree}"], gitOptions).trim();
    dirty = execFileSync("git", ["-C", pin.checkout_path, "status", "--porcelain=v1", "--untracked-files=all"], gitOptions).trim();
    remote = execFileSync("git", ["-C", pin.checkout_path, "remote", "get-url", "origin"], gitOptions).trim();
  } catch { throw new Error(`qualification ${label} checkout is not a readable pinned Git repository`); }
  const finalStat = lstatSync(pin.checkout_path);
  if (finalStat.isSymbolicLink() || finalStat.dev !== checkoutStat.dev || finalStat.ino !== checkoutStat.ino) throw new Error(`qualification ${label} checkout identity changed while it was verified`);
  if (head !== pin.commit || tree !== pin.tree) throw new Error(`qualification ${label} checkout commit/tree does not match its pin`);
  if (dirty) throw new Error(`qualification ${label} checkout must be clean`);
  if (repositorySlug(remote) !== repositorySlug(pin.repository)) throw new Error(`qualification ${label} checkout origin does not match its repository pin`);
}

function repositorySlug(value: string): string {
  const match = /github\.com(?::|\/)([^/]+\/[^/#]+?)(?:\.git)?$/i.exec(value.replace(/^git\+/, ""));
  if (!match) throw new Error(`qualification repository URL is not a pinned GitHub repository: ${value}`);
  return match[1].replace(/\.git$/i, "").toLowerCase();
}

function readPinnedRegularFile(path: string, label: string): { bytes: Buffer; stat: Stats; realpath: string } {
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    const pathStat = lstatSync(path);
    if (!stat.isFile() || pathStat.isSymbolicLink() || !pathStat.isFile() || stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
      throw new Error(`qualification ${label} must be a stable regular non-symlink file`);
    }
    const bytes = readFileSync(fd);
    const resolved = realpathSync(path);
    const finalStat = lstatSync(path);
    if (finalStat.isSymbolicLink() || finalStat.dev !== stat.dev || finalStat.ino !== stat.ino) throw new Error(`qualification ${label} path changed while it was verified`);
    return { bytes, stat, realpath: resolved };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`qualification ${label}`)) throw error;
    throw new Error(`qualification ${label} is missing or unreadable: ${path}`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function verifyFileIdentity(path: string, expectedSha256: string, expectedBytes: number | undefined, label: string): void {
  const opened = readPinnedRegularFile(path, label);
  if (expectedBytes !== undefined && opened.stat.size !== expectedBytes) throw new Error(`qualification ${label} byte size does not match its pin`);
  const actual = qualificationSha256(opened.bytes);
  if (actual !== expectedSha256) throw new Error(`qualification ${label} digest does not match its pin`);
}

export function verifyQualificationResource(pin: QualificationResourcePin): { realpath: string; bytes: number; sha256: string } {
  const path = absolutePath(pin.path, "qualification resource.path");
  const expected = digest(pin.sha256, "qualification resource.sha256");
  const opened = readPinnedRegularFile(path, "resource");
  const actual = qualificationSha256(opened.bytes);
  if (actual !== expected) throw new Error(`qualification resource digest mismatch for ${path}: expected ${expected}, got ${actual}`);
  return { realpath: opened.realpath, bytes: opened.stat.size, sha256: actual };
}

export function verifyQualificationExecutable(pin: QualificationExecutablePin): { realpath: string; bytes: number; sha256: string; device: number; inode: number; mtime_ms: number } {
  const parsed = parseExecutablePin(pin, "executable");
  const opened = readPinnedRegularFile(parsed.path, "executable");
  if (process.platform !== "win32" && (opened.stat.mode & 0o111) === 0) throw new Error(`qualification executable is not executable: ${parsed.path}`);
  const digest = qualificationSha256(opened.bytes);
  if (digest !== parsed.sha256) throw new Error(`qualification executable digest mismatch for ${parsed.path}: expected ${parsed.sha256}, got ${digest}`);
  return { realpath: opened.realpath, bytes: opened.stat.size, sha256: digest, device: opened.stat.dev, inode: opened.stat.ino, mtime_ms: opened.stat.mtimeMs };
}

export function parseQualificationConfig(value: unknown): QualificationConfigV1 {
  const root = object(value, "qualification configuration");
  exactKeys(
    root,
    ["schema_version", "mode", "product", "engine", "producer", "runner", "accounting", "arms"],
    "qualification configuration",
    ["oauth_directory_policy", "terminal_receipt_version", "judge_panel", "board"],
  );
  if (root.schema_version !== QUALIFICATION_CONFIG_VERSION) throw new Error(`qualification configuration schema_version must be ${QUALIFICATION_CONFIG_VERSION}`);
  const oauthDirectoryPolicy = Object.hasOwn(root, "oauth_directory_policy")
    ? enumValue(root.oauth_directory_policy, [QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2], "qualification oauth_directory_policy") as typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2
    : undefined;
  const terminalReceiptVersion = Object.hasOwn(root, "terminal_receipt_version")
    ? enumValue(root.terminal_receipt_version, [QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3], "qualification terminal_receipt_version") as typeof QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3
    : undefined;
  const judgePanel = Object.hasOwn(root, "judge_panel")
    ? parseCanonicalJudgePanelPolicy(root.judge_panel)
    : undefined;
  const board = Object.hasOwn(root, "board") ? parseQualificationBoard(root.board) : undefined;
  if (terminalReceiptVersion && oauthDirectoryPolicy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) throw new Error("qualification terminal receipt v3 requires oauth_directory_policy v2");
  if (judgePanel && terminalReceiptVersion !== QUALIFICATION_TERMINAL_RECEIPT_VERSION_V3) throw new Error("qualification judge_panel requires terminal_receipt_version v3 and oauth_directory_policy v2");
  if (judgePanel && !board) throw new Error("qualification judge_panel requires an externally approved read-only board");
  if (!judgePanel && board) throw new Error("qualification board requires judge_panel");
  const mode = enumValue(root.mode, ["production", "test"], "qualification configuration mode") as QualificationConfigMode;
  const productObject = object(root.product, "qualification configuration product");
  exactKeys(productObject, ["repository", "commit", "tree", "checkout_path", "package_path", "package_sha256", "package_bytes"], "qualification configuration product");
  const product: QualificationProductPin = {
    ...parseRepositoryPin(productObject, "product"),
    checkout_path: absolutePath(productObject.checkout_path, "product.checkout_path"),
    package_path: absolutePath(productObject.package_path, "product.package_path"),
    package_sha256: digest(productObject.package_sha256, "product.package_sha256"),
    package_bytes: positiveInteger(productObject.package_bytes, "product.package_bytes"),
  };
  const engineObject = object(root.engine, "qualification configuration engine");
  exactKeys(engineObject, ["repository", "commit", "tree", "checkout_path", "package_paths", "package_sha256"], "qualification configuration engine");
  const packageObject = object(engineObject.package_sha256, "engine.package_sha256");
  exactKeys(packageObject, ["core", "adapters", "cli", "meta"], "engine.package_sha256");
  const packagePaths = object(engineObject.package_paths, "engine.package_paths");
  exactKeys(packagePaths, ["core", "adapters", "cli", "meta"], "engine.package_paths");
  const engine: QualificationEnginePin = {
    ...parseRepositoryPin(engineObject, "engine"),
    checkout_path: absolutePath(engineObject.checkout_path, "engine.checkout_path"),
    package_paths: {
      core: absolutePath(packagePaths.core, "engine.package_paths.core"),
      adapters: absolutePath(packagePaths.adapters, "engine.package_paths.adapters"),
      cli: absolutePath(packagePaths.cli, "engine.package_paths.cli"),
      meta: absolutePath(packagePaths.meta, "engine.package_paths.meta"),
    },
    package_sha256: {
      core: digest(packageObject.core, "engine.package_sha256.core"),
      adapters: digest(packageObject.adapters, "engine.package_sha256.adapters"),
      cli: digest(packageObject.cli, "engine.package_sha256.cli"),
      meta: digest(packageObject.meta, "engine.package_sha256.meta"),
    },
  };
  const producerObject = object(root.producer, "qualification configuration producer");
  exactKeys(producerObject, ["repository", "commit", "tree", "checkout_path", "version", "ledger_version", "ledger_schema_sha256"], "qualification configuration producer");
  if (producerObject.ledger_version !== 3) throw new Error("qualification producer.ledger_version must be 3");
  const producer: QualificationProducerPin = {
    ...parseRepositoryPin(producerObject, "producer"),
    checkout_path: absolutePath(producerObject.checkout_path, "producer.checkout_path"),
    version: nonEmpty(producerObject.version, "producer.version"),
    ledger_version: 3,
    ledger_schema_sha256: digest(producerObject.ledger_schema_sha256, "producer.ledger_schema_sha256"),
  };
  if (mode === "production") {
    const productIdentity = {
      repository: product.repository, commit: product.commit, tree: product.tree, package_sha256: product.package_sha256, package_bytes: product.package_bytes,
    };
    if (qualificationCanonicalJson(productIdentity) !== qualificationCanonicalJson(PRINCIPAL_QUALIFICATION_PRODUCT_PIN)) {
      throw new Error("qualification production product pin does not match the authorized principal-pi-skills commit/tree/package identity");
    }
    const producerIdentity = {
      repository: producer.repository, commit: producer.commit, tree: producer.tree, version: producer.version, ledger_version: producer.ledger_version,
      ledger_schema_sha256: producer.ledger_schema_sha256,
    };
    if (qualificationCanonicalJson(producerIdentity) !== qualificationCanonicalJson(PI_DADDY_QUALIFICATION_PRODUCER_PIN)) {
      throw new Error("qualification production producer pin does not match the authorized pi-daddy ledger-v3 identity");
    }
    if (repositorySlug(engine.repository) !== "mojomanyana/skill-harness") throw new Error("qualification production engine repository must be mojomanyana/skill-harness");
  }
  const runnerObject = object(root.runner, "qualification configuration runner");
  exactKeys(runnerObject, ["version", "executable", "conflicting_parent_environment"], "qualification configuration runner");
  if (runnerObject.version !== QUALIFICATION_RUNNER_VERSION) throw new Error(`qualification runner.version must be ${QUALIFICATION_RUNNER_VERSION}`);
  const conflictPolicy = enumValue(runnerObject.conflicting_parent_environment, ["refuse", "remove-and-record"], "runner.conflicting_parent_environment") as QualificationConflictPolicy;

  const accounting = object(root.accounting, "qualification accounting");
  const expectedAccounting: QualificationAccountingPolicy = judgePanel
    ? QUALIFICATION_PANEL_ACCOUNTING_POLICY
    : QUALIFICATION_ACCOUNTING_POLICY;
  if (qualificationCanonicalJson(accounting) !== qualificationCanonicalJson(expectedAccounting)) {
    throw new Error(judgePanel
      ? "qualification accounting must equal the canonical panel policy (Wave A 54/162, complete 642/1926, ceilings 700/2100, initial 0/0)"
      : "qualification accounting must equal the canonical policy (Wave A 54/54, complete 642/642, ceilings 700/700, initial 0/0)");
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
  if (board) {
    for (const cell of board.cells) {
      if (!arms.some((arm) => arm.id === cell.subject_arm && arm.kind === "subject")) throw new Error(`qualification board cell ${cell.id} names undeclared subject arm ${cell.subject_arm}`);
      for (const judgeArm of cell.judge_arms) if (!arms.some((arm) => arm.id === judgeArm && arm.kind === "judge")) throw new Error(`qualification board cell ${cell.id} names undeclared judge arm ${judgeArm}`);
    }
  }

  return {
    schema_version: QUALIFICATION_CONFIG_VERSION,
    ...(oauthDirectoryPolicy ? { oauth_directory_policy: oauthDirectoryPolicy } : {}),
    ...(terminalReceiptVersion ? { terminal_receipt_version: terminalReceiptVersion } : {}),
    ...(judgePanel ? { judge_panel: judgePanel } : {}),
    ...(board ? { board } : {}),
    mode,
    product,
    engine,
    producer,
    runner: {
      version: QUALIFICATION_RUNNER_VERSION,
      executable: parseExecutablePin(runnerObject.executable, "runner.executable"),
      conflicting_parent_environment: conflictPolicy,
    },
    accounting: structuredClone(expectedAccounting),
    arms,
  };
}

export function parseQualificationRequest(value: unknown, config: QualificationConfigV1): QualificationInvocationRequestV1 {
  const root = object(value, "qualification invocation request");
  exactKeys(root, ["schema_version", "measurement_identity_sha256", "invocation_id", "continuation_authority_sha256", "continuation_authority_expires_at", "scenario", "role", "counts_as_measurement", "arms", "selected_arm", "repetition"], "qualification invocation request", ["panel"]);
  if (root.schema_version !== QUALIFICATION_REQUEST_VERSION) throw new Error(`qualification request schema_version must be ${QUALIFICATION_REQUEST_VERSION}`);
  const scenarioObject = object(root.scenario, "qualification request scenario");
  exactKeys(scenarioObject, ["id", "version", "stimulus_sha256", "rubric_sha256", "input_path", "input_sha256", "working_directory"], "qualification request scenario");
  const armsObject = object(root.arms, "qualification request arms");
  exactKeys(armsObject, ["subject", "judge"], "qualification request arms");
  const role = enumValue(root.role, ["holdout-author", "holdout-reviewer", "subject", "judge", "calibration", "canary"], "qualification role") as QualificationRole;
  if (typeof root.counts_as_measurement !== "boolean") throw new Error("qualification counts_as_measurement must be boolean");
  const requiredMeasurement = role === "subject" || role === "judge";
  if (root.counts_as_measurement !== requiredMeasurement) {
    throw new Error(`qualification ${role} calls must be recorded as ${requiredMeasurement ? "measurement" : "non-measurement"}`);
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
  if (config.board && role === "subject" && !config.board.cells.some((cell) =>
    boardCellMatchesRequest(cell, root, scenarioObject, subjectArm) &&
    cell.subject_input_sha256 === String(scenarioObject.input_sha256).toLowerCase() &&
    cell.panels.some((panel) => panel.repetition === root.repetition))) {
    throw new Error("qualification subject request identity/input is not declared by the approved board");
  }
  let panel: QualificationInvocationRequestV1["panel"];
  if (Object.hasOwn(root, "panel")) {
    if (!config.judge_panel) throw new Error("qualification request panel metadata requires a judge_panel configuration");
    if (role !== "judge") throw new Error("qualification request panel metadata is valid only for judge role");
    const panelObject = object(root.panel, "qualification request panel");
    exactKeys(panelObject, ["id", "member_ordinal", "subject_invocation_id", "subject_artifact_sha256"], "qualification request panel");
    const ordinal = boundedInteger(panelObject.member_ordinal, 1, 3, "qualification request panel.member_ordinal") as 1 | 2 | 3;
    panel = {
      id: identifier(panelObject.id, "qualification request panel.id"),
      member_ordinal: ordinal,
      subject_invocation_id: identifier(panelObject.subject_invocation_id, "qualification request panel.subject_invocation_id"),
      subject_artifact_sha256: digest(panelObject.subject_artifact_sha256, "qualification request panel.subject_artifact_sha256"),
    };
    const cell = config.board?.cells.find((candidate) => candidate.panels.some((declared) => declared.id === panel!.id && declared.repetition === root.repetition));
    if (!cell || !boardCellMatchesRequest(cell, root, scenarioObject, subjectArm) || cell.judge_arms[ordinal - 1] !== selectedArm) throw new Error("qualification request panel is not declared for this board identity/scenario/arm/repetition/judge ordinal");
  } else if (config.judge_panel && role === "judge") {
    throw new Error("qualification judge request under judge_panel configuration requires panel metadata");
  }
  const inputPath = absolutePath(scenarioObject.input_path, "scenario.input_path");
  const workingDirectory = absolutePath(scenarioObject.working_directory, "scenario.working_directory");
  return {
    schema_version: QUALIFICATION_REQUEST_VERSION,
    measurement_identity_sha256: digest(root.measurement_identity_sha256, "measurement_identity_sha256"),
    invocation_id: identifier(root.invocation_id, "invocation_id"),
    continuation_authority_sha256: digest(root.continuation_authority_sha256, "continuation_authority_sha256"),
    continuation_authority_expires_at: utcTimestamp(root.continuation_authority_expires_at, "continuation_authority_expires_at"),
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
    ...(panel ? { panel } : {}),
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
  if (argumentsList.some((entry) => entry.startsWith("-"))) {
    throw new Error(`${ctx}.arguments must be positional inputs only; option-looking arguments are runner-owned`);
  }
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

function boardCellMatchesRequest(
  cell: QualificationBoardV1["cells"][number],
  request: Record<string, unknown>,
  scenario: Record<string, unknown>,
  subjectArm: string,
): boolean {
  return cell.measurement_identity_sha256 === String(request.measurement_identity_sha256).toLowerCase() &&
    cell.scenario_id === scenario.id && cell.scenario_version === scenario.version &&
    cell.stimulus_sha256 === String(scenario.stimulus_sha256).toLowerCase() &&
    cell.rubric_sha256 === String(scenario.rubric_sha256).toLowerCase() && cell.subject_arm === subjectArm;
}

function parseQualificationBoard(value: unknown): QualificationBoardV1 {
  const board = object(value, "qualification board");
  exactKeys(board, ["schema_version", "read_only", "cells"], "qualification board");
  if (board.schema_version !== QUALIFICATION_BOARD_VERSION || board.read_only !== true) throw new Error("qualification board must be qualification-board-v1 with read_only true");
  if (!Array.isArray(board.cells) || board.cells.length === 0) throw new Error("qualification board cells must be a non-empty array");
  const cells = board.cells.map((entry, index) => {
    const cell = object(entry, `qualification board cell ${index}`);
    exactKeys(cell, ["id", "scenario_id", "measurement_identity_sha256", "scenario_version", "stimulus_sha256", "rubric_sha256", "subject_input_sha256", "subject_arm", "judge_arms", "panels", "critical", "pass_threshold"], `qualification board cell ${index}`);
    if (!Array.isArray(cell.panels) || cell.panels.length === 0) throw new Error(`qualification board cell ${index}.panels must be non-empty`);
    const panels = cell.panels.map((raw, panelIndex) => {
      const panel = object(raw, `qualification board cell ${index}.panels[${panelIndex}]`);
      exactKeys(panel, ["id", "repetition"], `qualification board cell ${index}.panels[${panelIndex}]`);
      return { id: identifier(panel.id, `qualification board cell ${index} panel id`), repetition: nonNegativeInteger(panel.repetition, `qualification board cell ${index} panel repetition`) };
    });
    if (new Set(panels.map((panel) => panel.id)).size !== panels.length || new Set(panels.map((panel) => panel.repetition)).size !== panels.length) throw new Error(`qualification board cell ${index} contains duplicate panel ids or repetitions`);
    if (!Array.isArray(cell.judge_arms) || cell.judge_arms.length !== 3) throw new Error(`qualification board cell ${index}.judge_arms must contain exactly three arm ids`);
    const judgeArms = cell.judge_arms.map((arm, judgeIndex) => identifier(arm, `qualification board cell ${index}.judge_arms[${judgeIndex}]`)) as [string, string, string];
    if (typeof cell.critical !== "boolean") throw new Error(`qualification board cell ${index}.critical must be boolean`);
    const passThreshold = positiveInteger(cell.pass_threshold, `qualification board cell ${index}.pass_threshold`);
    if (passThreshold > panels.length || (cell.critical && passThreshold !== panels.length)) throw new Error(`qualification board cell ${index}.pass_threshold contradicts its repetitions or Critical policy`);
    return {
      id: identifier(cell.id, `qualification board cell ${index}.id`),
      scenario_id: identifier(cell.scenario_id, `qualification board cell ${index}.scenario_id`),
      measurement_identity_sha256: digest(cell.measurement_identity_sha256, `qualification board cell ${index}.measurement_identity_sha256`),
      scenario_version: identifier(cell.scenario_version, `qualification board cell ${index}.scenario_version`),
      stimulus_sha256: digest(cell.stimulus_sha256, `qualification board cell ${index}.stimulus_sha256`),
      rubric_sha256: digest(cell.rubric_sha256, `qualification board cell ${index}.rubric_sha256`),
      subject_input_sha256: digest(cell.subject_input_sha256, `qualification board cell ${index}.subject_input_sha256`),
      subject_arm: identifier(cell.subject_arm, `qualification board cell ${index}.subject_arm`), judge_arms: judgeArms,
      panels, critical: cell.critical, pass_threshold: passThreshold,
    };
  });
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) throw new Error("qualification board contains duplicate cell ids");
  const logicalSlots = cells.flatMap((cell) => cell.panels.map((panel) => `${cell.scenario_id}\0${cell.subject_arm}\0${panel.repetition}`));
  if (new Set(logicalSlots).size !== logicalSlots.length) throw new Error("qualification board duplicates a scenario/subject-arm/repetition slot");
  const allPanelIds = cells.flatMap((cell) => cell.panels.map((panel) => panel.id));
  if (new Set(allPanelIds).size !== allPanelIds.length) throw new Error("qualification board contains duplicate panel ids across cells");
  return { schema_version: QUALIFICATION_BOARD_VERSION, read_only: true, cells };
}

function parseCanonicalJudgePanelPolicy(value: unknown): typeof QUALIFICATION_JUDGE_PANEL_POLICY {
  if (qualificationCanonicalJson(value) !== qualificationCanonicalJson(QUALIFICATION_JUDGE_PANEL_POLICY)) {
    throw new Error("qualification judge_panel must equal the canonical qualification-judge-panel-policy-v1 agreement, split, failure, and Wave A call-budget policy");
  }
  return structuredClone(QUALIFICATION_JUDGE_PANEL_POLICY);
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

function exactKeys(value: Record<string, unknown>, keys: readonly string[], ctx: string, optionalKeys: readonly string[] = []): void {
  const allowed = new Set([...keys, ...optionalKeys]);
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
function utcTimestamp(value: unknown, ctx: string): string {
  const text = nonEmpty(value, ctx);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error(`${ctx} must be an RFC 3339 UTC timestamp`);
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
