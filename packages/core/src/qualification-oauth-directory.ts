import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type BigIntStats,
} from "node:fs";
import { basename as pathBasename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
  qualificationCanonicalJson,
  type QualificationOAuthDirectoryPolicy,
} from "./qualification-config.js";

export const QUALIFICATION_OAUTH_DIRECTORY_INVENTORY_VERSION = "qualification-oauth-directory-inventory-v2" as const;

export type QualificationOAuthDirectoryValidationPointV2 =
  | "before-oauth-readiness"
  | "after-oauth-readiness"
  | "before-launch-claim"
  | "immediately-before-pi-launch"
  | "after-child-termination";

export type QualificationFilesystemTypeV2 =
  | "absent"
  | "regular"
  | "directory"
  | "symlink"
  | "fifo"
  | "socket"
  | "block-device"
  | "character-device"
  | "unknown";

export type QualificationOAuthAllowedBasenameV2 = "auth.json" | "models.json" | "models-store.json";

export interface QualificationFilesystemOccurrenceTupleV2 {
  basename: QualificationOAuthAllowedBasenameV2;
  present: boolean;
  file_type: QualificationFilesystemTypeV2;
  uid: number | null;
  gid: number | null;
  mode: string | null;
  device: string | null;
  inode: string | null;
  link_count: string | null;
  size_bytes: string | null;
  modified_at_ns: string | null;
  changed_at_ns: string | null;
  validated_at: string;
}

export interface QualificationDirectoryOccurrenceV2 {
  path: string;
  realpath: string | null;
  file_type: QualificationFilesystemTypeV2;
  uid: number | null;
  gid: number | null;
  mode: string | null;
  device: string | null;
  inode: string | null;
  link_count: string | null;
  size_bytes: string | null;
  modified_at_ns: string | null;
  changed_at_ns: string | null;
  validated_at: string;
}

export interface QualificationOAuthDirectoryInventoryV2 {
  schema_version: typeof QUALIFICATION_OAUTH_DIRECTORY_INVENTORY_VERSION;
  policy: typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  validation_point: QualificationOAuthDirectoryValidationPointV2;
  validated_at: string;
  directory: QualificationDirectoryOccurrenceV2;
  entries: [
    QualificationFilesystemOccurrenceTupleV2,
    QualificationFilesystemOccurrenceTupleV2,
    QualificationFilesystemOccurrenceTupleV2,
  ];
  unexpected_entries: string[];
  valid: boolean;
  errors: string[];
}

export interface QualificationOAuthDirectoryBoundaryV2 {
  policy: typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
  agent_directory: string;
  provider: "openai-codex";
  auth_type: "oauth";
  inventory: QualificationOAuthDirectoryInventoryV2;
}

const ALLOWED_BASENAMES: readonly QualificationOAuthAllowedBasenameV2[] = ["auth.json", "models.json", "models-store.json"];
const INVENTORY_KEYS = ["schema_version", "policy", "validation_point", "validated_at", "directory", "entries", "unexpected_entries", "valid", "errors"] as const;
const DIRECTORY_KEYS = ["path", "realpath", "file_type", "uid", "gid", "mode", "device", "inode", "link_count", "size_bytes", "modified_at_ns", "changed_at_ns", "validated_at"] as const;
const ENTRY_KEYS = ["basename", "present", "file_type", "uid", "gid", "mode", "device", "inode", "link_count", "size_bytes", "modified_at_ns", "changed_at_ns", "validated_at"] as const;
const VALIDATION_POINTS = new Set<QualificationOAuthDirectoryValidationPointV2>([
  "before-oauth-readiness",
  "after-oauth-readiness",
  "before-launch-claim",
  "immediately-before-pi-launch",
  "after-child-termination",
]);
const FILE_TYPES = new Set<QualificationFilesystemTypeV2>([
  "absent", "regular", "directory", "symlink", "fifo", "socket", "block-device", "character-device", "unknown",
]);

export class QualificationOAuthDirectoryValidationError extends Error {
  readonly inventory: QualificationOAuthDirectoryInventoryV2;

  constructor(inventory: QualificationOAuthDirectoryInventoryV2) {
    super(`qualification OAuth directory policy v2 rejected the bound directory: ${inventory.errors[0] ?? "validation failed"}`);
    this.name = "QualificationOAuthDirectoryValidationError";
    this.inventory = inventory;
  }
}

