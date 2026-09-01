import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { qualificationProcessIdentity, qualificationProcessMatches, type QualificationProcessIdentity } from "./qualification-process.js";

export interface QualificationLockIo {
  read(path: string, context: string): unknown;
  write(path: string, value: unknown, exclusive: boolean): void;
}

export interface QualificationLockOwner {
  schema_version: "qualification-lock-owner-v1";
  token: string;
  process: QualificationProcessIdentity;
}

export function tryPublishQualificationLock(lockPath: string, token: string, io: QualificationLockIo): boolean {
  const candidate = `${lockPath}.candidate-${token}`;
  try {
    mkdirSync(candidate, { mode: 0o700 });
    io.write(join(candidate, "owner.json"), {
      schema_version: "qualification-lock-owner-v1",
      token,
      process: qualificationProcessIdentity(process.pid),
    }, true);
    renameSync(candidate, lockPath);
    return true;
  } catch (error) {
    if (!["EEXIST", "ENOTEMPTY"].includes(String((error as NodeJS.ErrnoException).code))) throw error;
    return false;
  } finally {
    rmSync(candidate, { recursive: true, force: true });
  }
}

export function readQualificationLockOwner(lockPath: string, io: QualificationLockIo): QualificationLockOwner | null {
  const ownerPath = join(lockPath, "owner.json");
  if (!existsSync(ownerPath)) return null;
  let value: unknown;
  try { value = io.read(ownerPath, `qualification lock owner ${lockPath}`); }
  catch (error) {
    if (error instanceof Error && /missing or unreadable/.test(error.message)) return null;
    throw error;
  }
  if (!plainObject(value) || value.schema_version !== "qualification-lock-owner-v1" || typeof value.token !== "string") {
    throw new Error(`qualification state lock owner is corrupt: ${lockPath}`);
  }
  const identity = processIdentityFrom(value.process);
  if (!identity) throw new Error(`qualification state lock owner is corrupt: ${lockPath}`);
  return { schema_version: "qualification-lock-owner-v1", token: value.token, process: identity };
}

export function qualificationLockOwnerIsLive(owner: QualificationLockOwner): boolean {
  return qualificationProcessMatches(owner.process);
}

export function reclaimQualificationLock(
  lockPath: string,
  observedToken: string,
  contenderToken: string,
  io: QualificationLockIo,
): "reclaimed" | "retry" {
  const stalePath = `${lockPath}.stale-${contenderToken}`;
  try { renameSync(lockPath, stalePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "retry";
    throw error;
  }
  const moved = readQualificationLockOwner(stalePath, io);
  if (!moved || moved.token !== observedToken) {
    // Another generation replaced the observed stale lock before rename. Put it
    // back if the canonical path is still free; never delete an unobserved owner.
    if (!existsSync(lockPath)) renameSync(stalePath, lockPath);
    throw new Error(`qualification state lock generation changed during stale reclamation: ${lockPath}`);
  }
  rmSync(stalePath, { recursive: true, force: true });
  return "reclaimed";
}

export function releaseQualificationLock(lockPath: string, token: string, io: QualificationLockIo): void {
  const owner = readQualificationLockOwner(lockPath, io);
  if (owner?.token === token) rmSync(lockPath, { recursive: true, force: true });
}

function processIdentityFrom(value: unknown): QualificationProcessIdentity | null {
  if (!plainObject(value) || !Number.isInteger(value.pid) || typeof value.platform !== "string" ||
      (value.boot_id !== null && typeof value.boot_id !== "string") || (value.start_ticks !== null && typeof value.start_ticks !== "string")) return null;
  return { pid: Number(value.pid), platform: value.platform as NodeJS.Platform, boot_id: value.boot_id, start_ticks: value.start_ticks };
}
function plainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
