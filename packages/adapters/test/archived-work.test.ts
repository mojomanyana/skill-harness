import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { retainArchiveSource } from '../src/evidence-archive.js';
import * as pureWork from '../src/generated/work-v4/reader.js';
import { readArchivedWork, captureArchivedWorkCandidates, captureArchivedWorkSignals } from '../src/archived-work.js';
import { readWorkSignalObservation } from '../src/work-signal-observation.js';
import { createWorkSignalReviewer } from '../src/work-case-review.js';
const roots:string[]=[];
function fixture(){const root=mkdtempSync(join(tmpdir(),'archived-work-'));roots.push(root);const events=JSON.parse(readFileSync(resolve(__dirname,'../../../contracts/pi-daddy/work/v4/fixtures/layout-options.json'),'utf8'));const text=events.map((e:unknown)=>JSON.stringify(e)).join('\n')+'\n';const snapshot=events.find((e:any)=>e.event==='work_snapshot');const context={selectedSnapshot:{snapshot:{id:snapshot.payload.snapshot.snapshotId,digest:snapshot.payload.snapshot.digest},event:{eventId:snapshot.eventId,digest:snapshot.digest}},authority:null};const stored=retainArchiveSource(root,{sourceId:'work',parser:{id:'pi-daddy-work-ledger',version:'4'},retention:'exact',bytes:Buffer.from(text)});return{root,stored,context,text};}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
describe('actual archived P01 projection',()=>{
 it('extracts only the pure producer facade, not append or filesystem inspection',()=>{expect(pureWork).not.toHaveProperty('appendWorkLedgerEvent');expect(pureWork).not.toHaveProperty('inspectWorkLedger');});
 it('replays exact producer fixtures without loading authority from wire',()=>{const f=fixture();const read=readArchivedWork(f.root,f.stored.manifestId,f.context);expect(read.state).toBe('available');if(read.state!=='available')throw Error('missing');expect(read.projection.scopeState).toBe('valid');expect(read.projection.runtime?.counts.attempts).toBe(2);expect(read.projection.runtime?.counts.variants).toBe(3);expect(read.projection.progress?.accepted).toBe(0);expect(read.projection.obligations.some(o=>o.acceptance==='accepted-under-supplied-authority')).toBe(false);});
 it('keeps missing and redacted sources unprojected',()=>{const f=fixture();unlinkSync(join(f.root,'objects',f.stored.reference.sha256));expect(readArchivedWork(f.root,f.stored.manifestId,f.context).state).toBe('missing');const redacted=retainArchiveSource(f.root,{sourceId:'redacted',parser:{id:'pi-daddy-work-ledger',version:'4'},retention:'redacted',bytes:Buffer.from(f.text)});expect(readArchivedWork(f.root,redacted.manifestId,f.context).state).toBe('error');});
 it('maps actual pinned bindings into frozen signals without inventing acceptance authority',()=>{
  const f=fixture();const actual=readArchivedWork(f.root,f.stored.manifestId,f.context);if(actual.state!=='available')throw Error('fixture missing');
  const binding=actual.projection.obligations[0].binding;
  const facts={scopeDigest:f.context.selectedSnapshot.snapshot.digest,version:'fixture-revision-bindings-v1',population:'layout',expectedWaits:[],checkpoints:[],violations:[{obligationDigest:binding.obligation.digest,status:'FAIL' as const,evidence:f.stored.reference.sha256}],priorAccepted:[]};
  const result=captureArchivedWorkSignals(f.root,f.stored.manifestId,f.context,facts);
  const observed=readWorkSignalObservation(f.root,result.observationId);
  expect(observed.input.snapshot.obligations[0]).toMatchObject({id:binding.obligation.id,digest:binding.obligation.digest,intentDigest:binding.intent.digest,policyDigest:binding.policy.digest,artifactDigest:binding.artifact?.digest??null});
  expect(result).toMatchObject({workManifestId:f.stored.manifestId,workSha256:f.stored.reference.sha256,acceptance:'not-assessed'});
  const page=createWorkSignalReviewer(f.root,result.caseBatchId,'operator').list();
  expect(page.items).toHaveLength(actual.projection.obligations.length);
  expect(page.items.every(i=>i.candidate.classification==='coverage_issue')).toBe(true);
  expect(()=>captureArchivedWorkSignals(f.root,f.stored.manifestId,f.context,{...facts,scopeDigest:'e'.repeat(64)})).toThrow(/scope/);
  unlinkSync(join(f.root,'objects',f.stored.reference.sha256));
  expect(()=>captureArchivedWorkSignals(f.root,f.stored.manifestId,f.context,facts)).toThrow(/incomplete/);
 });
 it('uses the real producer projection for silent candidate capture and refuses incomplete input',()=>{const f=fixture();const result=captureArchivedWorkCandidates(f.root,f.stored.manifestId,f.context,{version:'fixture',population:'layout',scopeDigest:f.context.selectedSnapshot.snapshot.digest,minEquivalentAttempts:2,expectedWaits:[],expectedFailures:[]});expect(result.workManifestId).toBe(f.stored.manifestId);const bad=retainArchiveSource(f.root,{sourceId:'bad',parser:{id:'pi-daddy-work-ledger',version:'4'},retention:'exact',bytes:Buffer.from(f.text+'{"partial":')});expect(()=>captureArchivedWorkCandidates(f.root,bad.manifestId,f.context,{version:'fixture',population:'layout',scopeDigest:f.context.selectedSnapshot.snapshot.digest,minEquivalentAttempts:2,expectedWaits:[],expectedFailures:[]})).toThrow(/incomplete/);});
});
