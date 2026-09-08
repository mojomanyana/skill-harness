import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readArchiveSource } from "./evidence-archive.js";
export interface ArchiveReadCapabilityOptions {
  root: string;
  /** Independently selected, content-reviewed artifact IDs; never accepted from model requests. */
  manifestIds: readonly string[];
  maxCalls: number;
  /** Total returned bytes, not a claim about OS-level read bandwidth or process memory. */
  maxBytes: number;
  durationMs: number;
  representations?: readonly ("exact" | "redacted")[];
}
/** A closed read interface for an existing host/tool integration, not an OS sandbox or model route qualification. */
export function createArchiveReadCapability(options: ArchiveReadCapabilityOptions, clock = () => performance.now()) {
  if (!Array.isArray(options.manifestIds) || !options.manifestIds.length || options.manifestIds.length > 4096
    || options.manifestIds.some(id => typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id))
    || !Number.isSafeInteger(options.maxCalls) || options.maxCalls < 1 || options.maxCalls > 128
    || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 64 * 1024 * 1024
    || !Number.isSafeInteger(options.durationMs) || options.durationMs < 1 || options.durationMs > 3600000) throw new Error("invalid archive capability bounds");
  const root = options.root, maxCalls = options.maxCalls, maxBytes = options.maxBytes, durationMs = options.durationMs;
  const representations = [...new Set(options.representations ?? ["redacted"])].sort();
  if (!representations.length || representations.some(r => r !== "exact" && r !== "redacted")) throw new Error("invalid archive representation policy");
  const ids = Object.freeze([...new Set(options.manifestIds)].sort()), allowed = new Set(ids), started = clock();
  if (!Number.isFinite(started)) throw new Error("invalid host clock");
  const descriptor = { version: "archive-read-capability-v1", manifestIds: ids, maxCalls, maxBytes, durationMs, representations: Object.freeze(representations) };
  const snapshot = Object.freeze({ ...descriptor, id: createHash("sha256").update(JSON.stringify(descriptor)).digest("hex") });
  let calls = 0, returned = 0;
  const elapsed = () => { const now = clock(); if (!Number.isFinite(now) || now < started) return Infinity; return now - started; };
  return Object.freeze({
    snapshot,
    status: () => Object.freeze({ calls, bytes: returned, expired: elapsed() >= durationMs }),
    read(manifestId: string) {
      if (calls >= maxCalls || elapsed() >= durationMs) throw new Error("archive read refused");
      calls++;
      if (typeof manifestId !== "string" || !allowed.has(manifestId)) throw new Error("archive read refused");
      const source = readArchiveSource(root, manifestId);
      if (source.status !== "available" || !representations.includes(source.reference.retention as "exact" | "redacted")
        || source.bytes.length > maxBytes - returned || elapsed() >= durationMs) throw new Error("archive read refused");
      returned += source.bytes.length;
      return Object.freeze({ manifestId, reference: Object.freeze({ ...source.reference }), bytes: Buffer.from(source.bytes) });
    },
  });
}
