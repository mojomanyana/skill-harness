import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { learningCopy, learningHash, learningJournal } from './learning-journal.js';
import { openLocalCodexHost, inspectCodexRoleSeparation } from './codex-host-observer.js';
import type { CodexSdkBinding, CodexWireTransport } from './codex-sdk-transport.js';

export interface CodexProducerBinding {version:string;budgetDigest:string;orderId:string;experimentId:string;executionId:string;charterSha256:string;invocationId:string}
/** These are trusted producer-module capabilities, not caller-provided source attestation.
 * The launcher must pin the actual producer module; this adapter never loads credentials. */
export interface CodexProducerApi {
 createProducerIpcHost(input:{owner:unknown;binding:CodexProducerBinding;exchange:(frames:Readable,context:{binding:CodexProducerBinding;signal:AbortSignal})=>Promise<{claimRef:string;responseRef:string}>}):unknown;
 startProducerIpc(input:{owner:unknown;permit:unknown;binding:CodexProducerBinding;host:unknown;signal:AbortSignal;timeoutMs:number}):Promise<{completion:Promise<any>;result:Promise<any>;inspect():any;[key:string]:unknown}>;
}
export async function startCodexProducerIpc(input:{path:string;binding:CodexProducerBinding;sdk:CodexSdkBinding;transport:CodexWireTransport;producer:CodexProducerApi;owner:unknown;permit:unknown;signal:AbortSignal;timeoutMs:number}) {
 const binding=learningCopy(input.binding),keys=['version','budgetDigest','orderId','experimentId','executionId','charterSha256','invocationId'];
 if(!binding||Object.keys(binding).sort().join()!==keys.sort().join()||binding.version!=='producer-ipc-v1'||![binding.budgetDigest,binding.charterSha256].every(h=>/^[a-f0-9]{64}$/.test(h))||![binding.orderId,binding.experimentId,binding.executionId,binding.invocationId].every(v=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(v)))throw Error('closed producer source binding required');
 const store=learningJournal(input.path),rows=store.read(),first=rows[0].value,host=openLocalCodexHost(input.path);
 const invocation=(first.spec as any).invocations.find((i:any)=>i.id===binding.invocationId),reservation=first.subscription as any,model=input.sdk.model;
 if(!reservation||reservation.charterSha256!==binding.charterSha256||input.transport.kind!==(reservation.mode==='fixture'?'fixture-http':'subscription-http')||!first.rolePolicy||inspectCodexRoleSeparation(first.rolePolicy as any).state==='BLOCKED'||!invocation||model.id!==invocation.model||model.provider!=='openai-codex'||model.api!=='openai-codex-responses'||model.baseUrl!=='https://chatgpt.com/backend-api'||model.headers&&Object.keys(model.headers as object).length||typeof input.sdk.stream!=='function')throw Error('unbound producer/host charter or SDK policy');
 if(!(input.signal instanceof AbortSignal)||!Number.isSafeInteger(input.timeoutMs)||input.timeoutMs<50||input.timeoutMs>30000)throw Error('bounded original source signal/deadline required');
 if(host.inspect().aborted||rows.some(e=>e.value.id===binding.invocationId&&['claim','producer-ipc-bound'].includes(String(e.value.type))))throw Error('source already bound/claimed or aborted; no retry');
 const bindingHash=learningHash(binding),append=(value:Record<string,unknown>)=>store.append(store.read().at(-1)!.id,value);
 let invoked=false,references:{claimRef:string;responseRef:string}|null=null;
 const port=input.producer.createProducerIpcHost({owner:input.owner,binding,exchange:async(frames,context)=>{
  if(invoked){frames.destroy();throw Error('repeated producer exchange refused');}invoked=true;
  if(learningHash(context.binding)!==bindingHash||!(context.signal instanceof AbortSignal)){frames.destroy();throw Error('original source context mismatch');}
  const observation=await host.exchangeSubscriptionSdk(frames,input.sdk,input.transport,binding.charterSha256,context.signal);
  const records=store.read(),claim=records.find(e=>e.value.type==='claim'&&e.value.id===observation.id),response=records.find(e=>e.value.type==='observation'&&e.value.id===observation.id);
  if(!claim||!response)throw Error('host observation references missing');references={claimRef:claim.id,responseRef:response.id};return {...references};
 }});
 append({type:'producer-ipc-bound',id:binding.invocationId,bindingHash,binding,liveQualified:false});
 let run:Awaited<ReturnType<CodexProducerApi['startProducerIpc']>>;
 try {run=await input.producer.startProducerIpc({owner:input.owner,permit:input.permit,binding,host:port,signal:input.signal,timeoutMs:input.timeoutMs});}
 catch {append({type:'abort',reason:'producer source start failed; no retry',id:binding.invocationId});throw Error('producer source start failed');}
 const completion=run.completion.then(snapshot=>{
  const frameSha256=createHash('sha256').update(JSON.stringify({id:binding.invocationId,sequence:1})+'\n').digest('hex');
  const acknowledged=invoked&&references!==null&&learningHash(snapshot.binding)===bindingHash&&snapshot.outcome==='completed'&&snapshot.settlement==='acknowledged'&&snapshot.childState==='settled'&&snapshot.hostState==='acknowledged'&&snapshot.frameSha256===frameSha256&&snapshot.acceptance==='not-assessed'&&learningHash(snapshot.references)===learningHash(references);
  if(acknowledged)append({type:'producer-ipc-settled',id:binding.invocationId,bindingHash,references,frameSha256,liveQualified:false,acceptance:'not-assessed'});
  else {append({type:'abort',reason:'producer source did not acknowledge completed ownership',id:binding.invocationId});if(snapshot.outcome==='completed')throw Error('producer source completion mismatch');}
  return snapshot;
 },()=>{append({type:'abort',reason:'producer source completion rejected',id:binding.invocationId});throw Error('producer source completion rejected');});
 // Preserve original bounded result/child/readiness/inspect handles. Only original completion
 // can unlock host eligibility; an observer timeout never substitutes for that completion.
 return Object.freeze({...run,completion});
}
