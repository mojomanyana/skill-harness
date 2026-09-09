// Deliberately inert. No credential file, HTTP socket or provider/account probe.
import { zstdDecompressSync } from 'node:zlib';
export function fixturePorts(c,bindings){
 const counters={http:0,fixtureReads:0,realCredentialReads:0,liveCalls:0};
 return {counters,ports:{bindings,credentials:{kind:'fixture-oauth',read:async()=>{counters.fixtureReads++;return {type:'oauth',provider:'openai-codex',access:'fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:c.accountId}})).toString('base64url')+'.invalid',expires:Date.now()+180000,accountId:c.accountId};}},transport:{kind:'fixture-http',exchange:async wire=>{
  const bytes=wire.encoding==='zstd'?zstdDecompressSync(wire.body,{maxOutputLength:c.limits.requestBytes}):wire.body;
  const model=JSON.parse(bytes).model,k=c.invocations.findIndex(i=>i.model===model);if(k<0)throw Error('unknown fixture model');counters.http++;
  const text=k<2?'4':JSON.stringify({verdict:k===3?'FAIL':'PASS',suspect:false}),item={id:'item-'+k,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]};
  const events=[{type:'response.created',response:{id:'response-'+k,status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-'+k,model,status:'completed',output:[item]}}];
  return new Response(events.map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 }}}};
}
