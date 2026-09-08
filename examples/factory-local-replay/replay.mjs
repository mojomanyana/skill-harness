import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildHypothesis, previewInvestigationScenario, applyInvestigationScenario, freezeInvestigation,
  freezeIntervention, interventionEvidenceDigest, assessIntervention,
  buildAdoptionBinding, authorizeAdoption, classifyProductionObservation,
} from '../../packages/core/dist/index.js';
import { retainArchiveSource, readWorkCandidate, captureArchivedWorkCandidates, createWorkCaseReviewer, retainBlindIntervention, openBlindIntervention } from '../../packages/adapters/dist/index.js';
import { buildWorkRevisionEvent, buildWorkSnapshotEvent, buildWorkOccurrenceEvent, buildWorkAcceptanceEvent, projectWorkLedger } from '../../packages/adapters/dist/generated/work-v4/reader.js';
const sha=value=>createHash('sha256').update(value).digest('hex');
const revisionRef=e=>({kind:e.payload.revision.kind,id:e.payload.revision.id,revision:e.payload.revision.revision,digest:e.payload.revision.digest});
const eventRef=e=>({eventId:e.eventId,digest:e.digest});
function world(domain){
 const now=new Date('2026-01-01T00:00:00.000Z'),content=sha(`synthetic ${domain} content`),scopeId=`${domain}-scope`;
 const revision=(kind,id,extra={})=>buildWorkRevisionEvent({eventId:`${domain}:${id}`,now,revision:{kind,id,revision:1,scopeId,predecessor:null,contentDigest:content,parent:null,dependencies:[],ownerId:'fixture-controller',permittedEffects:[],policy:null,...extra}});
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
 const expected=world(domain);return{selectedSnapshot:{snapshot:{id:expected.snapshot.payload.snapshot.snapshotId,digest:expected.snapshot.payload.snapshot.digest},event:eventRef(expected.snapshot)},authority:{snapshot:{id:expected.snapshot.payload.snapshot.snapshotId,digest:expected.snapshot.payload.snapshot.digest},decisions:expected.claims.map((c,i)=>({receiptId:`${domain}-fixture-receipt-${i}`,authorityId:'fixture-controller',claim:eventRef(c),binding:JSON.parse(JSON.stringify(c.payload.binding)),decision:i?'accept':'reject'})),availability:[0,1].flatMap(i=>[{kind:'artifact',id:expected.artifacts[i].payload.revision.id,digest:expected.content,available:true},{kind:'evidence',id:`${domain}-evidence-${i}`,digest:expected.content,available:true}])}};
}
export function runLocalReplay(outputRoot){
 if(!isAbsolute(outputRoot)||existsSync(outputRoot))throw Error('explicit output must be absolute and not exist');mkdirSync(outputRoot,{mode:0o700});
 const domains=[];
 for(const domain of ['software','layout']){
  const directory=join(outputRoot,domain);mkdirSync(directory,{mode:0o700});const archive=join(directory,'archive');
  const expected=world(domain),context=fixedAuthority(domain),text=expected.events.map(e=>JSON.stringify(e)).join('\n')+'\n';
  const projection=projectWorkLedger(text,context);
  const source=retainArchiveSource(archive,{sourceId:`${domain}-work`,parser:{id:'pi-daddy-work-ledger',version:'4'},retention:'exact',bytes:Buffer.from(text)});
  const usage=Object.fromEntries(expected.occurrences.map(o=>[o.payload.executionId,{observed:true,cost:1,unit:'wall_ms',evidence:sha('synthetic usage receipt')} ]));
  const captured=captureArchivedWorkCandidates(archive,source.manifestId,context,{version:'synthetic-fixture-v1',population:domain,scopeDigest:context.selectedSnapshot.snapshot.digest,minEquivalentAttempts:2,expectedWaits:[],expectedFailures:[],usage,exemplar:{unit:'wall_ms',maximum:10}});
  const candidates=captured.candidateIds.map(id=>readWorkCandidate(archive,id));const defectIndex=candidates.findIndex(c=>c.classification==='candidate_defect');
  if(defectIndex<0)throw Error('fixture did not nominate repeated work');
  const reviewer=createWorkCaseReviewer(archive,captured.caseBatchId,'operator:synthetic-fixture');
  reviewer.decide({caseManifestId:captured.candidateIds[defectIndex],priorDecisionId:null,disposition:'confirmed_defect',note:'Synthetic fixed reference, not a live human judgment.'});
  const hypothesis=buildHypothesis({archiveSnapshot:captured.observationId,caseIds:[candidates[defectIndex].id],population:domain,intervention:`change ${domain} fixture configuration`,alternatives:['keep reference'],prediction:'satisfy the fixed fixture check',downside:'additional review work',disproof:'fixed check remains unsatisfied',rollback:'retain reference',limits:{subjectCalls:0,judgeCalls:0,wallMs:1000},effectProfile:null});
  const specPath=join(directory,'specification.yaml');writeFileSync(specPath,'# synthetic replay only\nskill: fixture\njudge_persona: fixture\nship_bar: {total: 1, min_pass: 1, no_critical_fail: true}\ncritical: []\nscenarios:\n  - id: A0\n    title: baseline\n    turns: [hello]\n    checklist: [responds]\n',{mode:0o600});
  const preview=previewInvestigationScenario(hypothesis,specPath,{id:'A1',title:`${domain} fixed case`,turns:[`check ${domain} fixture`],checklist:['satisfies fixed constraint']});
  const authority={id:'synthetic-controller',investigations:[hypothesis.id],promotions:[preview.digest]};applyInvestigationScenario(hypothesis,preview,authority);
  const replay=applyInvestigationScenario(hypothesis,preview,authority);const h=sha(`${domain} fixed inputs`);
  const frozen=freezeInvestigation(hypothesis,{specSha256:replay.sha256,rubricSha256:h,judgePolicySha256:h,heldoutSha256:h,configurationSha256:h},authority);
  const manifest=freezeIntervention({family:'intervention',investigationSha256:frozen.digest,resourceMetric:'wall_ms',axes:['model'],common:{mode:'force',scenarioSha256:h,rubricSha256:h,fixtureSha256:h,heldoutSha256:h,harnessSha256:h,judgePolicySha256:h},proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:['a','b'].map(id=>({id,configuration:{model:`fixture:${id}`,effort:'fixture',skill:h,prompt:h,configuration:h}}))});
  const output=Buffer.from(`${domain} synthetic output`),outputHash=sha(output);
  const evidence=['a','b'].map(armId=>({armId,inputDigest:manifest.inputDigest,artifactDigests:[outputHash],cells:[{caseId:'A1',repetition:0,delivery:'PASS',objective:armId==='a'?'PASS':'FAIL',criteria:armId==='a'?['PASS']:[],suspect:false,artifactSha256:outputHash}],cost:armId==='a'?10:1,costUnit:'wall_ms'}));
  const qualified={manifestId:manifest.id,proposer:{requested:'fixture:proposer',canonical:'fixture-proposer'},judge:{requested:'fixture:judge',canonical:'fixture-judge'},subjects:{a:{requested:'fixture:a',canonical:'fixture-a'},b:{requested:'fixture:b',canonical:'fixture-b'}},evidenceDigests:Object.fromEntries(evidence.map(e=>[e.armId,interventionEvidenceDigest(e)])),artifacts:new Map([[outputHash,output]])};
  const assessment=assessIntervention(manifest,evidence,qualified);
  const blindReviewId=retainBlindIntervention(archive,manifest,evidence,qualified,'operator:synthetic-fixture');
  const blind=openBlindIntervention(archive,blindReviewId,'operator:synthetic-fixture');
  blind.choose({kind:'one',labels:[blind.view().cards[0].label]});
  // Reopen the durable record instead of carrying an in-memory reveal permission.
  openBlindIntervention(archive,blindReviewId,'operator:synthetic-fixture').reveal();
  const binding=buildAdoptionBinding({hypothesisDigest:hypothesis.id,experimentDigest:manifest.id,candidateDigest:h,scopeDigest:context.selectedSnapshot.snapshot.digest,assessmentPolicyDigest:h,rollbackCandidateDigest:sha('synthetic prior candidate'),activationBoundary:'next-orders',expiresAt:1000});
  const adoption=authorizeAdoption(binding,{id:'synthetic-controller',adoptions:[binding.id],rollbacks:[]},{experimentDigest:manifest.id,candidateDigest:h,scopeDigest:binding.scopeDigest,assessmentPolicyDigest:h,eligible:true},0);
  const later=classifyProductionObservation(adoption,{id:'synthetic-later-observation',adoptionId:adoption.id,candidateDigest:h,scopeDigest:binding.scopeDigest,originalRequirementDigest:h,currentRequirementDigest:h,outcome:'unknown',acceptanceDigest:null,acceptedArtifactDigest:null,observedArtifactDigest:outputHash,evidence:[]});
  domains.push({domain,blindReviewId,accepted:projection.progress?.accepted,total:projection.progress?.total,caseCount:candidates.length,scenarioReplayed:replay.replayed,routingDefault:assessment.routingDefault,grantExpansion:adoption.grantExpansion,laterOutcome:later.state,executionReady:frozen.executionReady});
 }
 const result={kind:'synthetic-local-replay',liveQualified:false,domains,pending:['actual model/role/delivery qualification','bounded factory order execution and reserved decision','authenticated human debrief/blind workflow','real production adoption and later outcomes']};
 writeFileSync(join(outputRoot,'summary.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv[2]!=='--output'||!process.argv[3]||process.argv.length!==4)throw Error('use --output /absolute/new-owned-directory after direct build');console.log(JSON.stringify(runLocalReplay(resolve(process.argv[3])),null,2));}
