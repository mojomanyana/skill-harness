// Explicit kernel/installed-SDK proof; run only with documented isolated mounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
globalThis.fetch=async()=>{throw Error('global network disabled');};
globalThis.WebSocket=class {constructor(){throw Error('WebSocket disabled');}};
const {stream}=await import('/sdk/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js');
const catalogue=JSON.parse(readFileSync('/sdk/node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json','utf8'))['openai-codex-responses'];
const {createLocalCodexHost,openLocalCodexHost}=await import('/harness/packages/adapters/dist/codex-host-observer.js');
const sha=s=>createHash('sha256').update(s).digest('hex');
const policy=[{role:'proposer',model:'gpt-5.4',canonical:'p',lineage:'shared-fixture'},{role:'subject',model:'gpt-5.6-sol',canonical:'s',lineage:'shared-fixture'},{role:'judge',model:'gpt-5.5',canonical:'j',lineage:'shared-fixture'}];
function events(model='gpt-5.6-sol',text='4') {const item={id:'msg_fixture',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]};return [
 {type:'response.created',response:{id:'resp_'+model,status:'in_progress'}},
 {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
 {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},
 {type:'response.output_item.done',output_index:0,item},
 {type:'response.completed',response:{id:'resp_'+model,model,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}},
 ].map((e,i)=>({...e,sequence_number:i}));}
const encode=es=>es.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
let totalFetches=0;
for(const scenario of ['success','malformed','truncated','reordered','correlation','settings','wire-tamper','quota','retry','oversize']) {
 const path='/out/'+scenario,host=createLocalCodexHost(path,{version:'codex-host-local-v1',maxCalls:1,wallMs:30000,invocations:[{id:'subject',role:'subject',model:'gpt-5.6-sol',effort:'low',instructions:'Return only the integer.',input:'2+2?',expectedSha256:sha('4'),subjectId:null}]},policy);
 let fetches=0;
 const fixture=async()=>{fetches++;totalFetches++;let es=events();if(scenario==='reordered')[es[1],es[2]]=[es[2],es[1]];if(scenario==='correlation')es[2].item_id='wrong';if(scenario==='settings')es[4].response.model='gpt-5.5';let body=encode(es);if(scenario==='malformed')body='event: broken\ndata: {\n\n';if(scenario==='truncated')body=encode(es.slice(0,-1));if(scenario==='oversize')body='x'.repeat(16385);return new Response(scenario==='quota'?JSON.stringify({error:{message:'fixture quota exhausted'}}):body,{status:scenario==='quota'?429:200,headers:{'content-type':scenario==='quota'?'application/json':'text/event-stream'}});};
 const selectedStream=scenario==='wire-tamper'?(m,c,o)=>stream(m,c,{...o,onPayload:async b=>({...await o.onPayload(b),instructions:'tampered'})}):scenario==='retry'?(m,c,o)=>stream(m,c,{...o,fetch:async(...a)=>{await o.fetch(...a);return o.fetch(...a);}}):stream;
 const operation=()=>host.exchangeSdk(Readable.from(['{"id":"subject","sequence":1}\n']),{model:catalogue['gpt-5.6-sol'],stream:selectedStream},fixture);
 if(scenario==='success'){const result=await operation();assert.equal(result.objective,'PASS');assert.equal(Buffer.from(result.outputBase64,'base64').toString(),'4');assert.equal(openLocalCodexHost(path).inspect().complete,true);const rows=readFileSync(path+'/events.jsonl','utf8');assert.match(rows,/sdk-wire-observed/);assert.match(rows,/sdk-response-observed/);assert.match(rows,/sdk-decoded/);assert.match(rows,/zstd/);assert.doesNotMatch(rows,/fixture-no-account|authorization/i);}
 else {await assert.rejects(operation);assert.equal(host.inspect().aborted,true);await assert.rejects(operation);assert.equal(host.inspect().calls,1);}
 assert.equal(fetches,scenario==='wire-tamper'?0:1);console.log(JSON.stringify({scenario,fetches,liveCalls:0,passed:true}));
}
// The same durable owner carries objective eligibility into actual SDK-decoded blind votes.
const panelPolicy=[...policy,{role:'judge',model:'gpt-5.3-codex-spark',canonical:'j2',lineage:'shared-fixture'}];
const invocations=['subject','first','second'].map((id,i)=>({id,role:i?'judge':'subject',model:['gpt-5.6-sol','gpt-5.5','gpt-5.3-codex-spark'][i],effort:'low',instructions:'Return only the requested result.',input:i?'Must equal 4.':'2+2?',expectedSha256:sha('4'),subjectId:i?'subject':null}));
const panelHost=createLocalCodexHost('/out/panel',{version:'codex-host-local-v1',maxCalls:3,wallMs:30000,invocations},panelPolicy);
for(const i of invocations)await panelHost.exchangeSdk(Readable.from([JSON.stringify({id:i.id,sequence:1})+'\n']),{model:catalogue[i.model],stream},async()=>new Response(encode(events(i.model,i.role==='subject'?'4':'{"verdict":"PASS","suspect":false}')),{headers:{'content-type':'text/event-stream'}}));
assert.equal(panelHost.panel('subject',['first','second'],panelPolicy).collapse.verdict,'PASS');
assert.deepEqual(panelHost.panel('subject',['first','second'],panelPolicy).disclosures,['shared lineage: shared-fixture']);
const replayHost=createLocalCodexHost('/out/replay',{version:'codex-host-local-v1',maxCalls:2,wallMs:30000,invocations:[invocations[0],{...invocations[0],id:'again'}]},policy);
for(const id of ['subject','again']){const call=()=>replayHost.exchangeSdk(Readable.from([JSON.stringify({id,sequence:1})+'\n']),{model:catalogue['gpt-5.6-sol'],stream},async()=>new Response(encode(events()),{headers:{'content-type':'text/event-stream'}}));if(id==='subject')await call();else await assert.rejects(call,/replayed/);}
assert.equal(replayHost.inspect().calls,2);assert.equal(replayHost.inspect().aborted,true);
console.log(JSON.stringify({passed:12,fixtureFetches:totalFetches+5,liveCalls:0,authReads:0,scope:'actual installed serializer/compression/response decoder + durable host; text-only inert compatibility, not backend identity or live qualification'}));
