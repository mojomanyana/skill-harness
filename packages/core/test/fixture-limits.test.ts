import { afterEach, describe, expect, it } from "vitest";
import { closeSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureInventory, FIXTURE_LIMITS } from "../src/util/fixture-inventory.js";
import { dirSha256 } from "../src/sources.js";
import { createWorkspace, diffSnapshots, snapshotPaths } from "../src/workspace.js";

const directories: string[] = [];
function temporary(): string {
  const path = mkdtempSync(join(tmpdir(), "harness-fixture-")); directories.push(path); return path;
}
function sparse(path: string, size: number): void {
  const fd = openSync(path, "w");
  try { ftruncateSync(fd, size); } finally { closeSync(fd); }
}
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("selected fixture bounds", () => {
  it("preserves the existing path/NUL/bytes/NUL digest and per-file snapshots", () => {
    const dir = temporary();
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "z.bin"), Buffer.from([0, 255, 17]));
    writeFileSync(join(dir, "a.txt"), "alpha");
    const expected = createHash("sha256").update("a.txt\0alpha\0nested/z.bin\0").update(Buffer.from([0, 255, 17])).update("\0").digest("hex");
    expect(dirSha256(dir)).toBe(expected);
    const before = snapshotPaths(dir, "empty-git");
    expect(before?.get("a.txt")).toBe(createHash("sha256").update("alpha").digest("hex"));
    expect(diffSnapshots(before, snapshotPaths(dir, "empty-git"))).toEqual([]);
  });

  it("refuses excessive depth without treating a partial snapshot as unchanged", () => {
    const dir = temporary();
    let nested = dir;
    for (let n = 0; n <= FIXTURE_LIMITS.depth; n++) { nested = join(nested, "d"); mkdirSync(nested); }
    expect(() => fixtureInventory(dir)).toThrow(/depth exceeds 32/);
    expect(dirSha256(dir)).toBeNull();
    expect(snapshotPaths(dir, "empty-git")).toBeNull();
    expect(diffSnapshots(new Map(), snapshotPaths(dir, "empty-git"))).toBeNull();
  });

  it("stops enumeration at the entry bound and still skips existing tool-artifact trees", () => {
    const dir = temporary();
    const ignored = join(dir, "node_modules"); mkdirSync(ignored);
    for (let n = 0; n < FIXTURE_LIMITS.entries; n++) writeFileSync(join(ignored, String(n)), "");
    expect(() => fixtureInventory(dir)).toThrow(/4096 entries/);
    expect(dirSha256(dir)).toBeNull();
    expect(snapshotPaths(dir, "empty-git")).toEqual(new Map());
  });

  // Sparse files exercise the real stat-only rejection without allocating or reading their payload.
  it.skipIf(process.platform !== "linux")("rejects an oversized selected file before workspace copy or hashing", () => {
    const dir = temporary();
    sparse(join(dir, "large.bin"), FIXTURE_LIMITS.fileBytes + 1);
    expect(() => createWorkspace({ fixture: dir }, { specDir: dir })).toThrow(/Selected fixture limit exceeded/);
    expect(dirSha256(dir)).toBeNull();
    expect(snapshotPaths(dir, "empty-git")).toBeNull();
  });

  it.skipIf(process.platform !== "linux")("rejects an oversized total even when every selected file fits", () => {
    const dir = temporary();
    for (let n = 0; n < 5; n++) sparse(join(dir, `${n}.bin`), FIXTURE_LIMITS.fileBytes);
    expect(() => fixtureInventory(dir)).toThrow(/total exceeds/);
    expect(() => createWorkspace({ fixture: dir }, { specDir: dir })).toThrow(/Selected fixture limit exceeded/);
  });
});
