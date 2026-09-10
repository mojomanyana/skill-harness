// The SAME selected worker assembles producer + five roles in fixture and approved modes.
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadLaunch } from './qualification-launch.mjs';
import { executeProducerCodexQualification, executeProducerCodexSingleRequest, createCodexOAuthFilePort, CODEX_RUNTIME_FILES, codexCharterHash } from '../../packages/adapters/dist/codex-subscription.js';
import { loadCodexDiagnosticModel } from '../../packages/adapters/dist/codex-diagnostic-model.js';
import { executeProducerProduct, prepareProducerProduct } from '../../packages/adapters/dist/producer-product.js';
import { createCodexHttpsPort } from '../../packages/adapters/dist/codex-https.js';
async function main(){
 const [mode,path,approvalPath,...extra]=process.argv.slice(2);if(extra.length||!['--fixture','--live'].includes(mode))throw Error('worker mode');
 const controller=new AbortController();process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());
 let frame='';for await(const chunk of process.stdin){frame+=chunk.toString('utf8');if(Buffer.byteLength(frame)>1024)throw Error('release frame overflow');}
 const {config,launchSha256,approval}=loadLaunch(path,mode,approvalPath),c=config.manifest.charter;
 if(frame!==JSON.stringify({id:launchSha256,sequence:1})+'\n')throw Error('unbound supervisor release');controller.signal.throwIfAborted();
 if(mode==='--fixture'){globalThis.fetch=()=>{throw Error('fixture network denied');};globalThis.WebSocket=class{constructor(){throw Error('fixture WebSocket denied');}};}
 const {stream}=await import(pathToFileURL(c.runtime.sdkRoot+'/'+CODEX_RUNTIME_FILES[0]).href),catalogue=JSON.parse(readFileSync(c.runtime.sdkRoot+'/'+CODEX_RUNTIME_FILES[2]))['openai-codex-responses'];
 const diagnostic=c.diagnosticModel?loadCodexDiagnosticModel(c.diagnosticModel):null;
 const bindings=Object.fromEntries(c.rolePolicy.map(i=>[i.model,{model:diagnostic?.id===i.model?diagnostic:catalogue[i.model],stream}]));
 for(const i of c.invocations){const b=bindings[i.model];if(!b?.model||b.model.id!==i.model||b.model.provider!=='openai-codex'||b.model.api!=='openai-codex-responses'||b.model.baseUrl!=='https://chatgpt.com/backend-api'||b.model.headers&&Object.keys(b.model.headers).length)throw Error('unresolved SDK binding before budget creation');}
 let ports,fixture=null;
 if(mode==='--fixture'){const f=await import('./qualification-fixture-ports.mjs');const p=f.fixturePorts(c,bindings,config.product);ports=p.ports;fixture=p.counters;}
 else{const transport=createCodexHttpsPort();transport.preflight();ports={bindings,credentials:createCodexOAuthFilePort(c.runtime.oauthFile),transport};}
 // One original pinned graph and original budget. No reconstructed permits/settlement.
 const producer=await import('/producer/packages/pi-daddy/src/producer-ipc.ts');
 const {createExperimentBudget,openResourceBudget,resourceBindingDigest}=await import('/producer/packages/pi-daddy/src/resource-budget.ts');
 const {newExecutionId}=await import('/producer/packages/pi-daddy/src/execution-id.ts');
 controller.signal.throwIfAborted();
 const product=config.product?prepareProducerProduct(config.product):null,invocations=product?.invocations??c.invocations,planHash=product?.planSha256??codexCharterHash(c),calls=product?.maxCalls??5;
 const budget=await createExperimentBudget({directory:'/out/budget',authorityDigest:launchSha256,limits:{maxAttempts:calls,maxConcurrent:calls,maxInputBytes:product?calls*1024:8192}}),owner=openResourceBudget(budget),completions=[];
 const source={owner,signal:controller.signal,producer:{...producer,startProducerIpc:async input=>{const run=await producer.startProducerIpc(input);completions.push(run.completion);return run;}},bindings:invocations.map(i=>({version:'producer-ipc-v1',budgetDigest:resourceBindingDigest(budget),orderId:'qualification-'+launchSha256.slice(0,16),experimentId:'qualification-'+launchSha256.slice(16,32),executionId:newExecutionId(),charterSha256:planHash,invocationId:i.id}))};
 const result=product?await executeProducerProduct(config.manifest.journalPath,config.product,{version:'producer-product-approval-v1',planSha256:planHash,maxCalls:calls,expiresAt:approval.expiresAt,journalPath:config.manifest.journalPath,codex:approval},ports,source):config.version==='supervised-producer-single-request-launch-v1'?await executeProducerCodexSingleRequest(config.manifest.journalPath,c,approval,ports,source):await executeProducerCodexQualification(config.manifest.journalPath,c,approval,ports,source);
 writeFileSync('/out/result.json',JSON.stringify({launchSha256,result,resources:await owner.controlSnapshot(),completions:await Promise.all(completions),fixture,liveQualified:false,acceptance:'not-assessed'},null,2)+'\n',{flag:'wx',mode:0o600});
}
main().catch(error=>{if(process.argv[2]==='--fixture')writeFileSync('/out/fixture-failure.json',JSON.stringify({name:error.name,message:String(error.message).slice(0,512)})+'\n',{mode:0o600});console.error('qualification worker refused or failed; original accounting retained, no retry');process.exitCode=1;});
