import { expect, it } from 'vitest';
import { mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTrustLifecycle, openTrustLifecycle, trustPolicyDigest, trustOutcomeDigest } from '../src/trust-lifecycle.js';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { retainWorkSignalObservation } from '../src/work-signal-observation.js';
import { captureWorkSignalCases, readWorkSignalCase } from '../src/work-signal-cases.js';
import { createWorkSignalReviewer } from '../src/work-case-review.js';
const component={kind:'detector' as const,id:'overdue',version:'1',population:'layout'};
function fixture(policy=true){
 const root=mkdtempSync(join(tmpdir(),'trust-connected-')),archiveRoot=join(root,'archive'),directory=join(root,'trust');
 const evidence=retainArchiveSource(archiveRoot,{sourceId:'independent-reference',parser:{id:'fixture-reference',version:'1'},retention:'exact',bytes:Buffer.from('independent fixture labels')}).manifestId;
 const input={archiveRoot,component,seed:'a'.repeat(64),maxUnflagged:2,cohort:Array.from({length:16},(_,i)=>({incidentId:`incident-${i}`,manifestId:evidence,flagged:i<13,split:'calibration' as const})),exposure:policy?{id:'predeclared',component,kind:'positive' as const,split:'calibration' as const,minimumResolved:10,minimumLowerBound:0.1,attentionRemaining:1,expiresAt:1000}:null};
 const store=createTrustLifecycle(directory,input,[trustPolicyDigest(input)]);
 const predictions=Array.from({length:13},(_,i)=>({id:`prediction-${i}`,incidentId:`incident-${i}`,component,kind:'positive' as const,split:'calibration' as const}));
 return {root,directory,input,store,evidence,predictions};
}
it('connects predeclared policy, durable predictions, independent outcomes and attention without resetting on reopen',()=>{
 const f=fixture();for(const p of f.predictions)f.store.predict(p);
 for(let i=0;i<10;i++){const r={kind:'prediction' as const,targetId:f.predictions[i].id,value:i<8,evidenceManifestId:f.evidence,referenceId:`ref-${i}`};expect(()=>f.store.outcome(r,[])).toThrow(/authority/);f.store.outcome(r,[trustOutcomeDigest(r)]);}
 const view=f.store.inspect(10);expect(view.calibration.reports[0]).toMatchObject({correct:8,incorrect:2,resolved:10,unresolved:3,precision:0.8});
 expect(f.store.expose('question-1',10).mode).toBe('ask');const again=openTrustLifecycle(f.directory);
 expect(again.expose('question-1',10).mode).toBe('ask');expect(again.expose('question-2',10).mode).toBe('silent');expect(again.inspect(10).attentionUsed).toBe(1);
 expect(()=>createTrustLifecycle(join(f.root,'refill'),f.input,[trustPolicyDigest(f.input)])).toThrow(/bound/);
 mkdirSync(join(f.root,'copied'),{mode:0o700});cpSync(f.directory,join(f.root,'copied'),{recursive:true});expect(()=>openTrustLifecycle(join(f.root,'copied'))).toThrow(/registration/);
 expect(()=>createTrustLifecycle(f.directory,{...f.input,seed:'b'.repeat(64)},[trustPolicyDigest({...f.input,seed:'b'.repeat(64)})])).toThrow();
});
it('freezes actual unflagged samples before labels and counts misses outside positive precision',()=>{
 const f=fixture(),sample=f.store.inspect(10).sampledIncidentIds;
 expect(sample).toHaveLength(2);expect(sample.every(id=>Number(id.split('-')[1])>=13)).toBe(true);
 const label={kind:'unflagged' as const,targetId:sample[0],value:true,evidenceManifestId:f.evidence,referenceId:'miss'};
 f.store.outcome(label,[trustOutcomeDigest(label)]);expect(f.store.inspect(10).unflagged).toEqual({sampled:2,resolved:1,misses:1,unresolved:1,conflicted:0});
 expect(f.store.inspect(10).calibration.reports).toEqual([]);
 const foreign={...label,targetId:'incident-0',referenceId:'forged'};expect(()=>f.store.outcome(foreign,[trustOutcomeDigest(foreign)])).toThrow(/sample/);
});
it('appends corrections without reusing stale labels or inheriting version trust',()=>{
 const f=fixture();f.store.predict(f.predictions[0]);const r={kind:'prediction' as const,targetId:'prediction-0',value:true,evidenceManifestId:f.evidence,referenceId:'old-label'};f.store.outcome(r,[trustOutcomeDigest(r)]);
 const corrected={...f.predictions[0],id:'corrected'};f.store.correct('prediction-0',corrected,'independent correction');
 expect(f.store.inspect(10).calibration.reports[0]).toMatchObject({resolved:0,unresolved:1});expect(f.store.history().filter(e=>e.value.type==='prediction')).toHaveLength(1);
 expect(()=>f.store.correct('prediction-0',{...corrected,id:'stale'},'again')).toThrow(/stale/);
 expect(()=>f.store.predict({...f.predictions[1],component:{...component,version:'2'}})).toThrow(/scope/);
});
it('links the actual case decision writer and withdraws stale confirmation from confidence',()=>{
 const root=mkdtempSync(join(tmpdir(),'trust-case-link-')),archiveRoot=join(root,'archive'),h='a'.repeat(64),o='b'.repeat(64);
 const observation=retainWorkSignalObservation(archiveRoot,{snapshotDigest:h,scopeValid:true,obligations:[{id:'layout',digest:o,intentDigest:h,policyDigest:h,artifactDigest:h,acceptance:'unaccepted',coverage:'available'}]}, {scopeDigest:h,version:'fixture-v1',population:'layout',expectedWaits:[],checkpoints:[{obligationDigest:o,deadlineMs:1,observedAt:2,status:'pending',evidence:h}],violations:[],priorAccepted:[]});
 const batch=captureWorkSignalCases(archiveRoot,observation.manifestId),manifestId=batch.candidateIds[0],candidate=readWorkSignalCase(archiveRoot,manifestId).candidate,review=createWorkSignalReviewer(archiveRoot,batch.batchId,'reference-operator');
 const decision=review.decide({caseManifestId:manifestId,priorDecisionId:null,disposition:'confirmed_defect',note:'independent fixture reference'}).current;
 const component={kind:'detector' as const,...candidate.detector},input={archiveRoot,component,seed:h,maxUnflagged:0,cohort:[{incidentId:candidate.id,manifestId,flagged:true,split:'calibration' as const}],exposure:null};
 const store=createTrustLifecycle(join(root,'trust'),input,[trustPolicyDigest(input)]);store.predict({id:'prediction',incidentId:candidate.id,component,kind:'positive',split:'calibration'});
 const ref={version:3 as const,batchId:batch.batchId,manifestId,decisionId:decision.id},preview=store.previewCaseOutcome('prediction',ref);
 expect(()=>store.linkCaseOutcome('prediction',ref,[])).toThrow(/authority/);store.linkCaseOutcome('prediction',ref,[preview.digest]);expect(store.inspect(0).calibration.reports[0].correct).toBe(1);
 review.decide({caseManifestId:manifestId,priorDecisionId:decision.id,disposition:'expected_behavior',note:'withdrawn'});
 expect(store.inspect(0).calibration.reports[0]).toMatchObject({resolved:0,unresolved:1});
});
it('keeps missing/expired policies silent and conflicting reference outcomes unresolved',()=>{
 const f=fixture(false);f.store.predict(f.predictions[0]);for(const value of [true,false]){const r={kind:'prediction' as const,targetId:'prediction-0',value,evidenceManifestId:f.evidence,referenceId:String(value)};f.store.outcome(r,[trustOutcomeDigest(r)]);}
 expect(f.store.inspect(10).calibration.reports[0]).toMatchObject({resolved:0,unresolved:1,conflicted:1});expect(f.store.expose('q',10).mode).toBe('silent');
 const g=fixture();expect(g.store.expose('expired',1001).mode).toBe('silent');expect(()=>g.store.expose('rewind',10)).toThrow(/clock/);
});
it('durably retires under the predeclared policy; a later corrected prediction does not reactivate it',()=>{
 const f=fixture(),input={...f.input,exposure:{...f.input.exposure!,minimumResolved:1,retireBelowUpperBound:1}};
 const store=createTrustLifecycle(join(f.root,'retiring'),input,[trustPolicyDigest(input)]);store.predict(f.predictions[0]);
 const bad={kind:'prediction' as const,targetId:'prediction-0',value:false,evidenceManifestId:f.evidence,referenceId:'bad'};store.outcome(bad,[trustOutcomeDigest(bad)]);expect(store.expose('retire',10).mode).toBe('retire');
 store.correct('prediction-0',{...f.predictions[0],id:'fixed'},'correction');const good={...bad,targetId:'fixed',value:true,referenceId:'good'};store.outcome(good,[trustOutcomeDigest(good)]);
 const reopened=openTrustLifecycle(join(f.root,'retiring'));expect(reopened.expose('later',11).mode).toBe('retire');expect(reopened.inspect(11).grantExpansion).toBe(false);
});
