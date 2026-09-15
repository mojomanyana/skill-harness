import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { learningFile, learningHash, learningCopy } from './learning-journal.js';
import { retainArchiveSource, readArchiveSource } from './evidence-archive.js';
import { observePiSession, observeSessionLedger, sessionText, type SessionObservation } from './session-observation.js';

export interface SessionSourceSelection { kind:'parent'|'child'|'ledger'|'feedback'|'artifact'; path:string; executionId?:string }
export interface Source { kind:SessionSourceSelection['kind']; path:string; sha256:string; bytes:number; executionId:string|null }
export interface SessionImportPreview {
  version:'session-import-preview-v1'; digest:string; sources:Source[];
  parent:SessionObservation; children:{source:number;executionId:string|null;session:SessionObservation}[];
  attempts:ReturnType<typeof observeSessionLedger>; gaps:string[]; acceptance:'not-assessed';
}
type Captured={preview:SessionImportPreview;buffers:Buffer[]};
const captured=new WeakMap<object,Captured>();
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function checkedSelections(input:SessionSourceSelection[]) {
  if(!Array.isArray(input)||input.length<1||input.length>16)throw Error('select 1–16 explicit session sources');
  const seen=new Set<string>(),executions=new Set<string>();let parents=0,ledgers=0;
  for(const s of input){
    if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['kind','path','executionId'].includes(k)))throw Error('closed source selection required');
    if(!['parent','child','ledger','feedback','artifact'].includes(s.kind)||typeof s.path!=='string'||resolve(s.path)!==s.path)throw Error('explicit absolute source path required');
    if(seen.has(s.path))throw Error('duplicate session source');seen.add(s.path);
    if(s.kind==='parent')parents++;if(s.kind==='ledger')ledgers++;
    if(s.executionId!==undefined){
      if(s.kind!=='child'||!/^exec:[0-9a-f-]{36}$/i.test(s.executionId)||executions.has(s.executionId))throw Error('unique child execution id required');
      executions.add(s.executionId);
    }
  }
  if(parents!==1||ledgers>1)throw Error('exactly one parent and at most one ledger required');
}
function projectSession(selections:SessionSourceSelection[],buffers:Buffer[]) {
  const parent=observePiSession(buffers[selections.findIndex(s=>s.kind==='parent')]);
  const children=selections.flatMap((s,i)=>s.kind==='child'?[{source:i,executionId:s.executionId??null,session:observePiSession(buffers[i])}]:[]);
  if(new Set([parent.sessionId,...children.map(c=>c.session.sessionId)]).size!==children.length+1)throw Error('duplicate parent/child session id');
  const ledger=selections.findIndex(s=>s.kind==='ledger'),attempts=ledger<0?[]:observeSessionLedger(buffers[ledger]);
  for(const child of children)if(child.executionId&&!attempts.some(a=>a.executionId===child.executionId))throw Error('selected child execution absent from ledger');
  const gaps=[...parent.gaps,'No quality, acceptance, calibrated learning or adoption is inferred from this import.'];
  for(const child of children)gaps.push(...child.session.gaps.map(g=>'Child source '+(child.source+1)+' ('+child.session.sessionId+'): '+g));
  if(ledger<0)gaps.push('No delegation ledger selected.');
  else gaps.push('Ledger/session association is operator-selected, not authenticated; ledger may include other sessions.');
  if(attempts.length>children.filter(c=>c.executionId).length)gaps.push('Child transcript coverage incomplete; no combined token total is claimed.');
  if(children.length)gaps.push('Child execution mappings are explicit operator declarations, not proof of parentage. Each transcript has separate usage.');
  if(!selections.some(s=>s.kind==='feedback'))gaps.push('External feedback not supplied; user messages remain available for review.');
  if(!selections.some(s=>s.kind==='artifact'))gaps.push('No final artifact or source snapshot supplied.');
  return {parent,children,attempts,gaps};
}
/** Explicit local selection only. Does not scan session directories, follow links, or contact workers. */
export function prepareSessionImport(selections:SessionSourceSelection[]):SessionImportPreview {
  checkedSelections(selections);
  const buffers=selections.map(s=>learningFile(s.path,8*1024*1024));
  if(buffers.reduce((n,b)=>n+b.length,0)>32*1024*1024)throw Error('session selection exceeds 32 MiB');
  const sources:Source[]=selections.map((s,i)=>({...s,executionId:s.executionId??null,sha256:sha(buffers[i]),bytes:buffers[i].length}));
  const {parent,children,attempts,gaps}=projectSession(selections,buffers);
  const digest=learningHash({version:'session-selection-v1',sources});
  const preview:SessionImportPreview={version:'session-import-preview-v1',digest,sources,parent,children,attempts,gaps,acceptance:'not-assessed'};
  captured.set(preview,{preview:learningCopy(preview),buffers});
  return preview;
}
interface RetainedSession {version:'retrospective-session-v1';selectionDigest:string;sources:(Source&{manifestId:string})[]}
export function retainSessionImport(root:string,preview:SessionImportPreview,expectedDigest:string) {
  const c=captured.get(preview);
  if(!c||learningHash(c.preview)!==learningHash(preview)||expectedDigest!==c.preview.digest)throw Error('exact preview digest required; changed or forged session import');
  for(const s of c.preview.sources)if(sha(learningFile(s.path,8*1024*1024))!==s.sha256)throw Error('session source changed since preview; prepare again');
  const sources=c.preview.sources.map((s,i)=>{
    const parser=s.kind==='parent'||s.kind==='child'?'pi-session-jsonl':s.kind==='ledger'?'pi-daddy-session-ledger':'session-evidence';
    const r=retainArchiveSource(root,{sourceId:'session-'+s.sha256,parser:{id:parser,version:'1'},retention:'exact',bytes:c.buffers[i]});
    return {...s,manifestId:r.manifestId};
  });
  const record:RetainedSession={version:'retrospective-session-v1',selectionDigest:preview.digest,sources};
  return retainArchiveSource(root,{sourceId:'retrospective-'+preview.digest,parser:{id:'retrospective-session',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify(record))}).manifestId;
}
export function readRetainedSession(root:string,manifestId:string) {
  const selected=readArchiveSource(root,manifestId);
  if(selected.status!=='available'||selected.reference.retention!=='exact'||selected.reference.parser.id!=='retrospective-session'||selected.reference.parser.version!=='1')throw Error('retained session unavailable or unsupported');
  const record=JSON.parse(sessionText(selected.bytes)) as RetainedSession;
  if(!record||record.version!=='retrospective-session-v1'||Object.keys(record).sort().join()!=='selectionDigest,sources,version'||!Array.isArray(record.sources))throw Error('invalid retained session');
  checkedSelections(record.sources.map(s=>({kind:s.kind,path:s.path,...(s.executionId===null?{}:{executionId:s.executionId})})));
  const sources=record.sources.map(s=>{
    if(Object.keys(s).sort().join()!=='bytes,executionId,kind,manifestId,path,sha256')throw Error('invalid retained session source');
    const r=readArchiveSource(root,s.manifestId);
    if(r.status!=='available'||r.reference.retention!=='exact'||r.reference.sha256!==s.sha256||r.bytes.length!==s.bytes)throw Error('retained session source missing or changed');
    return {selection:s,bytes:r.bytes};
  });
  if(sources.reduce((n,s)=>n+s.bytes.length,0)>32*1024*1024)throw Error('session selection exceeds 32 MiB');
  const plain=record.sources.map(({manifestId,...s})=>s);
  if(learningHash({version:'session-selection-v1',sources:plain})!==record.selectionDigest)throw Error('retained session selection mismatch');
  const projection=projectSession(record.sources.map(s=>({kind:s.kind,path:s.path,...(s.executionId===null?{}:{executionId:s.executionId})})),sources.map(s=>s.bytes));
  return {version:record.version,manifestId,selectionDigest:record.selectionDigest,sources:record.sources,...projection,acceptance:'not-assessed' as const};
}
export function readRetainedSessionSource(root:string,manifestId:string,index:number):Buffer {
  const session=readRetainedSession(root,manifestId),source=session.sources[index];
  if(!Number.isSafeInteger(index)||!source)throw Error('select a listed session source');
  const result=readArchiveSource(root,source.manifestId);if(result.status!=='available')throw Error('session source unavailable');
  return result.bytes;
}