export function assertQualificationOAuthDirectoryPolicyV2(
  env: NodeJS.ProcessEnv,
  options: { validation_point: QualificationOAuthDirectoryValidationPointV2; now?: () => string },
): QualificationOAuthDirectoryBoundaryV2 {
  const result = inspectQualificationOAuthDirectoryPolicyV2(env, options);
  if (!result.inventory.valid) throw new QualificationOAuthDirectoryValidationError(result.inventory);
  return result;
}

/**
 * Inspect only names and filesystem metadata for models-store.json. Its bytes are
 * never read, hashed, copied, moved, rewritten, or removed by this module.
 */
export function inspectQualificationOAuthDirectoryPolicyV2(
  env: NodeJS.ProcessEnv,
  options: { validation_point: QualificationOAuthDirectoryValidationPointV2; now?: () => string },
): QualificationOAuthDirectoryBoundaryV2 {
  if (!VALIDATION_POINTS.has(options.validation_point)) throw new Error(`qualification OAuth directory validation point is unsupported: ${String(options.validation_point)}`);
  const validatedAt = timestamp((options.now ?? (() => new Date().toISOString()))(), "qualification OAuth directory validation time");
  const agentDirectory = env.PI_CODING_AGENT_DIR ?? (env.HOME ? join(env.HOME, ".pi", "agent") : undefined);
  if (!agentDirectory || !isAbsolute(agentDirectory)) {
    throw new Error("qualification OAuth directory policy v2 requires an absolute PI_CODING_AGENT_DIR or HOME");
  }
  if (resolve(agentDirectory) !== agentDirectory) {
    throw new Error("qualification OAuth directory policy v2 requires a canonical absolute path without traversal");
  }

  const errors: string[] = [];
  let directoryStat: BigIntStats | null = null;
  let directoryRealpath: string | null = null;
  try {
    directoryStat = lstatSync(agentDirectory, { bigint: true });
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) errors.push("directory must be a real non-symlink directory");
    try { directoryRealpath = realpathSync(agentDirectory); }
    catch { errors.push("directory realpath is unavailable"); }
    if (directoryRealpath !== null && directoryRealpath !== agentDirectory) errors.push("directory path is an alias rather than the exact bound occurrence");
    const euid = effectiveUid();
    if (euid === null || safeNumber(directoryStat.uid) !== euid) errors.push("directory must be owned by the effective qualification UID");
    if (permissionMode(directoryStat) !== "0700") errors.push("directory must have exact mode 0700 and no effective non-owner ACL access");
  } catch {
    errors.push("directory is missing or unreadable");
  }

  const directory = directoryTuple(agentDirectory, directoryRealpath, directoryStat, validatedAt);
  let directoryFd: number | undefined;
  let names: string[] = [];
  const bytes = new Map<QualificationOAuthAllowedBasenameV2, Buffer>();
  const entries: QualificationFilesystemOccurrenceTupleV2[] = [];
  try {
    if (!directoryStat || errors.length > 0) {
      for (const name of ALLOWED_BASENAMES) entries.push(absentTuple(name, validatedAt));
    } else {
      directoryFd = openSync(agentDirectory, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0));
      const openedDirectory = fstatSync(directoryFd, { bigint: true });
      if (!sameOccurrence(directoryStat, openedDirectory)) errors.push("directory occurrence changed while it was opened");
      const openedDirectoryPath = process.platform === "linux" ? `/proc/${process.pid}/fd/${directoryFd}` : agentDirectory;
      names = readdirSync(openedDirectoryPath).sort();
      const unexpected = names.filter((name) => !ALLOWED_BASENAMES.includes(name as QualificationOAuthAllowedBasenameV2));
      for (const name of unexpected) errors.push(`undeclared entry ${JSON.stringify(name)} is not permitted`);
      for (const name of ALLOWED_BASENAMES) {
        entries.push(inspectAllowedEntry(openedDirectoryPath, directoryRealpath!, name, names.includes(name), validatedAt, errors, bytes));
      }
      const finalNames = readdirSync(openedDirectoryPath).sort();
      if (JSON.stringify(finalNames) !== JSON.stringify(names)) errors.push("directory inventory changed while it was validated");
      const finalOpenedDirectory = fstatSync(directoryFd, { bigint: true });
      const finalPathDirectory = lstatSync(agentDirectory, { bigint: true });
      if (!sameOccurrence(openedDirectory, finalOpenedDirectory) || !sameOccurrence(openedDirectory, finalPathDirectory)) {
        errors.push("directory occurrence changed while its entries were validated");
      }
    }
  } catch (error) {
    errors.push(`directory inventory could not be validated${safeFsCode(error)}`);
    while (entries.length < ALLOWED_BASENAMES.length) entries.push(absentTuple(ALLOWED_BASENAMES[entries.length], validatedAt));
  } finally {
    if (directoryFd !== undefined) closeSync(directoryFd);
  }

  validateCredentialSemantics(bytes, entries, errors);
  const unexpectedEntries = names.filter((name) => !ALLOWED_BASENAMES.includes(name as QualificationOAuthAllowedBasenameV2));
  const inventory: QualificationOAuthDirectoryInventoryV2 = {
    schema_version: QUALIFICATION_OAUTH_DIRECTORY_INVENTORY_VERSION,
    policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
    validation_point: options.validation_point,
    validated_at: validatedAt,
    directory,
    entries: entries as QualificationOAuthDirectoryInventoryV2["entries"],
    unexpected_entries: unexpectedEntries,
    valid: errors.length === 0,
    errors,
  };
  return {
    policy: QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2,
    agent_directory: agentDirectory,
    provider: "openai-codex",
    auth_type: "oauth",
    inventory,
  };
}

