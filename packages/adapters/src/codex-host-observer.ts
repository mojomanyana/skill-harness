import { createHash, randomBytes } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { learningCopy, learningJournal, learningHash } from './learning-journal.js';
import { collapseVotePanel, type PanelVote } from '@skill-harness/core';
import { inertCodexSdkStreams, type CodexSdkBinding } from './codex-sdk-transport.js';

/** LOCAL host protocol with an inert installed-SDK seam; no auth loader or live network switch.
 * The trusted host owns this module and transport streams; the subject gets framed IPC only.
 * Stream finish proves a host-side write, NOT provider receipt, backend identity or token limits.
 * Journal integrity assumes a trusted cooperative host/filesystem, not hostile same-UID rollback. */
export const CODEX_SUBSCRIPTION_DESTINATION = 'https://chatgpt.com/backend-api/codex/responses';
const MODELS = ['gpt-5.3-codex-spark','gpt-5.4','gpt-5.4-mini','gpt-5.5','gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra'];
const sha = (b:string|Buffer) => createHash('sha256').update(b).digest('hex');
type Role = 'proposer'|'subject'|'judge';
export interface LocalCodexInvocation { id:string; role:Role; model:string; effort:'low'|'medium'|'high'; instructions:string; input:string; expectedSha256:string; subjectId:string|null }
export interface LocalCodexHostSpec { version:'codex-host-local-v1'; maxCalls:number; wallMs:number; invocations:LocalCodexInvocation[] }
export interface LocalCodexObservation { id:string; sequence:number; requestBody:string; requestSha256:string; outputBase64:string; outputSha256:string; objective:'PASS'|'FAIL'; providerInternalFacts:null; liveQualified:false }
function closed(v:object, keys:string[]) { if(!v||Object.keys(v).sort().join()!==keys.sort().join())throw Error('closed local Codex contract required'); }
function admit(raw:LocalCodexHostSpec) {
 const s=learningCopy(raw);closed(s,['version','maxCalls','wallMs','invocations']);
 if(s.version!=='codex-host-local-v1'||!Number.isSafeInteger(s.maxCalls)||s.maxCalls<1||s.maxCalls>16||!Number.isSafeInteger(s.wallMs)||s.wallMs<1||s.wallMs>150000||!Array.isArray(s.invocations)||!s.invocations.length||s.invocations.length>s.maxCalls)throw Error('bounded local host spec required');
 for(const i of s.invocations){closed(i,['id','role','model','effort','instructions','input','expectedSha256','subjectId']);if(!/^[a-zA-Z0-9_-]{1,64}$/.test(i.id)||!['proposer','subject','judge'].includes(i.role)||!MODELS.includes(i.model)||!['low','medium','high'].includes(i.effort)||typeof i.instructions!=='string'||typeof i.input!=='string'||Buffer.byteLength(i.instructions)+Buffer.byteLength(i.input)>4096||!/^[a-f0-9]{64}$/.test(i.expectedSha256))throw Error('unresolved or unbounded subscription invocation');}
 if(new Set(s.invocations.map(i=>i.id)).size!==s.invocations.length)throw Error('duplicate invocation');
 if(s.invocations.some((i,k)=>s.invocations.some((j,l)=>k!==l&&i.model===j.model&&(i.role!==j.role||i.role==='judge'&&i.subjectId===j.subjectId))))throw Error('known model role conflict before effects');
 for(const i of s.invocations){if(i.role==='judge'?!s.invocations.some(t=>t.role==='subject'&&t.id===i.subjectId):i.subjectId!==null)throw Error('frozen subject/panel binding required');if(s.invocations.filter(t=>t.role==='judge'&&t.subjectId===i.id).length>3)throw Error('at most three panel roles');}
 return s;
}
/** This checks supplied policy consistency, never authenticates its source or invents lineage. */
export function inspectCodexRoleSeparation(raw:Array<{role:Role;model:string;canonical:string|null;lineage:string|null}>) {
 const rows=learningCopy(raw);const blocked=(reason:string)=>({state:'BLOCKED' as const,reason,liveQualified:false as const});
 if(!Array.isArray(rows)||rows.length<3||rows.length>16||!['proposer','subject','judge'].every(r=>rows.some(x=>x.role===r)))return blocked('required roles absent');
 for(const r of rows){closed(r,['role','model','canonical','lineage']);if(!['proposer','subject','judge'].includes(r.role)||!MODELS.includes(r.model))return blocked('unsupported exact subscription identity');}
 if(rows.some(r=>typeof r.canonical!=='string'||!r.canonical||r.canonical.length>512||/[\u0000-\u001f\u007f]/.test(r.canonical)))return blocked('unresolved canonical identity');
 if(rows.some(r=>r.lineage!==null&&(typeof r.lineage!=='string'||!r.lineage||r.lineage.length>512||/[\u0000-\u001f\u007f]/.test(r.lineage))))return blocked('malformed lineage disclosure');
 if(new Set(rows.map(r=>r.model)).size!==rows.length||new Set(rows.map(r=>r.canonical)).size!==rows.length)return blocked('canonical identity conflict');
 const disclosures=[...new Set(rows.flatMap(r=>r.lineage===null?['lineage unresolved; correlation unknown']:rows.filter(x=>x.lineage===r.lineage).length>1?[`shared lineage: ${r.lineage}`]:[]))];
 return {state:'CONSISTENT_DECLARATION_ONLY' as const,reason:'canonical declarations are not authenticated resolution; lineage is disclosed, not proof of training independence',disclosures,liveQualified:false as const};
}
function readBounded(stream:Readable, limit:number, signal:AbortSignal):Promise<Buffer> {
 return new Promise((resolve,reject)=>{const chunks:Buffer[]=[];let size=0,ended=false;
  const cleanup=()=>{stream.off('data',data);stream.off('end',end);stream.off('error',error);stream.off('close',close);signal.removeEventListener('abort',abort);};
  const error=(e:Error)=>{cleanup();stream.destroy();reject(e);};
  const data=(b:Buffer|string)=>{if(!Buffer.isBuffer(b)&&typeof b!=='string'){error(Error('host stream requires byte chunks'));return;}size+=typeof b==='string'?Buffer.byteLength(b):b.length;if(size>limit){error(Error('host stream byte bound'));return;}chunks.push(Buffer.from(b));};
  const end=()=>{ended=true;cleanup();resolve(Buffer.concat(chunks));};const close=()=>{if(!ended)error(Error('incomplete host stream'));};const abort=()=>error(Error('host deadline exceeded'));
  stream.on('data',data);stream.once('end',end);stream.once('error',error);stream.once('close',close);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
}
function writeBody(stream:Writable, body:Buffer, signal:AbortSignal):Promise<void> {
 return new Promise((resolve,reject)=>{const cleanup=()=>{stream.off('error',error);stream.off('finish',finish);stream.off('close',close);signal.removeEventListener('abort',abort);};
  const error=(e:Error)=>{cleanup();stream.destroy();reject(e);};const finish=()=>{cleanup();resolve();};const close=()=>error(Error('host write incomplete'));const abort=()=>error(Error('host deadline exceeded'));
  stream.once('error',error);stream.once('finish',finish);stream.once('close',close);signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}stream.end(body);
 });
}
function parseVote(text:string,ordinal:number):PanelVote {const v=JSON.parse(text);closed(v,['verdict','suspect']);if(typeof v.suspect!=='boolean'||!['PASS','FAIL','ERROR','NOT-MEASURED','JUDGE-AMBIGUOUS'].includes(v.verdict))throw Error('malformed host-observed vote');return {...v,ordinal};}
function body(i:LocalCodexInvocation, blindInput?:string) {
 // Exact supported request subset inspected in installed Codex buildRequestBody. No tools,
 // service tier, cache/session key, extension onPayload, endpoint or sampling overrides.
 return JSON.stringify({model:i.model,store:false,stream:true,instructions:i.instructions,input:[{role:'user',content:[{type:'input_text',text:blindInput??i.input}]}],text:{verbosity:'low'},include:['reasoning.encrypted_content'],tool_choice:'none',parallel_tool_calls:false,reasoning:{effort:i.effort,summary:'auto'}});
}
export function createLocalCodexHost(path:string, input:LocalCodexHostSpec, rolePolicy?:Parameters<typeof inspectCodexRoleSeparation>[0]) {
 const spec=admit(input),policy=rolePolicy===undefined?null:learningCopy(rolePolicy);
 if(policy){const separation=inspectCodexRoleSeparation(policy);if(separation.state==='BLOCKED')throw Error(separation.reason);for(const i of spec.invocations)if(!policy.some(r=>r.role===i.role&&r.model===i.model))throw Error('unbound canonical role policy');}
 learningJournal(path,{type:'codex-host-local-v1',spec,rolePolicy:policy,seed:randomBytes(32).toString('hex'),createdAt:Date.now()});return openLocalCodexHost(path);
}
export function openLocalCodexHost(path:string) {
 const store=learningJournal(path),first=store.read()[0].value;if(first.type!=='codex-host-local-v1'||typeof first.createdAt!=='number'||typeof first.seed!=='string')throw Error('local host owner required');
 const spec=admit(first.spec as LocalCodexHostSpec);
 const append=(value:Record<string,unknown>)=>{const prior=store.read().at(-1)!.id;return store.append(prior,value);};
 const inspect=()=>{const rows=store.read().map(e=>e.value),claims=rows.filter(r=>r.type==='claim'),results=rows.filter(r=>r.type==='observation');return {calls:claims.length,complete:results.length===spec.invocations.length&&claims.length===results.length&&!rows.some(r=>r.type==='abort'),aborted:rows.some(r=>r.type==='abort')||claims.length!==results.length,liveQualified:false as const};};
 const host={inspect,
  async exchangeSdk(subjectFrames:Readable,binding:CodexSdkBinding,fixture:()=>Promise<Response>):Promise<LocalCodexObservation> {
   if(!first.rolePolicy){subjectFrames.destroy();throw Error('frozen canonical policy required before SDK effects');}
   const separation=inspectCodexRoleSeparation(first.rolePolicy as Parameters<typeof inspectCodexRoleSeparation>[0]);if(separation.state==='BLOCKED'){subjectFrames.destroy();throw Error(separation.reason);}
   const streams=inertCodexSdkStreams(binding,fixture,value=>{const rows=store.read();if(value.type==='sdk-response-validated'&&rows.some(e=>e.value.type==='sdk-response-validated'&&e.value.responseId===value.responseId))throw Error('replayed SDK response');const claim=rows.filter(e=>e.value.type==='claim').at(-1)?.value;if(!claim||value.type==='sdk-wire-observed'&&value.requestSha256!==claim.requestSha256)throw Error('SDK observation without bound claim');append({...value,id:claim.id,sequence:claim.sequence});});
   return host.exchange(subjectFrames,streams.transport,streams.response);
  },
  async exchange(subjectFrames:Readable, hostTransport:Writable, hostResponse:Readable):Promise<LocalCodexObservation> {
   const state=inspect();if(state.aborted)throw Error('host aborted or stranded claim; no retry');if(state.calls>=spec.maxCalls)throw Error('call budget exhausted');
   const clockHistory=store.read(),now=Date.now(),lastClock=Math.max(Number(first.createdAt),...clockHistory.filter(e=>e.value.type==='clock').map(e=>Number(e.value.at)));
   if(!Number.isFinite(now)||now<lastClock){store.append(clockHistory.at(-1)!.id,{type:'abort',reason:'host clock rollback refused'});throw Error('host clock rollback refused');}
   store.append(clockHistory.at(-1)!.id,{type:'clock',at:now});
   const controller=new AbortController(),remaining=spec.wallMs-(now-Number(first.createdAt));const timer=setTimeout(()=>controller.abort(),Math.max(0,remaining));
   try {
    if(remaining<=0)throw Error('host deadline exceeded');
    const frameBytes=await readBounded(subjectFrames,1024,controller.signal),text=new TextDecoder('utf8',{fatal:true}).decode(frameBytes),frame=JSON.parse(text);
    closed(frame,['id','sequence']);if(frame.sequence!==1||text!==JSON.stringify({id:frame.id,sequence:1})+'\n')throw Error('incomplete or noncanonical invocation sequence');
    const i=spec.invocations.find(i=>i.id===frame.id);if(!i)throw Error('unbound invocation');
    const history=store.read();if(history.some(e=>e.value.type==='claim'&&e.value.id===i.id))throw Error('invocation already claimed; no retry');
    if(history.some(e=>e.value.type==='abort')||history.filter(e=>e.value.type==='claim').length!==history.filter(e=>e.value.type==='observation').length)throw Error('host aborted or concurrent claim');
    let blindInput:string|undefined;
    if(i.role==='judge'){
     const subject=history.find(e=>e.value.type==='observation'&&e.value.id===i.subjectId)?.value;
     if(!subject||subject.objective!=='PASS')throw Error('objective gate blocks judge emission');
     const siblings=spec.invocations.filter(t=>t.role==='judge'&&t.subjectId===i.subjectId),ordinal=siblings.findIndex(t=>t.id===i.id);
     const previous=siblings.slice(0,ordinal).map((t,k)=>{const r=history.find(e=>e.value.type==='observation'&&e.value.id===t.id)?.value;if(!r)throw Error('preceding panel observation missing');return parseVote(Buffer.from(String(r.outputBase64),'base64').toString('utf8'),k+1);});
     if(ordinal===2&&!collapseVotePanel(previous).split)throw Error('tie-break requires clean split');
     blindInput=JSON.stringify({label:sha(String(first.seed)+String(i.subjectId)).slice(0,24),outputBase64:subject.outputBase64,criterion:i.input});
    }
    const requestBody=body(i,blindInput),sequence=history.filter(e=>e.value.type==='claim').length+1;
    if(Buffer.byteLength(requestBody)>4096)throw Error('host request byte bound');
    if(sequence>spec.maxCalls)throw Error('call budget exhausted');
    store.append(history.at(-1)!.id,{type:'claim',id:i.id,sequence,role:i.role,destination:CODEX_SUBSCRIPTION_DESTINATION,requestSha256:sha(requestBody)});
    await writeBody(hostTransport,Buffer.from(requestBody),controller.signal);
    append({type:'host-write-completed',id:i.id,sequence,requestBody,requestSha256:sha(requestBody)});
    const output=await readBounded(hostResponse,16384,controller.signal);
    const result:LocalCodexObservation={id:i.id,sequence,requestBody,requestSha256:sha(requestBody),outputBase64:output.toString('base64'),outputSha256:sha(output),objective:i.role==='judge'?(parseVote(new TextDecoder('utf8',{fatal:true}).decode(output),1),'PASS'):sha(output)===i.expectedSha256?'PASS':'FAIL',providerInternalFacts:null,liveQualified:false};
    append({type:'observation',...result});return result;
   } catch(error) {append({type:'abort',reason:'local exchange failed; no automatic retry'});throw error;}
   finally {clearTimeout(timer);subjectFrames.destroy();hostTransport.destroy();hostResponse.destroy();}
  },
  panel(subjectId:string,judgeIds:string[],rawPolicy:Parameters<typeof inspectCodexRoleSeparation>[0]) {
   const policy=learningCopy(rawPolicy);if(first.rolePolicy&&learningHash(policy)!==learningHash(first.rolePolicy))throw Error('frozen canonical policy changed');const separation=inspectCodexRoleSeparation(policy);if(separation.state==='BLOCKED')throw Error(separation.reason);
   if(!Array.isArray(judgeIds)||![2,3].includes(judgeIds.length)||new Set(judgeIds).size!==judgeIds.length)throw Error('panel cardinality');
   const subject=spec.invocations.find(i=>i.id===subjectId&&i.role==='subject');if(!subject)throw Error('subject binding');
   const judges=spec.invocations.filter(i=>i.role==='judge'&&i.subjectId===subjectId);if(judgeIds.some((id,k)=>judges[k]?.id!==id))throw Error('frozen panel order');
   for(const i of [subject,...judges.slice(0,judgeIds.length)])if(!policy.some(p=>p.role===i.role&&p.model===i.model))throw Error('exact panel role binding');
   const rows=store.read().map(e=>e.value);if(rows.some(r=>r.type==='abort'))throw Error('aborted owner blocks panel');
   const output=rows.find(r=>r.type==='observation'&&r.id===subjectId);if(!output||output.objective!=='PASS')throw Error('objective gate blocks panel');
   const votes=judgeIds.map((id,k)=>{const r=rows.find(r=>r.type==='observation'&&r.id===id);if(!r)throw Error('panel observation missing');return parseVote(Buffer.from(String(r.outputBase64),'base64').toString('utf8'),k+1);});
   if(collapseVotePanel(votes.slice(0,2)).split!==(votes.length===3))throw Error('tie-break required exactly for clean split');
   const binding=learningHash({subjectId,judgeIds,policy}),old=rows.find(r=>r.type==='panel'&&r.subjectId===subjectId);if(old&&old.binding!==binding)throw Error('panel binding changed');
   const result={label:sha(String(first.seed)+subjectId).slice(0,24),collapse:collapseVotePanel(votes),identityStatus:separation.state,disclosures:separation.disclosures,liveQualified:false as const,routingDefault:null};
   if(!old)append({type:'panel',subjectId,binding,result});return result;
  },
  eligibleOutputs(){return store.read().filter(e=>e.value.type==='observation'&&e.value.objective==='PASS'&&spec.invocations.some(i=>i.id===e.value.id&&i.role==='subject')).map(e=>({label:sha(String(first.seed)+String(e.value.id)).slice(0,24),outputBase64:String(e.value.outputBase64),outputSha256:String(e.value.outputSha256),liveQualified:false as const}));},
 };return host;
}
