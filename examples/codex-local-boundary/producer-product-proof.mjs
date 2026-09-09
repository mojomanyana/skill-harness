// Runs INSIDE the no-home/network-unshared fixture namespace. Invokes the selected launcher.
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { productFixture,productSha } from '/harness/packages/adapters/test/producer-product-fixture.ts';
import { prepareProducerProduct } from '/harness/packages/adapters/dist/producer-product.js';
import { createWeeklyInvestigation,openWeeklyInvestigation } from '/harness/packages/adapters/dist/weekly-investigation.js';
import { retainWorkSignalObservation } from '/harness/packages/adapters/dist/work-signal-observation.js';
import { captureWorkSignalCases } from '/harness/packages/adapters/dist/work-signal-cases.js';
import { createWorkSignalReviewer } from '/harness/packages/adapters/dist/work-case-review.js';
import { learningJournal } from '/harness/packages/adapters/dist/learning-journal.js';
const scenario=process.argv[2]??'normal',cfg=JSON.parse(readFileSync('/out/launch.json')),product=productFixture('/out'),h='a'.repeat(64),o='b'.repeat(64),p='c'.repeat(64);
product.base.runtime=cfg.manifest.charter.runtime;
const observation=retainWorkSignalObservation('/out/archive',{snapshotDigest:h,scopeValid:true,obligations:[{id:'layout',digest:o,intentDigest:p,policyDigest:p,artifactDigest:p,acceptance:'unaccepted',coverage:'available'}]},{scopeDigest:h,version:'fixture-v1',population:'layout',expectedWaits:[],checkpoints:[{obligationDigest:o,deadlineMs:10,observedAt:11,status:'pending',evidence:p}],violations:[],priorAccepted:[]});
const batch=captureWorkSignalCases('/out/archive',observation.manifestId),review=createWorkSignalReviewer('/out/archive',batch.batchId,'fixture-author'),decision=review.decide({caseManifestId:batch.candidateIds[0],priorDecisionId:null,disposition:'confirmed_defect',note:'synthetic reference only'}).current;
const weekly=createWeeklyInvestigation('/out/weekly',{archiveRoot:'/out/archive',week:'2026-W37',population:'layout',policyDigest:h,maxCases:1,cases:[{version:3,batchId:batch.batchId,manifestId:batch.candidateIds[0],decisionId:decision.id}],reader:{manifestIds:[observation.manifestId],maxCalls:1,maxBytes:65536,durationMs:10000,representations:['exact']}});
const request={kind:'producer-archive-model-v1',manifestIds:[observation.manifestId],maxInputBytes:3000,proposalLimits:{subjectCalls:0,judgeCalls:0,wallMs:1000}};
assert.throws(()=>weekly.prepareModel({...request,manifestIds:['f'.repeat(64)]}));assert.throws(()=>weekly.prepareModel({...request,maxInputBytes:1}));
product.retro={path:'/out/weekly',prepared:weekly.prepareModel(request)};
product.limits={calls:25,totalRequestBytes:25*4096,totalResponseBytes:25*16384};
if(scenario==='n3'){const model='gpt-5.6-terra',canonical='fixture-6';product.base.rolePolicy.push({model,role:'subject',canonical,lineage:'shared-fixture'});product.protocol.catalogue.push({requested:model,canonical,lineage:'shared-fixture',efforts:['low','medium','high']});product.protocol.roles.subjects.c={requested:model,canonical,effort:'high'};const m={skill:'Skill C: return4',prompt:'Prompt C',configuration:'{}'};product.material.c=m;product.protocol.draft.arms.push({id:'c',configuration:{model,effort:'high',skill:productSha(m.skill),prompt:productSha(m.prompt),configuration:productSha(m.configuration)}});product.protocol.draft.cases[0].reps=1;product.protocol.expected={a:[productSha('4'),productSha('4')],b:[productSha('4'),productSha('4')],c:[productSha('4'),productSha('4')]};product.protocol.draft.common.heldoutSha256=productSha(JSON.stringify(product.protocol.draft.cases.map(c=>[c.id,c.reps,product.cases[c.id].partition,product.cases[c.id].boundary])));}
if(scenario!=='normal'){product.cases.boundary.input=scenario;product.protocol.draft.common.scenarioSha256=productSha(JSON.stringify(Object.entries(product.cases).sort().map(([id,c])=>[id,c.input])));}
const plan=prepareProducerProduct(product);
cfg.version='supervised-producer-product-launch-v1';cfg.product=product;cfg.manifest.charter=product.base;
writeFileSync('/out/launch.json',JSON.stringify(cfg,null,2)+'\n');
const child=spawnSync('/node',['/harness/examples/codex-local-boundary/qualification-launch.mjs','--fixture','/out/launch.json'],{env:{},encoding:'utf8',timeout:165000,maxBuffer:1048576});
writeFileSync('/out/launcher-status.json',JSON.stringify({status:child.status,error:child.error?.message??null,stdout:child.stdout,stderr:child.stderr},null,2));assert.equal(child.error,undefined);
const journal=learningJournal('/out/owner').read(),modelClaims=journal.filter(e=>e.value.type==='producer-plan-claimed');assert.equal(modelClaims.length,1);assert.equal(modelClaims[0].value.approvedCalls,25);
if(['cancel-source','fail-settlement'].includes(scenario)){
 assert.notEqual(child.status,0);assert.equal(existsSync('/out/result.json'),false);assert.ok(journal.some(e=>e.value.type==='producer-plan-failed'));assert.ok(!journal.some(e=>e.value.type==='producer-plan-settled'));
 const rows=learningJournal('/out/owner/cell-0').read();assert.equal(rows.filter(e=>e.value.type==='claim').length,1);assert.equal(rows.filter(e=>e.value.type==='panel').length,0);assert.equal(openWeeklyInvestigation('/out/weekly').inspect().state,'model-prepared');
 writeFileSync('/out/product-proof.json',JSON.stringify({scenario,passed:true,chargedReservation:25,liveCalls:0,realCredentialReads:0,claimCount:1,noAutomaticRetry:true}));
}else{
 assert.equal(child.status,0,existsSync('/out/fixture-failure.json')?readFileSync('/out/fixture-failure.json','utf8'):child.stderr);
 const result=JSON.parse(readFileSync('/out/result.json')),observed=JSON.parse(readFileSync('/out/process.json'));
 assert.equal(observed.observation.outcome,'completed');assert.equal(result.resources.attempts,25);assert.equal(result.resources.active,0);assert.equal(result.result.cells.length,6);assert.equal(result.result.liveAccuracy,null);assert.equal(result.result.referenceProvenance.kind,'synthetic');assert.equal(result.result.routingDefault,null);
 assert.equal(result.result.calls,scenario==='objective-failure'?13:25);assert.equal(result.completions.length,result.result.calls);assert.ok(result.completions.every(s=>s.settlement==='acknowledged'&&s.child.text===JSON.stringify({id:s.binding.invocationId,sequence:1})+'\n'));assert.equal(result.result.executionStrategy,'serial-replay');
 assert.equal(openWeeklyInvestigation('/out/weekly').inspect().state,'proposed');assert.equal(openWeeklyInvestigation('/out/weekly').inspect().approved,false);
 const configs=result.result.configurations;assert.equal(configs.length,scenario==='n3'?3:2);assert.equal(configs[0].observedConfiguration.length,scenario==='n3'?2:3);assert.equal(configs[1].observedConfiguration.length,scenario==='n3'?2:3);assert.notEqual(configs[0].observedConfiguration[0].model,configs[1].observedConfiguration[0].model);assert.notEqual(configs[0].observedConfiguration[0].effort,configs[1].observedConfiguration[0].effort);assert.notEqual(configs[0].observedConfiguration[0].instructionsSha256,configs[1].observedConfiguration[0].instructionsSha256);assert.ok(configs.every(c=>c.observedConfiguration.every(o=>o.backendIdentity===null)));
 assert.equal(result.result.cells.filter(c=>c.partition==='heldout').length,scenario==='n3'?3:2);assert.equal(result.result.cells.filter(c=>c.boundary).length,scenario==='n3'?3:4);
 if(scenario==='objective-failure'){assert.equal(result.result.cells.filter(c=>c.objective==='FAIL'&&c.panel===null).length,4);assert.ok(result.result.assessment.assessment.arms.every(a=>!a.eligible));}
 writeFileSync('/out/product-proof.json',JSON.stringify({scenario,passed:true,plannedCalls:25,actualCalls:result.result.calls,partitions:['calibration','heldout'],boundaryCells:scenario==='n3'?3:4,retro:'proposed',sourceKind:'original-producer-sdk',liveCalls:0,realCredentialReads:0,liveAccuracy:null,planSha256:plan.planSha256},null,2));
}
