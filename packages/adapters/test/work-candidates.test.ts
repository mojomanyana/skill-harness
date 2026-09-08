import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureWorkCandidates, readWorkCandidate } from '../src/work-case-archive.js';
import { readArchiveSource } from '../src/evidence-archive.js';
import { detectWorkCandidates } from '../src/work-candidates.js';
import type { WorkProjection } from '../src/generated/retention-v2-work-types.js';
const h = 'a'.repeat(64), digest = 'b'.repeat(64), config = 'c'.repeat(64);
const ref = (kind: any, id: string) => ({ kind, id, revision: 1, digest });
function work(): WorkProjection {
  const obligation = ref('obligation', 'layout'); const scope = ref('scope', 'scope');
  const labels = { sessionId: null, branchLeafId: null, toolCallId: null, taskId: null, workspaceId: null, definitionDigest: null, configurationDigest: config, modelId: null, effortId: null };
  const attempts = ['first', 'second'].map(executionId => ({ executionId, parentExecutionId: null, childId: 'same-name', declaredLabels: [], observedLabels: [labels], effectiveLabels: labels, state: 'completed' as const, resolution: 'resolved' as const, problems: [], bindings: [{ scope, obligation, variantIds: [], artifacts: [] }] }));
  return { selectedSnapshot: { id: 'scope', digest: h }, authoritySnapshot: { id: 'authority', digest: h }, scopeState: 'valid', progress: { accepted: 0, total: 1 },
    obligations: [{ binding: { intent: ref('intent','intent'), obligation, artifact: null, policy: ref('policy','policy') }, acceptance: 'unaccepted', artifactCoverage: { state: 'available', items: [] }, evidenceCoverage: { state: 'available', items: [] }, claims: [], problems: [] }],
    claims: [], supersededClaims: 0, conflicts: [], problems: [], errors: [], runtime: { counts: { attempts: 2, variants: 0, observedCompletedAttempts: 2 }, attempts,
      occurrences: attempts.map((a, i) => ({ event: { eventId: `event-${i}`, digest: String(i + 1).repeat(64) }, payload: { scope, obligation, executionId: a.executionId, parentExecutionId: null, childId: 'same-name', variantId: null, artifact: null, provenance: 'observed', state: 'completed', labels } })) } };
}
const options = () => ({ version: 'fixture-v1', population: 'layout', scopeDigest: h, minEquivalentAttempts: 2, expectedWaits: [] as string[], expectedFailures: [] as string[] });
describe('silent structural work candidates', () => {
  it('nominates repeat-without-progress using exact attempts and no manual note', () => {
    const a = detectWorkCandidates(work(), options()); expect(a.cases).toHaveLength(1);
    expect(a.cases[0]).toMatchObject({ reason: 'repeat_without_progress', visibility: 'silent', status: 'unresolved', metrics: { equivalentAttempts: 2 } });
    expect(detectWorkCandidates(work(), options()).cases[0].id).toBe(a.cases[0].id);
  });
  it('does not attribute missing evidence or unresolved scope to a worker defect', () => {
    const w = work(); (w.obligations[0] as any).evidenceCoverage.state = 'unknown';
    expect(detectWorkCandidates(w, options()).cases[0].classification).toBe('coverage_issue');
    (w as any).scopeState = 'unresolved'; expect(detectWorkCandidates(w, options()).cases).toEqual([]);
  });
  it('distinguishes declared wait, expected red recovery, changed requirement and declared-only state', () => {
    expect(detectWorkCandidates(work(), { ...options(), expectedWaits: [digest] }).cases).toEqual([]);
    expect(detectWorkCandidates(work(), { ...options(), expectedFailures: ['first'] }).cases).toEqual([]);
    const changed = work(); (changed.obligations[0].binding.obligation as any).digest = 'd'.repeat(64);
    // Detach because the synthetic fixture shares refs; old attempts explicitly remain on the prior revision.
    for (const a of changed.runtime!.attempts) (a as any).bindings = a.bindings.map(b => ({ ...b, obligation: { ...b.obligation, digest } }));
    expect(detectWorkCandidates(changed, options()).cases).toEqual([]);
    const declared = work(); for (const o of declared.runtime!.occurrences) (o.payload as any).provenance = 'declared';
    expect(detectWorkCandidates(declared, options()).cases).toEqual([]);
  });
  it('nominates an accepted economical exemplar only with observed, bounded, cited usage', () => {
    const w = work(); (w.obligations[0] as any).acceptance = 'accepted-under-supplied-authority';
    const usage = { first: { observed: true, cost: 2, unit: 'wall_ms' as const, evidence: h }, second: { observed: true, cost: 3, unit: 'wall_ms' as const, evidence: h } };
    expect(detectWorkCandidates(w, { ...options(), usage, exemplar: { unit: 'wall_ms', maximum: 10 } }).cases[0].reason).toBe('economical_exemplar');
    expect(detectWorkCandidates(w, { ...options(), usage: {}, exemplar: { unit: 'wall_ms', maximum: 10 } }).cases).toEqual([]);
  });
  it('retains the actual structural snapshot before archiving silent candidates', () => {
    const root = mkdtempSync(join(tmpdir(), 'work-detection-'));
    try {
      const batch = captureWorkCandidates(root, work(), options());
      expect(captureWorkCandidates(root, work(), options()).batchId).toBe(batch.batchId);
      const observed = readArchiveSource(root, batch.observationId); if (observed.status !== 'available') throw Error('missing observation');
      const candidate = readWorkCandidate(root, batch.candidateIds[0]);
      expect(candidate.evidence).toContain(observed.reference.sha256); expect(candidate.visibility).toBe('silent');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('does not pool different configurations or reuse a mismatched scope policy', () => {
    const w = work(); const different = { ...w.runtime!.attempts[1].effectiveLabels, configurationDigest: 'd'.repeat(64) };
    (w.runtime!.attempts[1] as any).effectiveLabels = different; (w.runtime!.attempts[1] as any).observedLabels = [different];
    expect(detectWorkCandidates(w, options()).cases).toEqual([]);
    expect(() => detectWorkCandidates(work(), { ...options(), scopeDigest: 'e'.repeat(64) })).toThrow(/scope/);
  });
});