export function invalidateQualificationOAuthDirectoryInventoryV2(
  inventory: QualificationOAuthDirectoryInventoryV2,
  error: string,
): QualificationOAuthDirectoryInventoryV2 {
  validateQualificationOAuthDirectoryInventoryV2(inventory, inventory.validation_point);
  return { ...structuredClone(inventory), valid: false, errors: [...inventory.errors, error] };
}

export function assertQualificationOAuthDirectoryContinuityV2(
  before: QualificationOAuthDirectoryInventoryV2,
  after: QualificationOAuthDirectoryInventoryV2,
  options: { allow_models_store_change: boolean },
): void {
  validateQualificationOAuthDirectoryInventoryV2(before, before.validation_point);
  validateQualificationOAuthDirectoryInventoryV2(after, after.validation_point);
  if (!before.valid || !after.valid) throw new Error("qualification OAuth directory continuity requires valid inventories");
  if (qualificationCanonicalJson(directoryContinuityIdentity(before.directory)) !== qualificationCanonicalJson(directoryContinuityIdentity(after.directory))) {
    throw new Error("qualification OAuth directory occurrence changed between validation points");
  }
  for (const name of ALLOWED_BASENAMES) {
    if (name === "models-store.json" && options.allow_models_store_change) continue;
    const left = before.entries.find((entry) => entry.basename === name)!;
    const right = after.entries.find((entry) => entry.basename === name)!;
    if (qualificationCanonicalJson(entryContinuityIdentity(left)) !== qualificationCanonicalJson(entryContinuityIdentity(right))) {
      throw new Error(`qualification OAuth ${name} occurrence changed between validation points`);
    }
  }
}

