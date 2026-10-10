import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { listCollections } from './collections.mjs';
import { createSessionCollection } from './data-root.mjs';
import { createStorageConsent, learningDigest } from './learning-data.mjs';
import { retainSelectedSessionData } from './consent.mjs';
import { parseCases } from './dataset.mjs';
import { prepareHandoff, createHandoffSource, retainHandoffSource, JEV_QUESTION, JEV_MODEL, JEV_PROVIDER } from '../../packages/pi-extension/src/jev-packet.js';
import { nativeModelSha256 } from './native-jev.mjs';

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function temporary(){const root=await mkdtemp(join(tmpdir(),'collection-inventory-'));roots.push(root);return root;}
function workflow(root:string,sessionId:string,native=false){
  const recordedAt=new Date().toISOString();
  const consent=createStorageConsent({sessionId,decision:'granted',interactionId:'storage-fixture',recordedAt});
  const model={type:'classifier',provider:'cloudflare-workers-ai',id:'@cf/typesafe-ai/jev-1.0',api:'cloudflare-workers-ai-system-one'};
  const route={transport:'pi-classifier' as const,provider:model.provider,model:model.id,api:model.api,modelSha256:nativeModelSha256(model)};
  const authorization=native
    ? {kind:'jev-workflow-paid-scope-v2',sessionId,interactionId:'paid-fixture',recordedAt,route,question:JEV_QUESTION,maximumCalls:3}
    : {kind:'jev-workflow-paid-scope',sessionId,interactionId:'paid-fixture',recordedAt,provider:JEV_PROVIDER,model:JEV_MODEL,question:JEV_QUESTION,maximumCalls:3};
  const packet=prepareHandoff({candidate:'private-candidate',stage:'verification',nextAction:'Private action',
    uncertainty:'Private uncertainty',requirements:'secret-fixture-input',evidence:'secret-fixture-evidence-path'});
  const source=createHandoffSource({packet,sessionId,toolCallId:'private-tool-call',consent,authorization,evidence:[],...(native?{route}:{})});
  return {retained:retainHandoffSource(source,()=>{},root,[]),source,consent};
}
const linux=process.platform==='linux'?describe:describe.skip;
linux('read-only collection metadata inventory',()=>{
  it('finds real legacy/native workflow and manual producers without exposing content or making them training eligible',async()=>{
    const root=await temporary();
    const old=workflow(root,'private-legacy-session');
    const legacy=join(root,'jev-workflow','selection-Old001');
    await rename(dirname(old.retained.path),legacy);
    const current=workflow(root,'private-native-session',true);
    const manual=createSessionCollection(root,'jev-manual',current.consent.sessionId);
    const cases=parseCases({schema:1,cases:[{id:'fixture',input:'secret-manual-input',question:'secret-manual-question',
      provenance:'synthetic',visibility:'public',source:{sha256:learningDigest('fixture'),recordId:'synthetic-fixture'}}]});
    await retainSelectedSessionData({cases,consent:current.consent,out:join(manual,'selected-data.json')});
    // An unrelated settings subtree is never enumerated, even if it mimics collections.
    await mkdir(join(root,'settings'));await writeFile(join(root,'settings','auth.json'),'secret-auth-fixture');
    const before=await readFile(current.retained.path),result=await listCollections(root);
    expect(result).toMatchObject({count:3,gaps:[],truncated:false,meaning:'inventory-only-not-validation',trainingEligible:false,exportEligible:false});
    expect(result.collections.map((row:any)=>row.recordSchema).sort()).toEqual([1,2,3]);
    expect(result.collections.find((row:any)=>row.recordSchema===3)).toMatchObject({provider:'cloudflare-workers-ai',model:'@cf/typesafe-ai/jev-1.0',
      sha256:learningDigest(before),bytes:before.length,sessionSha256:learningDigest(current.consent.sessionId),caseCount:1});
    expect(result.collections.find((row:any)=>row.recordSchema===1)).toMatchObject({provider:null,model:null,caseCount:1});
    for(const row of result.collections)expect(row).toMatchObject({trainingEligible:false,exportEligible:false});
    const text=JSON.stringify(result);
    for(const secret of ['secret-','private-','input','question','consent',root])expect(text).not.toContain(secret);
    expect(await readFile(current.retained.path)).toEqual(before);
  });

  it('reports incomplete, malformed, partition-mismatched and linked artifacts without following links or echoing names',async()=>{
    const root=await temporary(),family=join(root,'jev-workflow');await mkdir(family,{mode:0o700});
    const target=join(root,'private-target');await mkdir(target);await writeFile(join(target,'selection.json'),'secret-target');
    await symlink(target,join(family,'selection-Link01'),'dir');
    await mkdir(join(family,'selection-Miss01'));
    await mkdir(join(family,'selection-Bad001'));await writeFile(join(family,'selection-Bad001','selection.json'),'secret-invalid-json');
    await mkdir(join(family,'selection-File01'));await symlink(join(target,'selection.json'),join(family,'selection-File01','selection.json'));
    await mkdir(join(family,'selection-unsafe\u001b-private-name'));
    const record=workflow(root,'private-wrong-partition');
    const changed=JSON.parse(await readFile(record.retained.path,'utf8'));changed.sessionId='different-private-session';
    await writeFile(record.retained.path,JSON.stringify(changed));
    const result=await listCollections(root);
    expect(result.count).toBe(0);expect(result.truncated).toBe(false);
    expect(result.gaps.map((gap:any)=>gap.reason)).toEqual(expect.arrayContaining([
      'linked-or-unreadable-directory','selection-missing','invalid-selection-json',
      'linked-oversized-or-unreadable-selection','unrecognized-collection-entry','session-partition-mismatch']));
    expect(JSON.stringify(result)).not.toMatch(/private|secret|\u001b/);
    expect(await readFile(join(target,'selection.json'),'utf8')).toBe('secret-target');
    const alias=join(root,'alias');await symlink(target,alias,'dir');
    expect(await listCollections(alias)).toMatchObject({count:0,gaps:[{path:'.',reason:'linked-or-unreadable-directory'}]});
  });

  it('does not create empty or missing roots and explicitly reports an enumeration limit',async()=>{
    const root=await temporary(),missing=join(root,'not-created');
    expect(await listCollections(missing)).toMatchObject({count:0,gaps:[{path:'.',reason:'directory-missing'}],truncated:false});
    expect(await listCollections(root)).toMatchObject({count:0,gaps:[],truncated:false});
    expect(await readdir(root)).toEqual([]);
    const family=join(root,'jev-workflow');await mkdir(family,{mode:0o700});
    for(let start=0;start<10_001;start+=100)
      await Promise.all(Array.from({length:Math.min(100,10_001-start)},(_,i)=>writeFile(join(family,`ignored-${start+i}`),'')));
    const result=await listCollections(root);
    expect(result).toMatchObject({count:0,truncated:true,gaps:[{path:'jev-workflow',reason:'inventory-limit-reached'}]});
    await expect(readdir(missing)).rejects.toMatchObject({code:'ENOENT'});
  });
});
