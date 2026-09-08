import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeArchiveSource } from '../src/archive-observer.js';
import { readArchiveSource } from '../src/evidence-archive.js';
const roots:string[]=[];
function fixture(){const root=mkdtempSync(join(tmpdir(),'archive-observer-'));roots.push(root);const source=join(root,'source');mkdirSync(source,{mode:0o700});const file=join(source,'events');writeFileSync(file,'{}\n',{mode:0o600});const policy={version:'archive-policy-v1',id:'observer',revision:'1',sourceRoot:source,archiveRoot:join(root,'archive'),maxBytes:1024,retention:'exact',expiresAt:'2099-01-01T00:00:00.000Z',sources:[{id:'s',path:'events',parser:{id:'jsonl',version:'1'}}]};const path=join(root,'policy');writeFileSync(path,JSON.stringify(policy),{mode:0o600});return{root,file,path,policy};}
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
describe('external bounded file observation',()=>{
 it('captures append and restart checkpoints with no worker interaction',async()=>{const f=fixture();const records:any[]=[];const result=await observeArchiveSource({policyPath:f.path,sourceId:'s',intervalMs:1,maxPolls:2,onObservation:r=>{records.push(r);if(records.length===1)appendFileSync(f.file,'{}\n');}});expect(result.polls).toBe(2);expect(records[1].change).toBe('append');const restarted=await observeArchiveSource({policyPath:f.path,sourceId:'s',intervalMs:1,maxPolls:1,previousCheckpointId:result.lastCheckpointId!});expect(restarted.lastCheckpointId).toBe(result.lastCheckpointId);expect(readArchiveSource(f.policy.archiveRoot,result.receiptId).status).toBe('available');});
 it('stops on policy drift without following the newly selected source',async()=>{const f=fixture();const result=await observeArchiveSource({policyPath:f.path,sourceId:'s',intervalMs:1,maxPolls:3,onObservation:()=>{f.policy.sources[0].path='new-file';writeFileSync(f.path,JSON.stringify(f.policy));}});expect(result.gaps).toContain('policy-changed-or-unavailable');expect(result.polls).toBe(1);});
 it('stops only observation and records callback loss without discarding retained checkpoints',async()=>{const f=fixture();const abort=new AbortController();const result=await observeArchiveSource({policyPath:f.path,sourceId:'s',intervalMs:1,maxPolls:3,signal:abort.signal,onObservation:()=>{abort.abort();throw Error('observer display unavailable');}});expect(result.stopped).toBe('aborted');expect(result.gaps).toContain('observation-consumer-failed');expect(result.lastCheckpointId).toBeTruthy();appendFileSync(f.file,'{"producer":"continues"}\n');});
});
