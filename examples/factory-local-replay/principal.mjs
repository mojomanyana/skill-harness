import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyOrderProducer } from './order.mjs';
const parsed=JSON.parse(readFileSync(new URL('./principal-pin.json',import.meta.url),'utf8'));
const pin=Object.freeze({...parsed,files:Object.freeze(parsed.files)});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyPrincipalProducer(root){
 if(!isAbsolute(root))throw Error('explicit pinned Principal checkout required');
 const env={PATH:'/usr/bin:/bin',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_OPTIONAL_LOCKS:'0'};
 const git=(...args)=>execFileSync('git',['-c','core.fsmonitor=false','--no-pager','-C',root,...args],{env,encoding:'utf8',timeout:5000,maxBuffer:1024*1024}).trim();
 if(git('rev-parse','HEAD')!==pin.commit||git('rev-parse','HEAD^{tree}')!==pin.tree)throw Error('Principal pin mismatch');
 git('diff','--quiet','--no-ext-diff','--no-textconv',pin.commit,'--','.');
 for(const [path,digest] of Object.entries(pin.files))if(sha(readFileSync(join(root,path)))!==digest)throw Error('Principal source bytes changed');
 return pin;
}
/** Actual native reference APIs, with a separately labelled fixture ledger only.
 * The generic work, independent fixture context and actual order predicate are not
 * converted into native acceptance or claimed to be the same identity namespace. */
