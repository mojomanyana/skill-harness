import { resolve, relative, isAbsolute, sep } from 'node:path';
import { existsSync } from 'node:fs';
import {
  prepareSessionImport, retainSessionImport, readRetainedSessionSource, sessionScope,
  createLearningWorkspace, openLearningWorkspace, learningFile,
  type SessionSourceSelection,
} from '@skill-harness/adapters';
import type { LearningUI } from './learning.js';

const text=(v:unknown,label:string)=>{if(typeof v!=='string'||!v.trim())throw Error(label+' is required');return v;};
export const SESSION_HELP = [
'Session learning — retrospective, no model calls',
'  learning session preview --session FILE [--ledger FILE --feedback FILE --artifact FILE]',
'      [--sources FILE]                    additional explicit {kind,path,executionId?} selections',
'  learning session import --session FILE ... --name NAME --title TEXT',
'      --expected DIGEST --confirm [--archive DIR --author NAME for a new workspace]',
'  learning session list',
'  learning session show NAME              timeline excerpts, model/tool/usage evidence and gaps',
'  learning session source NAME --item N   complete selected retained source, display only',
'  learning session note NAME --kind finding|proposal|acceptance|context --note TEXT',
'      --item N --line N --confirm         operator annotation, not calibrated quality or adoption',
'Use --state DIR to select a learning workspace; --json returns structured readback.',
'Preview writes nothing. Import retains exact selected bytes privately, including potentially sensitive',
'session content. Inspect selected files before confirming. No automatic discovery, redaction or export.',
'A changed preview needs a new digest. No running worker is contacted.',
].join('\n');

