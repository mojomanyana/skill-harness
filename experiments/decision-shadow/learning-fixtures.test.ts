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
