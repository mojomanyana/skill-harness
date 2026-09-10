import { describe, expect, it } from 'vitest';
import { buildAdoptionBinding, authorizeAdoption, validateAdoptionReceipt, classifyProductionObservation, buildRollbackRequest, authorizeRollback, summarizeLeanOutcomes } from '../src/adoption.js';
const h='a'.repeat(64), old='b'.repeat(64);
const input=()=>({hypothesisDigest:h,experimentDigest:h,candidateDigest:h,scopeDigest:h,assessmentPolicyDigest:h,rollbackCandidateDigest:old,activationBoundary:'next-orders' as const,expiresAt:1000});
describe('scoped adoption and later outcome linkage',()=>{
 it('requires exact independent authority and eligible facts; never grants permissions or migrates old orders',()=>{
  const binding=buildAdoptionBinding(input());const facts={experimentDigest:h,candidateDigest:h,scopeDigest:h,assessmentPolicyDigest:h,eligible:true};
  expect(()=>authorizeAdoption(binding,null,facts,0)).toThrow(/authority/);
  const authority={id:'fixture-controller',adoptions:[binding.id],rollbacks:[]};
  const receipt=authorizeAdoption(binding,authority,facts,0);
  expect(receipt).toMatchObject({candidateDigest:h,activationBoundary:'next-orders',grantExpansion:false});
  expect(()=>validateAdoptionReceipt(receipt,binding,null,facts,0)).toThrow(/authority/);
  expect(()=>validateAdoptionReceipt(receipt,binding,authority,facts,0)).not.toThrow();
  expect(()=>authorizeAdoption({...binding,candidateDigest:old},authority,facts,0)).toThrow();
  expect(()=>authorizeAdoption(binding,authority,{...facts,eligible:false},0)).toThrow();
  expect(()=>authorizeAdoption(binding,authority,{...facts,eligible:'claimed'} as any,0)).toThrow();
  expect(()=>authorizeAdoption(binding,authority,facts,1001)).toThrow();
 });
 it('links a confirmed same-requirement escape but separates changed requirements and unknowns',()=>{
  const b=buildAdoptionBinding(input());const a=authorizeAdoption(b,{id:'fixture',adoptions:[b.id],rollbacks:[]},{experimentDigest:h,candidateDigest:h,scopeDigest:h,assessmentPolicyDigest:h,eligible:true},0);
  const observation={id:'observation',adoptionId:a.id,candidateDigest:h,scopeDigest:h,originalRequirementDigest:h,currentRequirementDigest:h,outcome:'confirmed-defect' as const,acceptanceDigest:h,acceptedArtifactDigest:old,observedArtifactDigest:old,evidence:[h]};
  expect(classifyProductionObservation(a,observation)).toMatchObject({state:'escape',hypothesisDigest:h,experimentDigest:h});
  expect(classifyProductionObservation(a,{...observation,currentRequirementDigest:old}).state).toBe('changed-requirements');
  expect(classifyProductionObservation(a,{...observation,outcome:'unknown'}).state).toBe('unknown');
  expect(classifyProductionObservation(a,{...observation,acceptanceDigest:null,acceptedArtifactDigest:null}).state).toBe('caught-defect');
  expect(classifyProductionObservation(a,{...observation,observedArtifactDigest:h}).state).toBe('changed-artifact');
  const rollback=buildRollbackRequest(a,'operator-request',[h]);
  const current={adoptionId:a.id,candidateDigest:h,scopeDigest:h};
  expect(()=>authorizeRollback(a,rollback,{id:'fixture',adoptions:[b.id],rollbacks:[]},0,current)).toThrow(/authority/);
  expect(authorizeRollback(a,rollback,{id:'fixture',adoptions:[b.id],rollbacks:[rollback.id]},0,current).restoreCandidateDigest).toBe(old);
  expect(()=>authorizeRollback(a,rollback,{id:'fixture',adoptions:[b.id],rollbacks:[rollback.id]},0,{...current,candidateDigest:old})).toThrow();
  const later=buildRollbackRequest(a,'operator-request',[h],3000);
  expect(authorizeRollback(a,later,{id:'fixture',adoptions:[],rollbacks:[later.id]},2000,current).application).toBe('not-performed');
 });
 it('keeps missing observations out of complete denominators and never counts changed requirements as escapes',()=>{
  const report=summarizeLeanOutcomes('layout-v1',[
   {population:'layout-v1',complete:true,accepted:true,repairAttempts:0,escape:'none-observed',requirementsChanged:false,decisionWaitMs:10,questions:1},
   {population:'layout-v1',complete:true,accepted:true,repairAttempts:1,escape:'confirmed',requirementsChanged:true,decisionWaitMs:20,questions:2},
   {population:'layout-v1',complete:false,accepted:null,repairAttempts:null,escape:'unknown',requirementsChanged:false,decisionWaitMs:null,questions:null},
  ]);
  expect(report).toMatchObject({firstPassAccepted:1,firstPassDenominator:2,confirmedEscapes:0,changedRequirements:1,incomplete:1,questions:{known:3,observed:2,total:3}});
 });
});
