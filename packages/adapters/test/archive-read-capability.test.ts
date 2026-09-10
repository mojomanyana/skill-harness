import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { createArchiveReadCapability } from '../src/archive-read-capability.js';
const roots: string[] = [];
function fixture() { const root = mkdtempSync(join(tmpdir(), 'archive-cap-')); roots.push(root); const value = retainArchiveSource(root, { sourceId: 'fixture', parser: { id: 'text', version: '1' }, retention: 'redacted', bytes: Buffer.from('safe') }); return { root, id: value.manifestId }; }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('bounded archive-only read capability', () => {
  it('exposes only allowlisted retained bytes and no write/exec/control method', () => {
    const f = fixture(); const cap = createArchiveReadCapability({ root: f.root, manifestIds: [f.id], maxCalls: 2, maxBytes: 8, durationMs: 1000 });
    expect(cap.read(f.id).bytes.toString()).toBe('safe');
    expect(Object.keys(cap).sort()).toEqual(['read', 'snapshot', 'status']);
    expect(() => cap.read('/etc/passwd')).toThrow(/refused/); expect(cap.status().calls).toBe(2);
  });
  it('counts failed calls, bounds repeated reads, and cannot mutate its allowlist after issue', () => {
    const f = fixture(); const ids = [f.id]; const cap = createArchiveReadCapability({ root: f.root, manifestIds: ids, maxCalls: 2, maxBytes: 4, durationMs: 1000 });
    ids.push('a'.repeat(64)); expect(() => cap.read('a'.repeat(64))).toThrow();
    expect(cap.read(f.id).bytes.length).toBe(4); expect(() => cap.read(f.id)).toThrow(/refused/);
    expect(cap.status()).toMatchObject({ calls: 2, bytes: 4 });
  });
  it('does not trust a redacted label to authorize arbitrary exact or unretained data', () => {
    const f = fixture(); const exact = retainArchiveSource(f.root, { sourceId: 'exact', parser: { id: 'text', version: '1' }, retention: 'exact', bytes: Buffer.from('private') });
    const cap = createArchiveReadCapability({ root: f.root, manifestIds: [exact.manifestId], maxCalls: 1, maxBytes: 100, durationMs: 1000 });
    expect(() => cap.read(exact.manifestId)).toThrow(/refused/);
  });
  it('expires according to the host clock and rejects bad budget configuration', () => {
    const f = fixture(); let now = 0;
    const cap = createArchiveReadCapability({ root: f.root, manifestIds: [f.id], maxCalls: 1, maxBytes: 4, durationMs: 10 }, () => now);
    now = 11; expect(() => cap.read(f.id)).toThrow(/refused/);
    expect(() => createArchiveReadCapability({ root: f.root, manifestIds: [f.id], maxCalls: 0, maxBytes: 4, durationMs: 10 })).toThrow();
  });
});
