import type { ClientRequest } from 'node:http';
import { Agent, request } from 'node:https';
import { rootCertificates, checkServerIdentity, type TLSSocket } from 'node:tls';
import { createHash } from 'node:crypto';
import { SUBSCRIPTION_ENDPOINT, validateCodexOAuth, type CodexHttpPort } from './codex-subscription.js';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const ERROR_CODES=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','EACCES','EPERM','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_SSL_WRONG_VERSION_NUMBER']);
function errorCode(error:unknown):string {
 // No messages, getters, arbitrary codes or implicit string conversion in diagnostics.
 try {const code=error&&Object.getOwnPropertyDescriptor(error,'code')?.value;return typeof code==='string'&&ERROR_CODES.has(code)?code:'unknown';}catch{return 'unknown';}
}

const REFUSAL_TYPES=new Set(['invalid_request_error','authentication_error','permission_error','rate_limit_error','server_error']);
const REFUSAL_CODES=new Set(['invalid_json','invalid_request','invalid_parameter','unknown_parameter','unsupported_parameter','unsupported_value','missing_required_parameter','model_not_found','invalid_api_key','insufficient_quota','rate_limit_exceeded']);
const REFUSAL_PARAMETERS=new Set(['model','input','instructions','reasoning','reasoning.effort','reasoning.summary','text','text.verbosity','tools','tool_choice','parallel_tool_calls','store','stream','max_output_tokens','temperature','top_p','include','service_tier','prompt_cache_key','previous_response_id','background']);
function refusalMetadata(value:unknown) {
 const error=(value as {error?:{type?:unknown;code?:unknown;param?:unknown}}|null)?.error;
 const allowed=(value:unknown,set:Set<string>)=>typeof value==='string'&&set.has(value)?value:'unknown';
 return {type:allowed(error?.type,REFUSAL_TYPES),code:allowed(error?.code,REFUSAL_CODES),parameter:allowed(error?.param,REFUSAL_PARAMETERS)};
}
type CompletionFailure='write-incomplete'|'tls-unverified'|'message-incomplete'|'response-encoding'|'response-byte-limit'|'redirect'|'credential-reflection'|'response-aborted'|'response-closed'|'internal-completion';

/** Low-level trusted-host capability. No auth discovery, redirects, fetch/global agents,
 * proxy support, retries or WebSocket path. The frozen entrypoint owns approval/reservations.
 * Constructing this port does not connect; only a separately approved entry may call exchange. */
