import {readFileSync,realpathSync,lstatSync,mkdirSync,existsSync} from 'node:fs';
import {isAbsolute,resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {learningHash,learningCopy} from './learning-journal.js';
import type {CodexSdkBinding} from './codex-sdk-transport.js';

export interface InstalledReviewSession {
 version:'installed-review-session-v1'; root:string; runRoot:string;
 resources:{kind:string;path:string;sha256:string}[]; subjectId:string; judgeId:string;
}
export type ReviewRole='subject'|'judge';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
function closed(v:object,keys:string[]){if(!v||Array.isArray(v)||Object.keys(v).sort().join()!==keys.sort().join())throw Error('closed installed review required');}
function canonical(p:string){if(typeof p!=='string'||!isAbsolute(p)||resolve(p)!==p||realpathSync(p)!==p)throw Error('installed resource canonical path required');}
/** Narrow exception for TWO named, isolated installed resources. Never a general .pi pin waiver. */
export function validateInstalledReviewSession(p:InstalledReviewSession){
 closed(p,['version','root','runRoot','resources','subjectId','judgeId']);
 if(p.version!=='installed-review-session-v1'||p.root.split('/').includes('.pi')||p.runRoot.split('/').includes('.pi')||p.root!==join(dirname(p.runRoot),'installed')||!isAbsolute(p.runRoot)||resolve(p.runRoot)!==p.runRoot)throw Error('isolated installed roots required');
 canonical(p.root);canonical(dirname(p.runRoot));
 if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.subjectId)||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.judgeId)||p.subjectId===p.judgeId)throw Error('distinct installed role identities required');
 if(!Array.isArray(p.resources)||p.resources.length!==4||p.resources.map(r=>r.kind).join()!=='skill,prompt,extension,extension'||new Set(p.resources.map(r=>r.path)).size!==4)throw Error('exact installed resources required');
 const selected=[join(p.root,'.pi/skills/review/SKILL.md'),join(p.root,'.pi/agents/principal-review.md')];
 p.resources.forEach((r,i)=>{closed(r,['kind','path','sha256']);canonical(r.path);if(i<2?r.path!==selected[i]:r.path.split('/').includes('.pi'))throw Error('forbidden installed resource path');const st=lstatSync(r.path);if(!st.isFile()||st.size> (i<2?16384:8*1024*1024)||!/^[a-f0-9]{64}$/.test(r.sha256)||hash(readFileSync(r.path))!==r.sha256)throw Error('installed resource pin mismatch');});
}
export function installedDelivery(p:InstalledReviewSession,role:ReviewRole){
 return role==='subject'?'\n\n<installed-review-instructions>\n'+p.resources.slice(0,2).map(r=>new TextDecoder('utf8',{fatal:true}).decode(readFileSync(r.path))).join('\n\n')+'\n</installed-review-instructions>':'\n\nAdvisory judgement only; this session cannot authorize adoption or acceptance.';
}
export const installedBase=(p:InstalledReviewSession,role:ReviewRole,base:string)=>base+'\nCurrent working directory: '+join(p.runRoot,role)+'\n';
export const installedInstructions=(p:InstalledReviewSession,role:ReviewRole,base:string)=>installedBase(p,role,base)+installedDelivery(p,role);
function messageText(m:any){
 if(!m||m.role!=='user'||(m.timestamp!==undefined&&(!Number.isSafeInteger(m.timestamp)||m.timestamp<0))||Object.keys(m).some(k=>!['role','content','timestamp'].includes(k)))throw Error('installed user context required');
 if(typeof m.content==='string')return m.content;
 if(!Array.isArray(m.content)||m.content.length!==1||!isDeepStrictEqual(Object.keys(m.content[0]).sort(),['text','type'])||m.content[0].type!=='text'||typeof m.content[0].text!=='string')throw Error('installed text-only context required');
 return m.content[0].text;
}
/** Compare actual post-extension context; timestamps are not provider input. Nothing is dropped from the wire. */
export function assertInstalledContext(c:any,instructions:string,input:string){
 if(!c||Object.keys(c).some(k=>!['systemPrompt','messages','tools'].includes(k))||c.systemPrompt!==instructions||!Array.isArray(c.messages)||c.messages.length!==1||messageText(c.messages[0])!==input||(c.tools!==undefined&&(!Array.isArray(c.tools)||c.tools.length)))throw Error('installed effective context changed/tools/history');
 if(Buffer.byteLength(instructions)+Buffer.byteLength(input)>65536)throw Error('installed context byte bound');
 return learningHash({systemPrompt:c.systemPrompt,messages:[{role:'user',content:input}],tools:[]});
}
export interface InstalledReviewSessions {
 sessionSha256:string;
 bind(role:ReviewRole,base:string,raw:CodexSdkBinding,record:(v:Record<string,unknown>)=>void):CodexSdkBinding;
}
/** SDK is the pinned, installed public SDK module. No SDK/auth import occurs during preparation.
 * This is a per-role adapter for the existing producer exchange, not another budget or retry engine. */
