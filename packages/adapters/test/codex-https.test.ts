import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const fixture=vi.hoisted(()=>({request:vi.fn(),options:null as any,status:200,body:'fixture output',authorized:true,throwRequest:false,requests:0}));
vi.mock('node:https',()=>({Agent:class {destroy(){}},request:(options:any,callback:any)=>fixture.request(options,callback)}));
import { createCodexHttpsPort, createCodexReviewHttpsPort } from '../src/codex-https.js';
const wire=()=>({destination:'https://chatgpt.com/backend-api/codex/responses',method:'POST' as const,body:Buffer.from('{}'),encoding:null});
const limits={calls:5,requestBytes:4096,responseBytes:16384,totalRequestBytes:20480,totalResponseBytes:81920,callMs:1000,wallMs:5000};
const credential=()=>({type:'oauth' as const,provider:'openai-codex' as const,accountId:'unit-account',expires:Date.now()+60000,access:Buffer.from('{"alg":"RS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({'https://api.openai.com/auth':{chatgpt_account_id:'unit-account'}})).toString('base64url')+'.'+Buffer.from('invalid-unit-signature').toString('base64url')});
beforeEach(()=>{for(const k of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_EXTRA_CA_CERTS','NODE_TLS_REJECT_UNAUTHORIZED'])vi.stubEnv(k,'');fixture.status=200;fixture.body='fixture output';fixture.authorized=true;fixture.throwRequest=false;fixture.requests=0;fixture.request.mockImplementation((options,callback)=>{fixture.requests++;fixture.options=options;if(fixture.throwRequest)throw Error('DO_NOT_RETAIN');const req:any=new EventEmitter();req.destroy=vi.fn();req.end=()=>{queueMicrotask(()=>{req.emit('finish');const res:any=new EventEmitter();res.statusCode=fixture.status;res.headers={'content-type':'text/event-stream'};res.socket={authorized:fixture.authorized};res.complete=true;res.aborted=false;callback(res);res.emit('data',Buffer.from(fixture.body));res.emit('end');});};return req;});});
afterEach(()=>vi.unstubAllEnvs());
it.each([['request','EACCES'],['lookup','ENOTFOUND'],['connect','ECONNREFUSED'],['tls','CERT_HAS_EXPIRED'],['write','ECONNRESET'],['response','ETIMEDOUT']])('records only bounded code and last entered %s phase',async (phase,code)=>{
 const secret='SECRET_MESSAGE_ADDRESS_HEADER_TOKEN';const error=Object.assign(new Error(secret),{code,hostname:secret});
 fixture.request.mockImplementation((_options,callback)=>{if(phase==='request')throw error;const req:any=new EventEmitter(),socket=new EventEmitter();req.destroy=vi.fn();req.end=()=>queueMicrotask(()=>{req.emit('socket',socket);if(phase!=='lookup')socket.emit('lookup',null);if(['tls','write','response'].includes(phase))socket.emit('connect');if(['write','response'].includes(phase))socket.emit('secureConnect');if(phase==='response'){const res:any=new EventEmitter();res.statusCode=200;res.headers={};callback(res);res.emit('error',error);}else req.emit('error',error);});return req;});
 const records:any[]=[];await expect(createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,v=>records.push(v),limits)).rejects.toThrow(/^subscription-http-failed$/);
 expect(records.find(r=>r.type==='http-request-failed')).toEqual({type:'http-request-failed',classification:'transport-failure',phase,errorCode:code});expect(JSON.stringify(records)).not.toContain(secret);
});
it.each(['NEW_SECRET_CODE',undefined,7])('maps unrecognized error code %s to unknown without leaking it',async code=>{
 fixture.request.mockImplementation(()=>{throw Object.assign(new Error('SECRET'),{code});});const records:any[]=[];
 await expect(createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,v=>records.push(v),limits)).rejects.toThrow(/^subscription-http-failed$/);
 expect(records).toEqual([{type:'http-request-failed',classification:'transport-failure',phase:'request',errorCode:'unknown'}]);
});
it('does not invoke an error code getter; recording failure still rejects',async()=>{
 const getter=vi.fn(()=>{throw Error('SECRET');});fixture.request.mockImplementation(()=>{throw Object.defineProperty(new Error('SECRET'),'code',{get:getter});});
 const port=createCodexHttpsPort();await expect(port.exchange(wire(),credential(),new AbortController().signal,()=>{throw Error('SECRET_RECORDER');},limits)).rejects.toThrow(/^subscription-http-failed$/);expect(getter).not.toHaveBeenCalled();
 fixture.request.mockImplementation(()=>{throw Object.assign(new Error('SECRET'),{code:'ECONNRESET'});});const records:any[]=[];
 await expect(port.exchange(wire(),credential(),new AbortController().signal,v=>records.push(v),limits)).rejects.toThrow(/^subscription-http-failed$/);expect(records[0].errorCode).toBe('ECONNRESET');
});
it('admits larger review requests only through the explicit review port, with bounded bytes and no retries',async()=>{
 const request={...wire(),body:Buffer.alloc(21489,120)},caps={...limits,requestBytes:65536};
 await expect(createCodexHttpsPort().exchange(request,credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();expect(fixture.requests).toBe(0);
 expect((await createCodexReviewHttpsPort().exchange(request,credential(),new AbortController().signal,()=>{},caps)).status).toBe(200);expect(fixture.requests).toBe(1);
 await expect(createCodexReviewHttpsPort().exchange({...request,body:Buffer.alloc(65537)},credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();expect(fixture.requests).toBe(1);
 fixture.throwRequest=true;await expect(createCodexReviewHttpsPort().exchange(request,credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();expect(fixture.requests).toBe(2);
});
it('keeps the legacy response bound while bounding larger review SSE framing',async()=>{
 const caps={...limits,requestBytes:65536,responseBytes:262144};fixture.body='x'.repeat(20000);
 await expect(createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();expect(fixture.requests).toBe(0);
 expect((await createCodexReviewHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},caps)).status).toBe(200);expect(fixture.requests).toBe(1);
 fixture.body='x'.repeat(262145);await expect(createCodexReviewHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();expect(fixture.requests).toBe(2);
});
it('review HTTP refuses API keys, expiry, destination and proxy changes before requests',async()=>{
 const caps={...limits,requestBytes:65536};const p=createCodexReviewHttpsPort();
 for(const c of [{...credential(),type:'api_key'},{...credential(),expires:0}])await expect(p.exchange(wire(),c as any,new AbortController().signal,()=>{},caps)).rejects.toThrow();
 await expect(p.exchange({...wire(),destination:'https://example.invalid'},credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();vi.stubEnv('HTTPS_PROXY','http://fixture.invalid');await expect(p.exchange(wire(),credential(),new AbortController().signal,()=>{},caps)).rejects.toThrow();expect(fixture.requests).toBe(0);
});
it('pins native HTTPS method/host/path/TLS and does not use an SDK/global fetch destination',async()=>{const result=await createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},limits);expect(await result.text()).toBe('fixture output');expect(fixture.requests).toBe(1);expect(fixture.options).toMatchObject({protocol:'https:',hostname:'chatgpt.com',port:443,path:'/backend-api/codex/responses',method:'POST',servername:'chatgpt.com',rejectUnauthorized:true,minVersion:'TLSv1.2'});expect(typeof fixture.options.checkServerIdentity).toBe('function');expect(fixture.options.ca.length).toBeGreaterThan(0);});
it('refuses destination/proxy/API-key substitutions without requesting',async()=>{const port=createCodexHttpsPort();await expect(port.exchange({...wire(),destination:'https://example.invalid/'},credential(),new AbortController().signal,()=>{},limits)).rejects.toThrow();await expect(port.exchange(wire(),{...credential(),type:'api_key'} as any,new AbortController().signal,()=>{},limits)).rejects.toThrow();vi.stubEnv('HTTPS_PROXY','http://fixture.invalid');await expect(port.exchange(wire(),credential(),new AbortController().signal,()=>{},limits)).rejects.toThrow();expect(fixture.requests).toBe(0);});
it('does not follow redirects or accept unverified TLS',async()=>{for(const bad of ['redirect','tls']){fixture.status=bad==='redirect'?302:200;fixture.authorized=bad!=='tls';await expect(createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},limits)).rejects.toThrow('subscription-http-failed');}expect(fixture.requests).toBe(2);});
it('retains status/hash but strips raw auth/quota error payloads before SDK decoding',async()=>{for(const status of [401,429]){fixture.status=status;fixture.body='DO_NOT_RETAIN';const records:any[]=[];const result=await createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,v=>records.push(v),limits);expect(result.status).toBe(status);expect(await result.text()).not.toContain('DO_NOT_RETAIN');expect(JSON.stringify(records)).not.toContain('DO_NOT_RETAIN');expect(records.some(r=>r.bodySha256&&r.status===status)).toBe(true);}});
it('sanitizes synchronous request failure and enforces the response byte bound',async()=>{fixture.throwRequest=true;await expect(createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},limits)).rejects.toThrow(/^subscription-http-failed$/);fixture.throwRequest=false;fixture.body='x'.repeat(20);await expect(createCodexHttpsPort().exchange(wire(),credential(),new AbortController().signal,()=>{},{...limits,responseBytes:10})).rejects.toThrow('subscription-http-failed');});
