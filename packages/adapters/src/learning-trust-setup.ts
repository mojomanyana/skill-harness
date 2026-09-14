import type { CalibrationPrediction, CalibrationSplit, ExposurePolicy } from '@skill-harness/core';
import { learningCopy, learningHash } from './learning-journal.js';
import type { LearningCaseReference } from './learning-case.js';
import { openLearningWorkspace } from './learning-workspace.js';
import { trustPolicyDigest, type TrustLifecycleInput } from './trust-lifecycle.js';

export interface LearningTrustSetup {
  caseName: string; detectorId: string; split: CalibrationSplit; maxUnflagged: number;
  unflagged: {incidentId:string;manifestId:string;split:CalibrationSplit}[];
  exposure: Omit<ExposurePolicy,'component'|'kind'|'split'>|null;
}
/** Forms construct a frozen cohort from actual selected cases. Repeated observations of the
 * same target are ONE incident; a detector nomination never becomes its own reference label. */
export function previewLearningTrust(directory: string, raw: LearningTrustSetup) {
  const options=learningCopy(raw), workspace=openLearningWorkspace(directory), config=workspace.configuration();
  if(Object.keys(options).sort().join()!=='caseName,detectorId,exposure,maxUnflagged,split,unflagged' || !['calibration','heldout','tuning'].includes(options.split) || !Array.isArray(options.unflagged) || options.unflagged.length>1024) throw Error('closed trust setup required');
  const page=workspace.cases(options.caseName), items=[...page.items];
  for(let offset=5;offset<page.total;offset+=5) items.push(...workspace.cases(options.caseName,offset).items);
  const chosen=items.filter(c=>c.candidate.detector.id===options.detectorId);
  if(!chosen.length) throw Error('selected detector has no retained cases');
  const component={kind:'detector' as const,...chosen[0].candidate.detector};
  if(chosen.some(c=>learningHash(c.candidate.detector)!==learningHash(chosen[0].candidate.detector))) throw Error('detector versions/populations must be calibrated separately');
  const binding=workspace.inspect(0).cases.find(b=>b.name===options.caseName);
  if(!binding || binding.state!=='ready') throw Error('case binding unavailable');
  const incidents=new Map<string,(typeof chosen)[number]>();
  for(const c of chosen) { const id=learningHash({target:c.candidate.target,population:component.population}); if(!incidents.has(id)) incidents.set(id,c); }
  const cohort=[...[...incidents].map(([incidentId,c])=>({incidentId,manifestId:c.caseManifestId,flagged:true,split:options.split})),...options.unflagged.map(c=>({...c,flagged:false}))];
  const input:TrustLifecycleInput={archiveRoot:config.archiveRoot,component,seed:learningHash({scope:config.scopeDigest,component,cohort}),maxUnflagged:options.maxUnflagged,cohort,
    exposure:options.exposure?{...options.exposure,component,kind:'positive',split:options.split==='tuning'?'calibration':options.split}:null};
  const predictions:CalibrationPrediction[]=[...incidents].map(([incidentId])=>({id:learningHash({incidentId,component,split:options.split}),incidentId,component,kind:'positive',split:options.split}));
  return {input,policyDigest:trustPolicyDigest(input),predictions,nominationCount:chosen.length,independentIncidentCount:incidents.size,
    caseManifestIds:[...incidents.values()].map(c=>c.caseManifestId),labelsCreated:0 as const,excludedOtherDetectors:items.length-chosen.length};
}
export function configureLearningTrust(directory: string, options: LearningTrustSetup, authorizedPolicyDigests: readonly string[]) {
  const preview=previewLearningTrust(directory,options),workspace=openLearningWorkspace(directory);
  workspace.configureTrust(preview.input,authorizedPolicyDigests);
  for(const p of preview.predictions) workspace.trust().predict(p);
  return workspace.trust().inspect(0);
}
/** Selected case reference, not a retyped verdict. Separate explicit reference authority is
 * still required by linkCaseOutcome; this only supplies the exact preview to the operator. */
export function previewLearningCaseLabel(directory: string, reference: LearningCaseReference) {
  const trust=openLearningWorkspace(directory).trust(),config=trust.configuration();
  const row=config.cohort.find(c=>c.flagged && c.manifestId===reference.manifestId);
  if(!row) throw Error('case outside frozen calibration cohort');
  const predictions=trust.history().filter(e=>e.value.type==='prediction'||e.value.type==='correction').map(e=>e.value.prediction as CalibrationPrediction);
  const p=predictions.filter(p=>p.incidentId===row.incidentId).at(-1);
  if(!p) throw Error('prediction missing');
  return {predictionId:p.id,...trust.previewCaseOutcome(p.id,reference)};
}
