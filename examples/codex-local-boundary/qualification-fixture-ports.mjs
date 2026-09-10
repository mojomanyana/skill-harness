// Deliberately inert. No credential file, HTTP socket or provider/account probe.
import promises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { zstdDecompressSync } from 'node:zlib';
export function fixturePorts(c,bindings,product){
 let serial=0;
 const counters={http:0,fixtureReads:0,realCredentialReads:0,liveCalls:0};
 return {counters,ports:{bindings,credentials:{kind:'fixture-oauth',read:async()=>{counters.fixtureReads++;return {type:'oauth',provider:'openai-codex',access:'fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:c.accountId}})).toString('base64url')+'.invalid',expires:Date.now()+180000,accountId:c.accountId};}},transport:{kind:'fixture-http',exchange:async(wire,_credential,signal)=>{
  const bytes=wire.encoding==='zstd'?zstdDecompressSync(wire.body,{maxOutputLength:c.limits.requestBytes}):wire.body;
  const body=JSON.parse(bytes),model=body.model;let k=c.invocations.findIndex(i=>i.model===model),text;
  if(product){const role=c.rolePolicy.find(r=>r.model===model)?.role;if(!role)throw Error('unknown product model');k=serial++;
   if(role==='proposer'){const request=JSON.parse(body.input[0].content[0].text),s=request.selection;text=JSON.stringify({archiveSnapshot:s.archiveSnapshot,caseIds:s.selectedCaseIds,population:s.population,intervention:'synthetic proposal',alternatives:['keep'],prediction:'fixed check passes',downside:'review effort',disproof:'check fails',rollback:'restore baseline',limits:request.proposalLimits,effectProfile:null});}
   else text=role==='subject'?(JSON.stringify(body.input).includes('objective-failure')?'5':'4'):JSON.stringify({verdict:model===product.protocol.roles.judges[1].requested?'FAIL':'PASS',suspect:false});
  }else{if(k<0)throw Error('unknown fixture model');text=k<2?'4':JSON.stringify({verdict:k===3?'FAIL':'PASS',suspect:false});}
  counters.http++;
  if(product&&JSON.stringify(body.input).includes('cancel-source')){process.kill(process.pid,'SIGTERM');await new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(Error('inert source cancellation')),{once:true});if(signal.aborted)reject(Error('inert source cancellation'));});}
  if(product&&JSON.stringify(body.input).includes('fail-settlement')){const original=promises.open;promises.open=async(...args)=>{const handle=await original(...args);if(String(args[0])==='/out/budget/budget.jsonl'){promises.open=original;syncBuiltinESMExports();const sync=handle.sync.bind(handle);handle.sync=async()=>{await sync();throw Error('inert required settlement sync failure');};}return handle;};syncBuiltinESMExports();}
  const item={id:'item-'+k,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text}]};
  const events=[{type:'response.created',response:{id:'response-'+k,status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},{type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:text},{type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{id:'response-'+k,model,status:'completed',output:[item]}}];
  return new Response(events.map((e,sequence_number)=>'data: '+JSON.stringify({...e,sequence_number})+'\n\n').join(''),{headers:{'content-type':'text/event-stream'}});
 }}}};
}
