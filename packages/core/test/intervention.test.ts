import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { freezeIntervention, assessIntervention, interventionEvidenceDigest, createBlindComparison, assertInterventionRoles } from '../src/intervention.js';
const artifact=Buffer.from('synthetic retained output'); const h=createHash('sha256').update(artifact).digest('hex');
const draft=()=>({ family:'intervention' as const, investigationSha256:h, resourceMetric:'wall_ms' as const, axes:['model' as const], common:{mode:'force' as const,scenarioSha256:h,rubricSha256:h,fixtureSha256:h,heldoutSha256:h,harnessSha256:h,judgePolicySha256:h}, proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:[{id:'a',configuration:{model:'fixture:a',effort:'low',skill:h,prompt:h,configuration:h}},{id:'b',configuration:{model:'fixture:b',effort:'low',skill:h,prompt:h,configuration:h}}] });
const rows=(manifest:any)=>['a','b'].map(armId=>({armId,inputDigest:manifest.inputDigest,artifactDigests:[h],cells:[{caseId:'A1',repetition:0,delivery:'PASS' as const,objective:'PASS' as const,criteria:['PASS' as const],suspect:false,artifactSha256:h}],cost:armId==='a'?10:1,costUnit:'wall_ms'}));
const context=(manifest:any,evidence:any[])=>({manifestId:manifest.id,proposer:{requested:'fixture:proposer',canonical:'proposer'},judge:{requested:'fixture:judge',canonical:'judge'},subjects:{a:{requested:'fixture:a',canonical:'subject-a'},b:{requested:'fixture:b',canonical:'subject-b'}},evidenceDigests:Object.fromEntries(evidence.map(e=>[e.armId,interventionEvidenceDigest(e)])),artifacts:new Map([[h,Buffer.from(artifact)]])});
describe('separate frozen intervention comparisons',()=>{
 it('requires explicit changed axes and keeps common inputs frozen',()=>{
  const value=draft(); expect(()=>freezeIntervention({...value,axes:['effort']})).toThrow(/undeclared/);
  const manifest=freezeIntervention(value);expect(manifest.family).toBe('intervention');expect(manifest.deterministicSampling).toBe(false);
 });
 it('requires independent resolved roles and exact host evidence before any eligibility',()=>{
  const manifest=freezeIntervention(draft()), evidence=rows(manifest);
  expect(()=>assertInterventionRoles(manifest,null)).toThrow(/qualification/);
  expect(()=>assertInterventionRoles(manifest,{...context(manifest,evidence),evidenceDigests:{},artifacts:new Map()})).not.toThrow();
  expect(()=>assessIntervention(manifest,evidence,null)).toThrow(/qualification/);
  const auth=context(manifest,evidence);auth.judge.canonical='subject-a';expect(()=>assessIntervention(manifest,evidence,auth)).toThrow(/role/);
  const valid=context(manifest,evidence);evidence[0].cost=0;
  expect(assessIntervention(manifest,evidence,valid).arms[0].state).toBe('ERROR');
 });
 it('keeps missing or undelivered arms incomplete and cheap failing arms ineligible',()=>{
  const manifest=freezeIntervention(draft()), evidence=rows(manifest);let auth=context(manifest,evidence);
  expect(assessIntervention(manifest,evidence.slice(0,1),auth).complete).toBe(false);
  evidence[1].cells[0].objective='FAIL' as any;evidence[1].cells[0].criteria=[];
  const result=assessIntervention(manifest,evidence,context(manifest,evidence));expect(result.complete).toBe(true);
  expect(result.arms.find(a=>a.armId==='b')?.eligible).toBe(false);expect(result.cheapestEligible).toBe('a');expect(result.routingDefault).toBeNull();
  evidence[1].cells[0].delivery='NOT-MEASURED' as any;auth=context(manifest,evidence);expect(assessIntervention(manifest,evidence,auth).complete).toBe(false);
 });
 it('does not treat output digests without retained bytes as measured evidence',()=>{
  const manifest=freezeIntervention(draft()), evidence=rows(manifest), qualified=context(manifest,evidence);qualified.artifacts.clear();
  const result=assessIntervention(manifest,evidence,qualified);expect(result.complete).toBe(false);expect(result.arms[0].state).toBe('MISSING');
  expect(()=>assessIntervention({...manifest,inputDigest:'b'.repeat(64)},evidence,context(manifest,evidence))).toThrow(/changed/);
 });
 it('retains unknown criteria rather than voting them into success',()=>{
  const manifest=freezeIntervention(draft()), evidence=rows(manifest);evidence[0].cells[0].criteria=['UNKNOWN' as any];
  expect(assessIntervention(manifest,evidence,context(manifest,evidence)).complete).toBe(false);
 });
 it('blinds configuration/cost until a quality choice and then locks that choice',()=>{
  const manifest=freezeIntervention(draft()), evidence=rows(manifest), assessment=assessIntervention(manifest,evidence,context(manifest,evidence));
  const blind=createBlindComparison(manifest,assessment,'0'.repeat(64));const view=blind.view();
  expect(createBlindComparison(manifest,assessment,'0'.repeat(64)).view()).toEqual(view);
  expect(JSON.stringify(view)).not.toContain('fixture:a');expect(JSON.stringify(view)).not.toContain('cost');expect(view.cards).toHaveLength(2);
  expect(blind.readArtifact(view.cards[0].label,h).equals(artifact)).toBe(true);
  expect(()=>blind.reveal()).toThrow(/quality/);
  blind.choose({kind:'tie',labels:view.cards.map(c=>c.label)});expect(blind.reveal().arms).toHaveLength(2);
  expect(()=>blind.choose({kind:'tie',labels:view.cards.map(c=>c.label).reverse()})).not.toThrow();
  expect(()=>blind.choose({kind:'none',labels:[]})).toThrow(/locked/);
 });
});
