import { it,expect,vi } from 'vitest';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { cmdArchive } from '../src/archive.js';
import { learningHash } from '../../adapters/src/learning-journal.js';
it('drives exact consent and revocation through the existing archive CLI without exposing raw reads',async()=>{const root=mkdtempSync(join(tmpdir(),'access-cli-')),archiveRoot=join(root,'archive');mkdirSync(archiveRoot,{mode:0o700});const request=join(root,'request.json'),state=join(root,'state'),log=vi.spyOn(console,'log').mockImplementation(()=>{}),policy={archiveRoot,id:'cli',expiresAt:100,maxCalls:3,maxBytes:32,purposes:['facts']};const call=async(operation:string,input:unknown,authority:unknown=null)=>{writeFileSync(request,JSON.stringify({operation,input,authority}));await cmdArchive({_:['access'],flags:{state,request}});return JSON.parse(String(log.mock.calls.at(-1)![0]));};try{await call('create',policy,[learningHash(policy)]);const grant={manifestId:createHash('sha256').update('fixture').digest('hex'),purpose:'facts',expiresAt:90},id=await call('preview-consent',grant);await expect(call('consent',{grant,now:1},[])).rejects.toThrow(/permission/);expect(await call('consent',{grant,now:2},[id])).toBe(id);const revoke=await call('preview-revocation',id);await call('revoke',{id,now:3},[revoke]);await expect(call('read',{})).rejects.toThrow(/unsupported/);}finally{log.mockRestore();rmSync(root,{recursive:true,force:true});}});
