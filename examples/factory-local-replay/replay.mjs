import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  freezeIntervention,
  buildAdoptionBinding, authorizeAdoption, classifyProductionObservation,
} from '../../packages/core/dist/index.js';
import { retainArchiveSource, readWorkCandidate, captureArchivedWorkCandidates, createWorkCaseReviewer, createInterventionRun, openBlindIntervention, createWeeklyInvestigation, openWeeklyInvestigation, createTrustLifecycle, trustPolicyDigest } from '../../packages/adapters/dist/index.js';
import { buildWorkRevisionEvent, buildWorkSnapshotEvent, buildWorkOccurrenceEvent, buildWorkAcceptanceEvent, projectWorkLedger } from '../../packages/adapters/dist/generated/work-v4/reader.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const revisionRef=e=>({kind:e.payload.revision.kind,id:e.payload.revision.id,revision:e.payload.revision.revision,digest:e.payload.revision.digest});
const eventRef=e=>({eventId:e.eventId,digest:e.digest});
export function buildReplayWorld(domain){
 const now=new Date('2026-01-01T00:00:00.000Z'),content=sha(`synthetic ${domain} content`),scopeId=`${domain}-scope`;
 const revision=(kind,id,extra={})=>buildWorkRevisionEvent({eventId:`${domain}:${id}`,now,revision:{kind,id,revision:1,scopeId,predecessor:null,contentDigest:content,parent:null,dependencies:[],ownerId:'fixture-controller',permittedEffects:['artifact','policy'].includes(kind)?[]:['read'],policy:null,...extra}});
 const scope=revision('scope',scopeId),policy=revision('policy',`${domain}-policy`);
 const goals=[1,2].map(i=>revision('goal',`${domain}-goal-${i}`,{parent:revisionRef(scope)}));
 const obligations=goals.map((g,i)=>revision('obligation',`${domain}-obligation-${i+1}`,{parent:revisionRef(g),policy:revisionRef(policy)}));
 const artifacts=[1,2].map(i=>revision('artifact',`${domain}-artifact-${i}`));
 const bindings=obligations.map((o,i)=>({intent:revisionRef(goals[i]),obligation:revisionRef(o),artifact:revisionRef(artifacts[i]),policy:revisionRef(policy)}));
 const snapshot=buildWorkSnapshotEvent({eventId:`${domain}:snapshot`,now,snapshot:{snapshotId:`${domain}-selection`,scope:revisionRef(scope),revisions:[policy,...goals,...obligations,...artifacts].map(revisionRef),bindings}});
 // Fixed test-world labels only, not observations of a real native session or active branch.
 const labels={sessionId:`${domain}-fixture-session`,branchLeafId:`${domain}-fixture-leaf`,toolCallId:null,taskId:null,workspaceId:null,definitionDigest:null,configurationDigest:sha('fixed observed fixture configuration'),modelId:null,effortId:null};
 const occurrences=[0,0,1].map((which,i)=>buildWorkOccurrenceEvent({eventId:`${domain}:attempt:${i}`,now,payload:{scope:revisionRef(scope),obligation:revisionRef(obligations[which]),executionId:`exec:00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,parentExecutionId:null,childId:`${domain}-worker`,variantId:null,artifact:revisionRef(artifacts[which]),provenance:'observed',state:'completed',labels}}));
 const claims=[0,1].map(i=>buildWorkAcceptanceEvent({eventId:`${domain}:claim:${i}`,now,payload:{authorityId:'fixture-controller',binding:{...bindings[i],artifact:revisionRef(artifacts[i]),artifactDigest:content,scope:revisionRef(scope),snapshot:{id:snapshot.payload.snapshot.snapshotId,digest:snapshot.payload.snapshot.digest},evidence:[{id:`${domain}-evidence-${i}`,digest:content,event:eventRef(occurrences[i?2:0])}]}}}));
 return {content,snapshot,occurrences,claims,artifacts,events:[scope,policy,...goals,...obligations,...artifacts,snapshot,...occurrences,...claims]};
}
function fixedAuthority(domain){
 // Rebuild the fixed expected world independently; no incoming wire/claim argument can grant itself authority.
 const expected=buildReplayWorld(domain);return{selectedSnapshot:{snapshot:{id:expected.snapshot.payload.snapshot.snapshotId,digest:expected.snapshot.payload.snapshot.digest},event:eventRef(expected.snapshot)},authority:{snapshot:{id:expected.snapshot.payload.snapshot.snapshotId,digest:expected.snapshot.payload.snapshot.digest},decisions:expected.claims.map((c,i)=>({receiptId:`${domain}-fixture-receipt-${i}`,authorityId:'fixture-controller',claim:eventRef(c),binding:JSON.parse(JSON.stringify(c.payload.binding)),decision:i?'accept':'reject'})),availability:[0,1].flatMap(i=>[{kind:'artifact',id:expected.artifacts[i].payload.revision.id,digest:expected.content,available:true},{kind:'evidence',id:`${domain}-evidence-${i}`,digest:expected.content,available:true}])}};
}
export function runLocalReplay(outputRoot){
 if(!isAbsolute(outputRoot)||existsSync(outputRoot))throw Error('explicit output must be absolute and not exist');mkdirSync(outputRoot,{mode:0o700});
 const domains=[];
 for(const domain of ['software','layout']){
  const directory=join(outputRoot,domain);mkdirSync(directory,{mode:0o700});const archive=join(directory,'archive');
  const expected=buildReplayWorld(domain),context=fixedAuthority(domain),text=expected.events.map(e=>JSON.stringify(e)).join('\n')+'\n';
  const projection=projectWorkLedger(text,context);
  const source=retainArchiveSource(archive,{sourceId:`${domain}-work`,parser:{id:'pi-daddy-work-ledger',version:'4'},retention:'exact',bytes:Buffer.from(text)});
  const usage=Object.fromEntries(expected.occurrences.map(o=>[o.payload.executionId,{observed:true,cost:1,unit:'wall_ms',evidence:sha('synthetic usage receipt')} ]));
  const captured=captureArchivedWorkCandidates(archive,source.manifestId,context,{version:'synthetic-fixture-v1',population:domain,scopeDigest:context.selectedSnapshot.snapshot.digest,minEquivalentAttempts:2,expectedWaits:[],expectedFailures:[],usage,exemplar:{unit:'wall_ms',maximum:10}});
  const candidates=captured.candidateIds.map(id=>readWorkCandidate(archive,id));const defectIndex=candidates.findIndex(c=>c.classification==='candidate_defect');
  if(defectIndex<0)throw Error('fixture did not nominate repeated work');
  const reviewer=createWorkCaseReviewer(archive,captured.caseBatchId,'operator:synthetic-fixture');
  const decision=reviewer.decide({caseManifestId:captured.candidateIds[defectIndex],priorDecisionId:null,disposition:'confirmed_defect',note:'Synthetic fixed reference, not a live human judgment.'}).current;
  const caseReference={version:2,batchId:captured.caseBatchId,manifestId:captured.candidateIds[defectIndex],decisionId:decision.id};
  const job=createWeeklyInvestigation(join(directory,'investigation'),{archiveRoot:archive,week:'2026-W01',population:domain,policyDigest:sha('fixture weekly policy'),maxCases:1,cases:[caseReference],reader:{manifestIds:[source.manifestId],maxCalls:1,maxBytes:65536,durationMs:30000,representations:['exact']}});
  const hypothesis=job.run({kind:'inert-v1',requests:[{tool:'archive.read',manifestId:source.manifestId},{tool:'hypothesis',proposal:{archiveSnapshot:job.inspect().selection.archiveSnapshot,caseIds:[candidates[defectIndex].id],population:domain,intervention:`change ${domain} fixture configuration`,alternatives:['keep reference'],prediction:'satisfy the fixed fixture check',downside:'additional review work',disproof:'fixed check remains unsatisfied',rollback:'retain reference',limits:{subjectCalls:0,judgeCalls:0,wallMs:1000},effectProfile:null}}]});
  const specPath=join(directory,'specification.yaml');writeFileSync(specPath,'# synthetic replay only\nskill: fixture\njudge_persona: fixture\nship_bar: {total: 1, min_pass: 1, no_critical_fail: true}\ncritical: []\nscenarios:\n  - id: A0\n    title: baseline\n    turns: [hello]\n    checklist: [responds]\n',{mode:0o600});
  const authority={id:'synthetic-controller',investigations:[hypothesis.id],promotions:[]};job.approve(authority);
  const preview=job.preview(specPath,{id:'A1',title:`${domain} fixed case`,turns:[`check ${domain} fixture`],checklist:['satisfies fixed constraint']});
  authority.promotions=[preview.digest];job.promote(preview,authority);
  const replay=job.promote(preview,authority),h=sha(`${domain} fixed inputs`),files={spec:specPath};
  for(const key of ['rubric','judgePolicy','heldout','configuration','skill']){files[key]=join(directory,key+'.txt');writeFileSync(files[key],`${domain} fixed ${key}`,{mode:0o600});}
  const frozen=job.freeze(files,authority),candidateText=`${domain} explicit candidate`;job.edit(candidateText,[job.previewEdit(candidateText)]);
  const component={kind:'detector',...candidates[defectIndex].detector},trustInput={archiveRoot:archive,component,seed:h,maxUnflagged:0,cohort:[{incidentId:candidates[defectIndex].id,manifestId:caseReference.manifestId,flagged:true,split:'calibration'}],exposure:null};
  const trust=createTrustLifecycle(join(directory,'trust'),trustInput,[trustPolicyDigest(trustInput)]);
  trust.predict({id:'fixture-prediction',incidentId:candidates[defectIndex].id,component,kind:'positive',split:'calibration'});
  const reference=trust.previewCaseOutcome('fixture-prediction',caseReference);trust.linkCaseOutcome('fixture-prediction',caseReference,[reference.digest]);
  const calibration=trust.inspect(0).calibration.reports[0];
  const manifest=freezeIntervention({family:'intervention',investigationSha256:frozen.digest,resourceMetric:'wall_ms',axes:['model'],common:{mode:'force',scenarioSha256:h,rubricSha256:h,fixtureSha256:h,heldoutSha256:h,harnessSha256:h,judgePolicySha256:h},proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:['a','b'].map(id=>({id,configuration:{model:`fixture:${id}`,effort:'fixture',skill:h,prompt:h,configuration:h}}))});
  const output=Buffer.from(`${domain} synthetic output`),outputHash=sha(output);
  const {version:_version,id:_id,inputDigest:_inputs,changedAxes:_axes,deterministicSampling:_sampling,...draft}=manifest;
  const castingScope={station:'fixture-build',taskClass:'fixed-constraint',risk:'fixture',population:domain,version:h};
  const comparison=createInterventionRun(join(directory,'comparison'),{kind:'inert-retained-v1',author:'operator:synthetic-fixture',catalogue:['proposer','judge','second','tie','a','b'].map(id=>({requested:`fixture:${id}`,canonical:`fixture-${id}`,efforts:['fixture'],lineage:'synthetic-shared-lineage'})),archiveRoot:archive,scope:castingScope,draft,roles:{proposer:{requested:draft.proposer,canonical:'fixture-proposer'},judges:[{requested:draft.judge,canonical:'fixture-judge'},{requested:'fixture:second',canonical:'fixture-second'},{requested:'fixture:tie',canonical:'fixture-tie'}],subjects:{a:{requested:'fixture:a',canonical:'fixture-a',effort:'fixture'},b:{requested:'fixture:b',canonical:'fixture-b',effort:'fixture'}}},expected:{a:[outputHash],b:['f'.repeat(64)]}});
  for(const config of comparison.configurations())comparison.retain(config.armId,0,{configurationDigest:config.digest,delivery:'PASS',outputBase64:output.toString('base64'),cost:config.armId==='a'?10:1});
  if(comparison.blind().length!==1)throw Error('objective gate failed before blind panel');
  comparison.panel('a',0,[[{verdict:'PASS',suspect:false},{verdict:'PASS',suspect:false}]]);
  const {assessment,blindReviewId}=comparison.finish();if(!blindReviewId)throw Error('complete inert panel did not yield durable blind choice');
  const blind=openBlindIntervention(archive,blindReviewId,'operator:synthetic-fixture');
  blind.choose({kind:'one',labels:[blind.view().cards[0].label]});
  // Reopen the durable record instead of carrying an in-memory reveal permission.
  openBlindIntervention(archive,blindReviewId,'operator:synthetic-fixture').reveal();
  writeFileSync(join(directory,'casting.json'),JSON.stringify(comparison.casting(castingScope),null,2)+'\n',{mode:0o600});
  const binding=buildAdoptionBinding({hypothesisDigest:hypothesis.id,experimentDigest:manifest.id,candidateDigest:h,scopeDigest:context.selectedSnapshot.snapshot.digest,assessmentPolicyDigest:h,rollbackCandidateDigest:sha('synthetic prior candidate'),activationBoundary:'next-orders',expiresAt:1000});
  const adoption=authorizeAdoption(binding,{id:'synthetic-controller',adoptions:[binding.id],rollbacks:[]},{experimentDigest:manifest.id,candidateDigest:h,scopeDigest:binding.scopeDigest,assessmentPolicyDigest:h,eligible:true},0);
  const later=classifyProductionObservation(adoption,{id:'synthetic-later-observation',adoptionId:adoption.id,candidateDigest:h,scopeDigest:binding.scopeDigest,originalRequirementDigest:h,currentRequirementDigest:h,outcome:'unknown',acceptanceDigest:null,acceptedArtifactDigest:null,observedArtifactDigest:outputHash,evidence:[]});
  domains.push({domain,caseBatchId:captured.caseBatchId,investigationSelectionId:job.inspect().selection.id,evaluationFrozen:job.evaluation().executionReady===false,calibration:{correct:calibration.correct,resolved:calibration.resolved,reference:'synthetic-confirmation'},blindReviewId,accepted:projection.progress?.accepted,total:projection.progress?.total,caseCount:candidates.length,scenarioReplayed:replay.replayed,routingDefault:assessment.routingDefault,grantExpansion:adoption.grantExpansion,laterOutcome:later.state,executionReady:frozen.executionReady});
 }
 const result={kind:'synthetic-local-replay',liveQualified:false,domains,pending:['actual model/role/delivery qualification','bounded factory order execution and reserved decision','authenticated human debrief/blind workflow','real production adoption and later outcomes']};
 writeFileSync(join(outputRoot,'summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
export async function runConnectedReplay(outputRoot,producerRoot,principalRoot){
 const {verifyOrderProducer,runPinnedOrder}=await import('./order.mjs');verifyOrderProducer(producerRoot);
 const principal=principalRoot?await import('./principal.mjs'):null;if(principal)principal.verifyPrincipalProducer(principalRoot);
 const result=runLocalReplay(outputRoot);writeFileSync(join(outputRoot,'harness-phase-summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 for(const domain of result.domains){const directory=join(outputRoot,domain.domain),evaluation=openWeeklyInvestigation(join(directory,'investigation')).evaluation();domain.boundedOrder=await runPinnedOrder(producerRoot,directory,domain.domain,evaluation,buildReplayWorld(domain.domain));if(principal)domain.principal=await principal.runPinnedPrincipal(principalRoot,producerRoot,directory,domain.domain,fixedAuthority(domain.domain),domain.boundedOrder);const {runPinnedDashboard}=await import('./dashboard.mjs');domain.dashboard=await runPinnedDashboard(producerRoot,directory,domain.domain,fixedAuthority(domain.domain),domain.caseBatchId,domain.blindReviewId);}
 result.kind='inert-connected-replay';result.pending=result.pending.filter(p=>p!=='bounded factory order execution and reserved decision');result.pending.push(principal?'authentic Principal/dashboard host and consent qualification':'Principal SPEC-006 corrected native mapping pin/invocation');
 writeFileSync(join(outputRoot,'summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv[2]!=='--output'||!process.argv[3]||![4,6,8].includes(process.argv.length)||(process.argv.length>=6&&(process.argv[4]!=='--producer'||!process.argv[5]))||(process.argv.length===8&&(process.argv[6]!=='--principal'||!process.argv[7])))throw Error('use --output /absolute/new-owned-directory [--producer /absolute/pinned-checkout [--principal /absolute/pinned-checkout]] after direct build');
 const result=process.argv.length>=6?await runConnectedReplay(resolve(process.argv[3]),resolve(process.argv[5]),process.argv[7]?resolve(process.argv[7]):undefined):runLocalReplay(resolve(process.argv[3]));console.log(JSON.stringify(result,null,2));
}
