import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

export interface EvidenceRef { path: string; sha256: string }
export interface VerifiedEvidence extends EvidenceRef { bytes: number; content: Buffer }
export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const LIMIT = 2 * 1024 * 1024;

/** Read only explicitly selected regular files. Matching bytes do not establish the truth of their claims. */
export function verifyEvidence(refs: EvidenceRef[] | undefined, cwd: string): VerifiedEvidence[] {
  if (refs === undefined) return [];
  if (!Array.isArray(refs) || refs.length < 1 || refs.length > 8)
    throw new Error("evidenceRefs must select between 1 and 8 files");
  const paths = new Set<string>();
  return refs.map(ref => {
    if (!ref || typeof ref !== "object" || Object.keys(ref).sort().join() !== "path,sha256" ||
        typeof ref.path !== "string" || !ref.path.trim() || ref.path.length > 4096 ||
        typeof ref.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(ref.sha256))
      throw new Error("Each evidence reference requires only path and lowercase sha256");
    const selected = resolve(cwd, ref.path);
    const selectedStat = lstatSync(selected);
    if (!selectedStat.isFile() || selectedStat.isSymbolicLink()) throw new Error("Evidence must be a regular file, not a link");
    const path = realpathSync(selected);
    if (paths.has(path)) throw new Error("Duplicate evidence path");
    paths.add(path);
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size > LIMIT) throw new Error("Evidence must be a regular file of at most 2 MiB");
      const buffer = Buffer.alloc(LIMIT + 1);
      let count = 0, size: number;
      while (count < buffer.length && (size = readSync(fd, buffer, count, buffer.length - count, null)) > 0) count += size;
      const after = fstatSync(fd);
      const content = buffer.subarray(0, count);
      if (count > LIMIT || count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || sha256(content) !== ref.sha256)
        throw new Error("Evidence bytes changed or do not match the selected sha256");
      return { path, sha256: ref.sha256, bytes: count, content };
    } finally { closeSync(fd); }
  });
}

export const evidenceReferences = (refs: VerifiedEvidence[]) => refs.map(({ path, sha256, bytes }) => ({ path, sha256, bytes }));
