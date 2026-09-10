import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readArchiveSource } from "../src/evidence-archive.js";
import { assertExecutionProjection } from "../src/execution-projection-schema.js";
import { parseExecutionRetentionManifest, RETENTION_SCHEMA } from "../src/generated/retention-v2-contract.js";
import { ingestRetainedExecution, readRetainedExecution, projectRetainedExecutions } from "../src/execution-retention-archive.js";
const fixtures = resolve(__dirname, '../../../contracts/pi-daddy/execution-retention/v2/fixtures');
const roots: string[] = [];
const root = () => { const path = mkdtempSync(join(tmpdir(), 'retention-consumer-')); roots.push(path); return path; };
const fixture = (name: string) => {
  const manifest = readFileSync(join(fixtures, name)); const parsed = parseExecutionRetentionManifest(manifest.toString()); const blobs = new Map<string, Uint8Array>();
  for (const ref of Object.values(parsed.content)) if (ref.path) blobs.set(ref.path, readFileSync(join(fixtures, ref.path)));
  return { manifest, blobs, retention: 'exact' as const };
};
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); });
describe('pinned producer retention ingestion', () => {
  it('reproduces the schema and validates every exact producer fixture', () => {
    const schema = readFileSync(join(fixtures, '../manifest.schema.json'));
    expect(Buffer.from(JSON.stringify(RETENTION_SCHEMA, null, 2) + '\n').equals(schema)).toBe(true);
    for (const name of readdirSync(fixtures).filter(name => name.endsWith('.json'))) {
      const input = fixture(name); const dir = root(); const a = ingestRetainedExecution(dir, input);
      expect(ingestRetainedExecution(dir, input).snapshotId).toBe(a.snapshotId);
      expect(readRetainedExecution(dir, a.snapshotId).manifest.version).toBe('2.0');
      expect(a.projection.acceptance).toBe('not-assessed'); expect(a.projection.coverage).toBe('partial');
    }
  });
  it('does not elect the file tail or a reported live leaf as independently verified active state', () => {
    const unknown = ingestRetainedExecution(root(), fixture('native-file-unknown-branch.json'));
    const reported = ingestRetainedExecution(root(), fixture('native-live-branch.json'));
    expect(unknown.projection.activeBranch).toBeNull(); expect(reported.projection.activeBranch).toBeNull();
    expect(reported.projection.reportedBranch.state).toBe('observed');
  });
  it('treats a digest without actual bytes as missing, and mismatched bytes as error', () => {
    const input = fixture('native-live-branch.json'); const noBytes = ingestRetainedExecution(root(), { ...input, blobs: new Map() });
    expect(noBytes.projection.content.session.status).toBe('missing');
    const parsed = parseExecutionRetentionManifest(input.manifest.toString()); input.blobs.set(parsed.content.session.path!, Buffer.from('wrong'));
    const bad = ingestRetainedExecution(root(), input); expect(bad.projection.content.session.status).toBe('mismatch');
    expect(bad.projection.issues).toContain('content-mismatch:session');
  });
  it('rejects contradictory wire, duplicate keys and imprecise integer tokens', () => {
    const input = fixture('native-live-branch.json'); const text = input.manifest.toString(); const wire = JSON.parse(text);
    wire.native.sessionId = null; expect(() => ingestRetainedExecution(root(), { ...input, manifest: Buffer.from(JSON.stringify(wire)) })).toThrow();
    expect(() => parseExecutionRetentionManifest(text.replace('"version":', '"version":"2.0","version":'))).toThrow();
    expect(() => parseExecutionRetentionManifest(text.replace('"version": "2.0"', '"version": "1.0"'))).toThrow();
    expect(() => parseExecutionRetentionManifest(text.replace('"pid": null', '"pid": 9007199254740993'))).toThrow();
  });
  it('keeps duplicate delivery idempotent and reused logical names separate by execution', () => {
    const input = fixture('native-file-unknown-branch.json'); const a = ingestRetainedExecution(root(), input).projection;
    const wire = JSON.parse(input.manifest.toString()); wire.identity.executionId += '-second'; wire.identity.parentExecutionId = a.identity.executionId;
    const b = ingestRetainedExecution(root(), { ...input, manifest: Buffer.from(JSON.stringify(wire)) }).projection;
    const grouped = projectRetainedExecutions([b, a, a]); expect(grouped.executions).toHaveLength(2);
    expect(grouped.executions.find(e => e.executionId === b.identity.executionId)?.issues).not.toContain('parent-not-in-snapshot');
    expect(grouped.acceptance).toBe('not-assessed');
  });
  it('rechecks deleted bytes and preserves mismatch observations across order-independent grouping', () => {
    const dir = root(); const input = fixture('native-live-branch.json'); const good = ingestRetainedExecution(dir, input);
    const saved = readArchiveSource(dir, good.snapshotId); if (saved.status !== 'available') throw Error('missing snapshot');
    const session = readArchiveSource(dir, JSON.parse(saved.bytes.toString()).blobs.session);
    if (session.status !== 'available') throw Error('missing session');
    unlinkSync(join(dir, 'objects', session.reference.sha256));
    expect(readRetainedExecution(dir, good.snapshotId).projection.content.session.status).toBe('missing');
    const manifest = parseExecutionRetentionManifest(input.manifest.toString()); input.blobs.set(manifest.content.session.path!, Buffer.from('bad'));
    const bad = ingestRetainedExecution(dir, input);
    expect(readRetainedExecution(dir, bad.snapshotId).projection.content.session.status).toBe('mismatch');
    expect(projectRetainedExecutions([good.projection, bad.projection])).toEqual(projectRetainedExecutions([bad.projection, good.projection]));
    expect(projectRetainedExecutions([bad.projection, good.projection]).executions[0].issues).toContain('content-mismatch:session');
  });
  it('marks cyclic execution parentage without manufacturing acceptance', () => {
    const input = fixture('native-file-unknown-branch.json'); const wire = JSON.parse(input.manifest.toString());
    wire.identity.parentExecutionId = wire.identity.executionId;
    const a = ingestRetainedExecution(root(), { ...input, manifest: Buffer.from(JSON.stringify(wire)) }).projection;
    expect(projectRetainedExecutions([a]).executions[0].issues).toContain('cyclic-parentage');
  });
  it('refuses acceptance or active-branch claims in the downstream view contract', () => {
    const value = projectRetainedExecutions([ingestRetainedExecution(root(), fixture('native-live-branch.json')).projection]);
    expect(() => assertExecutionProjection({ ...value, acceptance: 'accepted' })).toThrow();
    expect(() => assertExecutionProjection({ ...value, executions: value.executions.map(e => ({ ...e, activeBranch: 'aaaaaaaa' })) })).toThrow();
  });
  it('does not silently pool contradictory terminal outcomes', () => {
    const input = fixture('native-file-unknown-branch.json'); const wire = JSON.parse(input.manifest.toString());
    wire.state = 'terminal'; wire.outcome = { code: 0, signal: null, timedOut: false, aborted: false, truncated: false, failed: false };
    const a = ingestRetainedExecution(root(), { ...input, manifest: Buffer.from(JSON.stringify(wire)) }).projection;
    wire.outcome.code = 1; wire.outcome.failed = true;
    const b = ingestRetainedExecution(root(), { ...input, manifest: Buffer.from(JSON.stringify(wire)) }).projection;
    expect(projectRetainedExecutions([b, a]).executions[0].runtime).toBe('conflict');
  });
});
