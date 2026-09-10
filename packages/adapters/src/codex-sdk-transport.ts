import { createHash } from 'node:crypto';
import { PassThrough, Writable } from 'node:stream';
import { isDeepStrictEqual } from 'node:util';
import * as zlib from 'node:zlib';

/** Trusted installed SDK dependency, NOT an extension/caller capability. No auth loader or
 * network implementation is imported here. The sole credential is deliberately invalid.
 * Inert execution additionally requires the documented network-unshared, no-home mount. */
export interface CodexSdkBinding {
 model: { id:string; provider:string; api:string; baseUrl:string; [key:string]:unknown };
 stream: (model:any, context:any, options:any)=>{result():Promise<any>};
}
const destination='https://chatgpt.com/backend-api/codex/responses';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const fixtureCredential='fixture.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'fixture-no-account'}})).toString('base64url')+'.invalid';

/** Narrow text-only SSE support. Unsupported reasoning/tools/event shapes fail closed.
 * The SDK decoder alone tolerates gaps/reordering; this validates correlation first. */
export function validateCodexTextSse(bytes:Buffer, model:string):{text:string;responseId:string} {
 const text=new TextDecoder('utf8',{fatal:true}).decode(bytes).replace(/\r\n/g,'\n');
 if(!text.endsWith('\n\n'))throw Error('truncated SSE framing');
 let sequence=0,phase=0,responseId='',itemId='',output='',completedItem:unknown;
 let partOpen=false,partDone=false,textDone=false,progress=false;
 for(const block of text.slice(0,-2).split('\n\n')) {
  const lines=block.split('\n').filter(l=>l&&!l.startsWith(':'));if(!lines.length)continue;
  const types=lines.filter(l=>l.startsWith('event:')).map(l=>l.slice(6).trim()),data=lines.filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,''));
  if(types.length>1||!data.length||types.length+data.length!==lines.length)throw Error('unsupported SSE framing');
  const e=JSON.parse(data.join('\n'));if(types.length&&e.type!==types[0]||e.sequence_number!==sequence++)throw Error('SSE sequence or event mismatch');
  if(e.type==='response.created'&&phase===0) {responseId=e.response?.id;if(typeof responseId!=='string'||!responseId||responseId.length>128||e.response.status!=='in_progress')throw Error('response identity missing');phase=1;}
  else if(e.type==='response.in_progress'&&phase===1&&!progress){if(e.response?.id!==responseId||e.response.status!=='in_progress')throw Error('progress correlation');progress=true;}
  else if(e.type==='response.output_item.added'&&phase===1) {itemId=e.item?.id;if(typeof itemId!=='string'||!itemId||itemId.length>128||e.output_index!==0||e.item.type!=='message'||e.item.role!=='assistant'||e.item.status!=='in_progress'||!isDeepStrictEqual(e.item.content,[]))throw Error('unsupported output item');phase=2;}
  else if(e.type==='response.content_part.added'&&phase===2&&!partOpen&&!textDone){if(e.item_id!==itemId||e.output_index!==0||e.content_index!==0||e.part?.type!=='output_text'||e.part.text!=='')throw Error('content part correlation');partOpen=true;}
  else if(e.type==='response.output_text.done'&&phase===2&&!textDone){if(e.item_id!==itemId||e.output_index!==0||e.content_index!==0||e.text!==output)throw Error('text completion mismatch');textDone=true;}
  else if(e.type==='response.content_part.done'&&phase===2&&partOpen&&!partDone&&textDone){if(e.item_id!==itemId||e.output_index!==0||e.content_index!==0||e.part?.type!=='output_text'||e.part.text!==output)throw Error('content part completion mismatch');partDone=true;}
  else if(e.type==='response.output_text.delta'&&phase===2&&!textDone) {if(e.item_id!==itemId||e.output_index!==0||e.content_index!==0||typeof e.delta!=='string')throw Error('delta correlation');output+=e.delta;}
  else if(e.type==='response.output_item.done'&&phase===2) {if(partOpen&&!partDone||e.output_index!==0||e.item?.id!==itemId||e.item.type!=='message'||e.item.role!=='assistant'||e.item.status!=='completed'||!Array.isArray(e.item.content)||e.item.content.length!==1||e.item.content[0].type!=='output_text'||e.item.content[0].text!==output)throw Error('completed item mismatch');completedItem=e.item;phase=3;}
  else if(e.type==='response.completed'&&phase===3) {
   // Compact terminals omit duplicated items, not their preceding completion evidence.
   const terminal=e.response?.output,compact=Array.isArray(terminal)&&terminal.length===0&&partOpen&&partDone&&textDone;
   if(e.response?.id!==responseId||e.response.model!==model||e.response.status!=='completed'||!Array.isArray(terminal)||(!compact&&(terminal.length!==1||!isDeepStrictEqual(terminal[0],completedItem))))throw Error('completed response mismatch');phase=4;
  }
  else throw Error('unsupported or reordered SSE event');
 }
 if(phase!==4)throw Error('truncated SSE response');return {text:output,responseId};
}

