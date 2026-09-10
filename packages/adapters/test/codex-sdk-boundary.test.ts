import { it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createLocalCodexHost } from '../src/codex-host-observer.js';
import { validateCodexTextSse } from '../src/codex-sdk-transport.js';
it('legacy byte-only owners cannot invoke the SDK without a frozen canonical policy',async()=>{let calls=0;const host=createLocalCodexHost(join(mkdtempSync(join(tmpdir(),'sdk-policy-')),'owner'),{version:'codex-host-local-v1',maxCalls:1,wallMs:1000,invocations:[{id:'s',role:'subject',model:'gpt-5.6-sol',effort:'low',instructions:'integer',input:'2+2',expectedSha256:'0'.repeat(64),subjectId:null}]});await expect(host.exchangeSdk(Readable.from(['{"id":"s","sequence":1}\n']),{model:{} as any,stream:()=>{calls++;throw Error('must not invoke');}},async()=>{calls++;return new Response('');})).rejects.toThrow(/canonical policy/);expect(calls).toBe(0);expect(host.inspect().calls).toBe(0);});
it('fails closed on missing, malformed and uncorrelated wire events rather than accepting SDK tolerance',()=>{for(const s of ['', 'data: {}\n\n','event: response.created\ndata: {\n\n','event: response.created\ndata: {"type":"response.created","sequence_number":1}\n\n','event: response.created\ndata: {"type":"response.created","sequence_number":0,"response":{"id":"r","status":"in_progress"}}\n\n'])expect(()=>validateCodexTextSse(Buffer.from(s),'gpt-5.6-sol')).toThrow();});