export function formatSession(view:ReturnType<ReturnType<typeof openLearningWorkspace>['session']>):string {
  const p=view.parent;
  const lines=['Session — '+view.title,'Session ID: '+p.sessionId,'Snapshot: '+view.selectionDigest,
    'Retrospective evidence; quality and acceptance are not inferred.',
    p.userMessages+' user messages · '+p.assistantMessages+' assistant messages · '+view.attempts.length+' ledger executions · '+view.children.length+' child transcripts',
    'Last assistant stop: '+(p.lastAssistantStop??'unknown')+' (not a completion or acceptance receipt)',
    '', 'Models observed:',...p.modelRecords.map(m=>'  '+m.provider+'/'+m.model+': '+m.messages+' assistant records'),
    '', 'Parent usage — reported sums only; not billing or combined child usage:',
    ...Object.entries(p.usage.fields).map(([k,v])=>'  '+k+': '+v.sum+' ('+v.reportedMessages+'/'+p.assistantMessages+' messages reported)'),
    '', 'Delegations — operator-selected ledger, association not authenticated:',
    ...view.attempts.map(a=>'  '+a.executionId+' · '+(a.agent??'unknown')+' · '+a.state+' · '+(a.runningSeconds??'?')+' s · '+(a.pane??'no pane')),
    '', 'Child transcripts — separately reported, no combined token total:',
    ...view.children.flatMap(c=>[
      '  Source '+(c.source+1)+' · '+c.session.sessionId+' · '+(c.executionId??'unmapped execution'),
      '  Last assistant stop: '+(c.session.lastAssistantStop??'unknown')+' (not acceptance)',
      ...c.session.modelRecords.map(m=>'    '+m.provider+'/'+m.model+': '+m.messages+' assistant records'),
      ...Object.entries(c.session.usage.fields).map(([k,v])=>'    '+k+': '+v.sum+' ('+v.reportedMessages+'/'+c.session.assistantMessages+' messages reported)'),
      ...c.session.timeline.map(e=>'    line '+e.line+' · '+e.kind+': '+e.excerpt),
    ]),
    '', 'Sources — use session source NAME --item N for complete retained bytes:',
    ...view.sources.map((s,i)=>'  '+(i+1)+'. '+s.kind+': '+s.path+' ('+s.bytes+' bytes; '+s.sha256+')'),
    '', 'Chronological visible timeline — excerpts, not a complete artifact review:',
    ...p.timeline.map(e=>'  '+(e.timestamp??'unknown time')+' · line '+e.line+' · '+e.kind+': '+e.excerpt),
    '', 'Operator annotations — not automatically verified labels:',
    ...view.annotations.map(a=>'  '+a.kind+' · source '+a.item+', line '+a.line+' · '+a.author+': '+a.note),
    '', 'Evidence gaps:',...view.gaps.map(g=>'  - '+g)];
  return lines.join('\n');
}
type Flags=Record<string,string|boolean>;
export async function runSessionLearning(args:string[],flags:Flags,options:{cwd:string;directory:string;emit:(v:unknown)=>unknown}) {
  const {cwd,directory,emit}=options,[verb,name]=args;
  const allowed:Record<string,string[]>={preview:['session','ledger','feedback','artifact','sources'],import:['session','ledger','feedback','artifact','sources','name','title','expected','archive','author'],list:[],show:[],source:['item'],note:['kind','note','item','line']};
  if(!verb||verb==='help')return emit(SESSION_HELP);
  if(!Object.hasOwn(allowed,verb)||args.length>(['show','source','note'].includes(verb)?2:1))throw Error('unknown session command; use learning session help');
  for(const key of Object.keys(flags))if(!['state','json','confirm','help',...allowed[verb]].includes(key))throw Error('unsupported session option: --'+key);
  if(verb==='preview'||verb==='import'){
    const selections:SessionSourceSelection[]=[];
    if(flags.session)selections.push({kind:'parent',path:resolve(cwd,text(flags.session,'--session'))});
    for(const kind of ['ledger','feedback','artifact'] as const)if(flags[kind])selections.push({kind,path:resolve(cwd,text(flags[kind],'--'+kind))});
    if(flags.sources){
      const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(learningFile(resolve(cwd,text(flags.sources,'--sources')),65536)));
      if(!Array.isArray(raw))throw Error('source selection file must be an array');
      for(const s of raw) {
        if(!s||typeof s!=='object'||typeof s.path!=='string')throw Error('invalid source selection');
        selections.push({...s,path:resolve(cwd,s.path)});
      }
    }
    const preview=prepareSessionImport(selections);
    const summary={state:'preview',digest:preview.digest,sources:preview.sources,sessionId:preview.parent.sessionId,
      userMessages:preview.parent.userMessages,assistantMessages:preview.parent.assistantMessages,
      executions:preview.attempts.length,childTranscripts:preview.children.length,gaps:preview.gaps,
      privacy:'Exact source bytes, potentially sensitive, will be retained privately. Inspect sources first; no automatic redaction or publication.',
      next:'Repeat import with --expected '+preview.digest+' --confirm after reviewing the selected inputs.'};
    if(verb==='preview'||flags.confirm!==true)return emit(summary);
    if(flags.expected!==preview.digest)throw Error('exact preview digest required; re-preview changed inputs');
    const label=text(flags.name,'--name'),title=text(flags.title,'--title');
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(label)||title.length>512)throw Error('bounded session name/title required');
    let workspace:ReturnType<typeof openLearningWorkspace>;
    if(existsSync(directory)){
      if(flags.archive||flags.author)throw Error('existing workspace already binds archive and author');
      workspace=openLearningWorkspace(directory);
    }else{
      const archiveRoot=resolve(cwd,text(flags.archive,'--archive for new workspace')),author=text(flags.author,'--author for new workspace');
      const archiveRelative=relative(directory,archiveRoot);
      if(!archiveRelative||(!isAbsolute(archiveRelative)&&archiveRelative!=='..'&&!archiveRelative.startsWith('..'+sep)))throw Error('archive must be outside the workspace journal directory');
      workspace=createLearningWorkspace(directory,{archiveRoot,author,population:'pi-session:'+preview.parent.sessionId,scopeDigest:sessionScope(preview.parent,preview.sources.find(s=>s.kind==='parent')!.sha256)});
    }
    const previous=workspace.sessions().find(s=>s.name===label);
    if(previous){
      const old=workspace.session(label);
      if(old.selectionDigest!==preview.digest||old.title!==title)throw Error('session name already bound; use a new name for changed evidence');
      return emit({state:'already-retained',name:label,manifestId:old.manifestId});
    }
    const manifestId=retainSessionImport(workspace.configuration().archiveRoot,preview,preview.digest);
    workspace.bindSession({name:label,title,manifestId});
    return emit({state:'retained',name:label,manifestId,sources:preview.sources.length,acceptance:'not-assessed',next:'learning session show '+label});
  }
  const workspace=openLearningWorkspace(directory);
  if(verb==='list')return emit(workspace.sessions());
  const view=workspace.session(text(name,'session name'));
  if(verb==='show')return emit(flags.json?view:formatSession(view));
  const item=Number(flags.item);
  if(!Number.isSafeInteger(item)||item<1||item>view.sources.length)throw Error('select a listed source with --item N');
  if(verb==='source')return emit(new TextDecoder('utf-8',{fatal:true}).decode(readRetainedSessionSource(workspace.configuration().archiveRoot,view.manifestId,item-1)));
  const kind=text(flags.kind,'--kind'),note=text(flags.note,'--note'),line=Number(flags.line);
  if(!['finding','proposal','acceptance','context'].includes(kind)||note.length>4000||!Number.isSafeInteger(line)||line<1)throw Error('bounded annotation and evidence line required');
  if(flags.confirm!==true)return emit({state:'confirmation-required',name,item,line,kind,note,meaning:'operator annotation only; no trust/adoption authority'});
  return emit(workspace.noteSession(name!,{kind:kind as 'finding'|'proposal'|'acceptance'|'context',note,item,line}));
}
export async function reviewSessionLearning(directory:string,ui:LearningUI,display:(s:string)=>string) {
  const w=openLearningWorkspace(directory),name=await ui.select('Retained sessions',w.sessions().map(s=>s.name));if(!name)return;
  const view=w.session(name);
  await ui.editor('Session assessment — display only',display(formatSession(view)));
  for(;;){
    const choices=view.sources.map((s,i)=>(i+1)+'. '+s.kind+': '+s.path),selected=await ui.select('Complete retained evidence (may contain sensitive text)',[...choices,'Done']);
    if(!selected||selected==='Done')return;
    const index=choices.indexOf(selected);if(index<0)throw Error('select a listed retained source');
    await ui.editor('Exact source — changes discarded',display(new TextDecoder('utf-8',{fatal:true}).decode(readRetainedSessionSource(w.configuration().archiveRoot,view.manifestId,index))));
  }
}
