import { afterEach, expect, it } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { learningHash } from '../src/learning-journal.js';
import { openLearningWorkspace } from '../src/learning-workspace.js';
import { learningWorkspaceFixture, sha } from './learning-workspace-fixture.js';

// Consumer-only, synthetic shapes from pi-daddy src/work-policy-registry.ts.
// No producer execution, independent human approval or installed integration is claimed.
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('accepts the additive ordinary-work registry view without relaxing receipt authority or bindings', () => {
  const baseline = {
    version: 'ordinary-work-policy-v1', scopeDigest: sha('scope'), assessmentPolicyDigest: sha('scope'),
    profiles: [{ taskId: 'report', agent: null, model: 'fixture/baseline', thinking: 'low' }],
  };
  const candidate = { ...baseline, profiles: [{ ...baseline.profiles[0], model: 'fixture/candidate', thinking: 'high' }] };
  const f = learningWorkspaceFixture({ candidateDigest: learningHash(candidate), rollbackCandidateDigest: learningHash(baseline) });
  roots.push(f.root);
  const receipt = f.prepare();
  expect(receipt).toMatchObject({ candidateDigest: learningHash(candidate), rollbackCandidateDigest: learningHash(baseline) });
  const request = {
    version: 'ordinary-work-activation-v1', requestId: 'fixture-profile-activation', expectedRevision: 0,
    expectedCandidateDigest: learningHash(baseline), candidate, binding: f.adoptionBinding, receipt,
  };
  const activated = {
    version: 'factory-registry-view-v1', profile: 'ordinary-model-effort-v1',
    scopeDigest: receipt.scopeDigest, candidateDigest: receipt.candidateDigest, candidate,
    revision: 1, activation: request,
    lastChange: { operation: 'activate', requestId: request.requestId, adoptionId: receipt.id },
    application: 'applied', requestId: request.requestId, orders: [], acceptance: 'not-assessed',
  };
  const retain = (parser: string, value: unknown) => retainArchiveSource(f.archiveRoot, {
    sourceId: `${parser}-${learningHash(value).slice(0, 24)}`, parser: { id: parser, version: '1' },
    retention: 'exact', bytes: Buffer.from(JSON.stringify(value)),
  }).manifestId;
  const wrap = (operation: 'activate' | 'rollback', requestId: string, view: unknown, extra: Record<string, unknown> = {}) => retain('learning-registry-receipt', {
    version: 'learning-registry-receipt-v1', operation, requestId, adoptionId: receipt.id,
    scopeDigest: receipt.scopeDigest, candidateDigest: operation === 'activate' ? receipt.candidateDigest : receipt.rollbackCandidateDigest,
    revision: operation === 'activate' ? 1 : 2, registryManifestId: retain('producer-registry', view), ...extra,
  });
  const before = readFileSync(join(f.directory, 'events.jsonl'));
  const activation = wrap('activate', request.requestId, activated);
  expect(() => f.workspace.linkActivation('reports', activation, [])).toThrow(/authority/);
  for (const changed of [{ scopeDigest: sha('foreign') }, { candidateDigest: sha('wrong-policy') }, { revision: 3 }]) {
    const invalid = wrap('activate', request.requestId, { ...activated, ...changed });
    expect(() => f.workspace.linkActivation('reports', invalid, [invalid])).toThrow(/original registry observation mismatch/);
  }
  const flattened = wrap('activate', request.requestId, activated, { profile: 'ordinary-model-effort-v1' });
  expect(() => f.workspace.linkActivation('reports', flattened, [flattened])).toThrow(/closed/);
  expect(readFileSync(join(f.directory, 'events.jsonl'))).toEqual(before);
  f.workspace.linkActivation('reports', activation, [activation]);

  const rollback = f.workspace.previewRollback('reports', 'operator-request', [f.caseManifestId]);
  const current = { adoptionId: receipt.id, candidateDigest: receipt.candidateDigest, scopeDigest: receipt.scopeDigest };
  expect(() => f.workspace.prepareRollback('reports', rollback, f.authority, Date.now(), current)).toThrow(/authority/);
  f.workspace.prepareRollback('reports', rollback, { ...f.authority, rollbacks: [rollback.id] }, Date.now(), current);
  const restored = {
    ...activated, candidate: baseline, candidateDigest: receipt.rollbackCandidateDigest, revision: 2, activation: null,
    lastChange: { operation: 'rollback', requestId: rollback.id, adoptionId: receipt.id }, requestId: rollback.id, grantExpansion: false,
  };
  for (const changed of [{ application: 'not-performed' }, { requestId: 'wrong-request' }]) {
    const invalid = wrap('rollback', rollback.id, { ...restored, ...changed });
    expect(() => f.workspace.linkRollback('reports', invalid, [invalid])).toThrow(/rollback not applied/);
  }
  const unordered = wrap('rollback', rollback.id, { ...restored, revision: 1 }, { revision: 1 });
  expect(() => f.workspace.linkRollback('reports', unordered, [unordered])).toThrow(/revision must follow/);
  const rollbackLink = wrap('rollback', rollback.id, restored);
  expect(() => f.workspace.linkRollback('reports', rollbackLink, [])).toThrow(/authority/);
  f.workspace.linkRollback('reports', rollbackLink, [rollbackLink]);
  expect(openLearningWorkspace(f.directory).comparison('reports')).toMatchObject({
    activation: 'recorded', rollback: 'recorded', adoptionReadiness: { state: 'rollback-recorded' },
  });
});