export function validateQualificationOAuthDirectoryInventoryV2(
  value: unknown,
  expectedPoint?: QualificationOAuthDirectoryValidationPointV2,
): asserts value is QualificationOAuthDirectoryInventoryV2 {
  if (!plainObject(value)) throw new Error("qualification OAuth directory inventory v2 must be an object");
  exactKeys(value, INVENTORY_KEYS, "qualification OAuth directory inventory v2");
  if (value.schema_version !== QUALIFICATION_OAUTH_DIRECTORY_INVENTORY_VERSION || value.policy !== QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2) {
    throw new Error("qualification OAuth directory inventory v2 identity is invalid");
  }
  if (typeof value.validation_point !== "string" || !VALIDATION_POINTS.has(value.validation_point as QualificationOAuthDirectoryValidationPointV2) ||
      (expectedPoint !== undefined && value.validation_point !== expectedPoint)) {
    throw new Error("qualification OAuth directory inventory v2 validation point is invalid");
  }
  timestamp(String(value.validated_at), "qualification OAuth directory inventory validation time");
  validateDirectoryTuple(value.directory, String(value.validated_at));
  if (!Array.isArray(value.entries) || value.entries.length !== ALLOWED_BASENAMES.length) throw new Error("qualification OAuth directory inventory v2 entries are invalid");
  value.entries.forEach((entry, index) => validateEntryTuple(entry, ALLOWED_BASENAMES[index], String(value.validated_at)));
  if (!Array.isArray(value.unexpected_entries) || value.unexpected_entries.some((entry) => typeof entry !== "string") ||
      JSON.stringify([...value.unexpected_entries].sort()) !== JSON.stringify(value.unexpected_entries) || new Set(value.unexpected_entries).size !== value.unexpected_entries.length) {
    throw new Error("qualification OAuth directory inventory v2 unexpected entries are invalid");
  }
  if (typeof value.valid !== "boolean" || !Array.isArray(value.errors) || value.errors.some((error) => typeof error !== "string" || !error) ||
      value.valid !== (value.errors.length === 0) || (value.valid && value.unexpected_entries.length > 0)) {
    throw new Error("qualification OAuth directory inventory v2 verdict is contradictory");
  }
  if (value.valid) {
    const directory = value.directory as unknown as QualificationDirectoryOccurrenceV2;
    const entries = value.entries as unknown as QualificationFilesystemOccurrenceTupleV2[];
    const auth = entries[0];
    const validDirectory = directory.file_type === "directory" && directory.realpath === directory.path && directory.uid !== null && directory.mode === "0700";
    const validFile = (entry: QualificationFilesystemOccurrenceTupleV2, required: boolean) =>
      (!entry.present && !required) ||
      (entry.present && entry.file_type === "regular" && entry.uid === directory.uid && entry.mode === "0600" &&
        (process.platform === "win32" || entry.link_count === "1"));
    if (!validDirectory || !validFile(auth, true) || !validFile(entries[1], false) || !validFile(entries[2], false)) {
      throw new Error("qualification OAuth directory inventory v2 valid verdict does not satisfy the closed metadata policy");
    }
  }
}

