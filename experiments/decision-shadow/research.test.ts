import { describe,it,expect } from 'vitest';
import { mkdtemp,readFile,writeFile,rm,stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { main } from './main.mjs';
import { parseCases,parseLabels } from './dataset.mjs';
import { parsePiRun,previewPi,compareRuns,runPiBaseline } from './research.mjs';
import { DECISION_SYSTEM_PROMPT } from '@skill-harness/adapters';

const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const model='openai-codex:gpt-6.1-sol';
const hash=sha(DECISION_SYSTEM_PROMPT);
const emit=()=>{};
async function temporary(fn:(dir:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'decision-research-test-'));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function fixtures(dir:string){const f=join(dir,'fixtures');await main(['fixtures','--out',f],{emit});const json=async(name:string)=>JSON.parse(await readFile(join(f,name),'utf8'));const cases=parseCases(await json('cases.json'));return {dir:f,cases,labels:parseLabels(await json('labels.json'),cases),manifest:await json('experiment.json')};}
function fakeResult(id:string,p=0.75){return {status:'answered',probability:p,resolvedModel:model,piVersion:'1.0.4',nativeFinal:{sessionId:'session-'+id,messageId:'message-'+id,sha256:sha(JSON.stringify({probability:p,abstain:false}))},usage:{inputTokens:10,outputTokens:4,costUsd:null},route:{oauth:true,subscription:true},trainingEligible:false,latencyMs:12,workerSha256:'a'.repeat(64),systemPromptSha256:hash};}
const runArgs=(f:any,out:string)=>['run-pi','--cases',join(f.dir,'cases.json'),'--experiment',join(f.dir,'experiment.json'),'--model',model,'--thinking','medium','--split','test','--pi-package','/unused/fake-runner','--out',out,'--allow-subscription'];
const compareArgs=(f:any,out:string,runs:string[])=>['compare','--cases',join(f.dir,'cases.json'),'--experiment',join(f.dir,'experiment.json'),'--labels',join(f.dir,'labels.json'),'--label-evidence',join(f.dir,'label-evidence.json'),...runs.flatMap(r=>['--run',r]),'--out',out];
const exportArgs=(f:any,out:string)=>['export-learning','--cases',join(f.dir,'cases.json'),'--experiment',join(f.dir,'experiment.json'),'--labels',join(f.dir,'labels.json'),'--label-evidence',join(f.dir,'label-evidence.json'),'--consents',join(f.dir,'consents.json'),'--mode','fixture-demo','--out',out];

describe('shared packaged research command implementation (offline fake runners)',()=>{
 it('creates exclusive fixture outputs, previews one frozen split, runs once per selected case, compares and exports non-training plumbing',()=>temporary(async dir=>{
  const f=await fixtures(dir);await expect(main(['fixtures','--out',f.dir],{emit})).rejects.toThrow();
  const preview=previewPi(f.cases,f.manifest,{model,thinking:'medium',split:'test'});expect(preview.requests).toHaveLength(8);
  const calls:any[]=[];const out=join(dir,'pi.jsonl');await main(runArgs(f,out),{emit,piRunner:async(o:any)=>{calls.push(o);return fakeResult(o.caseId);}});
  expect(calls).toHaveLength(8);expect(calls.map(x=>x.prompt)).toEqual(preview.requests.map(x=>x.prompt));for(const c of calls){expect(c.model).toBe(model);expect(c.thinking).toBe('medium');expect(Object.keys(JSON.parse(c.prompt)).sort()).toEqual(['input','question']);}
  const before=await readFile(out,'utf8');await expect(main(runArgs(f,out),{emit,piRunner:async()=>{throw Error('must not call');}})).rejects.toThrow();expect(await readFile(out,'utf8')).toBe(before);
  const reportPath=join(dir,'comparison.json');await main(compareArgs(f,reportPath,[out]),{emit});const report=JSON.parse(await readFile(reportPath,'utf8'));
  expect(report.commonLabeledAnswered).toBe(8);expect(report.population).toMatchObject({cases:24,groups:6,synthetic:24,observed:0});expect(report.arms[0]).toMatchObject({model,observedModels:[model],thinking:'medium',split:'test',systemPromptSha256:hash,workerSha256:'a'.repeat(64),experimentBound:true});expect(report.trainingReady).toBe(false);expect(report.labelEvidenceReview.reviewed).toHaveLength(24);
  const exported=join(dir,'exported');await main(exportArgs(f,exported),{emit});const metadata=JSON.parse(await readFile(join(exported,'export-manifest.json'),'utf8'));expect(metadata.counts).toEqual({train:12,validation:4,test:8});expect(metadata.trainingEligible).toBe(false);expect(metadata.providerPredictionsIncluded).toBe(false);expect((await stat(join(exported,'train-lora.py'))).isFile()).toBe(true);
  await expect(main(exportArgs(f,exported),{emit})).rejects.toThrow();
 }));
 it('requires explicit subscription permission, route, thinking and split before any fake call',()=>temporary(async dir=>{
  const f=await fixtures(dir);let calls=0;const opts={emit,piRunner:async(o:any)=>{calls++;return fakeResult(o.caseId);}};
  const args=runArgs(f,join(dir,'denied.jsonl'));await expect(main(args.slice(0,-1),opts)).rejects.toThrow(/allow-subscription/);
  for(const [key,value] of [['--model','openai:gpt-6.1-sol'],['--thinking','default'],['--split','unassigned']]){const altered=[...args];altered[altered.indexOf(key)+1]=value;await expect(main(altered,opts)).rejects.toThrow();}
  expect(calls).toBe(0);
 }));
 it('retains an exact failed prefix and never retries or advances after an exception',()=>temporary(async dir=>{
  const f=await fixtures(dir);const out=join(dir,'partial.jsonl');let calls=0;await expect(main(runArgs(f,out),{emit,piRunner:async(o:any)=>{calls++;if(calls===2)throw Error('private provider diagnostics');return fakeResult(o.caseId);}})).rejects.toThrow(/partial run retained without retry/);
  expect(calls).toBe(2);const text=await readFile(out,'utf8');expect(text).not.toContain('private provider');const parsed=parsePiRun(text,f.cases,f.manifest);expect(parsed.records).toHaveLength(2);expect(parsed.records[1]).toMatchObject({status:'error',probability:null,error:'Pi decision failed; no retry or fallback.'});
  const r=compareRuns(f.cases,f.labels,f.manifest,[parsed]);expect(r.commonLabeledAnswered).toBe(1);expect(r.arms[0].selection.errorCases).toEqual([parsed.records[1].caseId]);
 }));
 it('compares only common independently labeled answers while reporting abstentions and mismatched arm selections',()=>temporary(async dir=>{
  const f=await fixtures(dir);const a=join(dir,'a.jsonl'),b=join(dir,'b.jsonl');await main(runArgs(f,a),{emit,piRunner:async(o:any)=>fakeResult(o.caseId)});let call=0;await main(runArgs(f,b),{emit,piRunner:async(o:any)=>{const r=fakeResult(o.caseId);return ++call===1?{...r,status:'abstained',probability:null}:r;}});
  const arms=await Promise.all([a,b].map(async path=>parsePiRun(await readFile(path,'utf8'),f.cases,f.manifest)));const r=compareRuns(f.cases,f.labels,f.manifest,arms);expect(r.commonLabeledAnswered).toBe(7);expect(r.commonCaseIds).not.toContain(arms[1].records[0].caseId);expect(r.arms[1].selection.abstained).toBe(1);expect(r.arms[0].common.scored).toBe(7);
  expect(()=>compareRuns(f.cases,f.labels,f.manifest,[arms[0],arms[0]])).toThrow(/duplicate run/);
 }));
 it('refuses changed experiments, prompts, provider/model/worker identity, reused sessions and reordered records',()=>temporary(async dir=>{
  const f=await fixtures(dir),out=join(dir,'pi.jsonl');await main(runArgs(f,out),{emit,piRunner:async(o:any)=>fakeResult(o.caseId)});const text=await readFile(out,'utf8');
  const mutations=[(r:any[])=>r[0].experimentHash='f'.repeat(64),(r:any[])=>{r[0].systemPromptSha256='f'.repeat(64);for(const row of r.slice(1))row.systemPromptSha256=r[0].systemPromptSha256;},(r:any[])=>r[1].resolvedModel='openai:paid',(r:any[])=>r[2].workerSha256='b'.repeat(64),(r:any[])=>r[2].nativeFinal.sessionId=r[1].nativeFinal.sessionId,(r:any[])=>{[r[1],r[2]]=[r[2],r[1]];},(r:any[])=>r[1].route.subscription=false];
  for(const mutate of mutations){const rows=text.trim().split('\n').map(s=>JSON.parse(s));mutate(rows);expect(()=>parsePiRun(rows.map(r=>JSON.stringify(r)).join('\n'),f.cases,f.manifest)).toThrow();}
 }));
 it('rejects mixed JEV snapshots and tampered independent label evidence in comparison command',()=>temporary(async dir=>{
  const f=await fixtures(dir),out=join(dir,'jev.jsonl');let n=0;await main(['run','--cases',join(f.dir,'cases.json'),'--provider','jev','--model','typesafe/jev-1.13','--out',out,'--allow-remote','--storage','no'],{emit,env:{OPENROUTER_API_KEY:'test-not-secret'},providerCall:async()=>({status:'answered',probability:0.5,resolvedModel:++n===1?'typesafe/jev-1.13':'typesafe/jev-1.13-20260611',usage:{inputTokens:1,outputTokens:1,costUsd:0},latencyMs:1,error:null})});
  await expect(main(compareArgs(f,join(dir,'mixed.json'),[out]),{emit})).rejects.toThrow();
  const pi=join(dir,'pi.jsonl');await main(runArgs(f,pi),{emit,piRunner:async(o:any)=>fakeResult(o.caseId)});const refs=JSON.parse(await readFile(join(f.dir,'label-evidence.json'),'utf8'));await writeFile(refs[0].path,'changed label evidence');await expect(main(compareArgs(f,join(dir,'tampered.json'),[pi]),{emit})).rejects.toThrow(/hash/);
 }));
});

describe('opt-in workflow fixtures through the installed command implementation',()=>{
 it('writes new local cases/receipts, validates them and exports only a non-training demo without inference',()=>temporary(async dir=>{
  const out=join(dir,'workflow'), emitted:string[]=[];
  const options={emit:(value:string)=>emitted.push(value),piRunner:async()=>{throw Error('No model call is authorized');},providerCall:async()=>{throw Error('No provider call is authorized');}};
  await main(['fixtures','--set','workflow','--out',out],options);
  const read=async(name:string)=>JSON.parse(await readFile(join(out,name),'utf8'));
  const cases=parseCases(await read('cases.json'));
  expect(cases.every(c=>c.provenance==='synthetic')).toBe(true);
  const refs=await read('label-evidence.json');
  for(const ref of refs)expect(sha(await readFile(ref.path,'utf8'))).toBe(ref.sha256);
  await main(['validate-experiment','--cases',join(out,'cases.json'),'--experiment',join(out,'experiment.json')],options);
  const exported=join(dir,'exported');
  await main(exportArgs({dir:out},exported),options);
  const manifest=JSON.parse(await readFile(join(exported,'export-manifest.json'),'utf8'));
  expect(manifest).toMatchObject({trainingEligible:false,trainingExecuted:false,providerPredictionsIncluded:false,counts:{train:8,validation:4,test:8}});
  expect(await read('consents.json')).toEqual([]);
  await expect(main(['fixtures','--set','workflow','--out',out],options)).rejects.toThrow();
  const invalid=join(dir,'invalid');
  await expect(main(['fixtures','--set','private-session','--out',invalid],options)).rejects.toThrow(/Fixture set/);
  expect(emitted.some(line=>JSON.parse(line).valid===true)).toBe(true);
 }));
});