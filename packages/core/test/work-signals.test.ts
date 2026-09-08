import { describe, expect, it } from 'vitest';
import { detectAdditionalWorkCases } from '../src/work-signals.js';
const h='a'.repeat(64),o='b'.repeat(64),p='c'.repeat(64);
const state=()=>({snapshotDigest:h,scopeValid:true,obligations:[{id:'layout',digest:o,intentDigest:p,policyDigest:p,artifactDigest:p,acceptance:'unaccepted' as const,coverage:'available' as const}]});
const context=()=>({scopeDigest:h,version:'fixture-v1',population:'layout',expectedWaits:[] as string[],checkpoints:[] as any[],violations:[] as any[],priorAccepted:[] as any[]});
describe('additional frozen work signal rules',()=>{
 it('nominates a genuinely pending overdue checkpoint but not a met/future/unknown one',()=>{
  const facts={...context(),checkpoints:[{obligationDigest:o,deadlineMs:10,observedAt:11,status:'pending',evidence:p}]};
  expect(detectAdditionalWorkCases(state(),facts).cases[0]).toMatchObject({capture_schema:3,reason:'overdue_checkpoint',status:'unresolved',visibility:'silent'});
  expect(detectAdditionalWorkCases(state(),{...facts,checkpoints:[{...facts.checkpoints[0],status:'met'}]}).cases).toEqual([]);
  expect(detectAdditionalWorkCases(state(),{...facts,checkpoints:[{...facts.checkpoints[0],observedAt:9}]}).cases).toEqual([]);
  expect(detectAdditionalWorkCases(state(),{...facts,checkpoints:[{...facts.checkpoints[0],status:'unknown'}]}).cases[0].classification).toBe('coverage_issue');
  expect(detectAdditionalWorkCases(state(),{...facts,checkpoints:[facts.checkpoints[0],{...facts.checkpoints[0],status:'met'}]}).cases.every(c=>c.classification==='coverage_issue')).toBe(true);
 });
 it('requires the same intent/policy/artifact/obligation for reopened acceptance',()=>{
  const prior={obligationDigest:o,intentDigest:p,policyDigest:p,artifactDigest:p,acceptanceEvidence:p};
  expect(detectAdditionalWorkCases(state(),{...context(),priorAccepted:[prior]}).cases[0].reason).toBe('reopened_acceptance');
  expect(detectAdditionalWorkCases(state(),{...context(),priorAccepted:[{...prior,policyDigest:h}]}).cases).toEqual([]);
  const unknown=state();unknown.obligations[0].coverage='unknown' as any;
  expect(detectAdditionalWorkCases(unknown,{...context(),priorAccepted:[prior]}).cases.every(c=>c.classification==='coverage_issue')).toBe(true);
 });
 it('uses independently supplied objective facts, not freeform worker prose, and keeps ERROR as coverage',()=>{
  const facts={...context(),violations:[{obligationDigest:o,status:'FAIL',evidence:p}]};
  expect(detectAdditionalWorkCases(state(),facts).cases[0].reason).toBe('intent_conflict');
  expect(detectAdditionalWorkCases(state(),{...facts,violations:[{...facts.violations[0],status:'ERROR'}]}).cases[0].classification).toBe('coverage_issue');
  expect(()=>detectAdditionalWorkCases(state(),{...facts,scopeDigest:p})).toThrow(/scope/);
 });
});
