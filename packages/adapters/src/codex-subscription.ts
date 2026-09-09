import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { collapseVotePanel } from '@skill-harness/core';
import { Readable } from 'node:stream';
import { learningCopy, learningHash, learningJournal, learningFile } from './learning-journal.js';
import { createLocalCodexHost, openLocalCodexHost, inspectCodexRoleSeparation, type LocalCodexInvocation } from './codex-host-observer.js';
import type { CodexSdkBinding, CodexWire } from './codex-sdk-transport.js';

export const CODEX_RUNTIME_FILES=Object.freeze(['node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js','node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js','node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json','dist/core/auth-storage.js']);
export const SUBSCRIPTION_ENDPOINT='https://chatgpt.com/backend-api/codex/responses';
export interface CodexCharter {
 version:'codex-synthetic-charter-v1'; provider:'openai-codex'; destination:string;
 rolePolicy:Parameters<typeof inspectCodexRoleSeparation>[0];
 identityEvidence:{kind:'fixture'|'unresolved'|'host-resolved';reference:string|null};
 hostEvidence:{kind:'fixture'|'unqualified'|'qualified-host';reference:string|null};
 accountId:string|null; serverOutputTokenCap:null;
 runtime:{sdkRoot:string;oauthFile:string;fingerprints:Record<string,string>};
 limits:{calls:number;requestBytes:number;responseBytes:number;totalRequestBytes:number;totalResponseBytes:number;callMs:number;wallMs:number};
 invocations:LocalCodexInvocation[];
}
/** A trusted-host approval input, not a signature or a user-consent detector.
 * Neither a subject frame nor the charter itself can supply this separate input. */
export interface CodexApproval {scope:'fixture'|'subscription-live';charterSha256:string;approvalId:string;expiresAt:number;journalPath:string}
export interface CodexOAuth {type:'oauth';provider:'openai-codex';access:string;expires:number;accountId:string}
export interface CodexCredentialPort {kind:'fixture-oauth'|'oauth-snapshot';read(signal:AbortSignal):Promise<unknown>}
export interface CodexHttpPort {
 kind:'fixture-http'|'subscription-http'; preflight?():void;
 exchange(wire:CodexWire,credential:CodexOAuth,signal:AbortSignal,record:(v:Record<string,unknown>)=>void,limits:CodexCharter['limits']):Promise<Response>;
}
export interface CodexExecutionPorts {bindings:Record<string,CodexSdkBinding>;credentials:CodexCredentialPort;transport:CodexHttpPort}
const closed=(x:object,keys:string[])=>{if(!x||Object.keys(x).sort().join()!==keys.sort().join())throw Error('invalid execution charter');};
export const codexCharterHash=(charter:CodexCharter)=>learningHash(charter);
export function validateCodexCharter(raw:CodexCharter, approval:CodexApproval|undefined) {
 const c=learningCopy(raw);closed(c,['version','provider','destination','rolePolicy','identityEvidence','hostEvidence','accountId','serverOutputTokenCap','runtime','limits','invocations']);
 if(c.version!=='codex-synthetic-charter-v1'||c.provider!=='openai-codex'||c.destination!==SUBSCRIPTION_ENDPOINT||c.serverOutputTokenCap!==null)throw Error('unsupported execution charter route/server guarantee');
 closed(c.runtime,['sdkRoot','oauthFile','fingerprints']);if(!isAbsolute(c.runtime.sdkRoot)||!isAbsolute(c.runtime.oauthFile)||!c.runtime.fingerprints||!Object.values(c.runtime.fingerprints).every(h=>/^[a-f0-9]{64}$/.test(h)))throw Error('unbound host runtime');
 const l=c.limits;closed(l,['calls','requestBytes','responseBytes','totalRequestBytes','totalResponseBytes','callMs','wallMs']);
 if(!Object.values(l).every(n=>Number.isSafeInteger(n)&&n>0)||l.calls!==5||l.requestBytes>4096||l.responseBytes>16384||l.callMs>30000||l.wallMs>150000||l.totalRequestBytes>20480||l.totalResponseBytes>81920||l.totalRequestBytes<l.requestBytes||l.totalResponseBytes<l.responseBytes)throw Error('invalid aggregate reservation');
 const separation=inspectCodexRoleSeparation(c.rolePolicy);if(separation.state==='BLOCKED')throw Error(separation.reason);
 if(!Array.isArray(c.invocations)||c.invocations.length!==5||c.invocations.map(i=>i.role).join()!=='proposer,subject,judge,judge,judge'||new Set(c.invocations.map(i=>i.id)).size!==5||c.invocations.slice(2).some(i=>i.subjectId!==c.invocations[1].id))throw Error('fixed five-role context policy required');
 if(!approval)throw Error('missing execution approval');closed(approval,['scope','charterSha256','approvalId','expiresAt','journalPath']);
 if(!['fixture','subscription-live'].includes(approval.scope)||approval.charterSha256!==codexCharterHash(c)||typeof approval.approvalId!=='string'||!approval.approvalId||!Number.isSafeInteger(approval.expiresAt)||approval.expiresAt<=Date.now())throw Error('execution approval mismatch/expired');
 for(const e of [c.identityEvidence,c.hostEvidence])closed(e,['kind','reference']);
 if(typeof c.accountId!=='string'||!c.accountId||c.accountId.length>256||/[\r\n]/.test(c.accountId))throw Error('unresolved approved account binding');
 if(approval.scope==='subscription-live'&&Object.keys(c.runtime.fingerprints).sort().join()!==[...CODEX_RUNTIME_FILES].sort().join())throw Error('unpinned production SDK runtime');
 if(approval.scope==='subscription-live'&&(c.identityEvidence.kind!=='host-resolved'||!c.identityEvidence.reference||c.hostEvidence.kind!=='qualified-host'||!c.hostEvidence.reference||c.accountId.startsWith('fixture-')))throw Error('production canonical/host qualification unresolved');
 if(approval.scope==='fixture'&&(c.identityEvidence.kind!=='fixture'||c.hostEvidence.kind!=='fixture'))throw Error('fixture provenance required');
 return c;
}
export function validateCodexOAuth(value:unknown,accountId:string,mode:'fixture'|'subscription-live'):CodexOAuth {
 try {
  const v=value as CodexOAuth;if(v.type!=='oauth'||v.provider!=='openai-codex'||typeof v.access!=='string'||v.access.length>16384||!Number.isFinite(v.expires)||v.expires<=Date.now()||v.accountId!==accountId)throw Error();
  const parts=v.access.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p))||mode==='subscription-live'&&(parts[0]==='fixture'||parts[2]==='invalid'))throw Error();
  const claim=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));if(claim['https://api.openai.com/auth']?.chatgpt_account_id!==accountId)throw Error();
  return {type:'oauth',provider:'openai-codex',access:v.access,expires:v.expires,accountId};
 }catch {throw Error('oauth-credential-unavailable');}
}
/** Lazy read-only SDK storage adapter. list FIRST: an API-key entry never reaches read(),
 * so command/env key helpers are unavailable. Never refresh/modify/login or persist secrets. */
