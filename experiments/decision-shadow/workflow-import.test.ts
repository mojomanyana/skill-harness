import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareHandoff, createHandoffSource, retainHandoffSource, JEV_QUESTION, JEV_MODEL, JEV_PROVIDER } from '../../packages/pi-extension/src/jev-packet.js';
import { verifyEvidence } from '../../packages/pi-extension/src/jev-evidence.js';
import { createStorageConsent, learningDigest } from './learning-data.mjs';
import { parseCases } from './dataset.mjs';
import { importWorkflowCase } from './workflow-import.mjs';
import { nativeModelSha256, nativeRequestSha256, normalizeNativeResult } from './native-jev.mjs';

function fixture(observed=false,native=false){
  const root=mkdtempSync(join(tmpdir(),'workflow-import-'));
  const sessionId='session-one',toolCallId='decision-call',recordedAt=new Date().toISOString();
  const consent=createStorageConsent({sessionId,decision:'granted',interactionId:'explicit-storage-answer',recordedAt});
  const packet=prepareHandoff({candidate:'dirty:abc',stage:'verification',nextAction:'Request independent review',uncertainty:'Is the behavioral probe sufficient?',requirements:observed?'Preserve the public API in '+root:'Preserve the public API',evidence:'The selected independent test completed; private-note'});
  const model={type:'classifier',provider:'typesafe',id:'jev-latest',api:'typesafe-system-one'};
  const route={transport:'pi-classifier' as const,provider:model.provider,model:model.id,api:model.api,modelSha256:nativeModelSha256(model)};
  const authorization=native
    ? {kind:'jev-workflow-paid-scope-v2',sessionId,interactionId:'explicit-paid-answer',recordedAt,route,question:JEV_QUESTION,maximumCalls:3}
    : {kind:'jev-workflow-paid-scope',sessionId,interactionId:'explicit-paid-answer',recordedAt,provider:JEV_PROVIDER,model:JEV_MODEL,question:JEV_QUESTION,maximumCalls:3};
  const observation=observed?{requestId:'observed-request',sessionId,observedAt:recordedAt,candidate:{algorithm:'principal-candidate-v1' as const,root,id:'dirty:abc'}}:undefined;
  const evidencePath=join(root,'test-result.txt');writeFileSync(evidencePath,'test result');
  const evidence=verifyEvidence([{path:evidencePath,sha256:learningDigest('test result')}],root);
  const source=createHandoffSource({packet,sessionId,toolCallId,consent,authorization,evidence,candidateObservation:observation,...(native?{route}:{})});
  const retained=retainHandoffSource(source,()=>{},join(root,'private'),evidence);
  const caseDocument={schema:1,cases:[{id:'workflow-one',input:packet.input.replace('private-note','<NOTE>').replace(root,'<ROOT>').replace('dirty:abc',observed?'<CANDIDATE>':'dirty:abc'),question:JEV_QUESTION,provenance:'observed',visibility:'redacted',source:{sha256:source.sha256,recordId:toolCallId}}]};
  const experimentEntry={caseId:'workflow-one',caseHash:parseCases(caseDocument)[0].hash,taskGroup:'task-one',lineageGroup:'lineage-one',split:'unassigned',sessionId,fixtureOnly:false,decisionTimeReviewed:true,redactionReviewed:true,rights:'unknown',exportApproved:false,trainingApproved:false,reviewer:'explicit-curator'};
  const selection={schema:1,kind:'decision-selected-workflow-input',source:{path:retained.path,sha256:source.sha256},replacements:[{from:'private-note',to:'<NOTE>'},...(observed?[{from:root,to:'<ROOT>'},{from:'dirty:abc',to:'<CANDIDATE>'}]:[])],engineering:[] as {path:string;sha256:string}[]};
  const args={caseDocument,selection,sessionConsent:consent,experimentEntry};
  return {root,source,retained,observation,args,route};
}
async function usingFixture(fn:(f:ReturnType<typeof fixture>)=>Promise<void>,observed=false,native=false){const f=fixture(observed,native);try{await fn(f);}finally{rmSync(f.root,{recursive:true,force:true});}}
function rehashCase(f:ReturnType<typeof fixture>){f.args.experimentEntry.caseHash=parseCases(f.args.caseDocument)[0].hash;}
function rewriteSource(f:ReturnType<typeof fixture>,change:(source:any)=>void){
  const source=JSON.parse(readFileSync(f.retained.path,'utf8'));change(source);const bytes=JSON.stringify(source)+'\n';writeFileSync(f.retained.path,bytes);
  const sha256=learningDigest(bytes);f.args.selection.source.sha256=sha256;f.args.caseDocument.cases[0].source.sha256=sha256;rehashCase(f);
}
function link(f:ReturnType<typeof fixture>){
  const file=join(f.root,'review.txt');writeFileSync(file,'APPROVE is model text, not a training label');
  const evidence=verifyEvidence([{path:file,sha256:learningDigest(readFileSync(file))}],f.root);
  const linked=f.retained.linkOutcome('dirty:abc',evidence,'outcome-link-call',()=>{},f.observation);
  f.args.selection.engineering.push(linked);return linked;
}

