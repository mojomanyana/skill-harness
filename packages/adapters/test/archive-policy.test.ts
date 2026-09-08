import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, readFileSync } from "node:fs";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { ingestPolicySource, inspectPolicyCheckpoint } from "../src/archive-policy.js";
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "archive-policy-")); roots.push(root);
  const sourceRoot = join(root, "sources"), archiveRoot = join(root, "archive"); mkdirSync(sourceRoot, { mode: 0o700 });
  writeFileSync(join(sourceRoot, "events.jsonl"), '{"secret":"synthetic-only"}\n', { mode: 0o600 });
  const policy = { version: "archive-policy-v1", id: "local", revision: "1", sourceRoot, archiveRoot, maxBytes: 1024,
    retention: "exact", expiresAt: "2099-01-01T00:00:00.000Z", sources: [{ id: "source", path: "events.jsonl", parser: { id: "jsonl", version: "1" } }] };
  const path = join(root, "policy.json"); const save = () => writeFileSync(path, JSON.stringify(policy), { mode: 0o600 }); save();
  return { root, path, policy, save, sourceRoot };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("explicit local archive policy", () => {
  it("ingests only the selected source and returns metadata, not source content", () => {
    const f = fixture(); const result = ingestPolicySource(f.path, "source");
    expect(result.change).toBe("initial"); expect(result.syntax).toBe("complete");
    expect(JSON.stringify(result)).not.toContain("synthetic-only");
    expect(inspectPolicyCheckpoint(f.path, "source", result.checkpointId).checkpointId).toBe(result.checkpointId);
    expect(ingestPolicySource(f.path, "source", result.checkpointId).change).toBe("repeat");
    expect(() => ingestPolicySource(f.path, "not-allowed")).toThrow(/policy/);
  });
  it("requires explicit v2 consent before following validated native content references", () => {
    const f = fixture(); const fixtures = resolve(__dirname, '../../../contracts/pi-daddy/execution-retention/v2/fixtures');
    const raw = readFileSync(join(fixtures, 'native-live-branch.json')); const wire = JSON.parse(raw.toString());
    writeFileSync(join(f.sourceRoot, 'manifest.json'), raw, { mode: 0o600 });
    for (const ref of Object.values(wire.content) as any[]) if (ref.path) writeFileSync(join(f.sourceRoot, ref.path), readFileSync(join(fixtures, ref.path)), { mode: 0o600 });
    const policy = f.policy as any; policy.version = 'archive-policy-v2'; policy.maxBytes = 65536;
    policy.sources = [{ id: 'source', path: 'manifest.json', parser: { id: 'pi-daddy-execution-retention', version: '2.0' }, contentPolicy: 'referenced-blobs' }]; f.save();
    const result = ingestPolicySource(f.path, 'source');
    expect(result.kind).toBe('execution-retention-v2'); expect(result.content.session.status).toBe('available');
    expect(result.activeBranch).toBeNull(); expect(JSON.stringify(result)).not.toContain('/fixture/private');
    expect(inspectPolicyCheckpoint(f.path, 'source', result.checkpointId).kind).toBe('execution-retention-v2');
    policy.version = 'archive-policy-v1'; f.save(); expect(() => ingestPolicySource(f.path, 'source')).toThrow(/policy/);
  });
  it("refuses expired, unknown-key and unsafe-path policies", () => {
    const f = fixture(); f.policy.expiresAt = "2000-01-01T00:00:00.000Z"; f.save(); expect(() => ingestPolicySource(f.path, "source")).toThrow(/policy/);
    f.policy.expiresAt = "2099-01-01T00:00:00.000Z"; f.policy.sources[0].path = "../policy.json"; f.save(); expect(() => ingestPolicySource(f.path, "source")).toThrow(/policy/);
    f.policy.sources[0].path = ".pi/auth.json"; f.save(); expect(() => ingestPolicySource(f.path, "source")).toThrow(/policy/);
    f.policy.sources[0].path = "events.jsonl"; (f.policy as any).approved = true; f.save(); expect(() => ingestPolicySource(f.path, "source")).toThrow(/policy/);
  });
  it("refuses symlink sources and size excess without reading arbitrary targets", () => {
    const f = fixture(); symlinkSync(f.path, join(f.sourceRoot, "link")); f.policy.sources[0].path = "link"; f.save(); expect(() => ingestPolicySource(f.path, "source")).toThrow();
    f.policy.sources[0].path = "events.jsonl"; f.policy.maxBytes = 1; f.save(); expect(() => ingestPolicySource(f.path, "source")).toThrow();
  });
  it("does not join a different policy path merely because its bytes share a prefix", () => {
    const f = fixture(); const a = ingestPolicySource(f.path, "source");
    writeFileSync(join(f.sourceRoot, "other.jsonl"), '{"secret":"synthetic-only"}\n{}\n', { mode: 0o600 });
    f.policy.sources[0].path = "other.jsonl"; f.save();
    expect(() => ingestPolicySource(f.path, "source", a.checkpointId)).toThrow(/policy/);
    expect(() => inspectPolicyCheckpoint(f.path, "source", a.checkpointId)).toThrow(/policy/);
  });
  it("refuses an archive destination inside agent configuration", () => {
    const f = fixture(); f.policy.archiveRoot = join(f.root, ".pi", "archive"); f.save();
    expect(() => ingestPolicySource(f.path, "source")).toThrow(/policy/);
  });
  it("keeps reference-only evidence unavailable and binds inspection to policy", () => {
    const f = fixture(); f.policy.retention = "reference-only"; f.save(); const result = ingestPolicySource(f.path, "source");
    expect(result.syntax).toBe("unavailable"); expect(result.sourceStatus).toBe("missing");
    f.policy.retention = "exact"; f.save(); expect(() => inspectPolicyCheckpoint(f.path, "source", result.checkpointId)).toThrow(/policy/);
  });
});
