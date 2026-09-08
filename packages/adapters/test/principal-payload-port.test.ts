import { it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createPrincipalPayloadPort } from '../src/principal-payload-port.js';
const roots:string[]=[];afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
it('binds real exact binary archive bytes to origin and archive, enforcing read budgets',async()=>{const root=mkdtempSync(join(tmpdir(),'principal-port-'));roots.push(root);const port=createPrincipalPayloadPort(join(root,'archive'),'fixture-archive'),bytes=Buffer.from([0,255,1]),origin={run_id:'fixture',check_id:'check',revision:{seq:1,digest:'a'.repeat(64)}};const receipt=await port.retain({bytes,sha256:sha(bytes),origin});expect((await port.read(receipt,{max_bytes:3})).bytes).toEqual(bytes);await expect(port.read(receipt,{max_bytes:2})).rejects.toThrow(/bound/);await expect(port.read({...receipt,origin_sha256:'f'.repeat(64)},{max_bytes:3})).rejects.toThrow(/origin/);await expect(port.read({...receipt,archive_id:'other'},{max_bytes:3})).rejects.toThrow(/archive/);await expect(port.retain({bytes,sha256:'f'.repeat(64),origin})).rejects.toThrow(/digest/);});
