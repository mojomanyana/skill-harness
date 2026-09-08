import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openTrustLifecycle } from '../../packages/adapters/dist/index.js';
import { verifyOrderProducer } from './order.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Actual settled dashboard ports on existing replay stores. No socket, TUI
 * deployment, new case/trust owner, worker or synthetic presence acknowledgement. */
export async function runPinnedDashboard(root,directory,domain,context,caseBatchId,blindReviewId){
 verifyOrderProducer(root);const load=p=>import(pathToFileURL(join(root,'packages/pi-daddy',p)).href);
 const [{connectedHarness},{bindWorkIntent},{createIntentBudget,resourceBindingDigest},{createDashboardHost,openDashboardHost,dashboardHostDigest,dashboardHostRequestDigest}]=await Promise.all(['test/dashboard-host-fixture.ts','src/intent-application.ts','src/resource-budget.ts','src/dashboard-host.ts'].map(load));
 const hostDirectory=join(directory,'dashboard');mkdirSync(hostDirectory,{mode:0o700});
 // Compile the producer's37 byte-pinned public harness sources with retained TypeScript; no install.
 // The fixture compiler creates an unused empty archive directory; all host data uses the existing replay archive.
 const loaded=await connectedHarness(hostDirectory),archiveRoot=join(directory,'archive'),trustDirectory=join(directory,'trust');
 const work=await bindWorkIntent({path:join(directory,'order-work.jsonl'),grantLedgerPath:null,selection:context.selectedSnapshot,priorities:context.authority.decisions.map((d,rank)=>({obligation:d.binding.obligation,rank}))});
 const authorityDigest=sha(`${domain}:fixture-dashboard-authority`),budget=await createIntentBudget({directory:join(hostDirectory,'budget'),authorityDigest,limits:{maxAttempts:1,maxInputBytes:4096,maxConcurrent:1}},work);
 const orderBytes=readFileSync(join(directory,'actual-order.json')),observed=JSON.parse(orderBytes);if(observed.producerCommit!==verifyOrderProducer(root).commit||observed.kind!=='actual-fixed-profile-order')throw Error('wrong fixed-order fact source');
 const factSource=loaded.api.retainArchiveSource(archiveRoot,{sourceId:`${domain}-dashboard-order-readback`,parser:{id:'factory-order-readback',version:'1'},retention:'exact',bytes:orderBytes});
 const facts={scopeDigest:context.selectedSnapshot.snapshot.digest,version:'fixture-host-facts-v1',population:domain,expectedWaits:[],checkpoints:[],violations:observed.nodes.filter(n=>n.state==='exhausted').map(n=>({obligationDigest:n.obligation.digest,status:'FAIL',evidence:sha(orderBytes)})),priorAccepted:[]};
 const factsText=JSON.stringify(facts)+'\n';writeFileSync(join(hostDirectory,'facts.jsonl'),factsText,{mode:0o600});
 const policy={version:'archive-policy-v2',id:'replay-dashboard',revision:'1',sourceRoot:hostDirectory,archiveRoot,maxBytes:65536,retention:'exact',expiresAt:new Date(Date.now()+60000).toISOString(),sources:[{id:'facts',path:'facts.jsonl',parser:{id:'pi-daddy-work-signal-facts',version:'1'},contentPolicy:'manifest-only'}]};
 const policyText=JSON.stringify(policy),policyPath=join(hostDirectory,'policy.json');writeFileSync(policyPath,policyText,{mode:0o600});
 const config={version:'producer-dashboard-host-v1',trustDirectory,trustPolicyId:openTrustLifecycle(trustDirectory).inspect(Date.now()).policyId,archiveRoot,scope:`${domain}:replay`,author:'operator:synthetic-fixture',policyPath,policySha256:sha(policyText),sources:[{id:'facts',kind:'facts'}],selection:context.selectedSnapshot,cases:{version:'work-case-v2',batchId:caseBatchId},blind:{comparisonId:blindReviewId,author:'operator:synthetic-fixture'},budgetDigest:resourceBindingDigest(budget),experimentDigest:null,harnessArtifactDigest:loaded.artifactDigest};
 const authority={hostDigests:[dashboardHostDigest(config)],requestDigests:[],workContext:context,dispatch:{authorityDigest,requestDigests:[]},experiment:null};
 const options={harness:loaded.api,config,budget,authority:()=>authority,presence:()=>null};
 const host=createDashboardHost(options),before=await host.frame(),again=await host.frame();if(before.tip!==again.tip)throw Error('read-only refresh mutated host');
 const request={version:'1.0',requestId:`${domain}:observe-facts`,hostDigest:host.hostDigest,selectionDigest:before.selectionDigest,expectedTip:before.tip,operation:'observe',payload:{sourceId:'facts',previousCheckpointId:null,facts:null}};
 const denial=await host.action(request);if(denial.state!=='denied')throw Error('unauthorized observation not denied');
 const allowed={...request,requestId:`${domain}:approved-facts`,expectedTip:(await host.frame()).tip};
 authority.requestDigests=[dashboardHostRequestDigest(allowed)];const acknowledgement=await host.action(allowed),after=await openDashboardHost(options).frame();
 if(acknowledgement.state!=='acknowledged'||after.tip===before.tip)throw Error('actual observation did not persist/acknowledge');
 const result={kind:'actual-dashboard-host-ports',liveQualified:false,presence:'unavailable-not-inferred',archiveRoot:'existing replay archive',trustStore:'existing replay trust; no refill',sourceFacts:'actual fixed-order exhaustion readback; synthetic work/authority, not live model facts',factSourceManifest:factSource.manifestId,harnessSource:'1c02194d4a3709d14890a5fbbad91ff5f0151f65',artifactDigest:loaded.artifactDigest,before,acknowledgement,after};
 writeFileSync(join(hostDirectory,'readback.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return {kind:result.kind,liveQualified:false,artifactDigest:result.artifactDigest,presence:result.presence,observationAcknowledged:true,reopenedTip:after.tip};
}
