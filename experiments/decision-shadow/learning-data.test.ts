import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseCases } from './dataset.mjs';
import { createLearningFixtures } from './learning-fixtures.mjs';
import { createStorageConsent, parseStorageConsent, parseExperiment, reviewLabelEvidence, importSelectedCase, prepareExport, writePreparedExport, learningDigest } from './learning-data.mjs';

const at='2026-10-08T00:00:00.000Z';
const consent=(sessionId='session-1',decision='granted')=>createStorageConsent({sessionId,decision,interactionId:'user-answer-'+sessionId,recordedAt:at});
async function temporary(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'learning-data-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function fixtureFiles(dir:string){const fixtures=createLearningFixtures();const refs=[];for(const r of fixtures.labelReceipts){const path=join(dir,r.filename);await writeFile(path,r.bytes);refs.push({caseId:r.caseId,path,sha256:r.sha256});}return {...fixtures,cases:parseCases(fixtures.caseDocument),refs};}
function realEntry(c:any,index=0){return {caseId:c.id,caseHash:c.hash,taskGroup:'task-'+index,lineageGroup:'lineage-'+index,split:['train','validation','test'][index],sessionId:'session-'+index,fixtureOnly:false,decisionTimeReviewed:true,redactionReviewed:true,rights:'local-training',exportApproved:true,trainingApproved:true,reviewer:'reviewer'};}
async function realData(dir:string){
 const cases=parseCases({schema:1,cases:[0,1,2].map(i=>({id:'observed-'+i,input:'Distinct observed public decision '+i,question:'Does this explicit narrow condition hold?',provenance:'observed',source:{sha256:String(i+1).repeat(64),recordId:'record-'+i},visibility:'redacted'}))});
 const manifest={schema:1,kind:'decision-learning-experiment',id:'reviewed-example',frozenAt:at,entries:cases.map(realEntry)};
 const labels=[],refs=[];
 for(const c of cases){const receipt={schema:1,kind:'independent-decision-label',caseId:c.id,caseHash:c.hash,source:c.source,value:true,labelKind:'human',actor:'actual-reviewer',independent:true,recordedAt:at,method:{kind:'human-review',id:'selected-review',version:'1'}};const bytes=JSON.stringify(receipt);const path=join(dir,c.id+'.json');await writeFile(path,bytes);const sha256=learningDigest(bytes);refs.push({caseId:c.id,path,sha256});labels.push({caseId:c.id,caseHash:c.hash,value:true,kind:'human',actor:'actual-reviewer',independent:true,evidenceSha256:sha256});}
 return {cases,manifest,labels,labelEvidence:refs,consents:[0,1,2].map(i=>consent('session-'+i)),mode:'reviewed-data'};
}

describe('session-specific storage consent',()=>{
 it('decline remains a valid advice choice, grants no implicit other permission',()=>{const c=consent('one','declined');expect(parseStorageConsent(c,'one').decision).toBe('declined');expect(()=>parseStorageConsent(c,'two')).toThrow(/another session/);expect(c).not.toHaveProperty('trainingApproved');expect(c).not.toHaveProperty('remoteApproved');});
 it('rejects missing user interaction, unknown fields and inherited/default decisions',()=>{expect(()=>createStorageConsent({sessionId:'one',decision:'inherited',interactionId:'x',recordedAt:at})).toThrow();expect(()=>createStorageConsent({sessionId:'one',decision:'granted',interactionId:' ',recordedAt:at})).toThrow();expect(()=>parseStorageConsent({...consent(),remotePermission:true},'session-1')).toThrow(/fields/);});
});
describe('frozen experiment splits',()=>{
 it('freezes groups and rejects task, lineage, source and normalized input duplicates across splits',()=>{
  const f=createLearningFixtures();const c=parseCases(f.caseDocument);expect(parseExperiment(c,f.manifest).entries).toHaveLength(24);
  for(const key of ['taskGroup','lineageGroup']){const m=structuredClone(f.manifest);m.entries[12][key]=m.entries[0][key];expect(()=>parseExperiment(c,m)).toThrow(/crosses splits/);}
  const same=structuredClone(f.caseDocument);same.cases[12].input='  '+same.cases[0].input.toUpperCase()+'\n';const changed=parseCases(same);const m=structuredClone(f.manifest);m.entries[12].caseHash=changed[12].hash;expect(()=>parseExperiment(changed,m)).toThrow(/duplicate input/);
  const copy=structuredClone(f.caseDocument);copy.cases[12].source=copy.cases[0].source;const duplicate=parseCases(copy);m.entries[12].caseHash=duplicate[12].hash;expect(()=>parseExperiment(duplicate,m)).toThrow(/source record/);
 });
 it('rejects stale case hashes, reordered entries and synthetic provenance laundering',()=>{const f=createLearningFixtures(),c=parseCases(f.caseDocument);const m=structuredClone(f.manifest);m.entries.reverse();expect(()=>parseExperiment(c,m)).toThrow(/identity/);const bad=structuredClone(f.manifest);bad.entries[0].fixtureOnly=false;expect(()=>parseExperiment(c,bad)).toThrow(/fixture-only/);});
});
describe('independent label evidence',()=>{
 it('requires existing exact typed receipts, excludes model/audit outcomes and rejects tampering',()=>temporary(async dir=>{
  const f=await fixtureFiles(dir);expect((await reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:f.refs})).reviewed).toHaveLength(24);
  const ref=f.refs[0];await writeFile(ref.path,'{"kind":"AI-audit","value":true}');await expect(reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:f.refs})).rejects.toThrow(/hash/);
  const bytes=JSON.stringify({kind:'AI-audit',value:true}),sha=learningDigest(bytes);f.refs[0].sha256=sha;f.labelDocument.labels[0].evidenceSha256=sha;await expect(reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:f.refs})).rejects.toThrow(/fields/);
 }));
 it('rejects final symlinks, ancestor symlinks and private-session aliases',()=>temporary(async dir=>{
  const target=join(dir,'ordinary');await mkdir(target);const f=await fixtureFiles(target);const alias=join(dir,'alias');await symlink(target,alias,'dir');const refs=structuredClone(f.refs);refs[0].path=join(alias,f.labelReceipts[0].filename);await expect(reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:refs})).rejects.toThrow();
  const link=join(dir,'linked.json');await symlink(f.refs[0].path,link);refs[0].path=link;await expect(reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:refs})).rejects.toThrow();
  const privatePath=join(dir,'native-sessions');await mkdir(privatePath);refs[0].path=join(privatePath,'anything.json');await expect(reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:refs})).rejects.toThrow(/private session/);
 }));
 it('rejects a receipt that disagrees with the label even after rehashing',()=>temporary(async dir=>{const f=await fixtureFiles(dir);const r=f.refs[0],receipt=JSON.parse(await readFile(r.path,'utf8'));receipt.value=!receipt.value;const bytes=JSON.stringify(receipt);await writeFile(r.path,bytes);r.sha256=learningDigest(bytes);f.labelDocument.labels[0].evidenceSha256=r.sha256;await expect(reviewLabelEvidence({cases:f.cases,labels:f.labelDocument.labels,references:f.refs})).rejects.toThrow(/disagrees/);}));
});
describe('explicit selected real input import',()=>{
 it('assembles exact redacted source excerpts and requires matching per-session consent',()=>temporary(async dir=>{
  const source=join(dir,'manifest.json'),event=join(dir,'public-events.jsonl');const primary=JSON.stringify({toolCallId:'call-1'}),raw='Save report at /local/report.md';await writeFile(source,primary);const eventBytes=JSON.stringify({event:{args:{task:raw}}})+'\n';await writeFile(event,eventBytes);
  const caseDocument={schema:1,cases:[{id:'real-one',input:'Save report at <REPORT_PATH>',question:'Does requested report delivery comply?',provenance:'observed',visibility:'redacted',source:{sha256:learningDigest(primary),recordId:'call-1'}}]};const c=parseCases(caseDocument)[0];const entry=realEntry(c);
  const selection={schema:1,kind:'decision-selected-public-input',sessionId:'session-0',source:{path:source,sha256:learningDigest(primary)},fragments:[{path:event,sha256:learningDigest(eventBytes),jsonlLine:1,jsonPointer:'/event/args/task',start:0,end:raw.length,replacements:[{from:'/local/report.md',to:'<REPORT_PATH>'}]}]};
  const input={caseDocument,selection,sessionConsent:consent('session-0'),experimentEntry:entry};const imported=await importSelectedCase(input);expect(imported.receipt.trainingEligible).toBe(false);expect(JSON.stringify(imported)).not.toContain('/local/report.md');expect(JSON.stringify(imported)).toContain(learningDigest('/local/report.md'));
  await expect(importSelectedCase({...input,sessionConsent:consent('other')})).rejects.toThrow(/another session/);
  await expect(importSelectedCase({...input,sessionConsent:consent('session-0','declined')})).rejects.toThrow(/declined/);
  const changed=structuredClone(caseDocument);changed.cases[0].input+=' invented';const cc=parseCases(changed)[0];await expect(importSelectedCase({...input,caseDocument:changed,experimentEntry:realEntry(cc)})).rejects.toThrow(/exact selected/);
 }));
});
describe('reviewed export workflow',()=>{
 it('exports fixture plumbing with hashed splits and bundled workflow, never training eligibility',()=>temporary(async dir=>{
  const f=await fixtureFiles(dir),prepared=await prepareExport({cases:f.cases,labels:f.labelDocument.labels,manifest:f.manifest,consents:[],labelEvidence:f.refs,mode:'fixture-demo'});
  expect(prepared.metadata.counts).toEqual({train:12,validation:4,test:8});expect(prepared.metadata.trainingEligible).toBe(false);expect(prepared.metadata.providerPredictionsIncluded).toBe(false);
  const output=join(dir,'export');await writePreparedExport({prepared,directory:output});await expect(writePreparedExport({prepared,directory:output})).rejects.toThrow();
  const call=spawnSync('python3',[join(output,'train-lora.py'),'--export',output,'--check-export-only'],{encoding:'utf8'});expect(call.status,call.stderr).toBe(0);expect(JSON.parse(call.stdout)).toMatchObject({trainingEligible:false,trainingExecuted:false});
  const denied=spawnSync('python3',[join(output,'train-lora.py'),'--export',output,'--config',join(output,'training-config.example.json'),'--train','--output',join(dir,'never-created')],{encoding:'utf8'});expect(denied.status).toBe(1);expect(denied.stderr).toContain('not eligible');
  await writeFile(join(output,'train.jsonl'),'tampered');const tampered=spawnSync('python3',[join(output,'train-lora.py'),'--export',output,'--check-export-only'],{encoding:'utf8'});expect(tampered.status).toBe(1);expect(tampered.stderr).toContain('mismatch');
 }));
 it('requires separate rights/training approval, complete independent labels and all splits',()=>temporary(async dir=>{
  const data=await realData(dir);const ready=await prepareExport(data);expect(ready.metadata.trainingEligible).toBe(true);expect(ready.metadata.trainingExecuted).toBe(false);
  for(const patch of [{rights:'local-export'},{trainingApproved:false}]){const m=structuredClone(data.manifest);Object.assign(m.entries[0],patch);expect((await prepareExport({...data,manifest:m})).metadata.trainingEligible).toBe(false);}
  const duplicate=[...data.consents,consent('session-0','declined')];const p=await prepareExport({...data,consents:duplicate});expect(p.metadata.trainingEligible).toBe(false);expect(p.metadata.excluded[0].reasons.join(' ')).toContain('one explicit');
  const declined=[consent('session-0','declined'),...data.consents.slice(1)];const no=await prepareExport({...data,consents:declined});expect(no.metadata.excluded[0].reasons.join(' ')).toContain('declined');expect(no.files['train.jsonl']).toBe('');
 }));
 it('rejects mutated prepared files and path injection before creating output',()=>temporary(async dir=>{
  const data=await realData(dir),p=await prepareExport(data);p.files['../escape']='bad';await expect(writePreparedExport({prepared:p,directory:join(dir,'export')})).rejects.toThrow(/unexpected/);delete p.files['../escape'];p.files['train.jsonl']+='bad';await expect(writePreparedExport({prepared:p,directory:join(dir,'export')})).rejects.toThrow(/changed/);
 }));
});
