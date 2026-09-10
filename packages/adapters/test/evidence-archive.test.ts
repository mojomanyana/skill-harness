import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { retainArchiveSource, readArchiveSource, parseArchivedJsonl } from "../src/evidence-archive.js";

const roots: string[] = [];
const root = () => { const p = mkdtempSync(join(tmpdir(), "evidence-archive-")); roots.push(p); return p; };
const input = (bytes = Buffer.from('{"timestamp":1}\n')) => ({ sourceId: "source-1", parser: { id: "native-jsonl", version: "1" }, bytes, retention: "exact" as const });
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });

describe("external evidence archive primitives", () => {
  it("retains exact bytes with an idempotent durable manifest and private files", () => {
    const dir = root(); const a = retainArchiveSource(dir, input());
    expect(retainArchiveSource(dir, input())).toEqual(a);
    const read = readArchiveSource(dir, a.manifestId);
    expect(read.status).toBe("available");
    if (read.status !== "available") throw new Error("missing bytes");
    expect(read.bytes.equals(input().bytes)).toBe(true);
    expect(read.reference.retention).toBe("exact");
    expect(readdirSync(join(dir, "objects"))).toHaveLength(1);
    expect(statSync(join(dir, "objects", a.reference.sha256)).mode & 0o777).toBe(0o600);
    expect(readArchiveSource(dir, a.manifestId)).toEqual(read);
  });
  it("reference-only records never imply retained content, even if the blob already exists", () => {
    const dir = root(); retainArchiveSource(dir, input());
    const a = retainArchiveSource(dir, { ...input(), retention: "reference-only" });
    expect(readArchiveSource(dir, a.manifestId)).toMatchObject({ status: "missing", reason: "not-retained" });
    const clean = root(); retainArchiveSource(clean, { ...input(), retention: "reference-only" });
    expect(readdirSync(clean)).toEqual(["manifests"]);
  });
  it("redacted representation remains explicitly redacted", () => {
    const dir = root(); const a = retainArchiveSource(dir, { ...input(Buffer.from("[redacted]\n")), retention: "redacted" });
    expect(readArchiveSource(dir, a.manifestId)).toMatchObject({ status: "available", reference: { retention: "redacted" } });
  });
  it("deleted content and manifests remain missing rather than fabricated recovery", () => {
    const dir = root(); const a = retainArchiveSource(dir, input());
    unlinkSync(join(dir, "objects", a.reference.sha256));
    expect(readArchiveSource(dir, a.manifestId)).toMatchObject({ status: "missing", reason: "content" });
    unlinkSync(join(dir, "manifests", a.manifestId));
    expect(readArchiveSource(dir, a.manifestId)).toMatchObject({ status: "missing", reason: "manifest" });
  });
  it("rejects corrupt existing bytes and never overwrites them", () => {
    const dir = root(); const a = retainArchiveSource(dir, input()); const path = join(dir, "objects", a.reference.sha256);
    writeFileSync(path, "bad");
    expect(readArchiveSource(dir, a.manifestId)).toMatchObject({ status: "error" });
    expect(() => retainArchiveSource(dir, input())).toThrow(/identity/);
    expect(readFileSync(path, "utf8")).toBe("bad");
  });
  it("rejects symlink roots and blob paths without changing their targets", () => {
    const outside = root(); const dir = root(); const alias = join(dir, "alias"); symlinkSync(outside, alias);
    expect(() => retainArchiveSource(alias, input())).toThrow(/symlink/);
    expect(readdirSync(outside)).toEqual([]);
    const a = retainArchiveSource(dir, input()); const path = join(dir, "objects", a.reference.sha256); unlinkSync(path);
    const target = join(outside, "target"); writeFileSync(target, input().bytes); symlinkSync(target, path);
    expect(readArchiveSource(dir, a.manifestId)).toMatchObject({ status: "error" });
    expect(() => retainArchiveSource(dir, input())).toThrow();
    expect(readFileSync(target).equals(input().bytes)).toBe(true);
  });
  it("rejects invalid metadata, omitted policy and oversized bytes before writing", () => {
    const dir = root();
    expect(() => retainArchiveSource(dir, { ...input(), sourceId: "../escape" })).toThrow();
    expect(() => retainArchiveSource(dir, { ...input(), retention: undefined } as any)).toThrow();
    expect(() => retainArchiveSource(dir, { ...input(), retention: { toString: () => "exact" } } as any)).toThrow();
    expect(() => retainArchiveSource(dir, input(Buffer.alloc(8 * 1024 * 1024 + 1)))).toThrow(/limit/);
    expect(readdirSync(dir)).toEqual([]);
    expect(readArchiveSource(dir, "../escape")).toMatchObject({ status: "error" });
  });
});

describe("archived JSONL reader", () => {
  it("preserves duplicates and source order, with byte offsets and an explicit trailing gap", () => {
    const bytes = Buffer.from('{"timestamp":2}\n{"timestamp":1}\n{"timestamp":1}\n{"partial":');
    const result = parseArchivedJsonl(bytes);
    expect(result.records.map(r => r.value)).toEqual([{ timestamp: 2 }, { timestamp: 1 }, { timestamp: 1 }]);
    expect(result.status).toBe("partial");
    expect(result.completeBytes + result.pendingBytes).toBe(bytes.length);
    expect(result.records[0].start).toBe(0);
    expect(result.records[2].end).toBe(result.completeBytes);
  });
  it("reports invalid complete records without treating later valid lines as continuous coverage", () => {
    const result = parseArchivedJsonl(Buffer.from('bad\n{"ok":true}\n'));
    expect(result.status).toBe("error"); expect(result.errors).toEqual([{ line: 1, start: 0, reason: "invalid-json" }]);
    expect(result.records).toHaveLength(1);
    expect(parseArchivedJsonl(Buffer.from([0xff, 10])).status).toBe("error");
  });
  it("does not invent a completed record for an unterminated valid JSON value", () => {
    expect(parseArchivedJsonl(Buffer.from('{}'))).toMatchObject({ status: "partial", records: [], completeBytes: 0, pendingBytes: 2 });
    expect(parseArchivedJsonl(Buffer.from('{}\n'))).toMatchObject({ status: "complete", pendingBytes: 0 });
  });
});
