import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createPrincipalPayloadPort, createReviewedArchiveExport, retainArchiveSource, readArchiveSource } from '../../packages/adapters/dist/index.js';
import { learningHash } from '../../packages/adapters/dist/learning-journal.js';
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
 const [{AssuranceStore,canonicalJson,digest},{appendPrincipalNativeReference,projectPrincipalAssociations,assemblePrincipalHost,consumePrincipalLifecycle},{createDailyViewReader}]=await Promise.all([
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
 const base=structuredClone(bindings);base.bindings[0].reference_links=[];
 const selected={binding_id:'fixture-connector',check_id:'order-predicate',result:{source:'journal',reference:receipt.reference},generic_receipt_id:link.generic_receipt_id,generic_claim:link.generic_claim,generic_artifact:link.generic_artifact,generic_artifact_digest:link.generic_artifact_digest,generic_evidence:link.generic_evidence};
 const payloadPath=join(directory,'actual-order.json'),permission={id:'fixture-output-consent',path:payloadPath,sha256:sha(retainedOrder),max_bytes:retainedOrder.length,run_id:runId,check_id:'order-predicate',revision:receipt.reference,channel:'output',purpose:'retain-check-output'};
 const request={version:'principal-host-assembly-request-v1',expected_head:retired.reference,operation:null,selections:[selected],payloads:[{binding_id:selected.binding_id,check_id:selected.check_id,result:selected.result,channel:'output',path:payloadPath,sha256:sha(retainedOrder),byte_length:retainedOrder.length,permission_id:permission.id}]};
 const assembled=await assemblePrincipalHost({stateDir,runId,dailyViewText:JSON.stringify(daily),bindingsText:JSON.stringify(base),workContextText:JSON.stringify(workContext),request,archivePort:createPrincipalPayloadPort(join(directory,'archive'),`${domain}:archive`),sourcePermissions:[permission]});
 // Acquire a host pin from the invoked pinned producer and independently re-read its source projection.
 // Retained byte integrity is not authenticated consent or independent native acceptance.
 const projection=projectPrincipalAssociations({stateDir,runId,dailyViewText:JSON.stringify(daily),bindingsText:canonicalJson(assembled.assembled_bindings),workContextText:JSON.stringify(workContext)}),n=projection.native_references;
 const expectedSource={native_ledger:n.native_ledger,journal_head:n.head,journal_sha256:digest(n.entries.map(e=>canonicalJson(e)+'\n').join('')),association_sha256:digest(projection),daily_view_sha256:projection.generic.input_sha256,bindings_sha256:projection.declarations_sha256,work_context_sha256:projection.work_context_sha256};
 const {digest:_exportDigest,...exportBody}=assembled.envelope;const expected={digest:digest(exportBody),source:expectedSource};
 const envelopeBytes=Buffer.from(canonicalJson(assembled.envelope)),stored=retainArchiveSource(join(directory,'archive'),{sourceId:`${domain}-principal-lifecycle`,parser:{id:'principal-generic-check-lifecycle',version:'1'},retention:'exact',bytes:envelopeBytes});
 save('export-pin.json',{...expected,manifestId:stored.manifestId,sha256:sha(envelopeBytes),authority:'synthetic fixture host; not authentication'});
 const readback=readArchiveSource(join(directory,'archive'),stored.manifestId);if(readback.status!=='available'||sha(readback.bytes)!==sha(envelopeBytes))throw Error('lifecycle export byte readback mismatch');
 const consumed=consumePrincipalLifecycle(readback.bytes.toString('utf8'),expected);
 if(consumed.emissions.length!==1||consumed.emissions[0].retirement.state!=='emitted'||consumed.emissions[0].state!=='emitted')throw Error('generic retirement was not actually consumed');
 const payloads=consumed.emissions[0].payloads;if(payloads.output.state!=='retained'||payloads.output.readback_sha256!==sha(retainedOrder)||payloads.stdout.state!=='missing'||payloads.stderr.state!=='missing')throw Error('actual output retention or missing-channel semantics changed');
 save('assembly.json',assembled);save('generic-consumed.json',consumed);
 const exportPolicy={archiveRoot:join(directory,'archive'),manifestIds:[stored.manifestId],destination:join(stateDir,'reviewed-lifecycle.json'),expiresAt:Date.now()+60000,redact:[directory],maxBytes:1024*1024};
 const exporter=createReviewedArchiveExport(join(stateDir,'export-owner'),exportPolicy,[learningHash(exportPolicy)]),preview=exporter.preview(Date.now());
 if(preview.content.includes(directory))throw Error('explicit fixture workspace redaction failed');
 // Explicit fixture preview authorization, not a claim of authenticated human review.
 const exportReceipt=exporter.export(preview.digest,[preview.digest],Date.now());save('reviewed-export-receipt.json',exportReceipt);
 const result={genericLifecycle:{manifestId:stored.manifestId,retirement:consumed.emissions[0].retirement.state,payloads},principalCommit:pin.commit,principalTree:pin.tree,kind:'actual-reference-API-fixture',liveQualified:false,acceptance:'not-assessed',current:currentLink.status,retired:finalLink.status,exitCode,genericRetirement:finalLink.generic_retirement,orderPayloadSha256:sha(retainedOrder),nativeReceiptSha256:sha(raw),payloadScope:'order bytes retained separately; native evidence contains assurance receipt, not full stdout',associations:final.associations.length};save('summary.json',result);return result;
}