function inspectAllowedEntry(
  openedDirectoryPath: string,
  directoryRealpath: string,
  name: QualificationOAuthAllowedBasenameV2,
  listed: boolean,
  validatedAt: string,
  errors: string[],
  bytes: Map<QualificationOAuthAllowedBasenameV2, Buffer>,
): QualificationFilesystemOccurrenceTupleV2 {
  if (!listed) {
    if (name === "auth.json") errors.push("auth.json is required");
    return absentTuple(name, validatedAt);
  }
  const path = join(openedDirectoryPath, name);
  let stat: BigIntStats;
  try { stat = lstatSync(path, { bigint: true }); }
  catch {
    errors.push(`${name} changed between inventory and no-follow lstat`);
    return absentTuple(name, validatedAt);
  }
  const tuple = fileTuple(name, stat, validatedAt);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    errors.push(`${name} must be a regular non-symlink file`);
    return tuple;
  }
  const euid = effectiveUid();
  if (euid === null || safeNumber(stat.uid) !== euid) errors.push(`${name} must be owned by the effective qualification UID`);
  if (permissionMode(stat) !== "0600") errors.push(`${name} must have exact mode 0600`);
  if (process.platform !== "win32" && stat.nlink !== 1n) errors.push(`${name} must have exactly one hard link where supported`);
  let resolved: string;
  try { resolved = realpathSync(path); }
  catch {
    errors.push(`${name} realpath is unavailable`);
    return tuple;
  }
  if (dirname(resolved) !== directoryRealpath || pathBasename(resolved) !== name || resolved !== join(directoryRealpath, name)) {
    errors.push(`${name} is not a direct child of the exact bound OAuth directory`);
    return tuple;
  }
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd, { bigint: true });
    if (!sameOccurrence(stat, opened) || !opened.isFile()) throw new Error("occurrence mismatch");
    // auth.json and models.json retain their historical semantic checks. The
    // runtime-state file is intentionally never passed to readFileSync.
    if (name !== "models-store.json") bytes.set(name, readFileSync(fd));
    const finalOpened = fstatSync(fd, { bigint: true });
    const finalPath = lstatSync(path, { bigint: true });
    if (!sameOccurrence(opened, finalOpened) || !sameOccurrence(opened, finalPath)) throw new Error("occurrence changed");
  } catch {
    errors.push(`${name} changed while its no-follow occurrence was validated`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  return tuple;
}

function validateCredentialSemantics(
  bytes: Map<QualificationOAuthAllowedBasenameV2, Buffer>,
  entries: QualificationFilesystemOccurrenceTupleV2[],
  errors: string[],
): void {
  const authEntry = entries.find((entry) => entry.basename === "auth.json");
  const authBytes = bytes.get("auth.json");
  if (authEntry?.present && authEntry.file_type === "regular" && authBytes) {
    let parsed: unknown;
    try { parsed = JSON.parse(authBytes.toString("utf8")); }
    catch { errors.push("auth.json must contain valid JSON"); parsed = null; }
    if (parsed !== null) {
      if (!plainObject(parsed) || JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(["openai-codex"])) {
        errors.push("auth.json must contain exactly the openai-codex OAuth credential");
      } else {
        const codex = parsed["openai-codex"];
        if (!plainObject(codex) || codex.type !== "oauth") errors.push("auth.json openai-codex credential must be OAuth");
      }
    }
  }
  const modelsEntry = entries.find((entry) => entry.basename === "models.json");
  const modelsBytes = bytes.get("models.json");
  if (modelsEntry?.present && modelsEntry.file_type === "regular" && modelsBytes) {
    let parsed: unknown;
    try { parsed = JSON.parse(modelsBytes.toString("utf8")); }
    catch { errors.push("models.json must contain valid JSON"); parsed = null; }
    if (parsed !== null && (!plainObject(parsed) || Object.keys(parsed).length !== 0)) {
      errors.push("models.json must be an empty object without provider overrides or embedded credentials");
    }
  }
}

function directoryTuple(path: string, realpath: string | null, stat: BigIntStats | null, validatedAt: string): QualificationDirectoryOccurrenceV2 {
  return {
    path,
    realpath,
    file_type: stat ? fileType(stat) : "absent",
    uid: stat ? safeNumber(stat.uid) : null,
    gid: stat ? safeNumber(stat.gid) : null,
    mode: stat ? permissionMode(stat) : null,
    device: stat ? stat.dev.toString() : null,
    inode: stat ? stat.ino.toString() : null,
    link_count: stat ? stat.nlink.toString() : null,
    size_bytes: stat ? stat.size.toString() : null,
    modified_at_ns: stat ? stat.mtimeNs.toString() : null,
    changed_at_ns: stat ? stat.ctimeNs.toString() : null,
    validated_at: validatedAt,
  };
}

function fileTuple(name: QualificationOAuthAllowedBasenameV2, stat: BigIntStats, validatedAt: string): QualificationFilesystemOccurrenceTupleV2 {
  return {
    basename: name,
    present: true,
    file_type: fileType(stat),
    uid: safeNumber(stat.uid),
    gid: safeNumber(stat.gid),
    mode: permissionMode(stat),
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    link_count: stat.nlink.toString(),
    size_bytes: stat.size.toString(),
    modified_at_ns: stat.mtimeNs.toString(),
    changed_at_ns: stat.ctimeNs.toString(),
    validated_at: validatedAt,
  };
}

function absentTuple(name: QualificationOAuthAllowedBasenameV2, validatedAt: string): QualificationFilesystemOccurrenceTupleV2 {
  return {
    basename: name,
    present: false,
    file_type: "absent",
    uid: null,
    gid: null,
    mode: null,
    device: null,
    inode: null,
    link_count: null,
    size_bytes: null,
    modified_at_ns: null,
    changed_at_ns: null,
    validated_at: validatedAt,
  };
}

function fileType(stat: BigIntStats): QualificationFilesystemTypeV2 {
  if (stat.isFile()) return "regular";
  if (stat.isDirectory()) return "directory";
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isFIFO()) return "fifo";
  if (stat.isSocket()) return "socket";
  if (stat.isBlockDevice()) return "block-device";
  if (stat.isCharacterDevice()) return "character-device";
  return "unknown";
}

function sameOccurrence(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode && left.uid === right.uid && left.gid === right.gid &&
    left.nlink === right.nlink && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs &&
    fileType(left) === fileType(right);
}