export function createReadOnlyCodexOAuthPort(factory:()=>{list(o?:{signal:AbortSignal}):Promise<Array<{providerId:string;type:string}>>;read(id:string,o?:{signal:AbortSignal}):Promise<any>}):CodexCredentialPort {
 let snapshot:unknown;
 return {kind:'oauth-snapshot',async read(signal){try {signal.throwIfAborted();if(snapshot)return snapshot;const store=factory();const entries=await store.list({signal});if(entries.filter(e=>e.providerId==='openai-codex'&&e.type==='oauth').length!==1||entries.some(e=>e.providerId==='openai-codex'&&e.type!=='oauth'))throw Error();const value=await store.read('openai-codex',{signal});if(value?.type!=='oauth'||typeof value.access!=='string')throw Error();const claim=JSON.parse(Buffer.from(value.access.split('.')[1],'base64url').toString('utf8'));snapshot={type:'oauth',provider:'openai-codex',access:value.access,expires:value.expires,accountId:claim['https://api.openai.com/auth']?.chatgpt_account_id};signal.throwIfAborted();return snapshot;}catch {throw Error('oauth-credential-unavailable');}}};
}

/** Bounded, no-follow read of the explicitly approved file, invoked lazily AFTER approval.
 * Whole JSON is parsed in trusted host memory; only OAuth is returned, never helper resolution. */
