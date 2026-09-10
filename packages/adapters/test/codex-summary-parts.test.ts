import {expect,it} from 'vitest';
import {validateCodexTextSse,inertCodexSdkStreams} from '../src/codex-sdk-transport.js';
// Synthetic public fixtures only; retained private summaries never belong in this file.
function events(parts:string[]):any[]{
 const reason={id:'reason',type:'reasoning',content:[],encrypted_content:'opaque',summary:parts.map(text=>({type:'summary_text',text}))};
 const answer={id:'answer',type:'message',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:'4'}]};
 return [{type:'response.created',response:{id:'response',status:'in_progress'}},{type:'response.output_item.added',output_index:0,item:{...reason,summary:[]}},
 ...parts.flatMap((text,summary_index)=>{const common={output_index:0,item_id:'reason',summary_index};return [
 {type:'response.reasoning_summary_part.added',...common,part:{type:'summary_text',text:''}},
 {type:'response.reasoning_summary_text.delta',...common,delta:text},
 {type:'response.reasoning_summary_text.done',...common,text},
 {type:'response.reasoning_summary_part.done',...common,part:{type:'summary_text',text}}];}),
 {type:'response.output_item.done',output_index:0,item:reason},
 {type:'response.output_item.added',output_index:1,item:{...answer,status:'in_progress',content:[]}},
 {type:'response.content_part.added',output_index:1,item_id:'answer',content_index:0,part:{type:'output_text',text:''}},
 {type:'response.output_text.delta',output_index:1,item_id:'answer',content_index:0,delta:'4'},
 {type:'response.output_text.done',output_index:1,item_id:'answer',content_index:0,text:'4'},
 {type:'response.content_part.done',output_index:1,item_id:'answer',content_index:0,part:answer.content[0]},
 {type:'response.output_item.done',output_index:1,item:answer},
 {type:'response.completed',response:{id:'response',model:'gpt-5.5',status:'completed',output:[]}}];
}
const bytes=(e:any[])=>Buffer.from(e.map((v,sequence_number)=>'data: '+JSON.stringify({...v,sequence_number})+'\n\n').join(''));
it.each([['first','second'],['',''],['first','','third'],Array(16).fill(''),['é'.repeat(1024),'x'.repeat(2048)]])('accepts bounded sequential summaries %# with compact and full completion',(...parts)=>{
 const e=events(parts);expect(validateCodexTextSse(bytes(e),'gpt-5.5')).toEqual({text:'4',responseId:'response'});
 e.at(-1).response.output=e.filter(v=>v.type==='response.output_item.done').map(v=>v.item);expect(validateCodexTextSse(bytes(e),'gpt-5.5').text).toBe('4');
});
it.each(['gap','duplicate-index','negative','fraction','string','wrong-item','wrong-output','overlap','missing-text-done','missing-part-done','late-delta','changed-text','changed-part','completion-order','completion-missing','terminal-mismatch','too-many','aggregate-bytes'])('refuses malformed sequential summaries: %s',kind=>{
 const e=events(['first','second']);const second=e.filter(v=>v.summary_index===1),completion=e.find(v=>v.type==='response.output_item.done');
 if(kind==='gap')second[0].summary_index=2;if(kind==='duplicate-index')second[0].summary_index=0;if(kind==='negative')second[0].summary_index=-1;if(kind==='fraction')second[0].summary_index=1.5;if(kind==='string')second[0].summary_index='1';
 if(kind==='wrong-item')second[1].item_id='other';if(kind==='wrong-output')second[1].output_index=1;
 if(kind==='overlap')e.splice(3,0,e.splice(e.indexOf(second[0]),1)[0]);
 if(kind==='missing-text-done')e.splice(e.indexOf(second[2]),1);if(kind==='missing-part-done')e.splice(e.indexOf(second[3]),1);
 if(kind==='late-delta')e.splice(e.indexOf(second[3])+1,0,structuredClone(second[1]));
 if(kind==='changed-text')second[2].text='other';if(kind==='changed-part')second[3].part.text='other';
 if(kind==='completion-order')completion.item.summary.reverse();if(kind==='completion-missing')completion.item.summary.pop();
 if(kind==='terminal-mismatch'){e.at(-1).response.output=e.filter(v=>v.type==='response.output_item.done').map(v=>structuredClone(v.item));e.at(-1).response.output[0].summary.reverse();}
 expect(()=>validateCodexTextSse(bytes(kind==='too-many'?events(Array(17).fill('')):kind==='aggregate-bytes'?events(['é'.repeat(1024),'x'.repeat(2049)]):e),'gpt-5.5')).toThrow();
});
it.each([['a','b'],['',''],['a','','b'],[''],[]])('matches SDK summary joining without exposing summaries %#',async(...parts)=>{
 const e=events(parts),reason=e.find(v=>v.type==='response.output_item.done').item,model={id:'gpt-5.5',provider:'openai-codex',api:'openai-codex-responses',baseUrl:'https://chatgpt.com/backend-api'};
 const request={model:model.id,instructions:'Integer only',input:[{role:'user',content:[{type:'input_text',text:'2+2'}]}],reasoning:{effort:'low'},parallel_tool_calls:false};
 const stream=(_m:any,_c:any,o:any)=>({result:async()=>{o.onPayload(request);await o.fetch('https://chatgpt.com/backend-api/codex/responses',{method:'POST',body:JSON.stringify(request)});return {model:model.id,provider:model.provider,api:model.api,responseId:'response',stopReason:'stop',content:[{type:'thinking',thinking:parts.join('\n\n')||'\n\n'.repeat(parts.length),thinkingSignature:JSON.stringify(reason)},{type:'text',text:'4'}]};}});
 const ports=inertCodexSdkStreams({model,stream},async()=>new Response(bytes(e)),()=>{}),chunks:Buffer[]=[];
 const done=new Promise<void>((resolve,reject)=>{ports.response.on('data',b=>chunks.push(b));ports.response.once('end',resolve);ports.response.once('error',reject);ports.transport.once('error',reject);});
 ports.transport.end(JSON.stringify(request));try{await done;expect(Buffer.concat(chunks).toString()).toBe('4');}finally{ports.transport.destroy();ports.response.destroy();}
});
