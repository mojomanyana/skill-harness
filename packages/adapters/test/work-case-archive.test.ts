import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWorkCapture } from '@skill-harness/core';
import { retainWorkCandidate, readWorkCandidate, groupWorkIncidents } from '../src/work-case-archive.js';
const roots: string[] = [];
const input = () => ({ detector: { id: 'repeat', version: '1', population: 'layout' }, target: { kind: 'work' as const, snapshotDigest: 'a'.repeat(64), obligationId: 'layout', obligationDigest: 'b'.repeat(64) }, classification: 'candidate_defect' as const, reason: 'repeat_without_progress' as const, evidence: ['a'.repeat(64)], metrics: { equivalentAttempts: 2 } });
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
describe('private work case archive', () => {
  it('retains and rereads nominations without promotion or duplicate semantic records', () => {
    const root = mkdtempSync(join(tmpdir(), 'work-cases-')); roots.push(root);
    const a = buildWorkCapture(input()); const id = retainWorkCandidate(root, a);
    expect(readWorkCandidate(root, id)).toEqual(a);
    const other = input(); other.detector = { population: 'layout', version: '1', id: 'repeat' };
    expect(retainWorkCandidate(root, buildWorkCapture(other))).toBe(id);
    expect(() => retainWorkCandidate(root, { ...a, status: 'promoted' } as any)).toThrow();
  });
  it('groups multiple observations deterministically as one incident', () => {
    const a = buildWorkCapture(input()); const b = buildWorkCapture({ ...input(), metrics: { equivalentAttempts: 3 } });
    expect(groupWorkIncidents([a, b, a])).toEqual(groupWorkIncidents([b, a]));
    expect(groupWorkIncidents([a, b])).toHaveLength(1);
  });
});
