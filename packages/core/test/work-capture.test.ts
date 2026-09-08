import { describe, expect, it } from "vitest";
import { buildWorkCapture, appendWorkCaseDecision } from "../src/work-capture.js";
const h = 'a'.repeat(64);
const nomination = () => ({ detector: { id: 'repeat', version: '1', population: 'layout' }, target: { kind: 'work' as const, snapshotDigest: h, obligationId: 'design', obligationDigest: 'b'.repeat(64) }, classification: 'candidate_defect' as const, reason: 'repeat_without_progress' as const, evidence: [h], metrics: { equivalentAttempts: 2 } });
describe('work-target capture v2', () => {
  it('is a silent unresolved nomination, not a test or causal verdict', () => {
    expect(buildWorkCapture(nomination())).toMatchObject({ capture_schema: 2, target: { kind: 'work' }, visibility: 'silent', status: 'unresolved', causalAttribution: 'not-established' });
  });
  it('deduplicates the incident across property order and additional evidence', () => {
    const a = buildWorkCapture(nomination()); const n = nomination();
    n.detector = { population: 'layout', version: '1', id: 'repeat' };
    n.target = { obligationDigest: 'b'.repeat(64), kind: 'work', obligationId: 'design', snapshotDigest: h };
    n.metrics.equivalentAttempts = 3; n.evidence.push('c'.repeat(64));
    expect(buildWorkCapture(n).id).toBe(a.id);
  });
  it('rejects unknown metadata and incompatible classification', () => {
    expect(() => buildWorkCapture({ ...nomination(), classification: 'candidate_exemplar' })).toThrow();
    expect(() => buildWorkCapture({ ...nomination(), detector: { ...nomination().detector, secret: 'not-a-field' } } as any)).toThrow();
    expect(() => buildWorkCapture({ ...nomination(), metrics: { equivalentAttempts: 1.5 } })).toThrow();
  });
  it('appends explicit decisions without turning skip into agreement or accepting stale correction', () => {
    const caseId = buildWorkCapture(nomination()).id;
    const first = { caseId, priorDecisionId: null, disposition: 'skip' as const, author: 'human:fixture', evidence: [h], note: '' };
    const a = appendWorkCaseDecision([], first); expect(a[0].disposition).toBe('skip');
    expect(appendWorkCaseDecision(a, first)).toEqual(a);
    expect(() => appendWorkCaseDecision(a, { ...first, disposition: 'confirmed_defect' })).toThrow(/stale/);
    expect(() => appendWorkCaseDecision([{ ...a[0], disposition: 'confirmed_defect' }], { ...first, priorDecisionId: a[0].id, disposition: 'expected_behavior' })).toThrow(/history/);
    const b = appendWorkCaseDecision(a, { ...first, priorDecisionId: a[0].id, disposition: 'expected_behavior' });
    expect(b).toHaveLength(2); expect(a).toHaveLength(1); expect(a[0].disposition).toBe('skip');
  });
});