export function createInstalledReviewSessions(raw:InstalledReviewSession,sdk:any):InstalledReviewSessions {
 const p=learningCopy(raw);validateInstalledReviewSession(p);p.resources.forEach(Object.freeze);Object.freeze(p.resources);Object.freeze(p);const used=new Set<string>();
 return {sessionSha256:learningHash(p),bind(role,base,raw,record){
  if(used.has(role))throw Error('installed role reused');used.add(role);
  return {model:raw.model,stream:(_model,seed,options)=>({result:async()=>{
   let session:any,closedSession=false,violation:Error|undefined,invocations=0,before=0,contexts=0,payloads=0,sdkResult:Promise<any>|undefined;
   const ensure=()=>{options.signal.throwIfAborted();if(closedSession||violation)throw violation??Error('installed session closed');};
   const refuse=(message:string):never=>{violation=Error(message);throw violation;};
   const input=messageText(seed.messages[0]),instructions=installedInstructions(p,role,base),cwd=join(p.runRoot,role),agentDir=join(cwd,'agent');
   assertInstalledContext(seed,instructions,input);
   const envKeys=Object.keys(process.env).filter(k=>k.startsWith('PI_GRANTS_')||k==='PI_CODING_AGENT_DIR'),saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
   for(const k of envKeys)delete process.env[k];process.env.PI_CODING_AGENT_DIR=agentDir;process.env.PI_GRANTS_HERDR='0';process.env.PI_GRANTS_GRANT='tool:read';
   let abortReject:(e:Error)=>void=()=>{};
   const aborted=new Promise<never>((_,reject)=>{abortReject=reject;});
   const abort=()=>{closedSession=true;void session?.abort().catch((e:Error)=>{violation=e;});abortReject(Error('installed session deadline'));};options.signal.addEventListener('abort',abort,{once:true});
   try {
    return await Promise.race([aborted,(async()=>{
     ensure();validateInstalledReviewSession(p);if(existsSync(cwd))refuse('installed role occurrence already consumed');mkdirSync(cwd,{mode:0o700});mkdirSync(agentDir,{mode:0o700});
     const settings=sdk.SettingsManager.inMemory({packages:[],compaction:{enabled:false},retry:{enabled:false,maxRetries:0},providerRetry:{maxRetries:0},blockImages:true});
     const loader=new sdk.DefaultResourceLoader({cwd,agentDir,settingsManager:settings,noExtensions:true,noSkills:true,noPromptTemplates:true,noThemes:true,
      additionalExtensionPaths:p.resources.slice(2).map(r=>r.path),additionalSkillPaths:role==='subject'?[p.resources[0].path]:[],additionalPromptTemplatePaths:role==='subject'?[p.resources[1].path]:[],
      agentsFilesOverride:()=>({agentsFiles:[]}),systemPromptOverride:()=>base,appendSystemPromptOverride:()=>'',
      extensionFactories:[{name:'installed-review-v1',factory:(pi:any)=>{
       pi.on('before_agent_start',(event:any)=>{ensure();validateInstalledReviewSession(p);record({type:'session-before-agent-observed',role,systemMatches:event.systemPrompt===installedBase(p,role,base),promptMatches:event.prompt===input,systemSha256:hash(event.systemPrompt),expectedSystemSha256:hash(installedBase(p,role,base))});if(++before!==1||event.systemPrompt!==installedBase(p,role,base)||event.prompt!==input)refuse('installed before-agent context changed');record({type:'session-before-agent',role,sessionId:p[role==='subject'?'subjectId':'judgeId'],resources:p.resources.slice(0,2).map(r=>r.sha256),delivery:role==='subject'});return {systemPrompt:event.systemPrompt+installedDelivery(p,role)};});
       pi.on('context',(event:any)=>{ensure();if(++contexts!==1||event.messages.length!==1||messageText(event.messages[0])!==input)refuse('installed context continuation/changed');record({type:'session-context-hook',role,messages:1});return {messages:event.messages};});
       pi.on('before_provider_request',()=>{ensure();if(++payloads!==1)refuse('installed provider request repeated');record({type:'session-provider-hook',role});});
      }}]});
     await loader.reload();ensure();const loaded=loader.getExtensions();if(loaded.errors.length||loaded.extensions.length!==3||p.resources.slice(2).some(r=>!loaded.extensions.some((e:any)=>(e.resolvedPath??e.path)===r.path)))refuse('installed extensions not loaded');
     if(role==='subject'&&(loader.getSkills().skills.length!==1||loader.getSkills().skills[0].filePath!==p.resources[0].path||loader.getPrompts().prompts.length!==1||loader.getPrompts().prompts[0].filePath!==p.resources[1].path))refuse('installed selected resources not loaded');
     // All ModelRuntime storage is fresh/private; only an INVALID SDK stand-in is ever supplied.
     const standIn={type:'oauth',access:options.apiKey,refresh:'fixture.invalid',expires:Date.now()+3600000,accountId:'fixture-no-account'};
     const credentials={read:async(id:string)=>id==='openai-codex'?standIn:undefined,list:async()=>[{providerId:'openai-codex',type:'oauth'}],modify:async()=>refuse('installed credential mutation/refresh forbidden'),delete:async()=>refuse('installed credential deletion forbidden')};
     const runtime=await sdk.ModelRuntime.create({credentials,modelsPath:join(agentDir,'models.json'),modelsStorePath:join(agentDir,'models-store.json'),allowModelNetwork:false});ensure();
     ({session}=await sdk.createAgentSession({cwd,agentDir,model:raw.model,modelRuntime:runtime,settingsManager:settings,resourceLoader:loader,sessionManager:sdk.SessionManager.inMemory(cwd,{id:p[role==='subject'?'subjectId':'judgeId']}),noTools:'all',thinkingLevel:'low'}));if(closedSession||options.signal.aborted)session.dispose();ensure();
     session.extensionRunner.onError((e:any)=>{violation??=Error('installed extension error: '+e.event);});
     session.agent.streamFunction=async(model:any,actual:any,opts:any)=>{
      ensure();if(++invocations!==1||before!==1||contexts!==1||session.sessionId!==p[role==='subject'?'subjectId':'judgeId']||session.sessionFile!==undefined||model.id!==raw.model.id||model.provider!==raw.model.provider||model.api!==raw.model.api||model.baseUrl!==raw.model.baseUrl||session.getActiveToolNames().length)refuse('installed SDK invocation/model/tools bound');
      validateInstalledReviewSession(p);const contextSha256=assertInstalledContext(actual,instructions,input);
      record({type:'session-sdk-invoked',role,sessionId:session.sessionId,contextSha256,sessionSha256:learningHash(p),tools:[]});
      const result=raw.stream(model,actual,{...opts,...options,onPayload:async(payload:unknown)=>{ensure();validateInstalledReviewSession(p);const processed=await opts.onPayload(payload,model);ensure();if(payloads!==1)refuse('installed provider hook missing');return options.onPayload(processed);},onResponse:opts.onResponse});
      sdkResult=result.result();return result;
     };
     await session.bindExtensions({mode:'print',uiContext:{...session.extensionRunner.createContext().ui,notify:(_message:string,type:string)=>{if(type==='error'||type==='warning')violation=Error('installed startup warning/error');}}});ensure();
     if(session.extensionRunner.hasHandlers('before_provider_headers'))refuse('undeclared installed header transformation');
     if(session.sessionId!==p[role==='subject'?'subjectId':'judgeId']||session.messages.length||session.getActiveToolNames().length)refuse('installed session identity/history/tools');
     record({type:'session-bound',role,sessionId:session.sessionId,extensions:p.resources.slice(2),commands:session.extensionRunner.getRegisteredCommands().map((c:any)=>c.name),history:0,tools:[]});
     await session.prompt(input,{expandPromptTemplates:false});ensure();
     if(invocations!==1||before!==1||contexts!==1||payloads!==1||session.sessionId!==p[role==='subject'?'subjectId':'judgeId']||session.sessionFile!==undefined||!sdkResult||session.messages.length!==2||session.getActiveToolNames().length)refuse('installed awaited prompt/continuation mismatch');
     const result=await sdkResult;ensure();if(!isDeepStrictEqual(session.messages[1],result))refuse('installed session final differs from SDK result');
     record({type:'session-prompt-completed',role,sessionId:session.sessionId,actualSdkCalls:invocations,beforeAgentHooks:before,contextHooks:contexts,providerHooks:payloads});return result;
    })()]);
   } catch(error){record({type:'session-refused',role,reason:violation?.message??'installed SDK/session exception',before,contexts,payloads,invocations});throw error;} finally {closedSession=true;options.signal.removeEventListener('abort',abort);session?.dispose();for(const k of Object.keys(process.env))if(k.startsWith('PI_GRANTS_')||k==='PI_CODING_AGENT_DIR')delete process.env[k];for(const [k,v] of Object.entries(saved))if(v!==undefined)process.env[k]=v;}
  }})};
 }};
}
