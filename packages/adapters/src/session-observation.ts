import { learningHash } from './learning-journal.js';
import { normalizePiDaddyLedgerV3 } from './trajectory.js';

type Row = Record<string, any>;
export interface SessionTimelineEntry { line: number; timestamp: string|null; kind: string; excerpt: string }
export interface SessionObservation {
  version: 'pi-session-observation-v1'; sessionId: string; cwd: string;
  timeline: SessionTimelineEntry[]; toolCalls: Record<string,number>;
  userMessages: number; assistantMessages: number; modelRecords: {provider:string;model:string;messages:number}[];
  usage: {fields:Record<string,{sum:number;reportedMessages:number}>;assistantMessages:number;scope:'this-transcript-only'};
  lastActivity: string|null; lastAssistantStop: string|null; gaps:string[];
}
export function sessionText(bytes:Uint8Array):string {
  if(bytes.byteLength>8*1024*1024)throw Error('session source exceeds 8 MiB');
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function sessionRows(bytes:Uint8Array):Row[] {
  const text=sessionText(bytes);
  if(!text.endsWith('\n'))throw Error('incomplete session/ledger line; retry after the writer settles');
  const lines=text.slice(0,-1).split('\n');
  if(lines.length>4096)throw Error('session source exceeds 4096 records');
  return lines.map((line,i)=>{
    let row:unknown;try{row=JSON.parse(line);}catch{throw Error('invalid JSON record at line '+(i+1));}
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('object record required at line '+(i+1));
    return row as Row;
  });
}
function value(v:unknown,max=512):string {
  if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('bounded session identifier required');
  return v;
}
const stamp=(v:unknown):string|null=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const excerpt=(v:string)=>v.length>512?v.slice(0,512)+' … [excerpt; inspect retained source for complete text]':v;
/** Chronological visible history, including abandoned branches. Never interprets prose as approval. */
export function observePiSession(bytes:Uint8Array):SessionObservation {
  const rows=sessionRows(bytes),header=rows[0];
  if(header?.type!=='session'||header.version!==3)throw Error('Pi session format version 3 required');
  const sessionId=value(header.id),cwd=value(header.cwd,4096),ids=new Set<string>();
  const timeline:SessionTimelineEntry[]=[],tools=new Map<string,number>(),models=new Map<string,{provider:string;model:string;messages:number}>();
  const fields:SessionObservation['usage']['fields']={};
  let userMessages=0,assistantMessages=0,lastAssistantStop:string|null=null,lastActivity:string|null=null,opaque=0;
  const add=(i:number,row:Row,kind:string,text:string)=>timeline.push({line:i+1,timestamp:stamp(row.timestamp),kind,excerpt:excerpt(text)});
  rows.forEach((row,i)=>{
    if(i&&row.type==='session')throw Error('multiple session headers');
    if(row.id!==undefined){const id=value(row.id);if(ids.has(id))throw Error('duplicate session record id');ids.add(id);}
    lastActivity=stamp(row.timestamp)??lastActivity;
    if(row.type==='model_change'){add(i,row,'model-setting',[row.provider,row.modelId].filter(x=>typeof x==='string').join('/'));return;}
    if(row.type==='thinking_level_change'){add(i,row,'thinking-setting',String(row.thinkingLevel??'unknown'));return;}
    if(row.type!=='message')return;
    const m=row.message;if(!m||typeof m!=='object'||Array.isArray(m))throw Error('invalid session message');
    const content=typeof m.content==='string'?[{type:'text',text:m.content}]:m.content;
    if(!Array.isArray(content))throw Error('invalid session message content');
    const text=content.filter(c=>c?.type==='text'&&typeof c.text==='string').map(c=>c.text).join('\n');
    if(m.role==='user'){userMessages++;add(i,row,'user-message',text);}
    else if(m.role==='assistant'){
      assistantMessages++;lastAssistantStop=typeof m.stopReason==='string'?m.stopReason:null;
      const provider=typeof m.provider==='string'?m.provider:'unknown',model=typeof m.model==='string'?m.model:'unknown';
      const key=JSON.stringify([provider,model]),record=models.get(key)??{provider,model,messages:0};record.messages++;models.set(key,record);
      if(text)add(i,row,'assistant-message',text);
      for(const field of ['input','output','cacheRead','cacheWrite','totalTokens']){
        const n=m.usage?.[field];if(n===undefined)continue;
        if(!Number.isSafeInteger(n)||n<0)throw Error('invalid provider-reported usage');
        const f=fields[field]??{sum:0,reportedMessages:0};f.sum+=n;f.reportedMessages++;
        if(!Number.isSafeInteger(f.sum))throw Error('usage sum overflow');fields[field]=f;
      }
      for(const c of content)if(c?.type==='toolCall'){
        const name=value(c.name,128);tools.set(name,(tools.get(name)??0)+1);add(i,row,'tool-call',name);
      }
    }else if(m.role==='toolResult')add(i,row,'tool-result',String(m.toolName??'unknown')+(m.isError===true?' — tool reported error':' — result recorded; success not inferred'));
    else opaque++;
  });
  const gaps=[
    'Retrospective chronological transcript; branch selection and live continuity are not established.',
    'Messages and tool results are evidence to inspect, not independently verified decisions, tests or acceptance.',
    'Only explicit inputs are captured. Source revision, initial workspace and external user feedback may be missing.',
    'Usage is provider-reported repeated-request usage, not unique context, billing or complete parent/child accounting.',
  ];
  if(opaque)gaps.push(opaque+' message(s) with other roles omitted from the timeline; retained source is complete.');
  if(!assistantMessages||Object.values(fields).some(f=>f.reportedMessages<assistantMessages)||Object.keys(fields).length<5)gaps.push('Usage fields are missing; sums cover only reported messages.');
  if(lastAssistantStop!=='stop')gaps.push('No final assistant stop observed; this snapshot may represent unfinished work.');
  return {version:'pi-session-observation-v1',sessionId,cwd,timeline,toolCalls:Object.fromEntries(tools),userMessages,assistantMessages,modelRecords:[...models.values()],usage:{fields,assistantMessages,scope:'this-transcript-only'},lastActivity,lastAssistantStop,gaps};
}
export interface SessionAttempt {
  executionId:string; parentExecutionId:string|null; logicalChildId:string; agent:string|null;
  state:string; pane:string|null; startedAt:string|null; endedAt:string|null; runningSeconds:number|null;
}
export function observeSessionLedger(bytes:Uint8Array):SessionAttempt[] {
  const rows=sessionRows(bytes);normalizePiDaddyLedgerV3(sessionText(bytes));
  const attempts=new Map<string,SessionAttempt>(),decisions=new Set<string>(),lifecycles=new Set<string>(),deadlines=new Map<string,string>(),displayed=new Set<string>();
  for(const row of rows){
    if(!['capability_decision','child_lifecycle','workspace_lease'].includes(row.event)||String(row.childId).startsWith('check:'))continue;
    const id=value(row.executionId),old=attempts.get(id);
    if(old&&(old.parentExecutionId!==row.parentExecutionId||old.logicalChildId!==row.childId))throw Error('execution identity changed');
    const a:SessionAttempt=old??{executionId:id,parentExecutionId:row.parentExecutionId,logicalChildId:row.childId,agent:null,state:'unknown',pane:null,startedAt:null,endedAt:null,runningSeconds:null};
    if(row.event==='workspace_lease'){attempts.set(id,a);continue;}
    displayed.add(id);
    if(row.event==='capability_decision'){
      if(decisions.has(id))throw Error('duplicate capability decision for one execution');
      decisions.add(id);a.agent=row.agentType;a.state=row.blocked?'refused':a.state==='unknown'?'authorised':a.state;
    }
    else {
      if(a.endedAt)throw Error('lifecycle after terminal execution');
      if(lifecycles.has(id)&&row.state==='starting')throw Error('duplicate starting lifecycle event');
      if(deadlines.has(id)&&stamp(row.deadlineAt)&&deadlines.get(id)!==row.deadlineAt)throw Error('lifecycle deadline changed');
      if(stamp(row.deadlineAt))deadlines.set(id,row.deadlineAt);
      lifecycles.add(id);
      a.state=row.state;a.pane=row.herdrPaneId??a.pane;
      if(row.state==='running')a.startedAt=a.startedAt??row.ts;
      if(['completed','failed'].includes(row.state))a.endedAt=row.ts;
    }
    if(a.startedAt&&a.endedAt){a.runningSeconds=(Date.parse(a.endedAt)-Date.parse(a.startedAt))/1000;if(a.runningSeconds<0)throw Error('negative execution duration');}
    attempts.set(id,a);
  }
  for(const a of attempts.values()){
    const seen=new Set<string>();let cursor:SessionAttempt|undefined=a;
    while(cursor){if(seen.has(cursor.executionId))throw Error('execution parent cycle');seen.add(cursor.executionId);cursor=cursor.parentExecutionId?attempts.get(cursor.parentExecutionId):undefined;}
  }
  return [...attempts.values()].filter(a=>displayed.has(a.executionId));
}
export function sessionScope(observation:SessionObservation,sourceSha256:string):string {
  return learningHash({kind:'retrospective-pi-session',sessionId:observation.sessionId,sourceSha256});
}
