/** Offline adapter for retained workflow selections. Local hashes bind bytes, not source truth. */
import { dirname, join, isAbsolute, normalize } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseCases } from './dataset.mjs';
import { validateNativeRoute, nativeRequestSha256 } from './native-jev.mjs';
import { learningDigest, parseEntry, parseStorageConsent, readExplicit, readBoundedArtifact, redactSelectedInput } from './learning-data.mjs';

// Explicit legacy selection-v2 and native selection-v3 producer contracts in packages/pi-extension/src/jev-packet.ts.
const QUESTION='Given the stated stage, unresolved engineering uncertainty, requirements and selected evidence, is the proposed next action justified? Assess that action only, not final acceptance or whether mandatory later review is complete.';
const SOURCE_KEYS=['schema','kind','sessionId','toolCallId','frozenAt','input','inputSha256','question','provider','model','consent','authorization','provenance','candidateIdentity','candidateObservation','sourceBinding','evidenceRefs','evidenceClaims','inputArtifact','redaction','rights','labelStatus','trainingEligible','exportEligible','publicCaptureVerified'];
const ENGINEERING_KEYS=['schema','kind','source','sessionId','toolCallId','candidate','recordedAt','evidenceRefs','candidateIdentity','candidateObservation','sourceBinding','independence','trainingEligible','exportEligible','labelStatus'];
const LIMIT=2*1024*1024;
function check(ok,message){if(!ok)throw new TypeError(message);}
function keys(value,names,name){check(value && typeof value==='object' && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(),[...names].sort()),name+': unsupported or missing fields');}
function text(value,name,max=256){check(typeof value==='string' && value.trim().length>0 && value.length<=max && !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value),name+': invalid text');}
function hash(value){check(typeof value==='string' && /^[a-f0-9]{64}$/.test(value),'invalid SHA-256');}
function date(value){check(typeof value==='string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)),'invalid timestamp');return Date.parse(value);}
function json(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}
function reference(ref){keys(ref,['path','sha256'],'selected reference');text(ref.path,'artifact path',4096);hash(ref.sha256);}
function unlabeled(record){check(record.trainingEligible===false && record.exportEligible===false && record.labelStatus==='unlabeled','retained source must remain unlabeled and ineligible');}
function observed(record,sessionId,candidate){
  if(record.candidateIdentity==='caller-claimed'){check(record.candidateObservation===null,'caller-claimed candidate cannot include an observation');return;}
  check(record.candidateIdentity==='principal-runtime-observed','unsupported candidate provenance');
  const o=record.candidateObservation;keys(o,['requestId','sessionId','observedAt','candidate'],'candidate observation');text(o.requestId,'observation ID');date(o.observedAt);
  check(o.sessionId===sessionId && o.candidate && typeof o.candidate==='object' && !Array.isArray(o.candidate) && o.candidate.algorithm==='principal-candidate-v1' && o.candidate.id===candidate,'candidate observation identity mismatch');
  text(o.candidate.root,'candidate root',4096);check(isAbsolute(o.candidate.root) && normalize(o.candidate.root)===o.candidate.root,'candidate root must be canonical and absolute');
}
function evidenceRefs(refs,retained=false){
  check(Array.isArray(refs) && refs.length<=8,'evidence must select at most 8 files');const seen=new Set();
  return refs.map(ref=>{
    keys(ref,retained?['path','sha256','bytes','retainedPath']:['path','sha256','bytes'],'evidence reference');
    text(ref.path,'original evidence path',4096);hash(ref.sha256);check(isAbsolute(ref.path) && normalize(ref.path)===ref.path && !seen.has(ref.path),'invalid or duplicate evidence path');seen.add(ref.path);
    check(Number.isSafeInteger(ref.bytes) && ref.bytes>=0 && ref.bytes<=LIMIT,'invalid evidence size');
    return {path:ref.path,sha256:ref.sha256,bytes:ref.bytes};
  });
}
async function snapshot(directory,ref,expectedName){
  check(ref.retainedPath===expectedName,'unexpected retained evidence path');
  const bytes=await readExplicit(join(directory,expectedName),ref.sha256,LIMIT);check(bytes.length===ref.bytes,'retained evidence size mismatch');
  return {sha256:ref.sha256,bytes:ref.bytes};
}
function validateSource(source){
  const native=source?.schema===3 && source.kind==='skill-harness-selected-decision-v3';
  check(native || (source?.schema===2 && source.kind==='skill-harness-selected-decision-v2'),'unsupported workflow selection contract');
  keys(source,native?[...SOURCE_KEYS,'route','requestSha256']:SOURCE_KEYS,'workflow selection');
  text(source.sessionId,'session ID');text(source.toolCallId,'tool-call ID');date(source.frozenAt);text(source.input,'decision input',32000);hash(source.inputSha256);
  check(Array.from(source.input).length<=16000 && learningDigest(source.input)===source.inputSha256,'decision input digest or size mismatch');
  check(source.question===QUESTION,'unsupported workflow question');
  const route=native?validateNativeRoute(source.route):null;
  check(route ? source.provider===route.provider && source.model===route.model : source.provider==='jev' && source.model==='typesafe/jev-1.13','unsupported workflow provider');
  if(native)check(source.requestSha256===nativeRequestSha256(source),'native request digest mismatch');
  const packet=JSON.parse(source.input);keys(packet,['candidate','stage','nextAction','uncertainty','requirements','evidence'],'decision packet');
  for(const key of Object.keys(packet))text(packet[key],key,32000);
  check(['design','implementation','verification'].includes(packet.stage),'unsupported decision stage');
  const {candidate,stage,nextAction,uncertainty,requirements,evidence}=packet;
  check(JSON.stringify({candidate,stage,nextAction,uncertainty,requirements,evidence})===source.input,'decision input is not the exact producer packet');
  const consent=parseStorageConsent(source.consent,source.sessionId);
  check(consent.decision==='granted' && date(consent.recordedAt)<=date(source.frozenAt),'recorded session storage consent is missing or postdates selection');
  const a=source.authorization;keys(a,['kind','interactionId','sessionId','recordedAt',...(native?['route']:['provider','model']),'question','maximumCalls'],'workflow authorization');text(a.interactionId,'authorization interaction');
  const authorizationMatches=native ? a.kind==='jev-workflow-paid-scope-v2' && isDeepStrictEqual(validateNativeRoute(a.route),route) : a.kind==='jev-workflow-paid-scope' && a.provider===source.provider && a.model===source.model;
  check(authorizationMatches && a.sessionId===source.sessionId && a.question===QUESTION && a.maximumCalls===3 && date(a.recordedAt)<=date(source.frozenAt),'workflow authorization mismatch');
  check(source.provenance==='tool-selected-input' && source.evidenceClaims==='unassessed' && source.redaction==='unassessed' && source.rights==='unassessed' && source.publicCaptureVerified===false,'unsupported workflow provenance claims');unlabeled(source);
  const refs=evidenceRefs(source.evidenceRefs);
  check(source.sourceBinding===(refs.length?'local-reference-digests-verified':'unassessed'),'source binding mismatch');
  keys(source.inputArtifact,['path','sha256','encoding'],'input artifact');check(source.inputArtifact.path==='input.txt' && source.inputArtifact.sha256===source.inputSha256 && source.inputArtifact.encoding==='utf8','unsupported input artifact');
  observed(source,source.sessionId,candidate);
  return {packet,consent,refs};
}

/** Import one explicitly curated case. Does not scan sessions or read provider outcomes. */
export async function importWorkflowCase({caseDocument,selection,sessionConsent,experimentEntry}){
  const cases=parseCases(caseDocument);check(cases.length===1 && cases[0].provenance==='observed','workflow import requires exactly one observed case');const c=cases[0];
  const entry=parseEntry(c,experimentEntry),currentConsent=parseStorageConsent(sessionConsent,entry.sessionId);
  check(currentConsent.decision==='granted','session storage declined; workflow import refused');
  check(entry.decisionTimeReviewed && entry.redactionReviewed,'decision-time and redaction review required');
  keys(selection,['schema','kind','source','replacements','engineering'],'workflow import selection');
  check(selection.schema===1 && selection.kind==='decision-selected-workflow-input','unsupported workflow import selection');reference(selection.source);
  check(Array.isArray(selection.engineering) && selection.engineering.length<=8,'select at most 8 engineering records');
  const source=json(await readExplicit(selection.source.path,selection.source.sha256));
  const {packet,consent,refs}=validateSource(source),directory=dirname(selection.source.path);
  check(source.sessionId===entry.sessionId && c.source.sha256===selection.source.sha256 && c.source.recordId===source.toolCallId,'workflow source/session identity mismatch');
  check(c.question===source.question,'workflow question must match the selected decision');
  const input=await readExplicit(join(directory,'input.txt'),source.inputSha256);
  check(input.equals(Buffer.from(source.input,'utf8')),'input artifact differs from decision input');
  const redacted=redactSelectedInput(source.input,selection.replacements);
  check(c.input===redacted.input,'case input must equal exact selected redacted decision input');
  check(!selection.replacements.length || c.visibility==='redacted','redacted case must declare redacted visibility');
  const mappingBytes=await readBoundedArtifact(join(directory,'evidence.json'));
  const mapping=json(mappingBytes);keys(mapping,['schema','evidenceRefs'],'retained decision evidence');
  check(mapping.schema===1 && isDeepStrictEqual(evidenceRefs(mapping.evidenceRefs,true),refs),'decision evidence mapping mismatch');
  const decisionEvidence=[];
  for(const [index,ref] of mapping.evidenceRefs.entries())decisionEvidence.push(await snapshot(directory,ref,`decision-evidence-${index+1}.bin`));
  const engineering=[],seen=new Set();
  for(const ref of selection.engineering){
    reference(ref);check(dirname(ref.path)===directory && !seen.has(ref.path),'engineering record must be a distinct selected sibling');seen.add(ref.path);
    const record=json(await readExplicit(ref.path,ref.sha256));keys(record,ENGINEERING_KEYS,'engineering evidence');
    check(record.schema===1 && record.kind==='skill-harness-engineering-evidence-v1','provider advice is not engineering evidence');
    keys(record.source,['path','sha256','inputSha256'],'engineering source');
    check(record.source.path==='selection.json' && record.source.sha256===selection.source.sha256 && record.source.inputSha256===source.inputSha256,'engineering source mismatch');
    text(record.toolCallId,'engineering tool-call ID');
    check(record.sessionId===source.sessionId && record.candidate===packet.candidate && date(record.recordedAt)>=date(source.frozenAt),'engineering session/candidate/time mismatch');
    check(record.sourceBinding==='local-reference-digests-verified' && record.independence==='unassessed','unsupported engineering evidence claims');unlabeled(record);observed(record,source.sessionId,packet.candidate);
    check(source.candidateIdentity!=='principal-runtime-observed' || (record.candidateIdentity==='principal-runtime-observed' && record.candidateObservation.candidate.root===source.candidateObservation.candidate.root),'engineering evidence lost its matching candidate observation');
    const linkedRefs=evidenceRefs(record.evidenceRefs,true);check(linkedRefs.length>0,'engineering evidence requires selected files');
    const key=learningDigest(JSON.stringify({candidate:record.candidate,evidenceRefs:linkedRefs}));
    check(ref.path===join(directory,`engineering-${key}.json`),'engineering filename does not match producer identity');
    const artifacts=[];
    for(const [index,saved] of record.evidenceRefs.entries())artifacts.push(await snapshot(directory,saved,`engineering-${key}-${index+1}.bin`));
    engineering.push({sha256:ref.sha256,sessionId:record.sessionId,toolCallId:record.toolCallId,candidateIdentity:record.candidateIdentity,recordedAt:record.recordedAt,artifacts,independence:'unassessed'});
  }
  return {caseDocument:structuredClone(caseDocument),experimentEntry:entry,receipt:{
    schema:1,kind:'decision-selected-workflow-import',caseId:c.id,caseHash:c.hash,sessionId:source.sessionId,toolCallId:source.toolCallId,
    source:{sha256:selection.source.sha256,recordId:source.toolCallId},inputSha256:source.inputSha256,
    ...(source.schema===3?{sourceContract:source.kind,nativeRouteSha256:learningDigest(source.route),nativeRequestSha256:source.requestSha256}:{}),
    recordedConsentHash:learningDigest(consent),currentConsentHash:learningDigest(currentConsent),
    candidateIdentity:source.candidateIdentity,candidateObservationSha256:source.candidateObservation?learningDigest(source.candidateObservation):null,
    replacements:redacted.replacements,decisionEvidence:{mappingSha256:learningDigest(mappingBytes),artifacts:decisionEvidence},engineering,
    labelStatus:'unlabeled',trainingEligible:false,exportEligible:false,publicCaptureVerified:false,automaticCollection:false,providerPredictionsIncluded:false,
    meaning:'Selected local bytes and declared producer linkage checked at import time; authenticity, source truth, independence, redaction and rights remain reviewer assertions. Export separately checks curated cases, entries, consent and independent labels; it does not reverify this receipt.'
  }};
}
