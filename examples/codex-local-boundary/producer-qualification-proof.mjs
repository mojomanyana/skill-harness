// Explicit opt-in five-role composition; exact b17 source / installed SDK / inert HTTP only.
import assert from 'node:assert/strict';
import fs, { readFileSync, writeFileSync } from 'node:fs';
import promises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import * as producer from '/producer/packages/pi-daddy/src/producer-ipc.ts';
import { createExperimentBudget, openResourceBudget, resourceBindingDigest } from '/producer/packages/pi-daddy/src/resource-budget.ts';
import { newExecutionId } from '/producer/packages/pi-daddy/src/execution-id.ts';
import { executeProducerCodexQualification, executeCodexQualification, codexCharterHash } from '/harness/packages/adapters/dist/codex-subscription.js';
import { learningJournal } from '/harness/packages/adapters/dist/learning-journal.js';
import { openLocalCodexHost } from '/harness/packages/adapters/dist/codex-host-observer.js';
globalThis.fetch=()=>{throw Error('no real network');};globalThis.WebSocket=class {constructor(){throw Error('no WebSocket');}};
const {stream}=await import('/sdk/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js');
const catalogue=JSON.parse(readFileSync('/sdk/node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json','utf8'))['openai-codex-responses'];
const models=['gpt-5.4','gpt-5.6-sol','gpt-5.5','gpt-5.3-codex-spark','gpt-5.4-mini'],ids=['proposer','subject','first','second','tie'];
const sha=v=>createHash('sha256').update(v).digest('hex');
function charter(){return {version:'codex-synthetic-charter-v1',provider:'openai-codex',destination:'https://chatgpt.com/backend-api/codex/responses',rolePolicy:models.map((model,k)=>({model,role:k===0?'proposer':k===1?'subject':'judge',canonical:'fixture-'+k,lineage:'shared-fixture'})),identityEvidence:{kind:'fixture',reference:'inert-only'},hostEvidence:{kind:'fixture',reference:'inert-only'},accountId:'fixture-account',serverOutputTokenCap:null,runtime:{sdkRoot:'/sdk',oauthFile:'/no-auth-mount',fingerprints:{}},limits:{calls:5,requestBytes:4096,responseBytes:16384,totalRequestBytes:20480,totalResponseBytes:81920,callMs:10000,wallMs:60000},invocations:models.map((model,k)=>({id:ids[k],model,role:k===0?'proposer':k===1?'subject':'judge',effort:'low',instructions:k<2?'Integer only':'JSON verdict and suspect only',input:k<2?'What is 2 + 2?':'Must equal4',expectedSha256:sha('4'),subjectId:k<2?null:'subject'}))};}
function response(k,text){const item={id:'item-'+k,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]};return new Response([{type:'response.created',response:{id:'response-'+k,status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-'+k,model:models[k],status:'completed',output:[item]}}].map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});}
const reports=[];
for(const scenario of ['normal','split','objective','cancel','http-failed','unknown-settlement','stranded','changed-charter','host-exhausted','producer-exhausted']){
 const path='/out/'+scenario,c=charter();if(scenario==='host-exhausted')c.limits.totalRequestBytes=4096;
 const approval={scope:'fixture',charterSha256:codexCharterHash(c),approvalId:'fixture-only',expiresAt:Date.now()+60000,journalPath:path};
 const budget=await createExperimentBudget({directory:path+'-budget',authorityDigest:'a'.repeat(64),limits:{maxAttempts:scenario==='producer-exhausted'?4:5,maxConcurrent:scenario==='producer-exhausted'?4:5,maxInputBytes:8192}}),owner=openResourceBudget(budget),caller=new AbortController(),completions=[];
 const source={owner,signal:caller.signal,producer:{...producer,startProducerIpc:async input=>{const run=await producer.startProducerIpc(input);completions.push(run.completion);return run;}},bindings:ids.map(invocationId=>({version:'producer-ipc-v1',budgetDigest:resourceBindingDigest(budget),orderId:'fixture-order',experimentId:'fixture-experiment',executionId:newExecutionId(),charterSha256:approval.charterSha256,invocationId}))};
 let http=0,reads=0,forced=0,armed=false;const originalOpen=promises.open;
 if(scenario==='unknown-settlement'){promises.open=async(...args)=>{const handle=await originalOpen(...args);if(armed&&String(args[0])===budget.directory+'/budget.jsonl'){armed=false;const sync=handle.sync.bind(handle);handle.sync=async()=>{await sync();forced++;throw Error('inert required settlement sync failure');};}return handle;};syncBuiltinESMExports();}
 const credential={type:'oauth',provider:'openai-codex',access:'fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'fixture-account'}})).toString('base64url')+'.invalid',expires:Date.now()+60000,accountId:'fixture-account'};
 const ports={bindings:Object.fromEntries(models.map(model=>[model,{model:catalogue[model],stream}])),credentials:{kind:'fixture-oauth',read:async()=>{reads++;return credential;}},transport:{kind:'fixture-http',exchange:async(wire,_credential,signal)=>{
  const serialized=wire.encoding==='zstd'?zstdDecompressSync(wire.body,{maxOutputLength:4096}):wire.body;
  const k=models.indexOf(JSON.parse(serialized.toString()).model);http++;const snapshot=await owner.controlSnapshot();assert.equal(snapshot.attempts,5);assert.equal(snapshot.active,5-k);assert.equal(wire.destination,c.destination);
  if(scenario==='stranded'&&k===0){await assert.rejects(()=>executeProducerCodexQualification(path,c,approval,ports,source),/stranded/);assert.equal((await owner.controlSnapshot()).attempts,5);}
  if(scenario==='cancel'){caller.abort();await new Promise((_,reject)=>{const stop=()=>reject(Error('inert cancellation'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();});}
  if(scenario==='http-failed')throw Error('inert HTTP failure');
  if(scenario==='unknown-settlement')armed=true;
  return response(k,k<2?(scenario==='objective'?'5':'4'):JSON.stringify({verdict:scenario==='split'&&k===3?'FAIL':'PASS',suspect:false}));
 }}};
 if(scenario==='changed-charter')c.invocations[0].input+='changed';
 let result=null,error=false;
 try {
  try {result=await executeProducerCodexQualification(path,c,approval,ports,source);}catch{error=true;}
  const snapshots=await Promise.all(completions),resources=await owner.controlSnapshot();
  const success=['normal','split','objective','stranded'].includes(scenario);assert.equal(error,!success);
  if(success){assert.equal(http,scenario==='split'?5:scenario==='objective'?1:4);assert.equal(result.sourceKind,'producer-ipc-v1');assert.equal(result.calls,http);const prior=http;assert.deepEqual(await executeProducerCodexQualification(path,c,approval,ports,source),result);assert.equal(http,prior);await assert.rejects(()=>executeCodexQualification(path,c,approval,ports),/source/);assert.equal(resources.active,0);}
  else {const prior=http;await assert.rejects(()=>executeProducerCodexQualification(path,c,approval,ports,source));assert.equal(http,prior);if(['changed-charter','producer-exhausted'].includes(scenario)){assert.equal(http,0);assert.equal(resources.attempts,0);}else assert.equal(http,1);}
  for(const [k,s] of snapshots.entries()){assert.equal(s.child.code,0);assert.equal(s.child.text,JSON.stringify({id:ids[k],sequence:1})+'\n');assert.equal(s.binding.executionId,source.bindings[k].executionId);assert.equal(resources.reservations[k].inputDigest,producer.producerIpcBindingDigest(source.bindings[k]));if(success)assert.equal(s.settlement,'acknowledged');}
  if(scenario==='unknown-settlement'){assert.equal(forced,1);assert.equal(snapshots[0].settlement,'failed-or-unknown');assert.equal(openLocalCodexHost(path).eligibleOutputs().length,0);assert.equal(resources.active,0,'visible settlement bytes do not prove original acknowledgement');}
  if(fs.existsSync(path)){const rows=learningJournal(path).read();assert.equal(rows.filter(e=>e.value.type==='claim').length,http);assert.ok(!readFileSync(path+'/events.jsonl','utf8').includes(credential.access));}
  reports.push({scenario,http,fixtureReads:reads,result,snapshots,resources,forced,liveQualified:false});
 } finally {promises.open=originalOpen;syncBuiltinESMExports();}
}
writeFileSync('/out/proof.json',JSON.stringify({scenarios:reports.length,reports,liveCalls:0,realCredentialReads:0,scope:'actual original child/ownership, pinned source and installed SDK; inert HTTP; no live qualification'},null,2)+'\n');console.log(JSON.stringify({passed:reports.length,liveCalls:0,realCredentialReads:0}));