export async function runPinnedPrincipal(root,producerRoot,directory,domain,workContext,orderResult){
 verifyPrincipalProducer(root);verifyOrderProducer(producerRoot);
 const [{AssuranceStore},{appendPrincipalNativeReference,projectPrincipalAssociations},{createDailyViewReader}]=await Promise.all([
  import(pathToFileURL(join(root,'scripts/assurance-state.mjs')).href),
  import(pathToFileURL(join(root,'scripts/principal-association.mjs')).href),
  import(pathToFileURL(join(producerRoot,'packages/pi-daddy/src/daily-view.ts')).href),
 ]);
 const stateDir=join(directory,'principal-fixture');mkdirSync(stateDir,{mode:0o700});
 const save=(name,value)=>writeFileSync(join(stateDir,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 const daily=await createDailyViewReader()({workLedgerPath:join(directory,'order-work.jsonl'),workContext});
 save('daily-view.json',daily);save('work-context.json',workContext);
 const runId=`${domain}-interop-fixture`,definition=sha('synthetic connector check'),plan=sha('synthetic connector plan');
 const store=new AssuranceStore({baseDir:stateDir,now:()=> '2026-01-01T00:00:00.000Z'});
 store.init({runId,workflow:'feature',request:'Synthetic local connector replay; no campaign acceptance',definitionDigests:{'skill:build':definition}});
 const append=(type,payload={})=>{store.append(runId,{type,...payload});return store.load(runId,{withEvents:true}).events.at(-1);};
 const ref=e=>({seq:e.seq,digest:e.event_digest});
 append('workspace_attached',{workspace_id:'fixture-workspace',path:directory,mode:'caller',writer:'build'});
 append('risk_classified',{level:'tiny',reason:'synthetic interop check only'});append('plan_recorded',{plan_digest:plan});
 const task=append('task_packet_recorded',{packet:{schema_version:'1.0',run_id:runId,task_id:'connector-check',title:'Retained order predicate',authority:['synthetic-fixture'],global_constraints:['no live acceptance'],out_of_scope:['deployment'],critical_scope:{applies:false,matched_by:[]},files:['actual-order.json'],dependencies:[],done_command:'inert retained-order predicate',review_risk:'identity',workspace_id:'fixture-workspace',plan_digest:plan,definition_digests:{'skill:build':definition}}});
 const context=append('phase_started',{phase:'build',task_id:'connector-check',workspace_id:'fixture-workspace',definition_digest:definition});
 // Explicit fixture attribution to the invoked connector source; not equivalence to work artifact or candidate bytes.
 const candidate=append('code_changed',{task_id:'connector-check',head_sha:pin.commit,tree_sha:pin.tree,changed_paths:['scripts/principal-association.mjs']});
 append('phase_completed',{phase:'build'});
 const retainedOrder=readFileSync(join(directory,'actual-order.json'));if(JSON.stringify(JSON.parse(retainedOrder))!==JSON.stringify(orderResult))throw Error('retained order readback differs');
 const exitCode=orderResult.nodes.every(n=>n.state==='satisfied')?0:1;
 const evidence=append('evidence_recorded',{kind:'exact-target',command:'inert retained-order predicate',exit_code:exitCode,head_sha:pin.commit,tree_sha:pin.tree,task_id:'connector-check',workspace_id:'fixture-workspace'});
 const raw=readFileSync(store.paths(runId).log,'utf8').match(/[^\n]+(?:\n|$)/g)[evidence.seq-1];
 const receipt=appendPrincipalNativeReference({stateDir,runId,expectedHead:null,record:{type:'check-result',check_id:'order-predicate',task:ref(task),context:ref(context),candidate:ref(candidate),evidence:ref(evidence),evidence_sha256:sha(raw),corrects:null,author:'synthetic-replay'}});
 const decision=workContext.authority.decisions[0],obligation=daily.obligations.find(o=>o.receiptIds.includes(decision.receiptId));if(!obligation)throw Error('actual daily receipt missing');
 const link={check_id:'order-predicate',native_check:receipt.reference,native_context:ref(context),finalization:null,retirement:null,generic_receipt_id:decision.receiptId,generic_claim:decision.claim,generic_artifact:decision.binding.artifact,generic_artifact_digest:decision.binding.artifactDigest,generic_evidence:decision.binding.evidence[0]};
 const bindings={version:'principal-host-bindings-v3',bindings:[{binding_id:'fixture-connector',native:{run_id:runId,task_id:'connector-check',workspace_id:'fixture-workspace',candidate:{head_sha:pin.commit,tree_sha:pin.tree}},generic:{selectedSnapshot:daily.selectedSnapshot,scope:daily.scope,obligation:obligation.obligation,binding_key:obligation.key},execution_ids:[obligation.attempts[0]],reference_links:[link]}]};
 const project=input=>projectPrincipalAssociations({stateDir,runId,dailyViewText:JSON.stringify(daily),bindingsText:JSON.stringify(input),workContextText:JSON.stringify(workContext)});
 const current=project(bindings),currentLink=current.associations[0]?.reference_links?.[0];
 if(currentLink?.status!=='current'||currentLink.native.evidence.event.exit_code!==exitCode)throw Error('actual Principal current evidence link missing');
 const wrong=structuredClone(bindings);wrong.bindings[0].reference_links[0].generic_artifact_digest='f'.repeat(64);
 const rejected=project(wrong);if(rejected.associations[0]?.reference_links?.[0]?.status!=='error')throw Error('wrong artifact binding did not fail closed');
 const retired=appendPrincipalNativeReference({stateDir,runId,expectedHead:receipt.reference.digest,record:{type:'check-retired',check_id:'order-predicate',previous:receipt.reference,reason:'end of synthetic connector demonstration; not work retirement',author:'synthetic-replay'}});
 link.retirement=retired.reference;const final=project(bindings),finalLink=final.associations[0]?.reference_links?.[0];
 if(finalLink?.status!=='retired'||finalLink.native.evidence.raw!==raw||finalLink.generic_retirement!=='unbound')throw Error('Principal retirement/history boundary changed');
 save('reference-write.json',receipt);save('bindings.json',bindings);save('current.json',current);save('wrong-artifact.json',rejected);save('retirement-write.json',retired);save('retired.json',final);
 const result={principalCommit:pin.commit,principalTree:pin.tree,kind:'actual-reference-API-fixture',liveQualified:false,acceptance:'not-assessed',current:currentLink.status,retired:finalLink.status,exitCode,genericRetirement:finalLink.generic_retirement,orderPayloadSha256:sha(retainedOrder),nativeReceiptSha256:sha(raw),payloadScope:'order bytes retained separately; native evidence contains assurance receipt, not full stdout',associations:final.associations.length};save('summary.json',result);return result;
}
