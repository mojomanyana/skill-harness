// Explicit local conformance command, not an automatic provider/installation test.
import assert from 'node:assert/strict';
import { mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { createLocalCodexHost, openLocalCodexHost } from '../../packages/adapters/dist/codex-host-observer.js';
import { probeLocalCodexProfile } from '../../packages/adapters/dist/codex-model-profile.js';
const root=process.argv[2];if(!root||resolve(root)!==root)throw Error('one new absolute evidence directory required');mkdirSync(root,{mode:0o700});
const sha=s=>createHash('sha256').update(s).digest('hex');
const models=['gpt-5.6-sol','gpt-5.5','gpt-5.3-codex-spark','gpt-5.4-mini'];
const invocations=['subject','first','second','tie'].map((id,i)=>({id,role:i?'judge':'subject',model:models[i],effort:'low',instructions:i?'Judge the anonymous output against the criterion.':'Return only the integer.',input:i?'Exactly 4.':'What is 2 + 2?',expectedSha256:sha('4'),subjectId:i?'subject':null}));
const policy=[{role:'proposer',model:'gpt-5.4',canonical:'fixture-proposer',lineage:'fixture-proposer'},...invocations.map(i=>({role:i.role,model:i.model,canonical:`fixture-${i.id}`,lineage:`fixture-${i.id}`}))];
const host=createLocalCodexHost(join(root,'owner'),{version:'codex-host-local-v1',maxCalls:4,wallMs:10000,invocations});
const kernel=await probeLocalCodexProfile('subject');
const observations=[];
for(const [index,i] of invocations.entries()){
 const response=index?JSON.stringify({verdict:index===2?'FAIL':'PASS',suspect:false}):'4';
 const path=join(root,`${i.id}-request.json`);
 const observed=await host.exchange(Readable.from([index?JSON.stringify({id:i.id,sequence:1})+'\n':kernel.frame]),createWriteStream(path,{flags:'wx',mode:0o600}),Readable.from([response]));
 assert.equal(readFileSync(path,'utf8'),observed.requestBody);assert.equal(sha(readFileSync(path)),observed.requestSha256);
 if(index)assert.ok(!observed.requestBody.includes('gpt-5.6-sol'));
 observations.push(observed);
}
const panel=host.panel('subject',['first','second','tie'],policy);assert.equal(panel.collapse.verdict,'PASS');assert.equal(panel.liveQualified,false);assert.equal(panel.routingDefault,null);
assert.deepEqual(openLocalCodexHost(join(root,'owner')).panel('subject',['first','second','tie'],policy),panel);
assert.equal(host.inspect().complete,true);
writeFileSync(join(root,'report.json'),JSON.stringify({kernel,observations,panel,calls:host.inspect().calls,liveCalls:0,credentialsRead:false,providerInternalFacts:null,qualification:'NOT QUALIFIED: fixed isolated IPC probe + host-owned local file writes + synthetic response streams; no provider client or arbitrary-model containment'},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({evidence:root,hostExchanges:4,liveCalls:0,namespaceProbe:'passed',panel:'fixture split collapsed; liveQualified=false'}));
