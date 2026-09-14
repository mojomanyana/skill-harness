import { afterEach, expect, it } from 'vitest';
import { rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLearningCommand, reviewLearningComparison, learningDisplay, type LearningUI } from '../src/learning.js';
import { learningWorkspaceFixture } from '../../adapters/test/learning-workspace-fixture.js';
const roots:string[]=[];const fixture=()=>{const f=learningWorkspaceFixture();roots.push(f.root);return f;};
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
it('normal CLI commands list existing sources and require deliberate confirmed quality writes',async()=>{
  const f=fixture(),output:string[]=[];const invoke=(args:string[])=>runLearningCommand([...args,'--state',f.directory,'--json'],{write:t=>output.push(t)});
  await invoke(['import']);expect(JSON.parse(output.at(-1)!)).toEqual(expect.arrayContaining([expect.objectContaining({kind:'comparison'}),expect.objectContaining({kind:'cases'})]));
  await invoke(['choose','reports','--kind','none','--full-review','--note','Complete reports reviewed']);
  expect(JSON.parse(output.at(-1)!)).toMatchObject({state:'confirmation-required'});expect(f.workspace.comparison('reports').choice).toBeNull();
  await invoke(['choose','reports','--kind','none','--full-review','--note','Complete reports reviewed','--confirm']);
  await invoke(['reveal','reports']);expect(JSON.parse(output.at(-1)!)).toHaveProperty('arms');
  await expect(invoke(['status','--unexpected','yes'])).rejects.toThrow(/unsupported/);
});
it('points the adoption handoff only to implemented /grants learning in interactive Pi',async()=>{
  const f=fixture(),output:string[]=[],before=readFileSync(join(f.directory,'events.jsonl'));
  await runLearningCommand(['adoption','reports','--state',f.directory,'--json'],{write:t=>output.push(t)});
  expect(JSON.parse(output[0]).next).toBe('Use /grants learning in interactive Pi for authorized next-order activation/rollback.');
  expect(output[0]).not.toContain('pi-daddy learning');
  expect(readFileSync(join(f.directory,'events.jsonl'))).toEqual(before);
});
it('does not treat a guided excerpt or cancelled view as full artifact acknowledgement',async()=>{
  const f=fixture(),choices:string[][]=[];let step=0;
  const ui:LearningUI={notify:()=>{},input:async()=>undefined,editor:async()=>undefined,confirm:async()=>true,
    select:async(_title,options)=>{choices.push(options);step++;if(step===1)return options[0];if(step===2)return 'Record quality choice';if(step===3)return 'Cancel';return 'Done';}};
  await reviewLearningComparison(f.directory,'reports',ui);
  expect(choices[2]).toEqual(['Insufficient evidence','Cancel']);expect(f.workspace.comparison('reports').choice).toBeNull();
});
it('uses complete editor bytes, immutable quality before reveal, and separate defer in the Pi-compatible wizard seam',async()=>{
  const f=fixture(),notices:string[]=[];const picks=['Read variant A (1 artifact(s))','Read variant B (1 artifact(s))','Record quality choice','Tie (all shown variants)','Adopt / reject / defer','defer','Done'];
  const ui:LearningUI={notify:t=>notices.push(t),input:async()=> 'Explicit complete-artifact review, not excerpts',editor:async(_title,text)=>text,confirm:async()=>true,select:async(_title,choices)=>{const pick=picks.shift();expect(choices).toContain(pick);return pick;}};
  await reviewLearningComparison(f.directory,'reports',ui);
  expect(f.workspace.comparison('reports')).toMatchObject({choice:{kind:'tie'},decision:{disposition:'defer'},activation:'not-activated',revealReady:true});
  expect(notices.join('\n')).not.toContain('fixture:subject');
});
it('opens actual case evidence by selection, without retyping manifest identities',async()=>{
  const f=fixture(),output:string[]=[];
  await runLearningCommand(['evidence','daily','--item','1','--state',f.directory,'--json'],{write:t=>output.push(t)});
  expect(JSON.parse(output.at(-1)!)).toEqual([expect.objectContaining({status:'available',role:'nomination'}),expect.objectContaining({status:'available',role:'frozen-inputs'})]);
  await runLearningCommand(['evidence','daily','--item','1','--evidence','2','--state',f.directory],{write:t=>output.push(t)});
  expect(output.at(-1)).toContain('Exact retained source');expect(output.at(-1)).toContain('Synthetic original fixture evidence');
  expect(()=>f.workspace.readCaseEvidence('daily',f.caseManifestId,f.comparison.comparisonManifestId)).toThrow(/outside/);
});
it('derives init scope from actual retained cases instead of asking for a digest',async()=>{
  const f=fixture(),output:string[]=[];
  await runLearningCommand(['init','--archive',f.archiveRoot,'--author',f.config.author,'--state',f.directory,'--confirm','--json'],{write:t=>output.push(t)});
  expect(JSON.parse(output.at(-1)!)).toMatchObject({configuration:f.config});
});
it('loads the portable guide/current register through the public offline command',async()=>{
  const output:string[]=[];await runLearningCommand(['guide'],{write:t=>output.push(t)});await runLearningCommand(['current'],{write:t=>output.push(t)});
  expect(output[0]).toContain('Factory: work, review, learn');expect(output[1]).toContain('requirement register');
});
it('offline readiness never writes and terminal text escapes controls without changing evidence',async()=>{
  const f=fixture(),file=join(f.directory,'events.jsonl'),before=readFileSync(file),out:string[]=[];
  await runLearningCommand(['status','--state',f.directory],{write:t=>out.push(t)});
  expect(out.join('\n')).toContain('no model calls');expect(readFileSync(file)).toEqual(before);
  expect(learningDisplay('safe\u001b[31m\u202eevil')).toBe('safe\\u001b[31m\\u202eevil');
});
