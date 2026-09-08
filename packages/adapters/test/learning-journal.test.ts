import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { learningJournal } from '../src/learning-journal.js';
it('two real processes cannot both append against the same durable prior',async()=>{
 const root=mkdtempSync(join(tmpdir(),'learning-cas-')),directory=join(root,'journal'),journal=learningJournal(directory,{type:'initial'}),prior=journal.read()[0].id;
 const module=new URL('../dist/learning-journal.js',import.meta.url).href;
 const script=`import {learningJournal} from ${JSON.stringify(module)};try{learningJournal(${JSON.stringify(directory)}).append(${JSON.stringify(prior)},{type:'winner',pid:process.pid});process.stdout.write('won');}catch(e){if(!/stale learning CAS|EEXIST/.test(String(e)))throw e;process.stdout.write('refused');process.exitCode=1;}`;
 const run=()=>new Promise<{code:number;out:string}>((resolve,reject)=>execFile(process.execPath,['--input-type=module','-e',script],{env:{PATH:'/usr/bin:/bin'},timeout:10000},(error,out)=>{if(error&&(!('code' in error)||typeof error.code!=='number'))reject(error);else resolve({code:error?.code as number??0,out});}));
 const results=await Promise.all([run(),run()]);expect(results.map(r=>r.code).sort()).toEqual([0,1]);expect(results.map(r=>r.out).sort()).toEqual(['refused','won']);expect(journal.read()).toHaveLength(2);
},15000);
it('refuses stranded locks, redirected journals and stale CAS without replacing evidence',()=>{
 const root=mkdtempSync(join(tmpdir(),'learning-integrity-')),directory=join(root,'journal'),journal=learningJournal(directory,{type:'initial'}),prior=journal.read()[0].id;
 journal.append(prior,{type:'one'});expect(()=>journal.append(prior,{type:'two'})).toThrow(/stale/);
 writeFileSync(join(directory,'writer.lock'),'stranded',{mode:0o600});const before=readFileSync(join(directory,'events.jsonl'));expect(()=>journal.append(journal.read().at(-1)!.id,{type:'three'})).toThrow(/EEXIST/);expect(readFileSync(join(directory,'events.jsonl'))).toEqual(before);
 const redirected=join(root,'redirected');symlinkSync(directory,redirected);expect(()=>learningJournal(redirected)).toThrow(/substitution/);
});