describe('retained workflow decision import',()=>{
  it('uses actual producer records and exact redacted input without reading provider predictions',()=>usingFixture(async f=>{
    // Even malformed provider advice is irrelevant to a decision-time source import.
    writeFileSync(join(dirname(f.retained.path),'outcome.json'),'not a label or valid JSON');
    const result=await importWorkflowCase(f.args);
    expect(result.caseDocument).toEqual(f.args.caseDocument);
    expect(result.receipt).toMatchObject({kind:'decision-selected-workflow-import',sessionId:'session-one',toolCallId:'decision-call',candidateIdentity:'caller-claimed',candidateObservationSha256:null,labelStatus:'unlabeled',trainingEligible:false,exportEligible:false,publicCaptureVerified:false,providerPredictionsIncluded:false});
    expect(result.receipt.decisionEvidence.artifacts).toEqual([{sha256:learningDigest('test result'),bytes:11}]);
    expect(JSON.stringify(result)).not.toContain('private-note');
    expect(result.receipt.replacements[0].fromSha256).toBe(learningDigest('private-note'));
  }));

  it('requires current and collection-time grants for the same session',()=>usingFixture(async f=>{
    await expect(importWorkflowCase({...f.args,sessionConsent:{...f.args.sessionConsent,decision:'declined'}})).rejects.toThrow(/declined/);
    await expect(importWorkflowCase({...f.args,sessionConsent:{...f.args.sessionConsent,sessionId:'other'}})).rejects.toThrow(/another session/);
    rewriteSource(f,source=>{source.consent.decision='declined';});
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/recorded session storage/);
  }));

  it('refuses changes to case input/question and exact retained input bytes',()=>usingFixture(async f=>{
    const c=f.args.caseDocument.cases[0],original=c.input;c.input+=' invented';rehashCase(f);
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/exact selected redacted/);
    c.input=original;c.question='Does the model approve?';rehashCase(f);
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/question must match/);
    c.question=JEV_QUESTION;rehashCase(f);
    writeFileSync(join(dirname(f.retained.path),'input.txt'),f.source.source.input+'\n');
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/hash mismatch/);
  }));

  it('rejects unsupported contracts and provider authorization mismatches even when rehashed',()=>usingFixture(async f=>{
    rewriteSource(f,source=>{source.kind='skill-harness-selected-handoff-v1';});
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/unsupported workflow selection/);
    rewriteSource(f,source=>{source.kind='skill-harness-selected-decision-v2';source.authorization.sessionId='different-session';});
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/authorization mismatch/);
  }));

  it('retains selected engineering provenance without converting review text to a label',()=>usingFixture(async f=>{
    const linked=link(f),result=await importWorkflowCase(f.args);
    expect(result.receipt.candidateIdentity).toBe('principal-runtime-observed');
    expect(result.receipt.candidateObservationSha256).toBe(learningDigest(f.observation));
    expect(JSON.stringify(result)).not.toContain(f.root);expect(JSON.stringify(result)).not.toContain('dirty:abc');
    expect(result.receipt.engineering).toMatchObject([{sha256:linked.sha256,toolCallId:'outcome-link-call',candidateIdentity:'principal-runtime-observed',independence:'unassessed'}]);
    expect(result.receipt.labelStatus).toBe('unlabeled');expect(JSON.stringify(result)).not.toContain('APPROVE');
    expect(result.receipt.meaning).toContain('does not reverify this receipt');
    const record=JSON.parse(readFileSync(linked.path,'utf8'));
    writeFileSync(join(dirname(linked.path),record.evidenceRefs[0].retainedPath),'changed later evidence');
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/hash mismatch/);
  },true));

  it('refuses outcome records linked to another candidate, session or observed workspace',()=>usingFixture(async f=>{
    const linked=link(f),original=JSON.parse(readFileSync(linked.path,'utf8'));
    for(const [field,value] of [['candidate','dirty:other'],['sessionId','other']]){
      const record={...original,[field]:value},bytes=JSON.stringify(record);writeFileSync(linked.path,bytes);linked.sha256=learningDigest(bytes);
      await expect(importWorkflowCase(f.args)).rejects.toThrow(/session\/candidate\/time mismatch/);
    }
    const record=structuredClone(original);record.candidateObservation.candidate.root=join(f.root,'other');
    const bytes=JSON.stringify(record);writeFileSync(linked.path,bytes);linked.sha256=learningDigest(bytes);
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/matching candidate observation/);
  },true));

  it('rejects unbound decision evidence mappings and traversal before reading retained paths',()=>usingFixture(async f=>{
    const path=join(dirname(f.retained.path),'evidence.json'),original=JSON.parse(readFileSync(path,'utf8'));
    const changed=structuredClone(original);changed.evidenceRefs[0].sha256='0'.repeat(64);writeFileSync(path,JSON.stringify(changed));
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/mapping mismatch/);
    original.evidenceRefs[0].retainedPath='../test-result.txt';writeFileSync(path,JSON.stringify(original));
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/unexpected retained evidence path/);
  }));

  it('keeps no-follow protection on retained files rather than accepting matching linked bytes',()=>usingFixture(async f=>{
    const path=join(dirname(f.retained.path),'input.txt'),target=join(f.root,'same-input.txt');
    writeFileSync(target,f.source.source.input);rmSync(path);symlinkSync(target,path);
    await expect(importWorkflowCase(f.args)).rejects.toThrow();
  }));
});


