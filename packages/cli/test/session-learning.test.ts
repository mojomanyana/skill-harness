import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLearningCommand, learningDisplay, type LearningUI } from '../src/learning.js';
import { reviewSessionLearning } from '../src/session-learning.js';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture() {
 const root=mkdtempSync(join(tmpdir(),'session-cli-'));roots.push(root);
 const source=join(root,'parent.jsonl'),directory=join(root,'workspace'),archive=join(root,'archive'),output:string[]=[];
 const rows=[{type:'session',version:3,id:'synthetic',cwd:root},
  {type:'message',id:'u',message:{role:'user',content:'Review the result.\u001b[31m\u202e'}},
  {type:'message',id:'a',message:{role:'assistant',provider:'subscription',model:'fixture',stopReason:'stop',content:'Done'}}];
 writeFileSync(source,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
 const invoke=(args:string[],json=true)=>runLearningCommand([...args,'--state',directory,...(json?['--json']:[])],{write:s=>output.push(s)});
 const preview=async()=>{await invoke(['session','preview','--session',source]);return JSON.parse(output.at(-1)!);};
 const retain=async()=>{const p=await preview();await invoke(['session','import','--session',source,'--name','task','--title','Synthetic task','--expected',p.digest,'--confirm','--archive',archive,'--author','operator']);};
 return {root,source,directory,archive,output,invoke,preview,retain};
}
it('requires an exact preview before creating state and provides durable CLI readback/annotations',async()=>{
 const f=fixture(),p=await f.preview();expect(existsSync(f.directory)).toBe(false);
 await expect(f.invoke(['session','import','--session',f.source,'--name','task','--title','Task','--expected','wrong','--confirm','--archive',f.archive,'--author','operator'])).rejects.toThrow(/digest/);
 expect(existsSync(f.directory)).toBe(false);await f.retain();
 await f.invoke(['session','show','task']);const view=JSON.parse(f.output.at(-1)!);expect(view.acceptance).toBe('not-assessed');expect(view.gaps).toEqual(p.gaps);
 await f.invoke(['session','import','--session',f.source,'--name','task','--title','Synthetic task','--expected',p.digest,'--confirm']);
 expect(JSON.parse(f.output.at(-1)!).state).toBe('already-retained');
 await f.invoke(['session','note','task','--kind','acceptance','--note','Operator observation','--item','1','--line','2','--confirm']);
 await f.invoke(['session','show','task']);expect(JSON.parse(f.output.at(-1)!)).toMatchObject({acceptance:'not-assessed',annotations:[{author:'operator',line:2}]});
 await expect(f.invoke(['session','show','task','extra'])).rejects.toThrow(/unknown/);
 await expect(f.invoke(['session','list','--oops','yes'])).rejects.toThrow(/unsupported/);
});
it('escapes terminal control text while retaining exact raw evidence and discarding editor changes',async()=>{
 const f=fixture();await f.retain();const original=readFileSync(f.source);
 await f.invoke(['session','show','task'],false);expect(f.output.at(-1)).not.toContain('\u001b');expect(f.output.at(-1)).toContain('\\u001b');
 await f.invoke(['session','source','task','--item','1']);expect(JSON.parse(f.output.at(-1)!)).toBe(original.toString());
 const journal=join(f.directory,'events.jsonl'),before=readFileSync(journal),picks=['task','1. parent: '+f.source,'Done'],editors:string[]=[];
 const ui:LearningUI={notify:()=>{},input:async()=>undefined,confirm:async()=>false,select:async()=>picks.shift(),editor:async(_title,text)=>{editors.push(text);return 'malicious edits ignored';}};
 await reviewSessionLearning(f.directory,ui,learningDisplay);
 expect(editors).toHaveLength(2);expect(readFileSync(journal)).toEqual(before);expect(readFileSync(f.source)).toEqual(original);
});
it('refuses nested archives and changed sources without an accidental retained import',async()=>{
 const f=fixture(),p=await f.preview();
 await expect(f.invoke(['session','import','--session',f.source,'--name','task','--title','Task','--expected',p.digest,'--confirm','--archive',join(f.directory,'archive'),'--author','operator'])).rejects.toThrow(/outside/);
 expect(existsSync(f.directory)).toBe(false);
 writeFileSync(f.source,readFileSync(f.source).toString().replace('Done','Changed'));
 await expect(f.invoke(['session','import','--session',f.source,'--name','task','--title','Task','--expected',p.digest,'--confirm','--archive',f.archive,'--author','operator'])).rejects.toThrow(/digest/);
 expect(existsSync(f.archive)).toBe(false);
});
