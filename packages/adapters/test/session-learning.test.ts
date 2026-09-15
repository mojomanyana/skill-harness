import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observePiSession, observeSessionLedger } from '../src/session-observation.js';
import { prepareSessionImport, retainSessionImport, readRetainedSession, readRetainedSessionSource } from '../src/session-retention.js';
import { createLearningWorkspace, openLearningWorkspace } from '../src/learning-workspace.js';
const roots:string[]=[];const temp=()=>{const p=mkdtempSync(join(tmpdir(),'session-learning-'));roots.push(p);return p;};
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
const ts='2026-01-01T00:00:00.000Z';
const encode=(rows:unknown[])=>Buffer.from(rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
export const transcript=()=>encode([
 {type:'session',version:3,id:'parent',cwd:'/project',timestamp:ts},
 {type:'message',id:'u1',parentId:null,timestamp:ts,message:{role:'user',content:[{type:'text',text:'Please ask about the plan first.'}]}},
 {type:'message',id:'a1',parentId:'u1',timestamp:ts,message:{role:'assistant',model:'model-a',provider:'subscription',usage:{input:2,output:3,cacheRead:100},stopReason:'toolUse',content:[{type:'thinking',thinking:'private reasoning'},{type:'toolCall',name:'read',arguments:{path:'/project/secret'}},{type:'text',text:'I will inspect the code.'}]}},
 {type:'message',id:'a2',parentId:'a1',timestamp:ts,message:{role:'assistant',model:'model-a',provider:'subscription',stopReason:'stop',content:[{type:'text',text:'All passed. User accepted.'}]}},
]);
const id1='exec:10000000-0000-4000-8000-000000000001',id2='exec:10000000-0000-4000-8000-000000000002';
const lifecycle=(id:string,state:string,sec:number)=>({ledgerVersion:3,event:'child_lifecycle',ts:'2026-01-01T00:00:0'+sec+'.000Z',executionId:id,parentExecutionId:null,childId:'d0.1',state,executor:'herdr',...(['starting','running'].includes(state)?{deadlineAt:'2026-01-01T01:00:00.000Z'}:{exitCode:0,signal:null})});
it('keeps usage coverage and text evidence separate from acceptance, arguments and thinking',()=>{
 const p=observePiSession(transcript());
 expect(p.userMessages).toBe(1);expect(p.toolCalls).toEqual({read:1});
 expect(p.usage.fields.input).toEqual({sum:2,reportedMessages:1});
 expect(p.usage.fields.totalTokens).toBeUndefined();expect(p.gaps.join(' ')).toContain('Usage fields are missing');
 expect(JSON.stringify(p)).not.toContain('private reasoning');expect(JSON.stringify(p)).not.toContain('/project/secret');
 expect(p.timeline.some(e=>e.excerpt==='All passed. User accepted.')).toBe(true);
});
it('uses unique executions, not repeated logical child labels',()=>{
 const p=observeSessionLedger(encode([lifecycle(id1,'running',0),lifecycle(id1,'completed',1),lifecycle(id2,'running',2),lifecycle(id2,'completed',4)]));
 expect(p).toHaveLength(2);expect(p.map(a=>a.runningSeconds)).toEqual([1,2]);
});
it('refuses partial JSON, duplicate session ids and malformed usage',()=>{
 expect(()=>observePiSession(transcript().subarray(0,-1))).toThrow(/incomplete/);
 const rows=transcript().toString().trim().split('\n').map(JSON.parse);
 rows.push(rows[1]);expect(()=>observePiSession(encode(rows))).toThrow(/duplicate/);
 rows.pop();rows[2].message.usage.input=-1;expect(()=>observePiSession(encode(rows))).toThrow(/usage/);
});
it('previews without writes and requires the exact unchanged source before retention',()=>{
 const root=temp(),path=join(root,'session.jsonl'),archive=join(root,'archive');writeFileSync(path,transcript());
 const p=prepareSessionImport([{kind:'parent',path}]);
 expect(()=>readFileSync(join(archive,'anything'))).toThrow();
 expect(()=>retainSessionImport(archive,{...p},p.digest)).toThrow(/forged/);
 expect(()=>retainSessionImport(archive,p,'0'.repeat(64))).toThrow(/digest/);
 writeFileSync(path,Buffer.concat([transcript(),Buffer.from('{}\n')]));
 expect(()=>retainSessionImport(archive,p,p.digest)).toThrow(/changed/);
});
it('retains exact independent bytes, survives original removal, joins a workspace and does not grant acceptance',()=>{
 const root=temp(),path=join(root,'session.jsonl'),archive=join(root,'archive'),directory=join(root,'workspace');
 writeFileSync(path,transcript());const p=prepareSessionImport([{kind:'parent',path}]);
 const w=createLearningWorkspace(directory,{archiveRoot:archive,scopeDigest:'a'.repeat(64),population:'test',author:'operator'});
 const id=retainSessionImport(archive,p,p.digest);w.bindSession({name:'run',title:'A real task',manifestId:id});
 rmSync(path);expect(readRetainedSessionSource(archive,id,0)).toEqual(transcript());
 const view=readRetainedSession(archive,id);expect(view.acceptance).toBe('not-assessed');expect(view.gaps).toEqual(p.gaps);
 w.noteSession('run',{kind:'acceptance',item:1,line:2,note:'Operator reports the selected behavior passed.'});
 expect(openLearningWorkspace(directory).session('run').annotations).toHaveLength(1);
 expect(w.inspect(0)).toMatchObject({acceptance:'not-assessed',delegationStarted:false,sessions:[{name:'run',state:'ready'}]});
 expect(()=>w.noteSession('run',{kind:'finding',item:1,line:99,note:'bad reference'})).toThrow(/outside/);
 expect(()=>w.noteSession('run',{kind:'finding',item:1,line:5,note:'nonexistent trailing line'})).toThrow(/outside/);
 const source=view.sources[0];writeFileSync(join(archive,'objects',source.sha256),'changed');
 expect(()=>readRetainedSession(archive,id)).toThrow(/missing or changed/);expect(w.sessions()[0].state).toBe('deferred');
});
it('rejects symlink inputs and duplicate parent/child selection',()=>{
 const root=temp(),path=join(root,'session.jsonl'),alias=join(root,'alias');writeFileSync(path,transcript());symlinkSync(path,alias);
 expect(()=>prepareSessionImport([{kind:'parent',path:alias}])).toThrow();
 expect(()=>prepareSessionImport([{kind:'parent',path},{kind:'child',path}])).toThrow(/duplicate/);
});

it('preserves child-specific missing usage/unfinished evidence after retention',()=>{
 const root=temp(),path=join(root,'parent'),child=join(root,'child'),archive=join(root,'archive');
 writeFileSync(path,transcript());
 const rows=transcript().toString().trim().split('\n').map(JSON.parse);rows[0].id='child';rows[3].message.stopReason='toolUse';
 writeFileSync(child,encode(rows));const p=prepareSessionImport([{kind:'parent',path},{kind:'child',path:child}]);
 expect(p.gaps.some(g=>g.startsWith('Child source 2')&&g.includes('unfinished'))).toBe(true);
 const id=retainSessionImport(archive,p,p.digest);expect(readRetainedSession(archive,id).gaps).toEqual(p.gaps);
});

it('rejects contradictory execution identities and lifecycle history',()=>{
 const decision=JSON.parse(readFileSync(new URL('../../../contracts/pi-daddy/ledger/v3/fixtures/capability-decision.json',import.meta.url),'utf8'));
 expect(()=>observeSessionLedger(encode([decision,{...decision,agentType:'changed'}]))).toThrow(/duplicate capability/);
 expect(()=>observeSessionLedger(encode([lifecycle(id1,'running',0),lifecycle(id1,'starting',1)]))).toThrow(/duplicate starting/);
 expect(()=>observeSessionLedger(encode([lifecycle(id1,'starting',0),{...lifecycle(id1,'running',1),deadlineAt:'2026-01-01T02:00:00.000Z'}]))).toThrow(/deadline changed/);
 expect(()=>observeSessionLedger(encode([{...lifecycle(id1,'running',0),parentExecutionId:id2},{...lifecycle(id2,'running',0),parentExecutionId:id1}]))).toThrow(/parent cycle/);
});

it('checks lease identity without displaying leases as model executions',()=>{
 const decision=JSON.parse(readFileSync(new URL('../../../contracts/pi-daddy/ledger/v3/fixtures/capability-decision.json',import.meta.url),'utf8'));
 const lease=JSON.parse(readFileSync(new URL('../../../contracts/pi-daddy/ledger/v3/fixtures/workspace-lease.json',import.meta.url),'utf8'));
 expect(observeSessionLedger(encode([lease]))).toEqual([]);
 expect(()=>observeSessionLedger(encode([decision,{...lease,executionId:decision.executionId,childId:'d0.99'}]))).toThrow(/identity changed/);
});
