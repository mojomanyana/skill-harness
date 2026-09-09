import type { ClientRequest } from 'node:http';
import { Agent, request } from 'node:https';
import { rootCertificates, checkServerIdentity, type TLSSocket } from 'node:tls';
import { createHash } from 'node:crypto';
import { SUBSCRIPTION_ENDPOINT, validateCodexOAuth, type CodexHttpPort } from './codex-subscription.js';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');

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
   const abort=()=>{req?.destroy();finish(Error('aborted'));};
   // All routing and TLS fields are fixed here, not taken from SDK headers or caller options.
   req=request({protocol:'https:',hostname:'chatgpt.com',port:443,path:'/backend-api/codex/responses',method:'POST',agent,servername:'chatgpt.com',rejectUnauthorized:true,checkServerIdentity,ca:[...rootCertificates],minVersion:'TLSv1.2',headers:{authorization:`Bearer ${credential.access}`,'chatgpt-account-id':credential.accountId,originator:'pi','user-agent':'skill-harness-codex-host','openai-beta':'responses=experimental',accept:'text/event-stream','accept-encoding':'identity','content-type':'application/json','content-length':body.length,...(wire.encoding?{'content-encoding':wire.encoding}:{})}},res=>{
    const chunks:Buffer[]=[];let bytes=0;
    try{record({type:'http-response-observed',phase:'headers',status:res.statusCode??0,providerInternalFacts:null});}catch{req?.destroy();finish(Error('record failed'));return;}
    res.on('error',()=>finish(Error('response failed')));
    res.on('aborted',()=>finish(Error('response aborted')));
    res.on('data',(chunk:Buffer)=>{if(settled)return;bytes+=chunk.length;if(bytes>limits.responseBytes){req?.destroy();finish(Error('response byte budget'));return;}chunks.push(Buffer.from(chunk));});
    res.on('end',()=>{if(settled)return;try {const raw=Buffer.concat(chunks),status=res.statusCode??0,socket=res.socket as TLSSocket;
     if(!written||socket.authorized!==true||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity')throw Error('unverified TLS/encoding');
     record({type:'http-response-observed',status,bodyBytes:raw.length,bodySha256:hash(raw),tlsAuthorized:true,serverName:'chatgpt.com',providerInternalFacts:null});
     if(status>=300&&status<400)throw Error('redirect refused');
     if(status!==200){finish(undefined,new Response(JSON.stringify({error:{message:'subscription request refused'}}),{status:status>=400&&status<=599?status:502,headers:{'content-type':'application/json'}}));return;}
     if(raw.includes(Buffer.from(credential.access)))throw Error('credential reflection refused');
     finish(undefined,new Response(raw,{status,headers:{'content-type':String(res.headers['content-type']??'')}}));
    }catch{req?.destroy();finish(Error('response refused'));}});
   });
   if(settled){req.destroy();return;}
   timer=setTimeout(()=>{req?.destroy();finish(Error('deadline'));},limits.callMs);
   req.once('error',()=>{if(settled)return;try{record({type:'http-request-failed',classification:signal.aborted?'aborted':'transport-failure'});}catch{finish(Error('record failed'));return;}finish(Error('request failed'));});
   req.once('finish',()=>{if(settled)return;try{record({type:'http-request-started',requestBytes:body.length,wireSha256:hash(body),meaning:'host write finish, not provider receipt'});written=true;}catch{req?.destroy();finish(Error('record failed'));}});
   signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}req.end(body);
  });}catch {throw Error('subscription-http-failed');}finally {inFlight=false;agent.destroy();}
 }};
}
