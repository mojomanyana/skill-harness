import { expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdArchive } from '../src/archive.js';
import { retainArchiveSource, trustPolicyDigest, trustOutcomeDigest } from '@skill-harness/adapters';
it('existing archive CLI connects durable predeclaration, prediction, independent reference and readback',async()=>{
 const root=mkdtempSync(join(tmpdir(),'archive-learning-cli-')),state=join(root,'state'),request=join(root,'request.json'),archiveRoot=join(root,'archive');
 const manifestId=retainArchiveSource(archiveRoot,{sourceId:'reference',parser:{id:'fixture',version:'1'},retention:'exact',bytes:Buffer.from('reference fixture')}).manifestId;
 const component={kind:'detector' as const,id:'detector',version:'1',population:'layout'},input={archiveRoot,component,seed:'a'.repeat(64),maxUnflagged:0,cohort:[{incidentId:'incident',manifestId,flagged:true,split:'calibration' as const}],exposure:null};
 const log=vi.spyOn(console,'log').mockImplementation(()=>{});
 const run=async(operation:string,input:unknown,authority:unknown=null)=>{writeFileSync(request,JSON.stringify({operation,input,authority}),{mode:0o600});await cmdArchive({_:['trust'],flags:{state,request}});return JSON.parse(String(log.mock.calls.at(-1)![0]));};
 try{expect((await run('create',input,[trustPolicyDigest(input)])).attentionUsed).toBe(0);
  await run('predict',{id:'prediction',incidentId:'incident',component,kind:'positive',split:'calibration'});
  const outcome={kind:'prediction' as const,targetId:'prediction',value:true,evidenceManifestId:manifestId,referenceId:'reference'};
  await expect(run('outcome',outcome,[])).rejects.toThrow(/authority/);await run('outcome',outcome,[trustOutcomeDigest(outcome)]);
  expect((await run('inspect',10)).calibration.reports[0]).toMatchObject({correct:1,resolved:1});expect((await run('expose',{id:'question',now:10})).mode).toBe('silent');
  await expect(run('network.fetch',{})).rejects.toThrow(/unsupported/);
  writeFileSync(request,'{"operation":"inspect","operation":"create","input":null,"authority":null}');await expect(cmdArchive({_:['trust'],flags:{state,request}})).rejects.toThrow(/invalid/);
 }finally{log.mockRestore();}
});
