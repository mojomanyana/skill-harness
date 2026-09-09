// Run only against an exact finished producer snapshot, with network unshared/no home.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createLocalCodexHost } from '/harness/packages/adapters/dist/codex-host-observer.js';
import { startCodexProducerIpc } from '/harness/packages/adapters/dist/codex-producer-ipc.js';
import { learningJournal } from '/harness/packages/adapters/dist/learning-journal.js';
import * as producer from '/producer/packages/pi-daddy/src/producer-ipc.ts';
import { createExperimentBudget,openResourceBudget,resourceBindingDigest } from '/producer/packages/pi-daddy/src/resource-budget.ts';
import { newExecutionId } from '/producer/packages/pi-daddy/src/execution-id.ts';
globalThis.fetch=()=>{throw Error('no global network');};globalThis.WebSocket=class {constructor(){throw Error('no WebSocket');}};
const {stream}=await import('/sdk/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js');
const models=JSON.parse(readFileSync('/sdk/node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json','utf8'))['openai-codex-responses'];
const sha=s=>createHash('sha256').update(s).digest('hex');
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve:()=>resolve()};}
const report=[];
for(const scenario of ['completed','cancelled','http-failed','charter-mismatch']){
 const root='/out/'+scenario,model='gpt-5.6-sol',charterSha256=sha('fixture-charter-'+scenario),invocationId='subject';
 const budget=await createExperimentBudget({directory:root+'-budget',authorityDigest:'a'.repeat(64),limits:{maxAttempts:1,maxInputBytes:4096,maxConcurrent:1}}),owner=openResourceBudget(budget);
 const binding={version:'producer-ipc-v1',budgetDigest:resourceBindingDigest(budget),orderId:'fixture-order',experimentId:'fixture-experiment',executionId:newExecutionId(),charterSha256,invocationId};
 const host=createLocalCodexHost(root,{version:'codex-host-local-v1',maxCalls:1,wallMs:30000,invocations:[{id:invocationId,role:'subject',model,effort:'low',instructions:'Integer only',input:'2+2',expectedSha256:sha('4'),subjectId:null}]},[{role:'proposer',model:'gpt-5.4',canonical:'fixture-p',lineage:'fixture-shared'},{role:'subject',model,canonical:'fixture-s',lineage:'fixture-shared'},{role:'judge',model:'gpt-5.5',canonical:'fixture-j',lineage:'fixture-shared'}],{charterSha256,mode:'fixture',requestBytes:4096,responseBytes:16384,totalRequestBytes:4096,totalResponseBytes:16384,callMs:15000});
 const entered=deferred(),release=deferred(),caller=new AbortController();let http=0;
 const transport={kind:'fixture-http',exchange:async(wire,signal)=>{
  http++;assert.equal(wire.destination,'https://chatgpt.com/backend-api/codex/responses');assert.equal((await owner.controlSnapshot()).active,1);entered.resolve();
  if(scenario==='http-failed')throw Error('inert HTTP failure');
  await Promise.race([release.promise,new Promise((_,reject)=>{const stop=()=>reject(Error('inert HTTP cancelled'));signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();})]);
  const item={id:'item',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'4'}]};
  const events=[{type:'response.created',response:{id:'response',status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,item_id:'item',delta:'4'},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response',model,status:'completed',output:[item]}}];
  return new Response(events.map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 }};
 if(scenario==='charter-mismatch'){
  await assert.rejects(()=>startCodexProducerIpc({path:root,binding:{...binding,charterSha256:'c'.repeat(64)},sdk:{model:models[model],stream},transport,producer,owner,permit:{},signal:caller.signal,timeoutMs:10000}));assert.equal((await owner.controlSnapshot()).attempts,0);assert.equal(http,0);report.push({scenario,sourceLaunched:false,http,liveQualified:false});continue;
 }
 const [permit]=await owner.reserveBatch([producer.producerIpcDemand(binding)]);
 const input={path:root,binding,sdk:{model:models[model],stream},transport,producer,owner,permit,signal:caller.signal,timeoutMs:10000};
 const run=await startCodexProducerIpc(input);
 await Promise.race([entered.promise,run.result.then(snapshot=>{if(http===0)throw Error('producer failed before inert HTTP: '+JSON.stringify(snapshot));})]);assert.equal(await run.started,'spawned');assert.equal(await run.readiness,'frame-ready');assert.deepEqual(host.eligibleOutputs(),[]);
 if(scenario==='cancelled')caller.abort();else release.resolve();
 const observed=await run.result,done=await run.completion,resources=await owner.controlSnapshot();
 assert.equal(done.outcome,scenario==='http-failed'?'failed':scenario);assert.equal(done.settlement,'acknowledged');assert.equal(done.childState,'settled');assert.equal(done.child.code,0);assert.equal(done.child.text,JSON.stringify({id:invocationId,sequence:1})+'\n');assert.equal(done.acceptance,'not-assessed');assert.equal(resources.attempts,1);assert.equal(resources.active,0);assert.equal(resources.reservations[0].attemptId,binding.executionId);assert.equal(resources.reservations[0].inputDigest,producer.producerIpcBindingDigest(binding));assert.equal(http,1);
 const rows=learningJournal(root).read();
 if(scenario==='completed'){assert.equal(host.eligibleOutputs().length,1);assert.equal(done.references.claimRef,rows.find(r=>r.value.type==='claim').id);assert.equal(done.references.responseRef,rows.find(r=>r.value.type==='observation').id);}else{assert.equal(host.eligibleOutputs().length,0);assert.equal(host.inspect().aborted,true);}
 await assert.rejects(()=>startCodexProducerIpc(input));assert.equal(http,1);assert.equal((await owner.controlSnapshot()).attempts,1);
 report.push({scenario,http,binding,observed,done,resources,liveQualified:false});
}
writeFileSync('/out/proof.json',JSON.stringify({report,scope:'actual producer child/IPC + installed SDK with fake HTTP; no real credential/TLS/provider qualification',liveCalls:0},null,2)+'\n');console.log(JSON.stringify({scenarios:report.length,passed:true,liveCalls:0}));
