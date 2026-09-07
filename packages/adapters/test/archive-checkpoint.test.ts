import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { retainArchiveSource } from "../src/evidence-archive.js";
import { ingestArchiveSnapshot, readArchiveCheckpoint } from "../src/archive-checkpoint.js";

const roots: string[] = [];
const root = () => { const p = mkdtempSync(join(tmpdir(), "archive-checkpoint-")); roots.push(p); return p; };
const input = (text: string) => ({ sourceId: "session-1", parser: { id: "jsonl-syntax", version: "1" }, retention: "exact" as const, bytes: Buffer.from(text) });
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });

describe("durable external ingestion checkpoints", () => {
  it("resumes a partial record without timestamp sorting or duplicate outcomes", () => {
    const dir = root(); const a = ingestArchiveSnapshot(dir, input('{"t":2}\n{"t":'));
    const b = ingestArchiveSnapshot(dir, { ...input('{"t":2}\n{"t":1}\n{"t":1}\n'), previousCheckpointId: a.checkpointId });
    expect(b.change).toBe("append"); expect(b.records.map(r => r.value)).toEqual([{ t: 2 }, { t: 1 }, { t: 1 }]);
    expect(b.records[0].id).toBe(a.records[0].id); expect(new Set(b.records.map(r => r.id)).size).toBe(3);
    expect(b.newRecords.map(r => r.value)).toEqual([{ t: 1 }, { t: 1 }]);
    const c = ingestArchiveSnapshot(dir, { ...input('{"t":2}\n{"t":1}\n{"t":1}\n'), previousCheckpointId: b.checkpointId });
    expect(c.change).toBe("repeat"); expect(c.checkpointId).toBe(b.checkpointId); expect(c.newRecords).toEqual([]);
    expect(readArchiveCheckpoint(dir, b.checkpointId).checkpoint).toEqual(b.checkpoint);
  });
  it("starts a distinct lineage on replacement, even with reused record labels", () => {
    const dir = root(); const a = ingestArchiveSnapshot(dir, input('{"id":"same","v":1}\n'));
    const b = ingestArchiveSnapshot(dir, { ...input('{"id":"same","v":2}\n'), previousCheckpointId: a.checkpointId });
    expect(b.change).toBe("replaced"); expect(b.records[0].id).not.toBe(a.records[0].id);
    expect(b.checkpoint.issues).toContain("source-replaced");
  });
  it("does not infer continuity across missing previous retained bytes", () => {
    const dir = root(); const a = ingestArchiveSnapshot(dir, input('{}\n'));
    unlinkSync(join(dir, "objects", a.checkpoint.sourceSha256));
    expect(readArchiveCheckpoint(dir, a.checkpointId).source.status).toBe("missing");
    const b = ingestArchiveSnapshot(dir, { ...input('{}\n{}\n'), previousCheckpointId: a.checkpointId });
    expect(b.change).toBe("unknown"); expect(b.checkpoint.issues).toContain("previous-content-unavailable");
  });
  it("does not inherit a cursor across parser revision or retention changes", () => {
    const dir = root(); const a = ingestArchiveSnapshot(dir, input('{}\n'));
    const b = ingestArchiveSnapshot(dir, { ...input('{}\n{}\n'), parser: { id: "jsonl-syntax", version: "2" }, previousCheckpointId: a.checkpointId });
    expect(b.change).toBe("unknown"); expect(b.checkpoint.issues).toContain("parser-or-representation-changed");
  });
  it("reports reference-only and redacted evidence without exact replay claims", () => {
    const dir = root(); const a = ingestArchiveSnapshot(dir, { ...input('{}\n'), retention: "reference-only" });
    expect(a.records).toEqual([]); expect(a.checkpoint.issues).toContain("content-not-retained");
    const b = ingestArchiveSnapshot(dir, { ...input('{}\n'), retention: "redacted" });
    expect(b.checkpoint.issues).toContain("redacted-representation");
    expect(b.checkpoint.activeBranch).toBeNull(); expect(b.checkpoint.acceptance).toBe("not-assessed");
  });
  it("rejects a different source checkpoint and fabricated cursor metadata", () => {
    const dir = root(); const a = ingestArchiveSnapshot(dir, input('{}\n'));
    expect(() => ingestArchiveSnapshot(dir, { ...input('{}\n'), sourceId: "other", previousCheckpointId: a.checkpointId })).toThrow(/source/);
    const bad = retainArchiveSource(dir, { ...input(''), sourceId: "bad-checkpoint", bytes: Buffer.from(JSON.stringify({ ...a.checkpoint, completeBytes: 999 })) });
    expect(() => readArchiveCheckpoint(dir, bad.manifestId)).toThrow(/checkpoint/);
  });
  it("retains malformed-line and pending-tail coverage independently", () => {
    const result = ingestArchiveSnapshot(root(), input('bad\n{}\n{"tail":'));
    expect(result.checkpoint.syntax).toBe("error"); expect(result.checkpoint.invalidLines).toBe(1);
    expect(result.checkpoint.pendingBytes).toBeGreaterThan(0);
    expect(result.records).toHaveLength(1);
  });
});
