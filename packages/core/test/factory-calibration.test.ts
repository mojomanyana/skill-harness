import { describe, expect, it } from 'vitest';
import { calibratePredictions, recommendExposure } from '../src/factory-calibration.js';
const component = { kind: 'detector' as const, id: 'repeat', version: 'v1', population: 'layout' };
const prediction = (n: number) => ({ id: `p${n}`, incidentId: `i${n}`, component, kind: 'positive' as const, split: 'calibration' as const });
const reference = (n: number, correct: boolean) => ({ id: `r${n}`, incidentId: `i${n}`, component, kind: 'positive' as const, split: 'calibration' as const, correct });
describe('conditional factory calibration', () => {
  it('reports8/10 with3 unresolved, not8/13 or11/13', () => {
    const predictions = Array.from({ length: 13 }, (_, i) => prediction(i));
    const outcomes = [true,true,true,true,true,true,true,true,false,false].map((correct, i) => reference(i, correct));
    const report = calibratePredictions(predictions, { outcomes }).reports[0];
    expect(report).toMatchObject({ correct: 8, incorrect: 2, resolved: 10, unresolved: 3, precision: .8, totalIncidents: 13, advisoryOnly: true });
    expect(report.interval!.lower).toBeCloseTo(.49016, 4); expect(report.interval!.upper).toBeCloseTo(.94332, 4);
  });
  it('keeps zero resolved precision unknown and does not accept self-labelled predictions', () => {
    expect(calibratePredictions([prediction(0)]).reports[0]).toMatchObject({ precision: null, interval: null, unresolved: 1 });
    expect(() => calibratePredictions([{ ...prediction(0), correct: true } as any])).toThrow();
  });
  it('deduplicates incidents, excludes tuning and refuses version/population inheritance', () => {
    const same = { ...prediction(0), id: 'second-alert' };
    const result = calibratePredictions([prediction(0), same, { ...prediction(1), split: 'tuning' }], { outcomes: [reference(0, true)] });
    expect(result.excludedTuning).toBe(1); expect(result.reports[0].resolved).toBe(1);
    expect(calibratePredictions([{ ...prediction(0), component: { ...component, version: 'v2' } }], { outcomes: [reference(0, true)] }).reports[0].precision).toBeNull();
  });
  it('keeps contradictory references unresolved and approval/rejection reliability separate', () => {
    expect(calibratePredictions([prediction(0)], { outcomes: [reference(0, true), { ...reference(0, false), id: 'other' }] }).reports[0]).toMatchObject({ conflicted: 1, unresolved: 1, precision: null });
    const adjudicator = { ...component, kind: 'adjudicator' as const };
    const reports = calibratePredictions([{ ...prediction(0), component: adjudicator, kind: 'approval' }, { ...prediction(1), component: adjudicator, kind: 'rejection' }]).reports;
    expect(reports).toHaveLength(2);
  });
  it('does not reuse one conflicting reference identity as independent outcomes', () => {
    const reports = calibratePredictions([prediction(0), prediction(1)], { outcomes: [reference(0, true), { ...reference(1, true), id: 'r0' }] }).reports;
    expect(reports[0]).toMatchObject({ unresolved: 2, conflicted: 2, resolved: 0 });
  });
  it('defaults to silent and never turns a recommendation into authority', () => {
    const report = calibratePredictions([prediction(0)], { outcomes: [reference(0, true)] }).reports[0];
    expect(recommendExposure(report, null, 0).mode).toBe('silent');
    const policy = { id: 'selected-policy', component, kind: 'positive' as const, split: 'calibration' as const, minimumResolved: 10, minimumLowerBound: .9, attentionRemaining: 5, expiresAt: 100 };
    expect(() => recommendExposure({ ...report, resolved: 999, interval: { lower: 1, upper: 1 } }, policy, 0)).toThrow(/recompute/);
    expect(recommendExposure(report, policy, 0)).toMatchObject({ mode: 'silent', advisoryOnly: true });
    expect(recommendExposure(report, { ...policy, minimumResolved: 1, minimumLowerBound: 0 }, 0)).toMatchObject({ mode: 'ask', advisoryOnly: true });
    expect(recommendExposure(report, { ...policy, expiresAt: 0 }, 1).mode).toBe('silent');
  });
});
