import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync } from "node:fs";
import type { Hash } from "node:crypto";
import { join } from "node:path";

export const FIXTURE_LIMITS = Object.freeze({ entries: 4096, depth: 32, fileBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 });
export class FixtureLimitError extends Error {
  constructor(message: string) { super(`Selected fixture limit exceeded: ${message}`); this.name = "FixtureLimitError"; }
}
export interface FixtureFile { path: string; relative: string; size: number }

/** Bounded metadata walk of one explicitly selected tree. Never follows child symlinks. */
export function fixtureInventory(root: string, skip?: (name: string, relative: string) => boolean): FixtureFile[] {
  const files: FixtureFile[] = [];
  let entries = 0, total = 0;
  const walk = (dir: string, prefix: string, depth: number): void => {
    if (depth > FIXTURE_LIMITS.depth) throw new FixtureLimitError(`depth exceeds ${FIXTURE_LIMITS.depth}`);
    const opened = opendirSync(dir);
    try {
      for (let entry = opened.readSync(); entry; entry = opened.readSync()) {
        if (++entries > FIXTURE_LIMITS.entries) throw new FixtureLimitError(`more than ${FIXTURE_LIMITS.entries} entries`);
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (skip?.(entry.name, relative)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path, relative, depth + 1);
        else if (entry.isFile()) {
          const stat = lstatSync(path);
          if (!stat.isFile()) throw new Error(`Selected fixture changed during inventory: ${relative}`);
          if (stat.size > FIXTURE_LIMITS.fileBytes) throw new FixtureLimitError(`${relative} exceeds ${FIXTURE_LIMITS.fileBytes} bytes`);
          total += stat.size;
          if (total > FIXTURE_LIMITS.totalBytes) throw new FixtureLimitError(`total exceeds ${FIXTURE_LIMITS.totalBytes} bytes`);
          files.push({ path, relative, size: stat.size });
        }
      }
    } finally { opened.closeSync(); }
  };
  walk(root, "", 0);
  return files.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
}

/** Update the existing hash format without allocating a whole file or accepting a growing file. */
export function hashFixtureFile(hash: Hash, file: FixtureFile): void {
  const fd = openSync(file.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size !== file.size || stat.size > FIXTURE_LIMITS.fileBytes)
      throw new Error(`Selected fixture changed before hashing: ${file.relative}`);
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    while (offset < file.size) {
      const count = readSync(fd, buffer, 0, Math.min(buffer.length, file.size - offset), offset);
      if (!count) throw new Error(`Selected fixture changed while hashing: ${file.relative}`);
      hash.update(buffer.subarray(0, count)); offset += count;
    }
    if (readSync(fd, buffer, 0, 1, offset) !== 0 || fstatSync(fd).size !== file.size)
      throw new Error(`Selected fixture changed while hashing: ${file.relative}`);
  } finally { closeSync(fd); }
}
