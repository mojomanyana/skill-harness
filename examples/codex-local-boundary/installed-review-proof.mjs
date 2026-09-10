// Model-free integration/negative proof. Run only in the documented no-network/no-auth namespace.
// No fault option is admitted by either production launcher schema.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import * as zlib from 'node:zlib';
import {loadReviewLaunch} from './producer-review-launch.mjs';
import {prepareProducerReview,executeProducerReview} from '../../packages/adapters/dist/producer-review.js';
import {createInstalledReviewSessions} from '../../packages/adapters/dist/installed-review-session.js';
import {learningJournal} from '../../packages/adapters/dist/learning-journal.js';
import {CODEX_RUNTIME_FILES} from '../../packages/adapters/dist/codex-subscription.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const {config:c}=loadReviewLaunch(process.argv[2],'--prepare');assert.equal(c.profile,'fixture');assert.equal(c.plan.version,'producer-review-installed-v1');
globalThis.fetch=()=>{throw Error('inert external fetch denied');};globalThis.WebSocket=class{constructor(){throw Error('inert WebSocket denied');}};
const sdk=await import(pathToFileURL(join(c.runtime.sdkRoot,'dist/index.js')));
const {stream}=await import(pathToFileURL(join(c.runtime.sdkRoot,CODEX_RUNTIME_FILES[0])));
const producer=await import(pathToFileURL(join(c.runtime.producerRoot,'packages/pi-daddy/src/producer-ipc.ts')));
const budgets=await import(pathToFileURL(join(c.runtime.producerRoot,'packages/pi-daddy/src/resource-budget.ts')));
const {newExecutionId}=await import(pathToFileURL(join(c.runtime.producerRoot,'packages/pi-daddy/src/execution-id.ts')));
const results=[];
for(const fault of ['none','resource','before-agent','context','tools','extra-invocation','final-wire','unknown-settlement','timeout']){
 const path=join(dirname(c.outputRoot),'proof-'+fault);mkdirSync(path,{mode:0o700});const spec=structuredClone(c.plan);spec.session.runRoot=path;spec.session.subjectId=randomUUID();spec.session.judgeId=randomUUID();
 const prepared=prepareProducerReview(spec),controller=new AbortController(),completions=[];
 const budget=await budgets.createExperimentBudget({directory:join(path,'budget'),authorityDigest:prepared.planSha256,limits:{maxAttempts:2,maxConcurrent:2,maxInputBytes:2048}}),owner=budgets.openResourceBudget(budget);
 const source={owner,signal:controller.signal,producer:{...producer,startProducerIpc:async input=>{const r=await producer.startProducerIpc(input);completions.push(r.completion);return fault==='unknown-settlement'?{...r,completion:r.completion.then(done=>({...done,settlement:'unknown'}))}:r;}},bindings:['subject','judge'].map(invocationId=>({version:'producer-ipc-v1',budgetDigest:budgets.resourceBindingDigest(budget),orderId:'proof',experimentId:'proof',executionId:newExecutionId(),charterSha256:prepared.planSha256,invocationId}))};
 let sdkCalls=0,http=0,sealed=false,packet=false;const review='Inert static review '+randomUUID()+'. No findings; the watchdog fails rather than silently passing.';
 const wrappedSdk={...sdk,createAgentSession:async options=>{
  const result=await sdk.createAgentSession(options),session=result.session;
  const ext=options.resourceLoader.getExtensions().extensions.find(e=>e.path.includes('installed-review-v1'));
  if(fault==='context')ext.handlers.get('context').push(e=>({messages:[{...e.messages[0],content:[{type:'text',text:'changed packet'}]}]}));
  if(fault==='before-agent')ext.handlers.get('before_agent_start').push(e=>({systemPrompt:e.systemPrompt+' changed'}));
  if(['tools','extra-invocation'].includes(fault)){
   let implementation=session.agent.streamFunction;Object.defineProperty(session.agent,'streamFunction',{get:()=>implementation,set:fn=>{implementation=async(...args)=>{if(fault==='tools')args[1].tools=[{name:'read'}];const r=await fn(...args);if(fault==='extra-invocation'){try{await fn(...args);}catch{/* Deliberately swallowed by faulty host: bridge must remain poisoned. */}}return r;};}});
  }
  return result;
 }};
 const modelRuntime=await sdk.ModelRuntime.create({authPath:join(path,'absent-auth'),modelsPath:join(path,'absent-models'),modelsStorePath:join(path,'models-store'),allowModelNetwork:false});
 const bindings=Object.fromEntries([spec.subject,spec.judge].map(id=>[id,{model:modelRuntime.getModel('openai-codex',id),stream:(model,ctx,options)=>{sdkCalls++;assert(sdkCalls<=2);if(fault==='final-wire'){const fetch=options.fetch;options={...options,fetch:async(url,init)=>{const compressed=new Headers(init.headers).get('content-encoding')==='zstd';const b=Buffer.from(init.body);const payload=JSON.parse(compressed?zlib.zstdDecompressSync(b):b);payload.changed=true;const text=Buffer.from(JSON.stringify(payload));return fetch(url,{...init,body:compressed?zlib.zstdCompressSync(text):text});}};}return stream(model,ctx,options);}}]));
 const ports={bindings,credentials:{kind:'fixture-oauth',read:async()=>({type:'oauth',provider:'openai-codex',accountId:spec.accountId,access:'fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:spec.accountId}})).toString('base64url')+'.invalid',expires:Date.now()+90000})},transport:{kind:'fixture-http',exchange:async wire=>{
  http++;assert(http<=2);if(fault==='timeout')return new Promise(()=>{});
  const body=JSON.parse(wire.encoding==='zstd'?zlib.zstdDecompressSync(wire.body):wire.body);assert.equal(body.tool_choice,'none');assert(!body.tools);assert.equal(body.input.length,1);
  if(http===1){assert.equal(body.input[0].content[0].text,spec.packet);assert(body.instructions.includes('<installed-review-instructions>'));for(const resource of spec.session.resources.slice(0,2))assert(body.instructions.includes(readFileSync(resource.path,'utf8')));packet=true;}
  else {assert(!JSON.stringify(body).includes('fixture-private-marker'));const input=JSON.parse(body.input[0].content[0].text);assert.deepEqual(Object.keys(input).sort(),['criterion','packet','review','reviewSha256']);assert.equal(input.review,review);assert.equal(input.packet,spec.packet);assert.equal(input.criterion,spec.criterion);assert.equal(input.reviewSha256,sha(review));assert(!body.instructions.includes('<installed-review-instructions>'));const events=learningJournal(join(path,'owner')).read();assert(events.some(e=>e.value.type==='review-sealed'&&e.value.sha256===sha(review)));assert(events.some(e=>e.value.type==='source-acknowledged'&&e.value.id==='subject'));sealed=true;}
  const text=http===1?review:'{"verdict":"PASS","suspect":false}',item={id:'message-'+http,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]},response={id:'response-'+http,model:body.model};
  const events=[{type:'response.created',response:{...response,status:'in_progress'}}];
  // Fictional reasoning data exercises isolation through the REAL SDK; not a model evaluation.
  const index=http===1?1:0;let reason;if(index){const parts=['fixture-private-marker one','fixture-private-marker two'];reason={id:'reason',type:'reasoning',content:[],encrypted_content:'fixture-private-marker encrypted',summary:parts.map(text=>({type:'summary_text',text}))};events.push({type:'response.output_item.added',output_index:0,item:{...reason,summary:[]}});parts.forEach((text,summary_index)=>{const common={output_index:0,item_id:'reason',summary_index};events.push({type:'response.reasoning_summary_part.added',...common,part:{type:'summary_text',text:''}},{type:'response.reasoning_summary_text.delta',...common,delta:text},{type:'response.reasoning_summary_text.done',...common,text},{type:'response.reasoning_summary_part.done',...common,part:{type:'summary_text',text}});});events.push({type:'response.output_item.done',output_index:0,item:reason});item.phase='final_answer';}
  const common={output_index:index,content_index:0,item_id:item.id};events.push({type:'response.output_item.added',output_index:index,item:{...item,status:'in_progress',content:[]}},{type:'response.content_part.added',...common,part:{type:'output_text',text:''}},{type:'response.output_text.delta',...common,delta:text},{type:'response.output_text.done',...common,text},{type:'response.content_part.done',...common,part:item.content[0]},{type:'response.output_item.done',output_index:index,item},{type:'response.completed',response:{...response,status:'completed',output:reason?[reason,item]:[item]}});return new Response(events.map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 }}};
 const sessions=createInstalledReviewSessions(spec.session,wrappedSdk);if(fault==='resource')spec.session.resources[0].sha256='0'.repeat(64);
 let result,error;const start=performance.now();try{result=await executeProducerReview(join(path,'owner'),spec,{version:'producer-review-approval-v1',scope:'fixture',planSha256:prepared.planSha256,journalPath:join(path,'owner'),approvalId:'inert-'+fault,expiresAt:Date.now()+90000,maxCalls:2},ports,source,sessions);}catch(e){error=e.message;}
 const completed=await Promise.allSettled(completions),snapshot=await owner.controlSnapshot();assert.equal(snapshot.active,0);assert(sdkCalls<=2&&http<=2);
 if(fault==='none'){assert(!error,error);assert.equal(result.sdkCalls,2);assert.equal(sdkCalls,2);assert.equal(http,2);assert(packet&&sealed);assert.equal(snapshot.attempts,2);assert(completed.every(r=>r.status==='fulfilled'&&r.value.settlement==='acknowledged'));const events=learningJournal(join(path,'owner')).read().map(e=>e.value);assert.equal(events.filter(v=>v.type==='session-prompt-completed').length,2);for(const v of events.filter(v=>v.type==='sdk-wire-observed'))assert.equal(v.serializedSha256,sha(Buffer.from(v.serializedBase64,'base64')));}
 else {assert(error,'fault unexpectedly passed: '+fault);assert(!sealed);assert.equal(snapshot.attempts,fault==='resource'?0:2);if(['resource','before-agent','context','tools'].includes(fault))assert.equal(sdkCalls,0);if(fault==='final-wire')assert.equal(http,0);if(fault==='timeout')assert(performance.now()-start>=29000);}
 const receipt={fault,passed:true,sdkCalls,httpAttempts:http,original:snapshot,completions:completed,packetSeen:packet,sealedBeforeJudge:sealed,error:error??null,elapsedMs:performance.now()-start,acceptance:'not-assessed'};writeFileSync(join(path,'proof.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});results.push(receipt);console.log('PASS',fault,'SDK',sdkCalls,'HTTP',http,'active',snapshot.active);
}
writeFileSync(join(dirname(c.outputRoot),'installed-proof.json'),JSON.stringify({cases:results.length,passed:results.length,networkCalls:0,results},null,2)+'\n',{flag:'wx',mode:0o600});
