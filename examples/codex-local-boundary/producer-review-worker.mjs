// Selected by the independently supervising review parent; same producer/SDK path in offline proof.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { loadReviewLaunch } from './producer-review-launch.mjs';
import { executeProducerReview } from '../../packages/adapters/dist/producer-review.js';
import { createCodexOAuthFilePort, CODEX_RUNTIME_FILES } from '../../packages/adapters/dist/codex-subscription.js';
import { createCodexReviewHttpsPort } from '../../packages/adapters/dist/codex-https.js';
import { learningJournal } from '../../packages/adapters/dist/learning-journal.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function main(){
 const [mode,path,approvalPath,...extra]=process.argv.slice(2);if(extra.length||!['--fixture','--execute-approved'].includes(mode))throw Error('worker mode');
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 let frame='';for await(const b of process.stdin){frame+=b.toString('utf8');if(Buffer.byteLength(frame)>1024)throw Error('worker release bound');}
 const {config:c,plan,launchSha256,approval}=loadReviewLaunch(path,mode,approvalPath);
 if(frame!==JSON.stringify({id:launchSha256,sequence:1})+'\n'||JSON.parse(readFileSync(join(c.outputRoot,'launch-claim.json'))).launchSha256!==launchSha256)throw Error('worker release mismatch');
 controller.signal.throwIfAborted();
 if(mode==='--fixture'){globalThis.fetch=()=>{throw Error('fixture external fetch denied');};globalThis.WebSocket=class{constructor(){throw Error('fixture WebSocket denied');}};}
 const {stream}=await import(pathToFileURL(join(c.runtime.sdkRoot,CODEX_RUNTIME_FILES[0])).href);
 const catalogue=JSON.parse(readFileSync(join(c.runtime.sdkRoot,CODEX_RUNTIME_FILES[2])))['openai-codex-responses'];
 const bindings=Object.fromEntries([c.plan.subject,c.plan.judge].map(id=>[id,{model:catalogue[id],stream}]));
 for(const [id,b] of Object.entries(bindings))if(!b.model||b.model.id!==id||b.model.provider!=='openai-codex'||b.model.baseUrl!=='https://chatgpt.com/backend-api'||b.model.api!=='openai-codex-responses')throw Error('review SDK unresolved');
 let ports,fixture=null;
 if(mode==='--fixture'){
  const review='Inert review '+randomUUID()+': the handshake controls successful child completion.';fixture={calls:0,completePacketSeen:false,sealedBeforeJudge:false,toolFree:true};
  ports={bindings,credentials:{kind:'fixture-oauth',read:async()=>({type:'oauth',provider:'openai-codex',accountId:c.plan.accountId,access:'fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:c.plan.accountId}})).toString('base64url')+'.invalid',expires:Date.now()+90000})},transport:{kind:'fixture-http',exchange:async wire=>{
   const zlib=await import('node:zlib');const raw=wire.encoding==='zstd'?zlib.zstdDecompressSync(wire.body,{maxOutputLength:65536}):wire.body,body=JSON.parse(raw);fixture.calls++;
   if(fixture.calls>2||body.tools||body.tool_choice!=='none'||body.input.length!==1)throw Error('fixture tool/call bound');
   if(fixture.calls===1){if(body.input[0].content[0].text!==c.plan.packet)throw Error('packet truncated');fixture.completePacketSeen=true;}
   else {const input=JSON.parse(body.input[0].content[0].text),seal=learningJournal(join(c.outputRoot,'owner')).read().find(e=>e.value.type==='review-sealed')?.value;if(input.packet!==c.plan.packet||input.review!==review||input.reviewSha256!==sha(review)||seal?.sha256!==sha(review))throw Error('unsealed judge input');fixture.sealedBeforeJudge=true;}
   const text=fixture.calls===1?review:'{"verdict":"PASS","suspect":false}',item={id:'message-'+fixture.calls,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]},response={id:'response-'+fixture.calls,model:body.model};
   const events=[{type:'response.created',response:{...response,status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...response,status:'completed',output:[item]}}];
   return new Response(events.map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
  }}};
 }else{const transport=createCodexReviewHttpsPort();transport.preflight();ports={bindings,credentials:createCodexOAuthFilePort(c.runtime.oauthFile),transport};}
 const producer=await import(pathToFileURL(join(c.runtime.producerRoot,'packages/pi-daddy/src/producer-ipc.ts')).href);
 const {createExperimentBudget,openResourceBudget,resourceBindingDigest}=await import(pathToFileURL(join(c.runtime.producerRoot,'packages/pi-daddy/src/resource-budget.ts')).href);
 const {newExecutionId}=await import(pathToFileURL(join(c.runtime.producerRoot,'packages/pi-daddy/src/execution-id.ts')).href);
 const budget=await createExperimentBudget({directory:join(c.outputRoot,'budget'),authorityDigest:launchSha256,limits:{maxAttempts:2,maxConcurrent:2,maxInputBytes:2048}}),owner=openResourceBudget(budget),completions=[];
 const source={owner,signal:controller.signal,producer:{...producer,startProducerIpc:async input=>{const r=await producer.startProducerIpc(input);completions.push(r.completion);return r;}},bindings:['subject','judge'].map(invocationId=>({version:'producer-ipc-v1',budgetDigest:resourceBindingDigest(budget),orderId:'review-'+launchSha256.slice(0,16),experimentId:'review-'+launchSha256.slice(16,32),executionId:newExecutionId(),charterSha256:plan.planSha256,invocationId}))};
 const result=await executeProducerReview(join(c.outputRoot,'owner'),c.plan,approval,ports,source);
 writeFileSync(join(c.outputRoot,'result.json'),JSON.stringify({launchSha256,result,resources:await owner.controlSnapshot(),completions:await Promise.all(completions),fixture,acceptance:'not-assessed'},null,2)+'\n',{flag:'wx',mode:0o600});
}
main().catch(error=>{if(process.argv[2]==='--fixture')console.error('inert review failure:',error.message);else console.error('review failed; no retry, accounting retained');process.exitCode=1;});
