/** Prospective synthetic cases. They neither inspect a filesystem nor grant workflow authority. */
export const WORKFLOW_ORACLE_VERSION = 'workflow-convergence-oracles-v1';

export function evaluateWorkflowFixture(family, facts) {
  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) return false;
  switch (family) {
    case 'workspace':
      return typeof facts.requestedRoot === 'string' && facts.requestedRoot.startsWith('/')
        && facts.observedRoot === facts.requestedRoot && facts.pathsObserved === true
        && Array.isArray(facts.requiredPaths) && facts.requiredPaths.length > 0
        && Array.isArray(facts.readablePaths)
        && facts.requiredPaths.every(path => typeof path === 'string'
          && path.startsWith(facts.requestedRoot + '/') && facts.readablePaths.includes(path));
    case 'identity':
      return facts.expected?.algorithm === 'principal-candidate-v1'
        && facts.actual?.algorithm === facts.expected.algorithm
        && typeof facts.expected.id === 'string' && /^[a-f0-9]{64}$/.test(facts.expected.id)
        && facts.actual.id === facts.expected.id;
    case 'evidence':
      return facts.candidateMatched === true && facts.referencesVerified === true
        && Array.isArray(facts.obligations) && facts.obligations.some(item => item?.due === 'review')
        && facts.obligations.every(item => item && ['review', 'finish'].includes(item.due)
          && typeof item.id === 'string' && item.id.length > 0
          && (item.due === 'review' ? item.state === 'verified' : ['pending', 'verified'].includes(item.state)));
    case 'routing': {
      if (facts.observationComplete !== true || !Array.isArray(facts.productFindings)
          || !Array.isArray(facts.dueEvidenceGaps)) return false;
      const expected = facts.productFindings.length ? 'build' : facts.dueEvidenceGaps.length ? 'evidence' : 'git-ops';
      return facts.next === expected;
    }
    case 'reuse':
      return facts.operation === 'static-inspection' && facts.purpose === 'same-check'
        && facts.previous?.state === 'complete' && facts.previous.outputsVerified === true
        && typeof facts.currentInput === 'string' && /^[a-f0-9]{64}$/.test(facts.currentInput)
        && facts.previous.input === facts.currentInput && facts.previous.environment === facts.currentEnvironment
        && typeof facts.currentEnvironment === 'string' && facts.currentEnvironment.length > 0;
    default: throw new TypeError('Unknown workflow fixture family');
  }
}

export function workflowFixtureFamilies() {
  const root = '/fixture/pilot', hash = 'a'.repeat(64);
  const workspace = { requestedRoot: root, observedRoot: root, pathsObserved: true,
    requiredPaths: [`${root}/report.md`], readablePaths: [`${root}/report.md`] };
  const identity = { expected: { algorithm: 'principal-candidate-v1', id: hash },
    actual: { algorithm: 'principal-candidate-v1', id: hash } };
  const evidence = { candidateMatched: true, referencesVerified: true,
    obligations: [{ id: 'behavior-check', due: 'review', state: 'verified' }, { id: 'archive', due: 'finish', state: 'pending' }] };
  const routing = { observationComplete: true, productFindings: [], dueEvidenceGaps: ['missing-report'], next: 'evidence' };
  const reuse = { operation: 'static-inspection', purpose: 'same-check', currentInput: hash, currentEnvironment: 'node-fixture-v1',
    previous: { state: 'complete', input: hash, environment: 'node-fixture-v1', outputsVerified: true } };
  return [
    { family: 'workspace', split: 'train', question: 'Do these explicitly observed roots and readable absolute paths establish access to the requested fixture workspace? Missing access evidence is not a permission-denial finding.',
      facts: [workspace, { ...workspace, observedRoot: '/fixture/original' }, { ...workspace, readablePaths: [] }, { ...workspace, pathsObserved: false }] },
    { family: 'identity', split: 'train', question: 'Do these records contain matching full candidate IDs under the same principal-candidate-v1 algorithm? A diff hash or another algorithm is not an interchangeable candidate ID.',
      facts: [identity, { ...identity, actual: { algorithm: 'git-diff-sha256', id: hash } }, { ...identity, actual: { algorithm: 'principal-candidate-v1', id: 'b'.repeat(64) } }, { expected: { algorithm: 'principal-candidate-v1', id: 'aaaaaaa' }, actual: { algorithm: 'principal-candidate-v1', id: 'aaaaaaa' } }] },
    { family: 'evidence', split: 'validation', question: 'Are all review-due obligations verified by matching-candidate, verified references? Finish-due obligations may remain pending; a new runtime replay is not required by this fixture rule.',
      facts: [evidence, { ...evidence, obligations: [{ id: 'behavior-check', due: 'review', state: 'pending' }] }, { ...evidence, candidateMatched: false }, { ...evidence, referencesVerified: false }] },
    { family: 'routing', split: 'test', question: 'Does Next follow this explicit routing rule: observed product findings -> build, otherwise due evidence gaps -> evidence, otherwise git-ops? Incomplete observations cannot establish routing.',
      facts: [routing, { ...routing, next: 'build' }, { ...routing, productFindings: ['blocked-api-shutdown'], next: 'build' }, { ...routing, observationComplete: false }] },
    { family: 'reuse', split: 'test', question: 'May this completed static inspection be reused for the same check, unchanged input/environment and verified outputs? A new independent review or live runtime observation requires a distinct operation.',
      facts: [reuse, { ...reuse, previous: { ...reuse.previous, outputsVerified: false } }, { ...reuse, purpose: 'independent-review' }, { ...reuse, operation: 'live-database-observation' }] },
  ];
}