export interface CodexWire { destination:string; method:'POST'; body:Buffer; encoding:string|null }
export interface CodexWireTransport { kind:'fixture-http'|'subscription-http'; exchange(wire:CodexWire,signal:AbortSignal,record:(value:Record<string,unknown>)=>void):Promise<Response> }
export function inertCodexSdkStreams(binding:CodexSdkBinding, fixture:()=>Promise<Response>, record:(value:Record<string,unknown>)=>void) {
 return sdkStreams(binding,async()=>fixture(),record,'inert-sdk-fetch');
}
export function boundCodexSdkStreams(binding:CodexSdkBinding, transport:CodexWireTransport, record:(value:Record<string,unknown>)=>void, caps:{requestBytes:number;responseBytes:number}) {
 if(!['fixture-http','subscription-http'].includes(transport.kind)||![caps.requestBytes,caps.responseBytes].every(n=>Number.isSafeInteger(n)&&n>0)||caps.requestBytes>4096||caps.responseBytes>16384)throw Error('unsupported SDK transport binding');
 return sdkStreams(binding,transport.exchange,record,transport.kind,caps);
}
function sdkStreams(binding:CodexSdkBinding, send:CodexWireTransport['exchange'], record:(value:Record<string,unknown>)=>void, mode:string, caps={requestBytes:4096,responseBytes:16384}) {
 const response=new PassThrough(),controller=new AbortController();let started=false;
 const transport=new Writable({autoDestroy:false,write(chunk,_encoding,done){
  void (async()=>{
   if(started)throw Error('SDK transport single use; no retry');started=true;
   const expected=JSON.parse(Buffer.from(chunk).toString('utf8')),model=binding.model;
   if(model.id!==expected.model||model.provider!=='openai-codex'||model.api!=='openai-codex-responses'||model.baseUrl!=='https://chatgpt.com/backend-api')throw Error('SDK model binding mismatch');
   let fetches=0,expectedOutput:string|undefined;
   const result=await binding.stream(model,{systemPrompt:expected.instructions,messages:[{role:'user',content:expected.input[0].content[0].text,timestamp:0}]},{apiKey:fixtureCredential,transport:'sse',maxRetries:0,cacheRetention:'none',reasoningEffort:expected.reasoning.effort,reasoningSummary:'auto',textVerbosity:'low',toolChoice:'none',timeoutMs:30000,signal:controller.signal,
    onPayload:(payload:unknown)=>{const normalized={...(payload as object),parallel_tool_calls:false};if(!isDeepStrictEqual(JSON.parse(JSON.stringify(normalized)),expected))throw Error('SDK request settings tampered');return normalized;},
    fetch:async(url:string,init:RequestInit)=>{
     if(++fetches!==1)throw Error('SDK retry refused');
     if(url!==destination||init.method!=='POST'||init.redirect&&init.redirect!=='error'||controller.signal.aborted)throw Error('SDK destination/redirect refused');
     const wire=typeof init.body==='string'?Buffer.from(init.body):init.body instanceof Uint8Array?Buffer.from(init.body):null;
     if(!wire||wire.length>(mode==='inert-sdk-fetch'?16384:caps.requestBytes))throw Error('SDK wire byte bound');
     const encoding=new Headers(init.headers).get('content-encoding');
     if(encoding!==null&&encoding!=='zstd')throw Error('unsupported request encoding');
     if(encoding==='zstd'&&typeof zlib.zstdDecompressSync!=='function')throw Error('zstd decoding unavailable');
     const serialized=encoding==='zstd'?Buffer.from(zlib.zstdDecompressSync(wire,{maxOutputLength:4096})):wire;
     if(serialized.length>caps.requestBytes||!isDeepStrictEqual(JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(serialized)),expected))throw Error('SDK final request tampered');
     record({type:'sdk-wire-observed',requestSha256:hash(chunk),serializedBase64:serialized.toString('base64'),wireBase64:wire.toString('base64'),wireSha256:hash(wire),encoding,destination,method:'POST',authenticationHeadersRetained:false,transport:mode,networkCalls:mode==='subscription-http'?null:0,liveQualified:false});
     const reply=await send({destination,method:'POST',body:wire,encoding},controller.signal,value=>{if(!['http-request-started','http-response-observed','http-request-failed'].includes(String(value.type)))throw Error('unbound transport observation');record({...value,transport:mode,liveQualified:false});});if(controller.signal.aborted)throw Error('SDK response deadline');if(reply.redirected||reply.status>=300&&reply.status<400)throw Error('fixture redirects refused');
     if(!reply.body)throw Error('missing response body');
     const reader=reply.body.getReader(),parts:Buffer[]=[];let size=0,cancellationError:unknown;
     const abort=()=>{void reader.cancel().catch(error=>{cancellationError=error;});};controller.signal.addEventListener('abort',abort,{once:true});
     try {for(;;){if(controller.signal.aborted)throw Error('SDK response deadline');const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>caps.responseBytes)throw Error('SDK response byte bound');parts.push(Buffer.from(next.value));}}
     finally {controller.signal.removeEventListener('abort',abort);await reader.cancel();reader.releaseLock();}
     if(cancellationError||controller.signal.aborted)throw Error('SDK response cancellation failed or deadline expired');
     const raw=Buffer.concat(parts);record({type:'sdk-response-observed',status:reply.status,responseBase64:raw.toString('base64'),responseSha256:hash(raw),liveQualified:false});
     let decoderBody=raw;const decoderHeaders=new Headers(reply.headers);
     if(reply.ok){
      const contentType=reply.headers.get('content-type'),mediaType=contentType===null||contentType===''?'missing':contentType.startsWith('text/event-stream')?'event-stream':'other';
      let category:'media-type-invalid'|'SSE-validation-failed'|'validation-record-failed'='media-type-invalid';
      try {
       if(mediaType==='other'||mediaType==='missing'&&reply.status!==200)throw Error('unsupported response content type');
       category='SSE-validation-failed';const validated=validateCodexTextSse(raw,expected.model);expectedOutput=validated.text;decoderBody=Buffer.from(new TextDecoder('utf8',{fatal:true}).decode(raw).replace(/\r\n/g,'\n'));
       // Only HTTP200 + validated, correlated model-bound text may supply a missing
       // decoder media type. Preserve reply.headers; this is not an upstream header claim.
       if(mediaType==='missing')decoderHeaders.set('content-type','text/event-stream');
       category='validation-record-failed';record({type:'sdk-response-validated',responseId:validated.responseId,decoderInputSha256:hash(decoderBody),decoderNormalization:'SSE CRLF to LF; original response retained',originalMediaType:mediaType,decoderMediaType:'event-stream',mediaTypeDerived:mediaType==='missing',liveQualified:false});
      }catch(error){
       // Diagnostic persistence is best effort only; it must never replace the initiating
       // exception or turn a refused response into success. No raw header/body/error text.
       try{record({type:'sdk-response-failed',category,mediaType,liveQualified:false});}catch{/* Original error remains authoritative even when this recorder also fails. */}
       throw error;
      }
     }
     return new Response(decoderBody,{status:reply.status,headers:decoderHeaders});
    }}).result();
   if(controller.signal.aborted||fetches!==1||result.stopReason!=='stop'||result.model!==expected.model||result.provider!=='openai-codex'||result.api!=='openai-codex-responses'||result.content?.length!==1||result.content[0].type!=='text'||result.content[0].text!==expectedOutput)throw Error(mode==='inert-sdk-fetch'?'SDK response decoding failed: '+String(result.errorMessage??'decoded output mismatch').slice(0,512):'subscription-exchange-failed');
   record({type:'sdk-decoded',outputSha256:hash(expectedOutput!),model:result.model,provider:result.provider,api:result.api,providerInternalFacts:null,transport:mode,liveQualified:false});response.end(expectedOutput);done();
  })().catch(e=>done(e instanceof Error?e:Error(String(e))));
 },destroy(error,done){controller.abort();response.destroy();done(error);}});
 return {transport,response};
}