export function createCodexHttpsPort():CodexHttpPort {
 let inFlight=false;
 const preflight=()=>{if(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_EXTRA_CA_CERTS'].some(k=>!!process.env[k])||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('unsupported production transport environment');};
 return {kind:'subscription-http',preflight,async exchange(wire,rawCredential,signal,record,limits){
  preflight();if(![limits.requestBytes,limits.responseBytes,limits.callMs].every(n=>Number.isSafeInteger(n)&&n>0)||!Buffer.isBuffer(wire.body)||inFlight||wire.destination!==SUBSCRIPTION_ENDPOINT||wire.method!=='POST'||!['zstd',null].includes(wire.encoding)||wire.body.length>limits.requestBytes||limits.requestBytes>4096||limits.responseBytes>16384||limits.callMs>30000)throw Error('subscription-http-refused');
  const credential=validateCodexOAuth(rawCredential,rawCredential.accountId,'subscription-live');signal.throwIfAborted();
  const body=Buffer.from(wire.body);inFlight=true;
  const agent=new Agent({keepAlive:false,maxSockets:1,maxCachedSessions:0});
  try {return await new Promise<Response>((resolve,reject)=>{
   let settled=false,written=false,req:ClientRequest|undefined,timer:ReturnType<typeof setTimeout>|undefined;const finish=(error?:Error,response?:Response)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);agent.destroy();inFlight=false;if(error)reject(Error('subscription-http-failed'));else resolve(response!);};
   let phase:'request'|'lookup'|'connect'|'tls'|'write'|'response'='request';
   const fail=(error:unknown)=>{if(settled)return;try{record({type:'http-request-failed',classification:signal.aborted?'aborted':'transport-failure',phase,errorCode:errorCode(error)});}catch{finish(Error('record failed'));return;}finish(Error('request failed'));};
   const refuse=(reason:CompletionFailure)=>{if(settled)return;try{record({type:'http-request-failed',classification:'response-refused',phase:'response',reason});}catch{finish(Error('record failed'));return;}finish(Error('response refused'));};
   const abort=()=>{req?.destroy();finish(Error('aborted'));};
   // All routing and TLS fields are fixed here, not taken from SDK headers or caller options.
   try {req=request({protocol:'https:',hostname:'chatgpt.com',port:443,path:'/backend-api/codex/responses',method:'POST',agent,servername:'chatgpt.com',rejectUnauthorized:true,checkServerIdentity,ca:[...rootCertificates],minVersion:'TLSv1.2',headers:{authorization:`Bearer ${credential.access}`,'chatgpt-account-id':credential.accountId,originator:'pi','user-agent':'skill-harness-codex-host','openai-beta':'responses=experimental',accept:'text/event-stream','accept-encoding':'identity','content-type':'application/json','content-length':body.length,...(wire.encoding?{'content-encoding':wire.encoding}:{})}},res=>{
    // Node's internal end listener can detach res.socket before our end listener.
    // Retain the original socket, not a later nullable/replaced IncomingMessage reference.
    const socket=res.socket as TLSSocket|null,tlsAuthorized=socket?.authorized===true;
    phase='response';const chunks:Buffer[]=[];let bytes=0;
    try{record({type:'http-response-observed',phase:'headers',status:res.statusCode??0,providerInternalFacts:null});}catch{req?.destroy();finish(Error('record failed'));return;}
    res.on('error',fail);
    res.on('aborted',()=>refuse('response-aborted'));
    res.on('close',()=>{if(!settled)refuse('response-closed');});
    res.on('data',(chunk:Buffer)=>{if(settled)return;bytes+=chunk.length;if(bytes>limits.responseBytes){refuse('response-byte-limit');return;}chunks.push(Buffer.from(chunk));});
    res.on('end',()=>{if(settled)return;try {
     if(!written){refuse('write-incomplete');return;}
     if(!tlsAuthorized||socket?.authorized!==true){refuse('tls-unverified');return;}
     if(res.complete!==true||res.aborted){refuse('message-incomplete');return;}
     if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){refuse('response-encoding');return;}
     const raw=Buffer.concat(chunks),status=res.statusCode??0;
     // Inspect reflections before ANY body digest or structured refusal is recorded, at all statuses.
     let parsed:unknown;try{parsed=JSON.parse(raw.toString('utf8'));}catch{/* Non-JSON refusal fields remain unknown; no parser error text is retained. */}
     const decoded=parsed===undefined?'':JSON.stringify(parsed);
     if([credential.access,credential.accountId].some(value=>raw.includes(Buffer.from(value))||decoded.includes(value))){refuse('credential-reflection');return;}
     if(status>=300&&status<400){refuse('redirect');return;}
     const response=status===200?new Response(raw,{status,headers:{'content-type':String(res.headers['content-type']??'')}}):new Response(JSON.stringify({error:{message:'subscription request refused'}}),{status:status>=400&&status<=599?status:502,headers:{'content-type':'application/json'}});
     record({type:'http-response-observed',status,bodyBytes:raw.length,bodySha256:hash(raw),tlsAuthorized:true,complete:true,serverName:'chatgpt.com',providerInternalFacts:null,...(status!==200?{refusal:refusalMetadata(parsed)}:{})});
     finish(undefined,response);
    }catch{refuse('internal-completion');}});
   });}catch(error){fail(error);return;}
   if(settled){req.destroy();return;}
   // Last entered phase, not a claim that DNS/connect/TLS caused the error.
   req.once('socket',socket=>{if(settled)return;phase='lookup';socket.once('lookup',error=>{if(!settled&&!error)phase='connect';});socket.once('connect',()=>{if(!settled)phase='tls';});socket.once('secureConnect',()=>{if(!settled)phase='write';});});
   timer=setTimeout(()=>{req?.destroy();finish(Error('deadline'));},limits.callMs);
   req.once('error',fail);
   req.once('finish',()=>{if(settled)return;try{record({type:'http-request-started',requestBytes:body.length,wireSha256:hash(body),meaning:'host write finish, not provider receipt'});written=true;}catch{req?.destroy();finish(Error('record failed'));}});
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}req.end(body);
  });}catch {throw Error('subscription-http-failed');}finally {inFlight=false;agent.destroy();}
 }};
}
