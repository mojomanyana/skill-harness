import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainWorkSignalObservation, readWorkSignalObservation } from '../src/work-signal-observation.js';
import { readArchiveSource, retainArchiveSource } from '../src/evidence-archive.js';
import type { WorkSignalFacts, WorkSignalSnapshot } from '@skill-harness/core';
const h='a'.repeat(64),o='b'.repeat(64),p='c'.repeat(64);
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'work-signal-observation-'));
 const snapshot:WorkSignalSnapshot={snapshotDigest:h,scopeValid:true,obligations:[{id:'layout',digest:o,intentDigest:p,policyDigest:p,artifactDigest:p,acceptance:'unaccepted',coverage:'available'}]};
 const facts:WorkSignalFacts={scopeDigest:h,version:'fixture-v1',population:'layout',expectedWaits:[],checkpoints:[{obligationDigest:o,deadlineMs:10,observedAt:11,status:'pending',evidence:p}],violations:[],priorAccepted:[]};
 return {root,snapshot,facts};
}
describe('frozen private work signal observations',()=>{
 it('retains exact closed host facts and rederives versioned cases without promotion',()=>{
  const f=fixture(),a=retainWorkSignalObservation(f.root,f.snapshot,f.facts);
  const b=readWorkSignalObservation(f.root,a.manifestId);
  expect(b.detection.cases[0]).toMatchObject({capture_schema:3,reason:'overdue_checkpoint',status:'unresolved',visibility:'silent'});
  expect(b.input).toMatchObject({snapshot:f.snapshot,facts:f.facts});
  expect(retainWorkSignalObservation(f.root,f.snapshot,{...f.facts})).toEqual(a);
  f.facts.checkpoints[0].status='met';
  expect(readWorkSignalObservation(f.root,a.manifestId).detection).toEqual(b.detection);
  expect(retainWorkSignalObservation(f.root,f.snapshot,f.facts).manifestId).not.toBe(a.manifestId);
 });
 it('rejects unknown properties and getters before reading them or writing archive data',()=>{
  const f=fixture();let reads=0;
  Object.defineProperty(f.facts,'extra',{enumerable:true,get(){reads++;return 'not-approved-for-retention'}});
  expect(()=>retainWorkSignalObservation(f.root,f.snapshot,f.facts)).toThrow(/closed/);
  expect(reads).toBe(0);expect(readdirSync(f.root)).toEqual([]);
 });
 it('rejects sparse arrays and duplicate obligation identities instead of last-write election',()=>{
  const f=fixture();f.snapshot.obligations.push({...f.snapshot.obligations[0],coverage:'unknown'});
  expect(()=>retainWorkSignalObservation(f.root,f.snapshot,f.facts)).toThrow(/duplicate/);
  f.snapshot.obligations.length=1;f.facts.checkpoints.length=2;
  expect(()=>retainWorkSignalObservation(f.root,f.snapshot,f.facts)).toThrow(/array/);
  expect(readdirSync(f.root)).toEqual([]);
 });
 it.each(['missing','corrupt'])('does not rederive predictions from %s frozen bytes',mode=>{
  const f=fixture(),a=retainWorkSignalObservation(f.root,f.snapshot,f.facts);
  const s=readArchiveSource(f.root,a.manifestId);if(s.status!=='available')throw new Error('fixture missing');
  const path=join(f.root,'objects',s.reference.sha256);
  if(mode==='missing')unlinkSync(path);else writeFileSync(path,'corrupt');
  expect(()=>readWorkSignalObservation(f.root,a.manifestId)).toThrow(/unavailable/);
 });
 it('does not expose malformed retained JSON in diagnostics',()=>{
  const f=fixture();
  const a=retainArchiveSource(f.root,{sourceId:`work-signals-${h}`,parser:{id:'work-signal-observation',version:'1'},retention:'exact',bytes:Buffer.from('{not-approved-for-diagnostics')});
  expect(()=>readWorkSignalObservation(f.root,a.manifestId)).toThrow('invalid work signal observation JSON');
 });
 it('rejects wrong parser/source bindings and preserves unresolved scope without candidates',()=>{
  const f=fixture();f.snapshot.scopeValid=false;
  const a=retainWorkSignalObservation(f.root,f.snapshot,f.facts);
  expect(readWorkSignalObservation(f.root,a.manifestId).detection).toMatchObject({cases:[],issues:['scope-unresolved']});
  const s=readArchiveSource(f.root,a.manifestId);if(s.status!=='available')throw new Error('fixture missing');
  const wrong=retainArchiveSource(f.root,{sourceId:'unbound',parser:s.reference.parser,retention:'exact',bytes:s.bytes});
  expect(()=>readWorkSignalObservation(f.root,wrong.manifestId)).toThrow(/binding/);
  const parser=retainArchiveSource(f.root,{sourceId:s.reference.sourceId,parser:{id:s.reference.parser.id,version:'99'},retention:'exact',bytes:s.bytes});
  expect(()=>readWorkSignalObservation(f.root,parser.manifestId)).toThrow(/unavailable/);
 });
});