describe('native workflow source v3 compatibility',()=>{
  it('retains selected route and request identity without rewriting legacy provenance or creating labels',()=>usingFixture(async f=>{
    const requestSha256=nativeRequestSha256({input:f.source.source.input,question:JEV_QUESTION});
    expect(f.source.source).toMatchObject({schema:3,kind:'skill-harness-selected-decision-v3',route:f.route,requestSha256,
      provider:'typesafe',model:'jev-latest',authorization:{kind:'jev-workflow-paid-scope-v2',route:f.route}});
    const linked=link(f);
    f.retained.writeOutcome(normalizeNativeResult(f.route,{api:f.route.api,provider:f.route.provider,model:f.route.model,
      stopReason:'stop',answers:{decision:{type:'bool',probability:0.9}}},4));
    const outcome=JSON.parse(readFileSync(join(dirname(f.retained.path),'outcome.json'),'utf8'));
    expect(outcome).toMatchObject({schema:3,kind:'skill-harness-decision-advice-v3',route:f.route,requestSha256,
      outcome:{resolvedModel:null,returnedModel:'jev-latest',costSource:null},labelStatus:'unlabeled',trainingEligible:false});
    const imported=await importWorkflowCase(f.args);
    expect(imported.receipt).toMatchObject({sourceContract:'skill-harness-selected-decision-v3',
      nativeRouteSha256:learningDigest(f.route),nativeRequestSha256:requestSha256,labelStatus:'unlabeled',
      providerPredictionsIncluded:false,trainingEligible:false,engineering:[{sha256:linked.sha256}]});
    expect(JSON.stringify(imported)).not.toContain('APPROVE');
    expect(JSON.stringify(imported)).not.toContain(f.root);
    expect(JSON.stringify(imported)).not.toContain('dirty:abc');
  },true,true));

  it('refuses a rehashed native authorization or classifier-context change',()=>usingFixture(async f=>{
    const original=JSON.parse(readFileSync(f.retained.path,'utf8'));
    rewriteSource(f,source=>{source.authorization.route.model='jev-1.13';});
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/authorization mismatch/);
    rewriteSource(f,source=>{Object.assign(source,original);source.requestSha256='0'.repeat(64);});
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/request digest mismatch/);
  },false,true));

  it('keeps v2 provider pinning and shape when no native route was selected',()=>usingFixture(async f=>{
    expect(f.source.source).toMatchObject({schema:2,kind:'skill-harness-selected-decision-v2',provider:'jev',model:'typesafe/jev-1.13'});
    expect(f.source.source).not.toHaveProperty('route');
    expect(f.source.source).not.toHaveProperty('requestSha256');
    f.retained.writeOutcome({status:'answered',probability:0.5});
    expect(JSON.parse(readFileSync(join(dirname(f.retained.path),'outcome.json'),'utf8')).schema).toBe(2);
    rewriteSource(f,source=>{source.provider='typesafe';source.authorization.provider='typesafe';});
    await expect(importWorkflowCase(f.args)).rejects.toThrow(/unsupported workflow provider/);
  }));
});
