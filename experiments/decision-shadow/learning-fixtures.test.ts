import { evaluateWorkflowFixture } from './workflow-fixtures.mjs';
import { describe,it,expect } from 'vitest';
import { createLearningFixtures,evaluateFixture } from './learning-fixtures.mjs';
import { parseCases,parseLabels } from './dataset.mjs';
import { learningDigest } from './learning-data.mjs';

describe('prospective mechanical fixture oracles',()=>{
 it('produces 24 distinct cases, six entire families and independently reproducible label receipts',()=>{
  const f=createLearningFixtures(),cases=parseCases(f.caseDocument),labels=parseLabels(f.labelDocument,cases);
  expect(cases).toHaveLength(24);expect(new Set(cases.map(c=>c.hash)).size).toBe(24);expect(f.fixtureOnly).toBe(true);expect(f.trainingEligible).toBe(false);
  const expected=[[true,false,false,false],[true,false,false,false],[true,true,false,false],[true,false,false,false],[true,false,false,true],[true,false,false,false]].flat();
  expect(labels.map(l=>l.value)).toEqual(expected);
  for(const [i,c] of cases.entries()){const evidence=f.labelReceipts[i],r=JSON.parse(evidence.bytes);expect(learningDigest(evidence.bytes)).toBe(labels[i].evidenceSha256);expect(r.caseHash).toBe(c.hash);expect(r.source).toEqual(c.source);expect(r.value).toBe(expected[i]);expect(r.method.kind).toBe('deterministic-test');expect(c.provenance).toBe('synthetic');}
  expect(createLearningFixtures()).toEqual(f);
 });
 it('does not infer missing identity, observations, capability qualification, report availability or receipt settlement',()=>{
  expect(evaluateFixture('candidate',{})).toBe(false);expect(evaluateFixture('candidate',{candidate:'',tested:'',reviewed:''})).toBe(false);
  expect(evaluateFixture('phases',{required:[],records:[]})).toBe(false);expect(evaluateFixture('phases',{required:['a','a'],records:[]})).toBe(false);
  expect(evaluateFixture('findings',{records:[]})).toBe(false);expect(evaluateFixture('findings',{historyObserved:true,records:[{step:'a',findings:[{id:'1',source:'report',status:'accepted'}]}]})).toBe(false);
  expect(evaluateFixture('capability',{required:['read'],available:['read'],backendQualified:true})).toBe(false);
  expect(evaluateFixture('report',{protocol:'saved-full-report-and-five-line-summary',persistence:'unknown',requestedDelivery:'saved-full-report-and-five-line-summary',reportReference:'required'})).toBe(false);
  expect(evaluateFixture('cleanup',{executionId:'same',state:'settled',receipt:{executionId:'same',reapedAll:true}})).toBe(false);
  for(const step of [undefined,null,'','   ',42])expect(evaluateFixture('findings',{historyObserved:true,records:[{step,findings:[{id:'f1',source:'report',status:'verified'}]}]})).toBe(false);
  expect(()=>evaluateFixture('general-readiness',{})).toThrow();
 });
});

describe('opt-in workflow convergence corpus', () => {
 it('keeps the historical corpus default and produces independently reproducible grouped workflow labels', () => {
  expect(createLearningFixtures({set:'mechanical'})).toEqual(createLearningFixtures());
  const fixture=createLearningFixtures({set:'workflow'});
  const cases=parseCases(fixture.caseDocument), labels=parseLabels(fixture.labelDocument,cases);
  expect(labels.map(label=>label.value)).toEqual([
   true,false,false,false, true,false,false,false, true,false,false,false,
   true,false,true,false, true,false,false,false,
  ]);
  expect(new Set(cases.map(c=>c.hash)).size).toBe(cases.length);
  expect(fixture.manifest.id).toBe('workflow-convergence-20-v1');
  expect(fixture.trainingEligible).toBe(false);
  for(const [index,c] of cases.entries()){
   const receipt=JSON.parse(fixture.labelReceipts[index].bytes);
   expect(receipt.value).toBe(evaluateWorkflowFixture(c.id.split('-')[1],JSON.parse(c.input)));
   expect(learningDigest(fixture.labelReceipts[index].bytes)).toBe(labels[index].evidenceSha256);
   expect(receipt.source).toEqual(c.source);
   expect(c.provenance).toBe('synthetic');
  }
  const splits=new Map<string,Set<string>>();
  for(const entry of fixture.manifest.entries){
   const family=splits.get(entry.lineageGroup)??new Set<string>();family.add(entry.split);splits.set(entry.lineageGroup,family);
   expect(entry).toMatchObject({fixtureOnly:true,sessionId:null,trainingApproved:false});
  }
  expect([...splits.values()].every(values=>values.size===1)).toBe(true);
  expect(()=>createLearningFixtures({set:'archive'})).toThrow(/Fixture set/);
 });
 it('does not infer workspace access, candidate equivalence, review completion or safe reuse from absent facts',()=>{
  for(const family of ['workspace','identity','evidence','routing','reuse'])expect(evaluateWorkflowFixture(family,{})).toBe(false);
  expect(evaluateWorkflowFixture('evidence',{candidateMatched:true,referencesVerified:true,obligations:[{id:'closeout',due:'finish',state:'pending'}]})).toBe(false);
  expect(evaluateWorkflowFixture('routing',{observationComplete:true,productFindings:[],dueEvidenceGaps:[],next:'git-ops'})).toBe(true);
  const valid={operation:'static-inspection',purpose:'same-check',currentInput:'a'.repeat(64),currentEnvironment:'env1',previous:{state:'complete',input:'a'.repeat(64),environment:'env1',outputsVerified:true}};
  expect(evaluateWorkflowFixture('reuse',{...valid,previous:{...valid.previous,state:'running'}})).toBe(false);
  expect(evaluateWorkflowFixture('reuse',{...valid,currentEnvironment:'env2'})).toBe(false);
  expect(evaluateWorkflowFixture('reuse',{...valid,currentInput:'b'.repeat(64)})).toBe(false);
 });
});