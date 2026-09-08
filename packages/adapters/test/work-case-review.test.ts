import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, appendFileSync, writeFileSync, readFileSync, renameSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildWorkCapture, WORK_CAPTURE_SCHEMA, WORK_CASE_REVIEW_REQUEST_SCHEMA } from '@skill-harness/core';
import { Compile } from 'typebox/compile';
import { retainWorkCandidate } from '../src/work-case-archive.js';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { createWorkCaseReviewer } from '../src/work-case-review.js';
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'work-case-review-')); roots.push(root);
  const candidate = buildWorkCapture({ detector: { id: 'repeat', version: '1', population: 'layout' }, target: { kind: 'work', snapshotDigest: 'a'.repeat(64), obligationId: 'layout', obligationDigest: 'b'.repeat(64) }, classification: 'candidate_defect', reason: 'repeat_without_progress', evidence: ['a'.repeat(64)], metrics: { equivalentAttempts: 2 } });
  const caseManifestId = retainWorkCandidate(root, candidate);
  const batchId = retainArchiveSource(root, { sourceId: 'batch', parser: { id: 'work-candidate-batch', version: '1' }, retention: 'exact', bytes: Buffer.from(JSON.stringify({ version: 'work-candidate-batch-v1', observationId: 'a'.repeat(64), candidateIds: [caseManifestId], issues: [], expected: [], visibility: 'silent', promotion: 'not-authorized' })) }).manifestId;
  return { root, candidate, caseManifestId, batchId };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('selected-batch case decision writer', () => {
  it('matches the case/request wire schema without accepting authority fields', () => {
    const f = fixture(); expect(Compile(WORK_CAPTURE_SCHEMA).Check(f.candidate)).toBe(true);
    expect(Compile(WORK_CAPTURE_SCHEMA).Check({ ...f.candidate, status: 'promoted' })).toBe(false);
    const request = { caseManifestId: f.caseManifestId, priorDecisionId: null, disposition: 'skip', note: '' };
    expect(Compile(WORK_CASE_REVIEW_REQUEST_SCHEMA).Check(request)).toBe(true);
    expect(Compile(WORK_CASE_REVIEW_REQUEST_SCHEMA).Check({ ...request, author: 'claimed' })).toBe(false);
  });
  it('persists operator decisions and explicit corrections, with idempotent replay', () => {
    const f = fixture(); const reviewer = createWorkCaseReviewer(f.root, f.batchId, 'operator:fixture');
    const request = { caseManifestId: f.caseManifestId, priorDecisionId: null, disposition: 'skip' as const, note: '' };
    expect(reviewer.list().items[0].disposition).toBe('unresolved');
    expect(() => reviewer.list(0, 6)).toThrow(/bounded/);
    const first = reviewer.decide(request); expect(first.current.disposition).toBe('skip');
    expect(reviewer.decide(request).replayed).toBe(true);
    const restarted = createWorkCaseReviewer(f.root, f.batchId, 'operator:fixture');
    expect(restarted.history(f.caseManifestId)).toHaveLength(1);
    expect(() => restarted.decide({ ...request, disposition: 'confirmed_defect' })).toThrow(/stale/);
    const second = restarted.decide({ ...request, priorDecisionId: first.current.id, disposition: 'expected_behavior' });
    expect(second.current.disposition).toBe('expected_behavior'); expect(restarted.history(f.caseManifestId)).toHaveLength(2);
  });
  it('rejects cases outside the selected batch and caller-supplied author overrides', () => {
    const f = fixture(); const reviewer = createWorkCaseReviewer(f.root, f.batchId, 'operator:fixture');
    expect(() => reviewer.history('b'.repeat(64))).toThrow(/batch/);
    expect(() => reviewer.decide({ caseManifestId: f.caseManifestId, priorDecisionId: null, disposition: 'skip', note: '', author: 'pretend-human' } as any)).toThrow();
  });
  it('does not follow a replaced parent directory during history inspection', () => {
    const f = fixture(); const reviewer = createWorkCaseReviewer(f.root, f.batchId, 'operator:fixture');
    reviewer.decide({ caseManifestId: f.caseManifestId, priorDecisionId: null, disposition: 'skip', note: '' });
    const outside = mkdtempSync(join(tmpdir(), 'case-outside-')); roots.push(outside);
    renameSync(join(f.root, 'case-decisions'), join(outside, 'decisions'));
    symlinkSync(join(outside, 'decisions'), join(f.root, 'case-decisions'));
    expect(() => reviewer.history(f.caseManifestId)).toThrow(/directory/);
  });
  it('preserves other locks and refuses a torn decision tail rather than truncating it', () => {
    const f = fixture(); const reviewer = createWorkCaseReviewer(f.root, f.batchId, 'operator:fixture');
    const request = { caseManifestId: f.caseManifestId, priorDecisionId: null, disposition: 'skip' as const, note: '' };
    reviewer.decide(request);
    const log = join(f.root, 'case-decisions', f.candidate.id, 'history.jsonl'); appendFileSync(log, '{"partial":');
    expect(() => reviewer.history(f.caseManifestId)).toThrow(/incomplete/); expect(readFileSync(log, 'utf8')).toContain('{"partial":');
    const lock = join(f.root, 'case-decisions', f.candidate.id + '.lock'); writeFileSync(lock, 'other-owner', { mode: 0o600 });
    expect(() => reviewer.decide(request)).toThrow(); expect(readFileSync(lock, 'utf8')).toBe('other-owner');
  });
});
