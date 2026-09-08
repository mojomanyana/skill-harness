import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { freezeIntervention, assertInterventionRoles, assessIntervention, interventionEvidenceDigest, collapseVotePanel, type InterventionDraft, type InterventionEvidence, type InterventionQualification, type PanelVote } from '@skill-harness/core';
import { learningJournal, learningCopy, learningHash, registerLearningStore, verifyLearningStore } from './learning-journal.js';
import { retainArchiveSource, readArchiveSource } from './evidence-archive.js';
import { retainBlindIntervention, openBlindIntervention } from './blind-intervention.js';
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
type Role={requested:string;canonical:string};
export interface InertModelCatalogueEntry extends Role {efforts:string[];lineage:string}
/** Exact retained/inert catalogue lookup; no provider calls, alias heuristics or fallback. */
export function resolveInertRole(catalogue:InertModelCatalogueEntry[],requested:string,effort?:string):Role {
 catalogue=learningCopy(catalogue);
 if(!Array.isArray(catalogue)||catalogue.length>64||catalogue.some(r=>!r||[r.requested,r.canonical,r.lineage].some(s=>typeof s!=='string'||!s.length||s.length>512)||!Array.isArray(r.efforts)||r.efforts.length>16||r.efforts.some(e=>typeof e!=='string'||!e.length||e.length>128))||new Set(catalogue.map(r=>r.requested)).size!==catalogue.length)throw Error('invalid inert role catalogue');
 const match=catalogue.find(r=>r.requested===requested);if(!match||effort!==undefined&&!match.efforts.includes(effort))throw Error('unresolved role/effort; no fallback');return {requested,canonical:match.canonical};
}
export interface CastingScope {station:string;taskClass:string;risk:string;population:string;version:string}
export interface InterventionRunInput {kind:'inert-retained-v1';archiveRoot:string;author:string;catalogue:InertModelCatalogueEntry[];scope:CastingScope;draft:InterventionDraft;roles:{proposer:Role;judges:Role[];subjects:Record<string,Role & {effort:string}>};expected:Record<string,string[]>}
type Retained={configurationDigest:string;delivery:'PASS'|'NOT-MEASURED'|'ERROR';outputBase64:string;cost:number|null};
type Vote=Omit<PanelVote,'ordinal'>;
function admit(raw:InterventionRunInput){
 const input=learningCopy(raw);if(input.kind!=='inert-retained-v1')throw Error('only inert retained transport supported');
 if(typeof input.author!=='string'||!input.author.length||input.author.length>512)throw Error('explicit operator required');
 const manifest=freezeIntervention(input.draft),roles=input.roles;
 if(manifest.arms.length>4||manifest.cases.reduce((n,c)=>n+c.reps,0)>64)throw Error('bounded inert charter required');
 if(!input.scope||Object.keys(input.scope).sort().join()!=='population,risk,station,taskClass,version'||Object.values(input.scope).some(v=>typeof v!=='string'||!v.length||v.length>512))throw Error('closed casting scope required');
 if(!roles||!Array.isArray(roles.judges)||roles.judges.length!==3)throw Error('three declared independent panel roles required');
 const qualification:InterventionQualification={manifestId:manifest.id,proposer:roles.proposer,judge:roles.judges[0],subjects:Object.fromEntries(Object.entries(roles.subjects).map(([id,r])=>[id,{requested:r.requested,canonical:r.canonical}])),evidenceDigests:{},artifacts:new Map()};assertInterventionRoles(manifest,qualification);
 for(const r of [roles.proposer,...roles.judges,...Object.values(roles.subjects)]){const resolved=resolveInertRole(input.catalogue,r.requested,'effort' in r?String(r.effort):undefined);if(resolved.canonical!==r.canonical)throw Error('role declaration differs from exact catalogue resolution');}
 const reserved=new Set([roles.proposer.canonical,...roles.judges.map(j=>j.canonical)]);
 if(reserved.size!==4||roles.judges.some(j=>[j.requested,j.canonical].some(s=>typeof s!=='string'||!s.length||s.length>512||/[\u0000-\u001f\u007f]/.test(s)))||manifest.arms.some(a=>reserved.has(roles.subjects[a.id].canonical)||roles.subjects[a.id].effort!==a.configuration.effort))throw Error('panel role conflict or unresolved effort');
 const cells=manifest.cases.flatMap(c=>Array.from({length:c.reps},(_,repetition)=>({caseId:c.id,repetition,criteria:c.criteria})));
 if(Object.keys(input.expected).sort().join()!==manifest.arms.map(a=>a.id).sort().join()||manifest.arms.some(a=>input.expected[a.id]?.length!==cells.length||input.expected[a.id].some(h=>!/^[a-f0-9]{64}$/.test(h))))throw Error('frozen objective hashes required for every cell');
 return {input,manifest,qualification,cells};
}
export function createInterventionRun(path:string,raw:InterventionRunInput){
 const {input,manifest}=admit(raw); // No archive, directory, output or panel effect before role admission.
 try{mkdirSync(input.archiveRoot,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
 const binding=learningHash(input);registerLearningStore(input.archiveRoot,'intervention',manifest.id,path,binding);
 learningJournal(path,{type:'intervention-run-v1',input,seed:randomBytes(32).toString('hex')});return openInterventionRun(path);
}
export function openInterventionRun(path:string){
 const store=learningJournal(path),initial=store.read()[0].value;
 if(initial.type!=='intervention-run-v1'||typeof initial.seed!=='string'||!/^[a-f0-9]{64}$/.test(initial.seed))throw Error('invalid intervention owner');
 const {input,manifest,qualification,cells}=admit(initial.input as InterventionRunInput);
 const artifacts=new Map<string,Uint8Array>();qualification.artifacts=artifacts;
 const history=()=>{verifyLearningStore(input.archiveRoot,'intervention',manifest.id,path,learningHash(input));return store.read();};
 const append=(prior:string,value:Record<string,unknown>)=>store.append(prior,value);
 const configurations=()=>manifest.arms.map(a=>({armId:a.id,requested:learningCopy(a.configuration),resolvedDeclaration:learningCopy(input.roles.subjects[a.id]),inputDigest:manifest.inputDigest,digest:learningHash({configuration:a.configuration,inputDigest:manifest.inputDigest}),catalogueDigest:learningHash(input.catalogue),lineage:input.catalogue.find(r=>r.requested===a.configuration.model)!.lineage,observedConfiguration:null,qualification:'inert-host-declaration-only' as const}));
 const find=(type:string,arm:string,index:number)=>history().find(e=>e.value.type===type&&e.value.arm===arm&&e.value.index===index)?.value;
 const check=(arm:string,index:number)=>{if(!manifest.arms.some(a=>a.id===arm)||!Number.isSafeInteger(index)||!cells[index])throw Error('unfrozen arm/cell');};
 const label=(arm:string)=>sha(String(initial.seed)+':'+arm).slice(0,24);
 const bytes=(record:Record<string,unknown>)=>{const read=readArchiveSource(input.archiveRoot,String(record.manifestId));if(read.status!=='available'||!read.bytes||sha(read.bytes)!==record.artifactSha256)throw Error('retained arm artifact missing or changed');return read.bytes;};
 const api={configurations,
  retain(arm:string,index:number,raw:Retained){
   check(arm,index);const request=learningCopy(raw),records=history();if(find('retained',arm,index)||find('retain-claimed',arm,index))throw Error('arm cell already claimed; no automatic retry');
   if(request.configurationDigest!==configurations().find(c=>c.armId===arm)!.digest||!['PASS','NOT-MEASURED','ERROR'].includes(request.delivery)||!(request.cost===null||Number.isFinite(request.cost)&&request.cost>=0)||typeof request.outputBase64!=='string'||request.outputBase64.length>87384)throw Error('configuration/delivery/retained input mismatch');
   const output=Buffer.from(request.outputBase64,'base64');if(output.toString('base64')!==request.outputBase64||output.length>65536)throw Error('bounded canonical output required');
   const claim=append(records.at(-1)!.id,{type:'retain-claimed',arm,index,requestDigest:learningHash(request)});
   const source=retainArchiveSource(input.archiveRoot,{sourceId:`inert-${manifest.id}-${arm}-${index}`,parser:{id:'inert-variant-output',version:'1'},retention:'exact',bytes:output});
   append(claim.id,{type:'retained',arm,index,manifestId:source.manifestId,artifactSha256:sha(output),configurationDigest:request.configurationDigest,delivery:request.delivery,objective:request.delivery==='NOT-MEASURED'?'NOT-MEASURED':request.delivery==='ERROR'?'ERROR':sha(output)===input.expected[arm][index]?'PASS':'FAIL',cost:request.cost});
  },
  blind(){return manifest.arms.flatMap(a=>cells.flatMap((c,index)=>{const r=find('retained',a.id,index);return r?.delivery==='PASS'&&r.objective==='PASS'?[{label:label(a.id),index,caseId:c.caseId,outputBase64:Buffer.from(bytes(r)).toString('base64'),disclosure:'artifact content may reveal identity; fixture transport, not live blinding qualification'}]:[]})).sort((a,b)=>a.label.localeCompare(b.label)||a.index-b.index);},
  panel(arm:string,index:number,raw:Vote[][]){
   check(arm,index);const records=history(),r=find('retained',arm,index);if(!r||r.delivery!=='PASS'||r.objective!=='PASS')throw Error('objective/delivery gate blocks panel');bytes(r);
   if(find('panel',arm,index))throw Error('panel already recorded');const votes=learningCopy(raw);
   if(!Array.isArray(votes)||votes.length!==cells[index].criteria)throw Error('criterion panel cardinality');
   const panels=votes.map(row=>{if(!Array.isArray(row)||![2,3].includes(row.length)||row.some(v=>Object.keys(v).sort().join()!=='suspect,verdict'||typeof v.suspect!=='boolean'||!['PASS','FAIL','ERROR','NOT-MEASURED','JUDGE-AMBIGUOUS'].includes(v.verdict)))throw Error('invalid retained votes');const ranked=row.map((v,i)=>({...v,ordinal:i+1}));const split=collapseVotePanel(ranked.slice(0,2)).split;if(split!== (row.length===3))throw Error('tie-break required exactly for clean split');return {votes:ranked.map((v,i)=>({...v,role:input.roles.judges[i]})),collapse:collapseVotePanel(ranked)};});
   append(records.at(-1)!.id,{type:'panel',arm,index,label:label(arm),panels});
  },
  finish(){
   const evidence:InterventionEvidence[]=manifest.arms.flatMap(a=>{const retained=cells.map((_,i)=>find('retained',a.id,i));if(retained.some(r=>!r))return [];
    return [{armId:a.id,inputDigest:manifest.inputDigest,artifactDigests:[...new Set(retained.map(r=>String(r!.artifactSha256)))],cost:retained.some(r=>r!.cost===null)?null:retained.reduce((n,r)=>n+Number(r!.cost),0),costUnit:manifest.resourceMetric,cells:retained.map((r,i)=>{artifacts.set(String(r!.artifactSha256),bytes(r!));const panel=find('panel',a.id,i) as {panels?:Array<{collapse:{verdict?:'PASS'|'FAIL';state:string}}> }|undefined;return {...cells[i],criteria:r!.objective==='PASS'?Array.from({length:cells[i].criteria},(_,k)=>panel?.panels?.[k]?.collapse.verdict??'UNKNOWN'):[],delivery:r!.delivery as 'PASS'|'ERROR'|'NOT-MEASURED',objective:r!.objective as 'PASS'|'FAIL'|'ERROR'|'NOT-MEASURED',suspect:false,artifactSha256:String(r!.artifactSha256)};})}];});
   qualification.evidenceDigests=Object.fromEntries(evidence.map(e=>[e.armId,interventionEvidenceDigest(e)]));const assessment=assessIntervention(manifest,evidence,qualification),records=history();
   const old=records.find(e=>e.value.type==='finished');if(old)return learningCopy(old.value.result) as {assessment:typeof assessment;blindReviewId:string|null;liveQualified:false};
   const result={assessment,blindReviewId:null as string|null,liveQualified:false as const};
   if(assessment.complete){if(records.some(e=>e.value.type==='finish-claimed'))throw Error('finish pending or unknown; no automatic retry');const claim=append(records.at(-1)!.id,{type:'finish-claimed'});if(assessment.arms.some(a=>a.eligible))result.blindReviewId=retainBlindIntervention(input.archiveRoot,manifest,evidence,qualification,input.author);append(claim.id,{type:'finished',result});}return result;
  },
  casting(scope:CastingScope){if(learningHash(scope)!==learningHash(input.scope))throw Error('casting scope/version requires revalidation');const result=api.finish();if(!result.blindReviewId)throw Error('complete quality choice required before casting');const blind=openBlindIntervention(input.archiveRoot,result.blindReviewId,input.author);if(!blind.quality())throw Error('quality choice required before casting reveal');blind.reveal();return result.assessment.arms.map(arm=>({scope:learningCopy(scope),armId:arm.armId,configuration:configurations().find(c=>c.armId===arm.armId)!,conditionalState:arm.state,eligibleInert:arm.eligible,qualityChoice:blind.quality(),retainedCells:cells.filter((_,i)=>find('retained',arm.armId,i)).length,requiredCells:cells.length,panels:cells.map((_,i)=>find('panel',arm.armId,i)??null),cost:arm.cost,costUnit:arm.costUnit,latency:null,measuredAcceptance:null,escapes:null,measuredSamples:0,uncertainty:'unqualified inert/retained protocol; panel agreement is not accuracy',revalidateOn:['scope','model/effort/skill/prompt/configuration','rubric/judge policy','independent labels','delivery/effect transport'],routingDefault:null,liveQualified:false}));}
 };return api;
}
