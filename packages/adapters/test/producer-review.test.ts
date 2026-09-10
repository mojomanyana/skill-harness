import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { prepareProducerReview, executeProducerReview, REVIEW_LIMITS } from '../src/producer-review.js';
import { learningJournal } from '../src/learning-journal.js';
import { boundCodexSdkStreams } from '../src/codex-sdk-transport.js';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const packet='published code\n'+'x'.repeat(21489-15);
function fixture(options:{unknownAck?:boolean;badVote?:boolean;empty?:boolean;transportFail?:boolean}={}) {
 const spec={version:'producer-review-v1',packet,packetSha256:sha(packet),task:'Review the code, citing evidence.',criterion:'Accurate supported reasoning.',subject:'gpt-5.6-luna',judge:'gpt-5.5',accountId:'fixture-account',limits:{...REVIEW_LIMITS}} as const;
 const plan=prepareProducerReview(spec),path=join(mkdtempSync(join(tmpdir(),'producer-review-')),'owner');
 const approval={version:'producer-review-approval-v1',scope:'fixture',planSha256:plan.planSha256,journalPath:path,approvalId:randomUUID(),expiresAt:Date.now()+90000,maxCalls:2} as const;
 const seen:any[]=[];let reserves=0,cancelled=0;const answer=options.empty?'':'Review-'+randomUUID();
 const stream=(model:any,context:any,o:any)=>({result:async()=>{
  expect(context.messages).toHaveLength(1);expect(context.tools).toBeUndefined();expect(o.maxRetries).toBe(0);
  const body=o.onPayload({model:model.id,store:false,stream:true,instructions:context.systemPrompt,input:[{role:'user',content:[{type:'input_text',text:context.messages[0].content}]}],text:{verbosity:'low'},include:['reasoning.encrypted_content'],tool_choice:'none',reasoning:{effort:'low',summary:'auto'}});
  const reply=await o.fetch('https://chatgpt.com/backend-api/codex/responses',{method:'POST',body:JSON.stringify(body),redirect:'error'});
  await reply.text();const text=model.id===spec.subject?answer:options.badVote?'invalid':'{"verdict":"PASS","suspect":false}';
  return {model:model.id,provider:'openai-codex',api:'openai-codex-responses',stopReason:'stop',content:[{type:'text',text}]};
 }});
 const bindings=Object.fromEntries([spec.subject,spec.judge].map(id=>[id,{model:{id,provider:'openai-codex',api:'openai-codex-responses',baseUrl:'https://chatgpt.com/backend-api'},stream}]));
 const ports:any={bindings,credentials:{kind:'fixture-oauth',read:async()=>({type:'oauth',provider:'openai-codex',accountId:spec.accountId,expires:Date.now()+60000,access:'fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:spec.accountId}})).toString('base64url')+'.invalid'})},transport:{kind:'fixture-http',exchange:async(wire:any)=>{
  const body=JSON.parse(wire.body.toString());seen.push(body);if(options.transportFail)throw Error('fixture transport failure');
  if(seen.length===2){const seal=learningJournal(path).read().find(e=>e.value.type==='review-sealed')!.value;expect(seal.sha256).toBe(sha(answer));expect(body.input[0].content[0].text).toContain(sha(answer));expect(JSON.parse(body.input[0].content[0].text).packet).toBe(packet);}
  const text=body.model===spec.subject?answer:options.badVote?'invalid':'{"verdict":"PASS","suspect":false}';
  const item={id:'m',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]};
  const events=[{type:'response.created',response:{id:'r'+seen.length,status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',item_id:'m',output_index:0,content_index:0,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'r'+seen.length,model:body.model,status:'completed',output:[item]}}];
  return new Response(events.map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 }}};
 const source:any={signal:new AbortController().signal,owner:{reserveBatch:async(d:any[])=>{reserves++;expect(d).toHaveLength(2);return d.map(()=>({settle:async()=>{cancelled++;}}));}},bindings:['subject','judge'].map(invocationId=>({version:'producer-ipc-v1',budgetDigest:'a'.repeat(64),orderId:'o',experimentId:'e',executionId:'exec-'+invocationId,charterSha256:plan.planSha256,invocationId})),producer:{producerIpcDemand:(b:any)=>b,createProducerIpcHost:(v:any)=>v,startProducerIpc:async(v:any)=>{
  const frame=JSON.stringify({id:v.binding.invocationId,sequence:1})+'\n';const references=await v.host.exchange(Readable.from([frame]),{binding:v.binding,signal:v.signal});
  const done={binding:v.binding,outcome:'completed',settlement:options.unknownAck?'unknown':'acknowledged',childState:'settled',hostState:'acknowledged',frameSha256:sha(frame),acceptance:'not-assessed',references};
  return {completion:Promise.resolve(done),result:Promise.resolve(done),inspect:()=>done};
 }}};
 return {spec,plan,path,approval,ports,source,seen,answer,counts:()=>({reserves,cancelled}),run:()=>executeProducerReview(path,spec,approval,ports,source)};
}
describe('producer review prospective two-call profile',()=>{
 it('accepts full21489bytes and seals an unknown review before the separate advisory judge',async()=>{const f=fixture();expect(Buffer.byteLength(packet)).toBe(21489);const r=await f.run();expect(f.seen).toHaveLength(2);expect(f.seen[0].input[0].content[0].text).toBe(packet);expect(r.reviewSha256).toBe(sha(f.answer));expect(r.advisory).toEqual({verdict:'PASS',suspect:false});expect(r.acceptance).toBe('not-assessed');expect(f.counts()).toEqual({reserves:1,cancelled:0});await expect(f.run()).rejects.toThrow();expect(f.seen).toHaveLength(2);});
 it('rejects malformed/oversized/changed inputs before reservation',()=>{const f=fixture();for(const spec of [{...f.spec,packetSha256:'0'.repeat(64)},{...f.spec,packet:'x'.repeat(32769)},{...f.spec,judge:f.spec.subject},{...f.spec,task:'\ud800'},{...f.spec,tools:['bash']},{...f.spec,limits:{...REVIEW_LIMITS,calls:3}}])expect(()=>prepareProducerReview(spec as any)).toThrow();expect(f.counts().reserves).toBe(0);});
 it('requires fresh exact two-call approval before any effect',async()=>{const f=fixture();await expect(executeProducerReview(f.path,f.spec,{...f.approval,maxCalls:3} as any,f.ports,f.source)).rejects.toThrow();expect(f.counts().reserves).toBe(0);});
 it.each([{unknownAck:true},{empty:true},{transportFail:true}])('never judges failed/unacknowledged subject: %j',async options=>{const f=fixture(options);await expect(f.run()).rejects.toThrow();expect(f.seen).toHaveLength(1);expect(f.counts()).toEqual({reserves:1,cancelled:1});await expect(f.run()).rejects.toThrow();expect(f.seen).toHaveLength(1);});
 it('retains invalid judge failure without retry or acceptance',async()=>{const f=fixture({badVote:true});await expect(f.run()).rejects.toThrow();expect(f.seen).toHaveLength(2);});
 it('refuses cancellation and changed SDK/source bindings before reservation',async()=>{for(const kind of ['signal','sdk','source']){const f=fixture();if(kind==='signal'){const c=new AbortController();c.abort();f.source.signal=c.signal;}if(kind==='sdk')f.ports.bindings[f.spec.subject].model.provider='openai';if(kind==='source')f.source.bindings[1].charterSha256='0'.repeat(64);await expect(f.run()).rejects.toThrow();expect(f.counts().reserves).toBe(0);expect(f.seen).toHaveLength(0);}});
 it('refuses a clock rollback after reservation and cancels only unhanded permits',async()=>{const f=fixture(),reserve=f.source.owner.reserveBatch;f.source.owner.reserveBatch=async(d:any[])=>{const p=await reserve(d);vi.spyOn(Date,'now').mockReturnValue(0);return p;};try{await expect(f.run()).rejects.toThrow('clock rollback');expect(f.counts()).toEqual({reserves:1,cancelled:2});expect(f.seen).toHaveLength(0);}finally{vi.restoreAllMocks();}});
 it('bounds waiting on unknown completion without refunding the handed permit',async()=>{const f=fixture(),c=new AbortController();f.source.signal=c.signal;f.source.producer.startProducerIpc=async()=>{queueMicrotask(()=>c.abort());return {completion:new Promise(()=>{}),result:new Promise(()=>{})};};await expect(f.run()).rejects.toThrow('deadline/cancellation');expect(f.counts()).toEqual({reserves:1,cancelled:1});expect(f.seen).toHaveLength(0);});
 it('retains the primary failure when cancellation accounting also fails',async()=>{const f=fixture({transportFail:true}),reserve=f.source.owner.reserveBatch;f.source.owner.reserveBatch=async(d:any[])=>{const permits=await reserve(d);for(const p of permits)p.settle=async()=>{throw Error('cancel accounting failed');};return permits;};let failure:any;try{await f.run();}catch(error){failure=error;}expect(failure).toBeInstanceOf(AggregateError);expect(failure.errors).toHaveLength(2);expect(failure.cause).toBe(failure.errors[0]);expect(failure.errors[1].message).toBe('cancel accounting failed');expect(f.seen).toHaveLength(1);});
 it('does not widen the historical SDK request cap',()=>{const f=fixture();expect(()=>boundCodexSdkStreams(f.ports.bindings[f.spec.subject],{kind:'fixture-http',exchange:async()=>new Response()},()=>{},{requestBytes:65536,responseBytes:16384})).toThrow();});
});
