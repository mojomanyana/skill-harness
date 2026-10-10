import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from './main.mjs';
import {parseCases} from './dataset.mjs';
import {makeNativeRequest, nativeRequestSha256, normalizeNativeResult} from './native-jev.mjs';

const dirs: string[] = [];
afterEach(async () => {for (const dir of dirs.splice(0)) await rm(dir,{recursive:true,force:true});});
const route = {transport:'pi-classifier',provider:'typesafe',model:'jev-latest',
  api:'typesafe-system-one',modelSha256:'a'.repeat(64)};
function answer(selected = route) {
  return normalizeNativeResult(selected, {api:selected.api,provider:selected.provider,model:selected.model,
    stopReason:'stop',answers:{decision:{type:'bool',probability:0.8}},
    usage:{input:12,output:1,cost:{total:0.0001}}}, 5);
}
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(),'native-decision-cli-')); dirs.push(dir);
  const dataset = {schema:1,cases:['a','b'].map(id=>({id,input:'Selected public input '+id,
    question:'Does the input contain a selected public fact?',provenance:'synthetic',
    source:{sha256:'b'.repeat(64),recordId:id},visibility:'public'}))};
  const cases = parseCases(dataset);
  const labels = {schema:1,labels:cases.map(c=>({caseId:c.id,caseHash:c.hash,value:true,kind:'test',
    actor:'fixture-test',evidenceSha256:'c'.repeat(64),independent:true}))};
  const casesPath=join(dir,'cases.json'), labelsPath=join(dir,'labels.json'),out=join(dir,'result.jsonl');
  await writeFile(casesPath,JSON.stringify(dataset)); await writeFile(labelsPath,JSON.stringify(labels));
  const args=(command:string)=>[command,'--cases',casesPath,'--provider',route.provider,'--model',route.model,
    ...(command==='run'?['--out',out,'--allow-remote','--storage','no']:[])];
  const score=['score','--cases',casesPath,'--labels',labelsPath,'--run',out];
  return {dir,cases,casesPath,out,args,score};
}
describe('native JEV manual run provenance',()=>{
  it('previews classifier contexts without resolving authentication or invoking either provider',async()=>{
    const f=await fixture(),emit=vi.fn(),nativeProviderCall=vi.fn(),providerCall=vi.fn();
    await main(f.args('preview'),{nativeRoute:route,nativeProviderCall,providerCall,env:{},emit});
    const preview=JSON.parse(emit.mock.calls[0][0]);
    expect(preview).toMatchObject({schema:2,requestFormat:'pi-classifier-context-v1',count:2,trainingEligible:false});
    expect(preview.requests[0]).toEqual({caseId:f.cases[0].id,caseHash:f.cases[0].hash,
      route,context:makeNativeRequest(f.cases[0]),requestSha256:nativeRequestSha256(f.cases[0])});
    expect(nativeProviderCall).not.toHaveBeenCalled();expect(providerCall).not.toHaveBeenCalled();
    expect(JSON.stringify(preview)).not.toContain('apiKey');
  });
  it('runs the selected native route without environment credentials and scores with honest model/cost provenance',async()=>{
    const f=await fixture(),nativeProviderCall=vi.fn().mockResolvedValue(answer()),providerCall=vi.fn();
    await main(f.args('run'),{nativeRoute:route,nativeProviderCall,providerCall,env:{},emit:()=>{}});
    expect(nativeProviderCall).toHaveBeenCalledTimes(2);expect(providerCall).not.toHaveBeenCalled();
    const rows=(await readFile(f.out,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    expect(rows[0]).toMatchObject({schema:2,kind:'decision-shadow-native-run',route,
      provider:'typesafe',requestedModel:'jev-latest',costSource:'pi-catalog-estimate'});
    expect(rows[1]).toMatchObject({resolvedModel:null,returnedProvider:'typesafe',returnedModel:'jev-latest',
      requestSha256:nativeRequestSha256(f.cases[0]),costSource:'pi-catalog-estimate',trainingEligible:false});
    const emit=vi.fn();await main(f.score,{emit});
    expect(JSON.parse(emit.mock.calls[0][0]).reports[0]).toMatchObject({scored:2,accuracy:1,
      resolvedModels:[],route,costSource:'pi-catalog-estimate',measurements:{costUsd:{reported:2,total:0.0002}}});
  });
  it('refuses changed route, missing native runner and occupied output without legacy fallback',async()=>{
    const f=await fixture(),nativeProviderCall=vi.fn(),providerCall=vi.fn();
    const opts={nativeRoute:route,nativeProviderCall,providerCall,env:{OPENROUTER_API_KEY:'unused'},emit:()=>{}};
    const args=f.args('run');args[args.indexOf('--model')+1]='typesafe/jev-1.13';
    await expect(main(args,opts)).rejects.toThrow('changed');
    await expect(main(f.args('run'),{...opts,nativeProviderCall:undefined})).rejects.toThrow('unavailable');
    await writeFile(f.out,'existing evidence');
    await expect(main(f.args('run'),opts)).rejects.toMatchObject({code:'EEXIST'});
    expect(await readFile(f.out,'utf8')).toBe('existing evidence');
    expect(nativeProviderCall).not.toHaveBeenCalled();expect(providerCall).not.toHaveBeenCalled();
  });
  it('stops on first native failure and retains a sanitized scoreable partial result',async()=>{
    const f=await fixture(),nativeProviderCall=vi.fn().mockRejectedValue(new Error('private-credential-value'));
    await expect(main(f.args('run'),{nativeRoute:route,nativeProviderCall,env:{},emit:()=>{}})).rejects.toThrow('stopped');
    expect(nativeProviderCall).toHaveBeenCalledTimes(1);
    const text=await readFile(f.out,'utf8');expect(text).not.toContain('private-credential-value');
    const emit=vi.fn();await main(f.score,{emit});
    expect(JSON.parse(emit.mock.calls[0][0]).reports[0]).toMatchObject({errors:1,missing:1,scored:0});
  });
  it('collects consented manual data under one root while declined sessions leave it untouched',async()=>{
    const f=await fixture(),dataRoot=join(f.dir,'shared-data'),emit=vi.fn();
    const args=f.args('run');args[args.indexOf('--storage')+1]='yes';
    await main(args,{nativeRoute:route,nativeProviderCall:async()=>answer(),
      env:{SKILL_HARNESS_DATA_ROOT:dataRoot},emit});
    const collection=JSON.parse(emit.mock.calls[0][0]).learningCollection;
    expect(collection.status).toBe('captured');
    expect(collection.path).toMatch(/jev-manual\/session-[a-f0-9]{64}\/run-/);
    expect((await stat(collection.path)).mode & 0o777).toBe(0o700);
    const selected=JSON.parse(await readFile(join(collection.path,'selected-data.json'),'utf8'));
    expect(selected).toMatchObject({labelStatus:'unlabeled',trainingEligible:false,providerOutputsIncluded:false});
    expect(selected.cases[0].input).toBe(f.cases[0].input);
    expect(await readFile(join(collection.path,'results.jsonl'),'utf8')).toBe(await readFile(f.out,'utf8'));
    expect((await stat(join(collection.path,'results.jsonl'))).mode & 0o777).toBe(0o600);
    const before=await readdir(join(dataRoot,'jev-manual'));
    const second=await fixture();
    await main(second.args('run'),{nativeRoute:route,nativeProviderCall:async()=>answer(),
      env:{SKILL_HARNESS_DATA_ROOT:dataRoot},emit:()=>{}});
    expect(await readdir(join(dataRoot,'jev-manual'))).toEqual(before);
  });
  it('refuses native request/route/cost tampering instead of interpreting it as legacy evidence',async()=>{
    const f=await fixture();
    await main(f.args('run'),{nativeRoute:route,nativeProviderCall:async()=>answer(),env:{},emit:()=>{}});
    const original=(await readFile(f.out,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    for(const change of [
      (rows:any[])=>{rows[1].requestSha256='f'.repeat(64);},
      (rows:any[])=>{rows[0].provider='openrouter';},
      (rows:any[])=>{rows[1].costSource='provider-billed';},
      (rows:any[])=>{rows[1].resolvedModel='jev-latest';},
      (rows:any[])=>{rows[0].schema=1;rows[0].kind='decision-shadow-run';},
    ]) {
      const rows=structuredClone(original);change(rows);
      await writeFile(f.out,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
      await expect(main(f.score,{emit:()=>{}})).rejects.toThrow();
    }
  });
});
