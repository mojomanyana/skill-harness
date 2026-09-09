import { expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createLocalCodexHost } from '../src/codex-host-observer.js';
import { learningJournal } from '../src/learning-journal.js';
const spec=()=>({version:'codex-host-local-v1' as const,maxCalls:1,wallMs:2000,invocations:[{id:'subject',role:'subject' as const,model:'gpt-5.6-sol',effort:'low' as const,instructions:'Return integer.',input:'2+2',expectedSha256:createHash('sha256').update('4').digest('hex'),subjectId:null}]});
it('original source cancellation interrupts pending host I/O, remains counted, and is not mislabeled a deadline',async()=>{
 const path=join(mkdtempSync(join(tmpdir(),'codex-source-cancel-')),'journal'),host=createLocalCodexHost(path,spec()),source=new AbortController();
 let written!:()=>void;const ready=new Promise<void>(r=>written=r),sink=new Writable({write(_b,_e,cb){cb();written();}}),response=new Readable({read(){}});
 const done=host.exchange(Readable.from(['{"id":"subject","sequence":1}\n']),sink,response,false,source.signal).then(()=>false,()=>true);
 await ready;source.abort();const result=await Promise.race([done,new Promise(r=>setTimeout(()=>r('not cancelled'),100))]);response.destroy();await done;
 expect(result).toBe(true);expect(host.inspect()).toMatchObject({calls:1,aborted:true,complete:false});
 expect(learningJournal(path).read().at(-1)?.value).toMatchObject({type:'abort',sourceAborted:true,deadlineExceeded:false});
});
it('a previously aborted source cannot consume a host claim or write a request',async()=>{
 const path=join(mkdtempSync(join(tmpdir(),'codex-source-preabort-')),'journal'),host=createLocalCodexHost(path,spec()),source=new AbortController();source.abort();let writes=0;
 await expect(host.exchange(Readable.from(['{"id":"subject","sequence":1}\n']),new Writable({write(_b,_e,cb){writes++;cb();}}),Readable.from(['4']),false,source.signal)).rejects.toThrow();
 expect(writes).toBe(0);expect(host.inspect().calls).toBe(0);
});
