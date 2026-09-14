// Synthetic production-builder fixture. No real model, independent label, or registry claim.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildWorkCapture, freezeIntervention, interventionEvidenceDigest, buildAdoptionBinding } from '@skill-harness/core';
import { retainWorkCandidate } from '../src/work-case-archive.js';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { retainBlindIntervention } from '../src/blind-intervention.js';
import { createLearningWorkspace, type LearningRegistryReceipt } from '../src/learning-workspace.js';
export const sha=(b:string|Buffer)=>createHash('sha256').update(b).digest('hex');
export function learningWorkspaceFixture(digests: { candidateDigest?: string; rollbackCandidateDigest?: string } = {}) {
  const root=mkdtempSync(join(tmpdir(),'learning-workspace-')),archiveRoot=join(root,'archive'),directory=join(root,'workspace');
  const h=sha('scope'),config={archiveRoot,scopeDigest:h,population:'fixture-population',author:'fixture-operator'};
  const workspace=createLearningWorkspace(directory,config);
  const observation=retainArchiveSource(archiveRoot,{sourceId:'fixture-case-inputs',parser:{id:'synthetic-case-inputs',version:'1'},retention:'exact',bytes:Buffer.from('Synthetic original fixture evidence; no real production observation.')});
  const candidate=buildWorkCapture({detector:{id:'coverage_gap',version:'fixture-v1',population:config.population},target:{kind:'work',snapshotDigest:h,obligationId:'report',obligationDigest:sha('obligation')},classification:'coverage_issue',reason:'coverage_gap',evidence:[observation.reference.sha256],metrics:{}});
  const caseManifestId=retainWorkCandidate(archiveRoot,candidate);
  const batchId=retainArchiveSource(archiveRoot,{sourceId:'fixture-case-batch',parser:{id:'work-candidate-batch',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify({version:'work-candidate-batch-v1',observationId:observation.manifestId,candidateIds:[caseManifestId],visibility:'silent',promotion:'not-authorized'}))}).manifestId;
  workspace.bindCases({name:'daily',title:'Retained daily cases',version:2,batchId});
  const decision=workspace.decideCase('daily',{caseManifestId,priorDecisionId:null,disposition:'confirmed_defect',note:'Synthetic independent fixture label, not actual evidence.'}).current;
  const hypothesis=workspace.propose('daily',{archiveSnapshot:sha('snapshot'),caseIds:[candidate.id],population:config.population,intervention:'Change the fixture setting',alternatives:['No change'],prediction:'Fewer missed fixture checks',downside:'Extra effort',disproof:'Checks remain missing',rollback:'Restore baseline',limits:{subjectCalls:0,judgeCalls:0,wallMs:0},effectProfile:null},'repair');
  const outputs=['First complete synthetic report.','Second complete synthetic report.'],hashes=outputs.map(sha),candidateDigest=digests.candidateDigest??sha('candidate-configuration'),rollbackCandidateDigest=digests.rollbackCandidateDigest??sha('baseline-configuration');
  const manifest=freezeIntervention({family:'intervention',investigationSha256:hypothesis.hypothesis.id,resourceMetric:'wall_ms',axes:['configuration'],common:{mode:'force',scenarioSha256:h,rubricSha256:h,fixtureSha256:h,heldoutSha256:h,harnessSha256:h,judgePolicySha256:h},proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:outputs.map((_,i)=>({id:`arm-${i}`,configuration:{model:'fixture:subject',effort:'low',skill:h,prompt:h,configuration:i?candidateDigest:rollbackCandidateDigest}}))});
  const evidence=outputs.map((_,i)=>({armId:`arm-${i}`,inputDigest:manifest.inputDigest,artifactDigests:[hashes[i]],cells:[{caseId:'A1',repetition:0,delivery:'PASS' as const,objective:'PASS' as const,criteria:['PASS' as const],suspect:false,artifactSha256:hashes[i]}],cost:i+1,costUnit:'wall_ms'}));
  const comparisonManifestId=retainBlindIntervention(archiveRoot,manifest,evidence,{manifestId:manifest.id,proposer:{requested:'fixture:proposer',canonical:'fixture-proposer'},judge:{requested:'fixture:judge',canonical:'fixture-judge'},subjects:Object.fromEntries(manifest.arms.map(a=>[a.id,{requested:a.configuration.model,canonical:'fixture-subject'}])),evidenceDigests:Object.fromEntries(evidence.map(e=>[e.armId,interventionEvidenceDigest(e)])),artifacts:new Map(outputs.map((text,i)=>[hashes[i],Buffer.from(text)]))},config.author);
  const adoptionBinding=buildAdoptionBinding({hypothesisDigest:hypothesis.hypothesis.id,experimentDigest:manifest.id,candidateDigest,scopeDigest:h,assessmentPolicyDigest:h,rollbackCandidateDigest,activationBoundary:'next-orders',expiresAt:Date.now()+86400000});
  const feedback=retainArchiveSource(archiveRoot,{sourceId:'fixture-excerpt-feedback',parser:{id:'excerpt-only-feedback',version:'1'},retention:'exact',bytes:Buffer.from('Historical fixture: preferred excerpt A; both acceptable. Excerpts only.')}).manifestId;
  const comparison={name:'reports',title:'Complete report comparison',scopeStatement:'Usefulness of complete synthetic reports; previously viewed excerpts are not full acceptance.',comparisonManifestId,caseReference:{version:2 as const,batchId,manifestId:caseManifestId,decisionId:decision.id},hypothesisManifestId:hypothesis.manifestId,priorFeedbackManifestIds:[feedback],adoptionBinding};
  workspace.bindComparison(comparison);
  const quality=()=>workspace.choose('reports',{kind:'tie',labels:workspace.comparison('reports').cards.map(c=>c.label)},{scope:'full-artifacts',note:'Both complete fixture artifacts reviewed.',reviewedArtifactDigests:hashes});
  const facts={experimentDigest:manifest.id,candidateDigest,scopeDigest:h,assessmentPolicyDigest:h,eligible:true};
  const authority={id:'fixture-authority',adoptions:[adoptionBinding.id],rollbacks:[] as string[]};
  const prepare=()=>{quality();workspace.decide('reports',{disposition:'adopt',note:'Fixture intent, not activation',priorDecisionId:null});return workspace.prepareAdoption('reports',authority,facts,Date.now());};
  const registry=(receipt:Omit<LearningRegistryReceipt,'registryManifestId'|'version'>)=>{
    const view={version:'factory-registry-view-v1',scopeDigest:receipt.scopeDigest,candidateDigest:receipt.candidateDigest,revision:receipt.revision,
      application:'applied',requestId:receipt.requestId,lastChange:{operation:receipt.operation,requestId:receipt.requestId,adoptionId:receipt.adoptionId},
      ...(receipt.operation==='activate'?{activation:{requestId:receipt.requestId,receipt:workspace.preparedAdoption('reports')}}:{})};
    const registryManifestId=retainArchiveSource(archiveRoot,{sourceId:'fixture-original-registry-view',parser:{id:'fixture-registry-view',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify(view))}).manifestId;
    return retainArchiveSource(archiveRoot,{sourceId:'fixture-registry-receipt',parser:{id:'learning-registry-receipt',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify({version:'learning-registry-receipt-v1',...receipt,registryManifestId}))}).manifestId;
  };
  return {root,archiveRoot,directory,config,workspace,candidate,caseManifestId,batchId,decision,hypothesis,comparison,comparisonManifestId,outputs,hashes,adoptionBinding,feedback,quality,facts,authority,prepare,registry};
}
