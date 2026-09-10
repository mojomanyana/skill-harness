import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, unlinkSync, mkdirSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { freezeIntervention, interventionEvidenceDigest } from '@skill-harness/core';
import { retainBlindIntervention, openBlindIntervention } from '../src/blind-intervention.js';
const bytes=Buffer.from('synthetic output');const hash=createHash('sha256').update(bytes).digest('hex');
function fixture(){
 const root=join(mkdtempSync(join(tmpdir(),'blind-review-')),'archive');
 const manifest=freezeIntervention({family:'intervention',investigationSha256:hash,resourceMetric:'wall_ms',axes:['model'],common:{mode:'force',scenarioSha256:hash,rubricSha256:hash,fixtureSha256:hash,heldoutSha256:hash,harnessSha256:hash,judgePolicySha256:hash},proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:['a','b'].map(id=>({id,configuration:{model:`fixture:${id}`,effort:'low',skill:hash,prompt:hash,configuration:hash}}))});
 const evidence=['a','b'].map(armId=>({armId,inputDigest:manifest.inputDigest,artifactDigests:[hash],cells:[{caseId:'A1',repetition:0,delivery:'PASS' as const,objective:'PASS' as const,criteria:['PASS' as const],suspect:false,artifactSha256:hash}],cost:armId==='a'?10:1,costUnit:'wall_ms'}));
 const qualification={manifestId:manifest.id,proposer:{requested:'fixture:proposer',canonical:'proposer'},judge:{requested:'fixture:judge',canonical:'judge'},subjects:{a:{requested:'fixture:a',canonical:'subject-a'},b:{requested:'fixture:b',canonical:'subject-b'}},evidenceDigests:Object.fromEntries(evidence.map(e=>[e.armId,interventionEvidenceDigest(e)])),artifacts:new Map([[hash,bytes]])};
 return {root,manifest,evidence,qualification};
}
describe('durable blind intervention review',()=>{
 it('reopens the same private labels, persists quality before reveal and locks it across restart',()=>{
  const f=fixture(), id=retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator');
  const first=openBlindIntervention(f.root,id,'operator'), view=first.view();
  expect(view.cards).toHaveLength(2);expect(JSON.stringify(view)).not.toMatch(/fixture:|cost|operator/);
  expect(first.quality()).toBeNull();expect(()=>first.reveal()).toThrow(/quality/);
  expect(first.readArtifact(view.cards[0].label,hash)).toEqual(bytes);
  const second=openBlindIntervention(f.root,id,'operator');expect(second.view()).toEqual(view);
  const choice={kind:'one' as const,labels:[view.cards[0].label]};first.choose(choice);
  expect(second.quality()).toEqual(choice);
  expect(second.reveal()).toMatchObject({choice,routingDefault:null});expect(second.reveal().arms).toHaveLength(2);
  expect(second.choose(choice)).toEqual(choice);
  expect(()=>second.choose({kind:'none',labels:[]})).toThrow(/locked/);
  expect(()=>openBlindIntervention(f.root,id,'other').view()).toThrow(/author/);
 });
 it('refuses changed or missing bytes on every read, not only when opening',()=>{
  const f=fixture(), id=retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator');
  const review=openBlindIntervention(f.root,id,'operator');review.choose({kind:'none',labels:[]});
  unlinkSync(join(f.root,'objects',hash));
  expect(()=>review.reveal()).toThrow(/artifact/);expect(()=>review.view()).toThrow(/artifact/);
 });
 it('refuses incomplete/forged evidence and accessor metadata before archive writes',()=>{
  const f=fixture();f.qualification.artifacts.clear();
  expect(()=>retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator')).toThrow(/complete/);expect(existsSync(f.root)).toBe(false);
  let accessed=false;Object.defineProperty(f.qualification,'proposer',{get(){accessed=true;return null;}});
  expect(()=>retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator')).toThrow(/plain/);expect(accessed).toBe(false);
 });
 it('admits one of two competing initial quality choices across actual Node processes',async()=>{
  const f=fixture(), id=retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator');
  const module=fileURLToPath(new URL('../dist/blind-intervention.js',import.meta.url));
  const children=['none','insufficient'].map(kind=>{
   const child=spawn(process.execPath,['--input-type=module','-e',`import {openBlindIntervention} from ${JSON.stringify(module)};process.stdout.write('READY\\n');for await(const _ of process.stdin){try{const choice=openBlindIntervention(${JSON.stringify(f.root)},${JSON.stringify(id)},'operator').choose({kind:${JSON.stringify(kind)},labels:[]});console.log(JSON.stringify({ok:true,choice}));}catch(e){console.log(JSON.stringify({ok:false,error:e.message}));}break;}`],{stdio:['pipe','pipe','pipe'],timeout:15000});
   let output='',errors='';let readyResolve!:()=>void;
   const ready=new Promise<void>(resolve=>{readyResolve=resolve;});
   child.stdout.on('data',b=>{output+=b; if(output.includes('READY\n'))readyResolve();});child.stderr.on('data',b=>{errors+=b;});
   const done=new Promise<any>((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>{if(code!==0||signal){reject(Error(JSON.stringify({code,signal,output,errors})));return;}try{resolve(JSON.parse(output.trim().split('\n').at(-1)!));}catch(e){reject(e);}});});
   return {child,ready,done};
  });
  try {
   await Promise.all(children.map(c=>Promise.race([c.ready,c.done.then(()=>{throw Error('child exited before release');})])));
   children.forEach(c=>c.child.stdin.end('GO\n'));
   const results=await Promise.all(children.map(c=>c.done));expect(results.filter(r=>r.ok)).toHaveLength(1);
   expect(openBlindIntervention(f.root,id,'operator').reveal().choice).toEqual(results.find(r=>r.ok).choice);
  }finally{children.forEach(c=>{c.child.stdin.end();if(c.child.exitCode===null)c.child.kill();});}
 },25000);
 it('rejects a symlinked choice namespace without touching its target',()=>{
  const f=fixture(), id=retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator');
  const outside=mkdtempSync(join(tmpdir(),'blind-outside-'));symlinkSync(outside,join(f.root,'blind-decisions'));
  expect(()=>openBlindIntervention(f.root,id,'operator').choose({kind:'none',labels:[]})).toThrow(/private/);
  expect(existsSync(join(outside,id))).toBe(false);
 });
 it('keeps partial first-choice writes as a recovery error, never a fresh choice',()=>{
  const f=fixture(), id=retainBlindIntervention(f.root,f.manifest,f.evidence,f.qualification,'operator');
  const directory=join(f.root,'blind-decisions',id);mkdirSync(join(f.root,'blind-decisions'),{mode:0o700});mkdirSync(directory,{mode:0o700});
  const review=openBlindIntervention(f.root,id,'operator');
  expect(()=>review.choose({kind:'none',labels:[]})).toThrow(/incomplete/);
  writeFileSync(join(directory,'choice.json'),'{',{mode:0o600});
  expect(()=>review.reveal()).toThrow(/invalid/);expect(readFileSync(join(directory,'choice.json'),'utf8')).toBe('{');
 });
});
