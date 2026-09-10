import { expect,it } from 'vitest';
import { validateCodexTextSse } from '../src/codex-sdk-transport.js';
// Synthetic structure only. No live response, identifiers or account metadata.
function events():any[]{const part={type:'output_text',text:'4'},item={id:'synthetic-item',type:'message',role:'assistant',status:'completed',content:[part]};return [
 {type:'response.created',response:{id:'synthetic-response',status:'in_progress'}},
 {type:'response.in_progress',response:{id:'synthetic-response',status:'in_progress'}},
 {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
 {type:'response.content_part.added',output_index:0,content_index:0,item_id:item.id,part:{...part,text:''}},
 {type:'response.output_text.delta',output_index:0,content_index:0,item_id:item.id,delta:'4'},
 {type:'response.output_text.done',output_index:0,content_index:0,item_id:item.id,text:'4'},
 {type:'response.content_part.done',output_index:0,content_index:0,item_id:item.id,part},
 {type:'response.output_item.done',output_index:0,item},
 {type:'response.completed',response:{id:'synthetic-response',model:'gpt-6-astra',status:'completed',output:[]}},
 ];}
const bytes=(e:any[])=>Buffer.from(e.map((v,sequence_number)=>'data: '+JSON.stringify({...v,sequence_number})+'\n\n').join(''));
it.each(['compact','full'])('accepts correlated completed text with %s terminal',shape=>{const e=events();if(shape==='full')e[8].response.output=[e[7].item];expect(validateCodexTextSse(bytes(e),'gpt-6-astra')).toEqual({text:'4',responseId:'synthetic-response'});});
it.each(['missing','null','nonarray','conflicting','multiple','wrong-model','wrong-response','wrong-status','wrong-item','item-content-nonarray','wrong-part','wrong-text','no-text-done','no-part-done','no-item-done','no-parts','reordered','tools','reasoning','unknown-event','truncated','after-terminal'])('refuses %s despite compact compatibility',change=>{const e=events();if(change==='missing')delete e[8].response.output;if(change==='null')e[8].response.output=null;if(change==='nonarray')e[8].response.output={length:0};if(change==='conflicting')e[8].response.output=[{...e[7].item,status:'in_progress'}];if(change==='multiple')e[8].response.output=[e[7].item,e[7].item];if(change==='wrong-model')e[8].response.model='gpt-5.4';if(change==='wrong-response')e[8].response.id='other';if(change==='wrong-status')e[8].response.status='incomplete';if(change==='wrong-item')e[7].item.id='other';if(change==='item-content-nonarray')e[7].item.content={0:{type:'output_text',text:'4'},length:1};if(change==='wrong-part')e[6].item_id='other';if(change==='wrong-text')e[5].text='5';if(change==='no-text-done')e.splice(5,1);if(change==='no-part-done')e.splice(6,1);if(change==='no-item-done')e.splice(7,1);if(change==='no-parts'){e.splice(6,1);e.splice(3,1);}if(change==='reordered')[e[5],e[6]]=[e[6],e[5]];if(change==='tools')e[2].item.type='function_call';if(change==='reasoning')e[2].item.type='reasoning';if(change==='unknown-event')e[4].type='response.unknown';if(change==='after-terminal')e.push(e[8]);const b=bytes(e);expect(()=>validateCodexTextSse(change==='truncated'?b.subarray(0,-1):b,'gpt-6-astra')).toThrow();});