function permissionMode(stat: BigIntStats): string {
  return Number(stat.mode & 0o7777n).toString(8).padStart(4, "0");
}

function effectiveUid(): number | null {
  return process.geteuid ? process.geteuid() : null;
}

function safeNumber(value: bigint): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function directoryContinuityIdentity(value: QualificationDirectoryOccurrenceV2): unknown {
  const { size_bytes: _size, modified_at_ns: _mtime, changed_at_ns: _ctime, validated_at: _validated, ...identity } = value;
  return identity;
}

function entryContinuityIdentity(value: QualificationFilesystemOccurrenceTupleV2): unknown {
  const { validated_at: _validated, ...identity } = value;
  return identity;
}

function validateDirectoryTuple(value: unknown, validatedAt: string): void {
  if (!plainObject(value)) throw new Error("qualification OAuth directory inventory v2 directory tuple is invalid");
  exactKeys(value, DIRECTORY_KEYS, "qualification OAuth directory inventory v2 directory tuple");
  if (typeof value.path !== "string" || !isAbsolute(value.path) || (value.realpath !== null && (typeof value.realpath !== "string" || !isAbsolute(value.realpath))) ||
      typeof value.file_type !== "string" || !FILE_TYPES.has(value.file_type as QualificationFilesystemTypeV2) || value.file_type === "regular" ||
      !nullableUid(value.uid) || !nullableUid(value.gid) || !nullableMode(value.mode) || !nullableDecimal(value.device) || !nullableDecimal(value.inode) ||
      !nullableDecimal(value.link_count) || !nullableDecimal(value.size_bytes) || !nullableDecimal(value.modified_at_ns) || !nullableDecimal(value.changed_at_ns) ||
      value.validated_at !== validatedAt) {
    throw new Error("qualification OAuth directory inventory v2 directory tuple is invalid");
  }
}

function validateEntryTuple(value: unknown, basename: QualificationOAuthAllowedBasenameV2, validatedAt: string): void {
  if (!plainObject(value)) throw new Error("qualification OAuth directory inventory v2 entry tuple is invalid");
  exactKeys(value, ENTRY_KEYS, "qualification OAuth directory inventory v2 entry tuple");
  if (value.basename !== basename || typeof value.present !== "boolean" || typeof value.file_type !== "string" || !FILE_TYPES.has(value.file_type as QualificationFilesystemTypeV2) ||
      value.validated_at !== validatedAt || !nullableUid(value.uid) || !nullableUid(value.gid) || !nullableMode(value.mode) || !nullableDecimal(value.device) ||
      !nullableDecimal(value.inode) || !nullableDecimal(value.link_count) || !nullableDecimal(value.size_bytes) || !nullableDecimal(value.modified_at_ns) || !nullableDecimal(value.changed_at_ns)) {
    throw new Error("qualification OAuth directory inventory v2 entry tuple is invalid");
  }
  const metadata = [value.uid, value.gid, value.mode, value.device, value.inode, value.link_count, value.size_bytes, value.modified_at_ns, value.changed_at_ns];
  if ((!value.present && (value.file_type !== "absent" || metadata.some((item) => item !== null))) ||
      (value.present && (value.file_type === "absent" || metadata.some((item) => item === null)))) {
    throw new Error("qualification OAuth directory inventory v2 entry presence is contradictory");
  }
}

function nullableUid(value: unknown): boolean { return value === null || (Number.isSafeInteger(value) && Number(value) >= 0); }
function nullableMode(value: unknown): boolean { return value === null || (typeof value === "string" && /^[0-7]{4}$/.test(value)); }
function nullableDecimal(value: unknown): boolean { return value === null || (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)); }

function exactKeys(value: Record<string, unknown>, keys: readonly string[], ctx: string): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${ctx} contains unknown field ${unknown}`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  if (missing) throw new Error(`${ctx} is missing field ${missing}`);
}

function plainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function timestamp(value: string, ctx: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${ctx} is not an RFC 3339 UTC timestamp`);
  return value;
}

function safeFsCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? ` (${code})` : "";
}

export function qualificationOAuthDirectoryPolicyIsV2(policy: QualificationOAuthDirectoryPolicy): policy is typeof QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2 {
  return policy === QUALIFICATION_OAUTH_DIRECTORY_POLICY_V2;
}
