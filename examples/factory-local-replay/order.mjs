import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const parsedPin=JSON.parse(readFileSync(new URL('./producer-order-pin.json',import.meta.url),'utf8'));
const pin=Object.freeze({...parsedPin,files:Object.freeze(parsedPin.files)});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const ref=e=>({kind:e.payload.revision.kind,id:e.payload.revision.id,revision:e.payload.revision.revision,digest:e.payload.revision.digest});
export function verifyOrderProducer(root){
 if(!isAbsolute(root)||process.platform!=='linux')throw Error('explicit pinned Linux producer checkout required');
 const env={PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0'};
 const git=(...args)=>execFileSync('git',['-c','core.fsmonitor=false','--no-pager','-C',root,...args],{env,encoding:'utf8',timeout:5000,maxBuffer:1024*1024}).trim();
 if(git('rev-parse','HEAD')!==pin.commit||git('rev-parse','HEAD^{tree}')!==pin.tree)throw Error('producer pin mismatch');
 git('diff','--quiet','--no-ext-diff','--no-textconv',pin.commit,'--','.');
 for(const [path,digest] of Object.entries(pin.files))if(sha(readFileSync(join(root,path)))!==digest)throw Error('producer contract bytes changed');
 return pin;
}
/** Real fixed-profile workers and original controller, under explicitly synthetic fixture authority.
 * No model calls, arbitrary workload, live acceptance or reconstructed native session. */
export async function runPinnedOrder(root,directory,domain,evaluation,w){
 verifyOrderProducer(root);
 const load=name=>import(pathToFileURL(join(root,'packages/pi-daddy/src',name+'.ts')).href);
 const [order,budgets,effects,intents,contracts]=await Promise.all(['factory-order','resource-budget','effect-profile','intent-application','experiment-contract'].map(load));
 const text=w.events.map(e=>JSON.stringify(e)).join('\n')+'\n',path=join(directory,'order-work.jsonl');writeFileSync(path,text,{mode:0o600});
 const obligations=w.events.filter(e=>e.event==='work_revision'&&e.payload.revision.kind==='obligation');
 const selection={snapshot:{id:w.snapshot.payload.snapshot.snapshotId,digest:w.snapshot.payload.snapshot.digest},event:{eventId:w.snapshot.eventId,digest:w.snapshot.digest}};
 const work=await intents.bindWorkIntent({path,grantLedgerPath:null,selection,priorities:obligations.map((o,rank)=>({obligation:ref(o),rank}))});
 const authorityId='synthetic-replay-controller',scopeDigest=contracts.experimentHash(work.selection.snapshot),common=`${domain}:${evaluation.skillSha256}:${evaluation.frozen.digest}`;
 const baseline={version:'fixed-policy-v1',suffixBase64:'',acceptancePolicyDigest:evaluation.frozen.inputs.rubricSha256,grants:[],effects:['fixed-digest'],model:null,effort:null,skills:[]};
 const registry=await order.createFactoryRegistry({directory:join(directory,'order-registry'),authorityId,scopeDigest,baseline});
 const budget=await budgets.createExperimentBudget({directory:join(directory,'order-budget'),authorityDigest:sha(`${domain} explicit fixture authority`),limits:{maxAttempts:2,maxInputBytes:4096,maxConcurrent:2}});
 const charter={version:'factory-order-v1',orderId:`${domain}:order`,directory:join(directory,'bounded-order'),budget,work,workTextDigest:sha(text),scopeDigest,commonBase64:Buffer.from(common).toString('base64'),deadlineMs:10000,pin:{revision:0,candidateDigest:order.fixedPolicyDigest(baseline)},nodes:obligations.map((o,i)=>({nodeId:`node:${i}`,obligation:ref(o),dependencies:i?['node:0']:[],attempts:[{executionId:`${domain}:actual-fixed:${i}`,suffixBase64:Buffer.from(String(i)).toString('base64'),operation:'digest'}],expectedDigest:domain==='layout'&&i===1?'f'.repeat(64):sha(common+i),decision:i===0?{decisionId:'fixture-choice',authorityId}:null}))};
 const authority={id:authorityId,orderDigests:[order.factoryOrderDigest(charter)],decisionDigests:[],activationDigests:[],migrationDigests:[],adoption:null,facts:[]};
 await order.createFactoryOrder(registry,charter,authority);const controller=await order.openFactoryOrder(registry,charter.orderId,authority);
 const run=await controller.advance(await effects.prepareDigestProfile(budget));let failure;
 try{
  const boundary=await run.boundary;if(boundary.control!=='not-assessed'||boundary.nodes[0].state!=='decision-required')throw Error('actual reserved decision boundary missing');
  const decision={version:'factory-decision-v1',requestId:`${domain}:fixture-choice`,bindingDigest:controller.bindingDigest,nodeId:'node:0',evidenceDigest:boundary.nodes[0].evidenceDigest,authorityId,choice:'approve'};
  // Deliberate fixture decision, not a fabricated live human approval or native campaign event.
  await controller.decide(decision,{...authority,decisionDigests:[order.factoryDecisionDigest(decision)]});
  const final=await run.completion,resources=await budgets.openResourceBudget(budget).inspect();
  if(final.control!=='not-assessed'||resources.active!==0||resources.attempts!==2||final.nodes[1].state!==(domain==='software'?'satisfied':'exhausted'))throw Error('fixed order result/accounting mismatch');
  const artifacts=[];for(const node of final.nodes){if(node.executionId){const bytes=await controller.readArtifact(node.executionId);artifacts.push({executionId:node.executionId,sha256:sha(bytes),bytes:bytes.length});}}
  const result={kind:'actual-fixed-profile-order',producerCommit:pin.commit,producerTree:pin.tree,authority:'synthetic-fixture',modelCalls:0,acceptance:final.acceptance,orderDigest:final.orderDigest,investigationDigest:evaluation.frozen.digest,caseIds:evaluation.caseIds,policyPin:final.policyPin,nodes:final.nodes,resources,artifacts};writeFileSync(join(directory,'actual-order.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
 }catch(error){failure=error;throw error;}finally{try{await run.completion;}catch(error){if(failure)throw new AggregateError([failure,error],'replay and original controller settlement failed');throw error;}}
}
