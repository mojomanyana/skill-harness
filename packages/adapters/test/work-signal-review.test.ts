import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainWorkSignalObservation } from '../src/work-signal-observation.js';
import { captureWorkSignalCases } from '../src/work-signal-cases.js';
import { createWorkCaseReviewer, createWorkSignalReviewer } from '../src/work-case-review.js';
import { readArchiveSource, retainArchiveSource } from '../src/evidence-archive.js';
const h='a'.repeat(64),o='b'.repeat(64),p='c'.repeat(64);
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'work-signal-review-'));
 const snapshot={snapshotDigest:h,scopeValid:true,obligations:[{id:'layout',digest:o,intentDigest:p,policyDigest:p,artifactDigest:p,acceptance:'unaccepted' as const,coverage:'available' as const}]};
 const facts={scopeDigest:h,version:'fixture-v1',population:'layout',expectedWaits:[],checkpoints:[{obligationDigest:o,deadlineMs:10,observedAt:11,status:'pending' as const,evidence:p}],violations:[],priorAccepted:[]};
 const observation=retainWorkSignalObservation(root,snapshot,facts);
 return {root,snapshot,facts,observation,...captureWorkSignalCases(root,observation.manifestId)};
}
describe('explicit work signal review bridge',()=>{
 it('rederives case-v3 cards and persists decisions through the existing real writer',()=>{
  const f=fixture(),review=createWorkSignalReviewer(f.root,f.batchId,'operator-fixture');
  const page=review.list();expect(page.total).toBe(1);
  expect(page.items[0].candidate).toMatchObject({capture_schema:3,reason:'overdue_checkpoint',visibility:'silent'});
  const request={caseManifestId:f.candidateIds[0],priorDecisionId:null,disposition:'expected_behavior' as const,note:'declared checkpoint withdrawn'};
  const first=review.decide(request);
  expect(first.current.author).toBe('operator-fixture');expect(first.current.evidence).toEqual([f.candidateIds[0]]);
  expect(review.decide(request).replayed).toBe(true);
  expect(createWorkSignalReviewer(f.root,f.batchId,'operator-fixture').list().items[0].disposition).toBe('expected_behavior');
  expect(()=>review.decide({...request,disposition:'confirmed_defect'})).toThrow(/stale/);
 });
 it('does not silently expand the old v2 review contract',()=>{
  const f=fixture();expect(()=>createWorkCaseReviewer(f.root,f.batchId,'operator')).toThrow(/batch/);
 });
 it('refuses decisions if original frozen facts disappear after opening the reviewer',()=>{
  const f=fixture(),review=createWorkSignalReviewer(f.root,f.batchId,'operator');
  const source=readArchiveSource(f.root,f.observation.manifestId);if(source.status!=='available')throw new Error('fixture');
  unlinkSync(join(f.root,'objects',source.reference.sha256));
  expect(()=>review.list()).toThrow(/unavailable/);
  expect(()=>review.decide({caseManifestId:f.candidateIds[0],priorDecisionId:null,disposition:'confirmed_defect',note:'no evidence'})).toThrow(/unavailable/);
  expect(existsSync(join(f.root,'case-decisions'))).toBe(false);
 });
 it('refuses a valid case from a different observation smuggled into a selected batch',()=>{
  const f=fixture();
  const next=retainWorkSignalObservation(f.root,f.snapshot,{...f.facts,checkpoints:[{...f.facts.checkpoints[0],observedAt:12}]});
  const other=captureWorkSignalCases(f.root,next.manifestId);
  const altered=retainArchiveSource(f.root,{sourceId:`work-signal-batch-${f.observation.manifestId}`,parser:{id:'work-signal-batch',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify({version:'work-signal-batch-v1',observationId:f.observation.manifestId,candidateIds:other.candidateIds,visibility:'silent',promotion:'not-authorized'}))});
  const review=createWorkSignalReviewer(f.root,altered.manifestId,'operator');
  expect(()=>review.decide({caseManifestId:other.candidateIds[0],priorDecisionId:null,disposition:'confirmed_defect',note:'unbound'})).toThrow(/outside frozen/);
  expect(existsSync(join(f.root,'case-decisions'))).toBe(false);
 });
 it('shows unresolved observation coverage even with no nominated cards',()=>{
  const f=fixture();
  const unresolved=retainWorkSignalObservation(f.root,{...f.snapshot,scopeValid:false},f.facts);
  const batch=captureWorkSignalCases(f.root,unresolved.manifestId);
  expect(createWorkSignalReviewer(f.root,batch.batchId,'operator').list()).toMatchObject({total:0,items:[],issues:['scope-unresolved']});
 });
 it('keeps selection, five-card bounds and changed observations separate',()=>{
  const f=fixture(),review=createWorkSignalReviewer(f.root,f.batchId,'operator');
  const next=retainWorkSignalObservation(f.root,f.snapshot,{...f.facts,checkpoints:[{...f.facts.checkpoints[0],observedAt:12}]});
  const other=captureWorkSignalCases(f.root,next.manifestId);
  expect(()=>review.history(other.candidateIds[0])).toThrow(/outside/);
  expect(()=>review.list(0,6)).toThrow(/bounded/);
  expect(review.list().items[0].priorDecisionId).toBe(null);
 });
});