export function createCodexOAuthFilePort(path:string):CodexCredentialPort {
 return createReadOnlyCodexOAuthPort(()=>{const data=JSON.parse(learningFile(path,65536).toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid credential snapshot');return {list:async()=>Object.entries(data).map(([providerId,v])=>({providerId,type:(v as any)?.type})),read:async(id:string)=>data[id]};});
}

/** Fixed synthetic evaluation only. Model votes select a conditional third judge, never
 * a worker, grant, production action or adoption. Same journal owns all reservations/results. */
export async function executeCodexQualification(path:string,raw:CodexCharter,rawApproval:CodexApproval|undefined,ports:CodexExecutionPorts) {
 const approval=rawApproval?learningCopy(rawApproval):undefined;
 const c=validateCodexCharter(raw,approval),mode=approval!.scope,hash=codexCharterHash(c);
 if(!isAbsolute(path)||resolve(path)!==path||realpathSync(dirname(path))!==dirname(path)||approval!.journalPath!==path)throw Error('execution approval owner-path mismatch');
 if(ports.credentials.kind!==(mode==='fixture'?'fixture-oauth':'oauth-snapshot')||ports.transport.kind!==(mode==='fixture'?'fixture-http':'subscription-http'))throw Error('fixture/production port mismatch');
 for(const i of c.invocations){const b=ports.bindings[i.model];if(!b||typeof b.stream!=='function'||b.model.id!==i.model||b.model.provider!=='openai-codex'||b.model.api!=='openai-codex-responses'||b.model.baseUrl!=='https://chatgpt.com/backend-api'||b.model.headers&&Object.keys(b.model.headers as object).length)throw Error('unresolved SDK binding');}
 ports.transport.preflight?.();
 const reservation={charterSha256:hash,mode,requestBytes:c.limits.requestBytes,responseBytes:c.limits.responseBytes,totalRequestBytes:c.limits.totalRequestBytes,totalResponseBytes:c.limits.totalResponseBytes,callMs:c.limits.callMs};
 const host=existsSync(path)?openLocalCodexHost(path):createLocalCodexHost(path,{version:'codex-host-local-v1',maxCalls:c.limits.calls,wallMs:Math.min(c.limits.wallMs,approval!.expiresAt-Date.now()),invocations:c.invocations},c.rolePolicy,reservation);
 const store=learningJournal(path),rows=store.read();if(learningHash(rows[0].value.subscription)!==learningHash(reservation)||learningHash(rows[0].value.rolePolicy)!==learningHash(c.rolePolicy))throw Error('frozen execution charter changed');
 const append=(v:Record<string,unknown>)=>store.append(store.read().at(-1)!.id,v);
 const old=rows.find(e=>e.value.type==='subscription-finished');if(old)return old.value;
 if(host.inspect().calls||host.inspect().aborted)throw Error('stranded execution; no retry');
 append({type:'subscription-charter',charter:c,charterSha256:hash,approvalId:approval!.approvalId,executionMode:mode,aggregateReservation:c.limits,liveQualified:false});
 let inFlight=false;
 const transport={kind:ports.transport.kind,exchange:async(wire:CodexWire,signal:AbortSignal,record:(v:Record<string,unknown>)=>void)=>{
  if(inFlight||wire.destination!==SUBSCRIPTION_ENDPOINT||wire.method!=='POST'||wire.body.length>c.limits.requestBytes||approval!.expiresAt<=Date.now())throw Error('subscription preflight refused');
  inFlight=true;try {signal.throwIfAborted();const credential=validateCodexOAuth(await ports.credentials.read(signal),c.accountId!,mode);signal.throwIfAborted();if(approval!.expiresAt<=Date.now())throw Error('execution approval expired before transport');const response=await ports.transport.exchange(wire,credential,signal,record,learningCopy(c.limits));if(response.redirected||response.status>=300&&response.status<400)throw Error('redirect refused');return response;}finally{inFlight=false;}
 }};
 try {
  const exchange=(i:LocalCodexInvocation)=>host.exchangeSubscriptionSdk(Readable.from([JSON.stringify({id:i.id,sequence:1})+'\n']),ports.bindings[i.model],transport,hash);
  for(const i of c.invocations.slice(0,2)){const r=await exchange(i);if(r.objective!=='PASS'){const result={type:'subscription-finished',charterSha256:hash,executionMode:mode,outcome:'objective-failed',calls:host.inspect().calls,liveQualified:false,routingDefault:null};append(result);return result;}}
  await exchange(c.invocations[2]);await exchange(c.invocations[3]);
  // Decide only whether the already-reserved clean-split tie-break is needed.
  const observations=store.read().filter(e=>e.value.type==='observation');const verdicts=observations.slice(-2).map(e=>JSON.parse(Buffer.from(String(e.value.outputBase64),'base64').toString('utf8')));
  const split=collapseVotePanel(verdicts.map((v,k)=>({...v,ordinal:k+1}))).split;const ids=c.invocations.slice(2,4).map(i=>i.id);
  if(split){await exchange(c.invocations[4]);ids.push(c.invocations[4].id);}
  const panel=host.panel(c.invocations[1].id,ids,c.rolePolicy);const result={type:'subscription-finished',charterSha256:hash,executionMode:mode,outcome:'advisory-panel',calls:host.inspect().calls,panel,liveQualified:false,routingDefault:null};append(result);return result;
 }catch {append({type:'abort',reason:'subscription execution failed; no retry',charterSha256:hash});throw Error('subscription-execution-failed');}
}
