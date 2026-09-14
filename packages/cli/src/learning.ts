import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import {
  createLearningWorkspace, openLearningWorkspace, catalogLearningArchive, learningHash, learningFile,
  retainArchiveSource, previewLearningTrust, configureLearningTrust, previewLearningCaseLabel,
  trustOutcomeDigest, type LearningTrustSetup, type LearningDecisionRequest,
} from '@skill-harness/adapters';
import type { BlindQualityChoice, WorkCaseDisposition } from '@skill-harness/core';

export interface LearningUI {
  select(title: string, choices: string[]): Promise<string|undefined>;
  input(title: string, initial?: string): Promise<string|undefined>;
  editor(title: string, text: string): Promise<string|undefined>;
  confirm(title: string, detail: string): Promise<boolean>;
  notify(text: string, level?: 'info'|'warning'|'error'): void;
}
export const LEARNING_HELP = `Learning — retained evidence, no model calls
  learning                         open guided review (interactive terminal)
  learning init --archive DIR --author NAME [--scope-item N] --confirm
      [--scope TEXT --population TEXT only for a comparison-only archive without retained cases]
  learning status [--json]          readiness; never automatic exposure
  learning import                  list retained batches/comparisons
  learning import --item N --name NAME --title TEXT --scope-note TEXT --confirm
  learning cases NAME [--offset N]
  learning evidence NAME --item N [--evidence N]   inspect only the selected case's retained sources
  learning case NAME --item N --disposition confirmed_defect|expected_behavior|exemplar|uncertain|skip --note TEXT --confirm
  learning comparisons
  learning review NAME             guided complete-output review in a terminal
  learning artifact NAME --variant A [--artifact N]
  learning choose NAME --kind one|tie|none|insufficient [--variants A,B] --full-review --note TEXT --confirm
  learning reveal NAME             requires durable full-scope quality receipt
  learning decide NAME --disposition adopt|reject|defer --note TEXT --confirm
  learning hypothesis NAME --name SLUG --intervention TEXT --prediction TEXT --disproof TEXT --downside TEXT --rollback TEXT --alternative TEXT --confirm
  learning link NAME --cases BATCH --item N --hypothesis SLUG --confirm
  learning trust sample FILE --name SLUG --title TEXT [--split calibration|heldout|tuning] --confirm
  learning trust setup --cases NAME [--detector ID] [--split calibration|heldout|tuning] [--max-unflagged N]
      [--attention N --minimum-resolved N --minimum-lower-bound T --expires DAYS] --confirm
  learning trust status
  learning trust label --cases NAME --item N --reference-author NAME --confirm
  learning trust unflagged --item N --miss yes|no --evidence FILE --reference-author NAME --note TEXT --confirm
  learning adoption NAME           scope/decision/readiness; activation is producer-owned
  learning outcome NAME            inspect observed outcomes
  learning outcome NAME --result success|confirmed-defect|unknown --artifact FILE --original-requirement FILE --current-requirement FILE --evidence FILE --reference-author NAME --note TEXT [--accepted-artifact FILE --acceptance-evidence FILE] --confirm
  learning guide | current         installed portable guide / requirement register
All commands accept --state DIR (default .skill-harness/learning), --json for structured output.
--confirm authorizes only the displayed local write, never models, acceptance or registry activation.
No raw manifest authoring. Import selects actual retained inputs. Exit zero is command completion, not quality.
Registry activation/rollback use the connected pi-daddy learning controls and their independent authority.`;

/** Escape terminal control/format characters in untrusted retained display text. Exact archive
 * bytes never change; output honestly identifies this as a display representation. */
export function learningDisplay(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,'0')}`);
}
function parse(argv: string[]) {
  const args:string[]=[],flags:Record<string,string|boolean>={};
  for(let i=0;i<argv.length;i++) {
    const token=argv[i]; if(!token.startsWith('--')) {args.push(token);continue;}
    const eq=token.indexOf('='),key=token.slice(2,eq<0?undefined:eq);
    if(!key || Object.hasOwn(flags,key)) throw Error('duplicate or empty learning option');
    if(eq>=0) flags[key]=token.slice(eq+1);
    else if(['confirm','json','full-review','help'].includes(key)) flags[key]=true;
    else { if(!argv[i+1] || argv[i+1].startsWith('--')) throw Error(`--${key} needs a value`); flags[key]=argv[++i]; }
  }
  return {args,flags};
}
const word=(v:unknown,name:string) => {if(typeof v!=='string'||!v.trim())throw Error(`${name} is required`);return v;};
const integer=(v:unknown,fallback:number) => {const n=v===undefined?fallback:Number(v);if(!Number.isSafeInteger(n)||n<0)throw Error('nonnegative integer required');return n;};
function artifactText(bytes:Uint8Array):string {
  try{return learningDisplay(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('Retained source is not UTF-8 text; no complete text view is claimed');}
}
function allCases(workspace: ReturnType<typeof openLearningWorkspace>,name:string) {
  const page=workspace.cases(name),items=[...page.items]; for(let offset=5;offset<page.total;offset+=5)items.push(...workspace.cases(name,offset).items);return {...page,items};
}
function caseAt(workspace:ReturnType<typeof openLearningWorkspace>,name:string,index:number) {
  const page=allCases(workspace,name),item=page.items[index-1];if(!item)throw Error('select a listed case number');return {page,item};
}
function trustSetup(workspace:ReturnType<typeof openLearningWorkspace>,flags:Record<string,string|boolean>):LearningTrustSetup {
  const caseName=word(flags.cases,'--cases'),cases=allCases(workspace,caseName).items;
  const detectorId=typeof flags.detector==='string'?flags.detector:cases[0]?.candidate.detector.id;
  if(!detectorId) throw Error('no retained detector cases available');
  const attention=integer(flags.attention,0),days=integer(flags.expires,7),split=String(flags.split??'calibration') as LearningTrustSetup['split'];
  if(attention && (flags['minimum-resolved']===undefined || flags['minimum-lower-bound']===undefined)) throw Error('automatic questions need explicit --minimum-resolved and --minimum-lower-bound');
  const minimumLowerBound=Number(flags['minimum-lower-bound']);
  if(attention && (!Number.isFinite(minimumLowerBound)||minimumLowerBound<0||minimumLowerBound>1||days<1||days>365))throw Error('invalid explicit exposure policy');
  return {caseName,detectorId,split,maxUnflagged:integer(flags['max-unflagged'],0),unflagged:workspace.unflagged().map(({incidentId,manifestId,split})=>({incidentId,manifestId,split})),
    exposure:attention?{id:`operator-${workspace.configuration().scopeDigest.slice(0,20)}`,attentionRemaining:attention,minimumResolved:integer(flags['minimum-resolved'],10),minimumLowerBound,expiresAt:Date.now()+days*86400000}:null};
}
export function formatLearningStatus(view: ReturnType<ReturnType<typeof openLearningWorkspace>['inspect']>): string {
  const lines=[`Learning — ${view.configuration.population}`, 'Deliberate review; no model calls, automatic questions, or activation from reading.'];
  for(const c of view.cases)lines.push(`Cases: ${c.title} (${c.name}) — ${c.state==='ready'?`${c.total} retained nomination(s)`:c.reason}`);
  for(const c of view.comparisons)lines.push(`Comparison: ${c.title} (${c.name}) — ${c.reason}${'decision' in c && c.decision?`; decision: ${c.decision.disposition}`:''}`);
  if(!view.cases.length&&!view.comparisons.length)lines.push('No inputs connected. Choose Connect retained input; missing evidence is not a failure or acceptance.');
  lines.push(formatLearningTrust(view.trust));
  return learningDisplay(lines.join('\n'));
}
export function formatLearningTrust(trust: Record<string,unknown>): string {
  const advice=trust.automaticExposure as {mode?:string;reason?:string}|undefined;
  const calibration=trust.calibration as {reports?:{resolved:number;unresolved:number;conflicted:number;precision:number|null;interval:{lower:number;upper:number}|null}[]}|undefined;
  const sample=trust.unflagged as {sampled:number;resolved:number;misses:number}|undefined;
  const lines=[`Automatic questions: ${advice?.mode??'silent'} — ${advice?.reason??trust.reason??'not configured'} (reading reserves no attention).`];
  for(const r of calibration?.reports??[])lines.push(`Independent labels: ${r.resolved} resolved, ${r.unresolved} unresolved, ${r.conflicted} conflicted; precision ${r.precision===null?'unknown':`${Math.round(r.precision*100)}%`}${r.interval?` (95% interval ${Math.round(r.interval.lower*100)}–${Math.round(r.interval.upper*100)}%)`:''}.`);
  if(sample)lines.push(`Unflagged sample: ${sample.sampled} frozen, ${sample.resolved} independently labelled, ${sample.misses} observed miss(es).${sample.sampled?'':' No unflagged coverage established.'}`);
  if(typeof trust.attentionUsed==='number')lines.push(`Attention already used: ${trust.attentionUsed}. Reopening does not refill it.`);
  return learningDisplay(lines.join('\n'));
}
export interface LearningCommandOptions {cwd?:string;write?:(text:string)=>void;ui?:LearningUI}
export async function runLearningCommand(argv:string[],options:LearningCommandOptions={}) {
  const {args,flags}=parse(argv),cwd=options.cwd??process.cwd(),directory=resolve(cwd,typeof flags.state==='string'?flags.state:'.skill-harness/learning');
  const out=options.write??console.log;
  const emit=(value:unknown) => {out(flags.json?JSON.stringify(value,null,2):typeof value==='string'?value:learningDisplay(JSON.stringify(value,null,2)));return value;};
  const confirm=(preview:unknown,write:()=>unknown) => {
    if(flags.confirm!==true) return emit({state:'confirmation-required',preview,next:'Repeat with --confirm to authorize this exact local action.'});
    return emit(write());
  };
  const global=['state','json','confirm','help'];
  const allowed:Record<string,string[]>={
    init:['archive','scope','population','author','scope-item'],status:[],import:['item','name','title','scope-note'],cases:['offset'],evidence:['item','evidence'],case:['item','disposition','note'],comparisons:[],review:[],artifact:['variant','artifact'],choose:['kind','variants','full-review','note'],reveal:[],decide:['disposition','note'],hypothesis:['name','intervention','prediction','disproof','downside','rollback','alternative'],link:['cases','item','hypothesis'],trust:['cases','item','detector','split','max-unflagged','attention','minimum-resolved','minimum-lower-bound','expires','name','title','reference-author','miss','evidence','note'],adoption:[],outcome:['result','artifact','original-requirement','current-requirement','evidence','reference-author','note','accepted-artifact','acceptance-evidence'],guide:[],help:[]};
  const command=args[0];
  if(command==='guide'||command==='current') {
    const file=command==='guide'?'PRODUCT-GUIDE.md':'STATUS.md',base=dirname(fileURLToPath(import.meta.url));
    const selected=[resolve(base,'../docs',file),resolve(base,'../../../docs/factory',file)].find(p=>existsSync(p));
    if(!selected)throw Error('packaged learning guide missing; reinstall a complete compatible package');
    return emit(learningFile(selected,65536).toString('utf8'));
  }
  if(flags.help || command==='help')return emit(LEARNING_HELP);
  if(!command) {const terminal=options.ui?null:terminalLearningUI();try{return await runLearningWizard({cwd,directory,ui:options.ui??terminal!});}finally{terminal?.close();}}
  if(!Object.hasOwn(allowed,command))throw Error('unknown learning command; use learning help');
  const unexpected=Object.keys(flags).filter(k=>!global.includes(k)&&!allowed[command].includes(k));if(unexpected.length)throw Error(`unsupported learning option: --${unexpected[0]}`);
  if(command==='init') {
    const archiveRoot=resolve(cwd,word(flags.archive,'--archive')),author=word(flags.author,'--author'),scopes=learningArchiveScopes(archiveRoot,author);
    if(scopes.length>1&&flags['scope-item']===undefined)return emit({state:'scope-selection-required',scopes:scopes.map((s,i)=>({item:i+1,description:s.description,population:s.population})),next:'Repeat init with --scope-item N; scope identity is derived from retained facts, not typed hashes.'});
    const selected=scopes[integer(flags['scope-item'],1)-1];if(scopes.length&&!selected)throw Error('select a listed retained scope number');
    if(selected&&flags.population!==undefined&&flags.population!==selected.population)throw Error('population differs from retained case scope');
    const input={archiveRoot,scopeDigest:selected?.scopeDigest??learningHash({declaredScope:word(flags.scope,'--scope for a comparison-only archive')}),population:selected?.population??word(flags.population,'--population for a comparison-only archive'),author};
    return confirm({directory,...input,scopeMeaning:selected?'exact retained case snapshot':'operator-declared comparison-only scope; cannot bind mismatching case snapshots'},()=>createLearningWorkspace(directory,input).inspect(Date.now()));
  }
  if(!existsSync(directory))throw Error('learning workspace not connected; use learning init or /grants learning with the current host');
  const workspace=openLearningWorkspace(directory),config=workspace.configuration(),name=args[1];
  if(command==='status') {const view=workspace.inspect(Date.now());return emit(flags.json?view:formatLearningStatus(view));}
  if(command==='import') {
    const catalog=catalogLearningArchive(config.archiveRoot,config.author);
    if(flags.item===undefined)return emit(flags.json?catalog.map((c,i)=>({item:i+1,...c})):catalog.length?catalog.map((c,i)=>`${i+1}. ${c.kind}: ${c.description}`).join('\n'):'No compatible retained inputs. Ordinary work must retain actual evidence first.');
    const item=catalog[integer(flags.item,0)-1];if(!item)throw Error('select a listed retained input number');
    const binding={name:word(flags.name,'--name'),title:word(flags.title,'--title')};
    return confirm({selected:item,...binding},()=>item.kind==='cases'?workspace.bindCases({...binding,version:item.version as 2|3,batchId:item.manifestId}):workspace.bindComparison({...binding,scopeStatement:word(flags['scope-note'],'--scope-note'),comparisonManifestId:item.manifestId,caseReference:null,hypothesisManifestId:null,adoptionBinding:null,priorFeedbackManifestIds:[]}));
  }
  if(command==='cases') {const page=workspace.cases(word(name,'case batch name'),integer(flags.offset,0));return emit(flags.json?page:page.items.map((c,i)=>`${page.offset+i+1}. ${c.candidate.target.obligationId}: ${c.candidate.reason} — ${c.disposition}`).join('\n')+`\n${page.total} retained nomination(s). Use learning evidence for retained bytes; learning case records an independent disposition.`);}
  if(command==='evidence') {
    const batch=word(name,'case batch name'),{item}=caseAt(workspace,batch,integer(flags.item,1)),refs=workspace.caseEvidence(batch,item.caseManifestId);
    if(flags.evidence===undefined)return emit(flags.json?refs:(refs.length===1?'Only nomination retained; no original observation link. Not independent proof.\n':'')+refs.map((r,i)=>`${i+1}. ${r.role}: ${r.status==='available'?`${r.reference.parser.id} (${r.reference.retention})`:r.status}`).join('\n'));
    const ref=refs[integer(flags.evidence,1)-1];if(!ref)throw Error('select a listed evidence number');
    const result=workspace.readCaseEvidence(batch,item.caseManifestId,ref.manifestId);
    if(result.status!=='available')return emit({state:'deferred',reason:result.status});
    return emit(`${result.reference.retention==='exact'?'Exact retained source':'Redacted retained source — not full evidence'}\n${artifactText(result.bytes)}`);
  }
  if(command==='case') {
    const batch=word(name,'case batch name'),{item}=caseAt(workspace,batch,integer(flags.item,0));
    const request={caseManifestId:item.caseManifestId,priorDecisionId:item.priorDecisionId,disposition:word(flags.disposition,'--disposition') as WorkCaseDisposition,note:word(flags.note,'--note')};
    return confirm({candidate:item.candidate,request},()=>workspace.decideCase(batch,request));
  }
  if(command==='comparisons') {const view=workspace.inspect(Date.now());return emit(flags.json?view.comparisons:view.comparisons.map(c=>`${c.name}: ${c.title} — ${c.reason}`).join('\n')||'No retained comparisons connected.');}
  if(command==='review') {const terminal=options.ui?null:terminalLearningUI();try{return await reviewLearningComparison(directory,word(name,'comparison name'),options.ui??terminal!);}finally{terminal?.close();}}
  if(command==='artifact') {
    const v=workspace.comparison(word(name,'comparison name')),card=v.cards.find(c=>c.displayLabel===flags.variant);if(!card)throw Error('select a listed variant letter');
    const digest=card.artifactDigests[integer(flags.artifact,1)-1];if(!digest)throw Error('select a listed artifact number');
    const bytes=workspace.artifact(name,card.label,digest); const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return emit(flags.json?{variant:card.displayLabel,digest,bytes:bytes.length,scope:'complete-artifact-display',controlCharacters:'escaped (retained bytes unchanged)',text:learningDisplay(text)}:`Variant ${card.displayLabel} — complete artifact (${bytes.length} bytes; controls escaped, retained bytes unchanged)\n\n${learningDisplay(text)}`);
  }
  if(command==='choose') {
    const v=workspace.comparison(word(name,'comparison name')),kind=word(flags.kind,'--kind') as BlindQualityChoice['kind'];
    const letters=typeof flags.variants==='string'?flags.variants.split(','):[];
    const labels=letters.map(letter=>{const c=v.cards.find(c=>c.displayLabel===letter);if(!c)throw Error('select listed variant letters');return c.label;});
    if(kind!=='insufficient'&&flags['full-review']!==true)throw Error('--full-review explicitly acknowledges all complete artifacts, not excerpts');
    const choice={kind,labels},review={scope:'full-artifacts' as const,note:word(flags.note,'--note'),reviewedArtifactDigests:flags['full-review']===true?[...new Set(v.cards.flatMap(c=>c.artifactDigests))]:[]};
    return confirm({comparison:name,choice,review},()=>workspace.choose(name,choice,review));
  }
  if(command==='reveal')return emit(workspace.reveal(word(name,'comparison name')));
  if(command==='decide') {
    const v=workspace.decisionStatus(word(name,'comparison name')),request={disposition:word(flags.disposition,'--disposition') as LearningDecisionRequest['disposition'],note:word(flags.note,'--note'),priorDecisionId:v.current?.id??null};
    return confirm({comparison:name,scope:v.scopeStatement,request,activation:'not-performed'},()=>workspace.decide(name,request));
  }
  if(command==='hypothesis') {
    const batch=word(name,'case batch name'),cases=allCases(workspace,batch).items.filter(c=>c.disposition==='confirmed_defect');if(!cases.length)throw Error('confirm a retained defect before proposing a repair');
    const proposal={archiveSnapshot:learningHash(cases.map(c=>({case:c.caseManifestId,decision:c.priorDecisionId}))),caseIds:cases.map(c=>c.candidate.id),population:config.population,
      intervention:word(flags.intervention,'--intervention'),prediction:word(flags.prediction,'--prediction'),disproof:word(flags.disproof,'--disproof'),downside:word(flags.downside,'--downside'),rollback:word(flags.rollback,'--rollback'),alternatives:[word(flags.alternative,'--alternative')],limits:{subjectCalls:0,judgeCalls:0,wallMs:0},effectProfile:null};
    return confirm({proposal,scope:'proposal-only; zero calls, no authorization'},()=>workspace.propose(batch,proposal,word(flags.name,'--name')));
  }
  if(command==='link') {
    const batch=word(flags.cases,'--cases'),{page,item}=caseAt(workspace,batch,integer(flags.item,0));if(!item.priorDecisionId)throw Error('case decision required');
    const h=workspace.hypotheses().find(h=>h.name===flags.hypothesis);if(!h)throw Error('select a hypothesis created with learning hypothesis');
    const context={...workspace.comparisonContext(word(name,'comparison name')),caseReference:{version:page.version,batchId:page.batchId,manifestId:item.caseManifestId,decisionId:item.priorDecisionId},hypothesisManifestId:h.manifestId};
    return confirm({comparison:name,context},()=>workspace.linkComparisonContext(name,context));
  }
  if(command==='trust') {
    if(name==='sample') {
      const bytes=learningFile(resolve(cwd,word(args[2],'sample evidence file')),65536),sampleName=word(flags.name,'--name');
      return confirm({source:args[2],bytes:bytes.length,title:flags.title,meaning:'operator-selected unflagged incident; NOT a correctness label'},()=>{const manifestId=retainArchiveSource(config.archiveRoot,{sourceId:`unflagged-${learningHash(bytes.toString('base64')).slice(0,24)}`,parser:{id:'operator-unflagged-evidence',version:'1'},retention:'exact',bytes}).manifestId;return workspace.addUnflagged({name:sampleName,title:word(flags.title,'--title'),manifestId,split:String(flags.split??'calibration') as 'calibration'});});
    }
    if(name==='setup') {const setup=trustSetup(workspace,flags),preview=previewLearningTrust(directory,setup);return confirm({...preview,independentLabels:'none created',automaticQuestions:setup.exposure?'only if independently calibrated policy is met':'disabled'},()=>configureLearningTrust(directory,setup,[preview.policyDigest]));}
    const trust=workspace.trust();
    if(name==='status'||!name) {const view={...trust.inspect(Date.now()),automaticExposure:trust.previewExposure(Date.now()),cohort:trust.configuration().cohort};return emit(flags.json?view:formatLearningTrust(view));}
    if(name==='label') {
      const batch=word(flags.cases,'--cases'),{page,item}=caseAt(workspace,batch,integer(flags.item,0));if(!item.priorDecisionId)throw Error('record an independent case decision first');
      const reference={version:page.version,batchId:page.batchId,manifestId:item.caseManifestId,decisionId:item.priorDecisionId},preview=previewLearningCaseLabel(directory,reference),author=word(flags['reference-author'],'--reference-author');
      return confirm({author,reference,preview,meaning:'independent correctness label, NOT writing preference or panel agreement'},()=>{trust.linkCaseOutcome(preview.predictionId,reference,[preview.digest],author);return {recorded:true,author,...trust.inspect(Date.now())};});
    }
    if(name==='unflagged') {
      const id=trust.inspect(Date.now()).sampledIncidentIds[integer(flags.item,0)-1];if(!id)throw Error('select a frozen sampled unflagged incident number');
      const author=word(flags['reference-author'],'--reference-author'),note=word(flags.note,'--note');if(!['yes','no'].includes(String(flags.miss)))throw Error('--miss yes|no required');
      const bytes=learningFile(resolve(cwd,word(flags.evidence,'--evidence')),65536);
      return confirm({author,note,incident:id,miss:flags.miss,evidenceBytes:bytes.length},()=>{
        const evidence=retainArchiveSource(config.archiveRoot,{sourceId:`independent-label-${learningHash({author,note,bytes:bytes.toString('base64')}).slice(0,24)}`,parser:{id:'operator-reference-evidence',version:'1'},retention:'exact',bytes}).manifestId;
        const outcome={kind:'unflagged' as const,targetId:id,value:flags.miss==='yes',evidenceManifestId:evidence,referenceId:learningHash({author,note,id,evidence})};trust.outcome(outcome,[trustOutcomeDigest(outcome)],author);return trust.inspect(Date.now());
      });
    }
    throw Error('unknown learning trust operation');
  }
  if(command==='adoption') {
    const v=workspace.comparison(word(name,'comparison name'));
    return emit({scope:v.scopeStatement,quality:v.qualityScope,decision:v.decision,configured:v.adoptionConfigured,activation:v.activation,rollback:v.rollback,
      reason:!v.adoptionConfigured?'independent scoped candidate/eligibility/authority not configured':v.activation==='recorded'?'activation receipt linked; existing sessions unchanged':'prepared/intent is not activation; use original producer registry controls',next:'Use /grants learning or pi-daddy learning for authorized next-order activation/rollback.'});
  }
  if(command==='outcome') {
    word(name,'comparison name');
    if(flags.result===undefined)return emit({outcomes:workspace.comparison(name).outcomes,meaning:'observed linkage only; no later outcome is inferred from exit zero',next:'Record with learning outcome --result … and explicit independently reviewed evidence, or connected producer controls.'});
    const status=workspace.adoptionStatus(name);if(!status.receipt||!status.activationManifestId)throw Error('an actual linked registry activation is required before later outcomes');
    const author=word(flags['reference-author'],'--reference-author'),note=word(flags.note,'--note'),result=word(flags.result,'--result');
    if(!['success','confirmed-defect','unknown'].includes(result))throw Error('explicit success, confirmed-defect or unknown result required');
    if((flags['accepted-artifact']===undefined)!==(flags['acceptance-evidence']===undefined))throw Error('accepted artifact and independent acceptance evidence must be supplied together; excerpts never imply acceptance');
    const keys=['artifact','original-requirement','current-requirement','evidence',...(flags['accepted-artifact']===undefined?[]:['accepted-artifact','acceptance-evidence'])];
    const files=keys.map(key=>({key,bytes:learningFile(resolve(cwd,word(flags[key],`--${key}`)),1024*1024)}));
    return confirm({name,result,author,note,files:files.map(f=>({kind:f.key,bytes:f.bytes.length})),meaning:'independently supplied observation, not detector calibration or model exit status'},()=>{
      const retained=new Map(files.map(f=>[f.key,retainArchiveSource(config.archiveRoot,{sourceId:`outcome-${f.key}-${learningHash(f.bytes.toString('base64')).slice(0,24)}`,parser:{id:'operator-outcome-evidence',version:'1'},retention:'exact',bytes:f.bytes})]));
      const audit=retainArchiveSource(config.archiveRoot,{sourceId:`outcome-reference-${learningHash({author,note,result}).slice(0,24)}`,parser:{id:'operator-outcome-reference',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify({author,note,result,scopeDigest:config.scopeDigest,source:'explicit-operator-review-not-exit-status'}))});
      const observation={id:learningHash({author,note,result,files:[...retained.values()].map(r=>r.manifestId)}),adoptionId:status.receipt!.id,candidateDigest:status.receipt!.candidateDigest,scopeDigest:config.scopeDigest,
        originalRequirementDigest:retained.get('original-requirement')!.reference.sha256,currentRequirementDigest:retained.get('current-requirement')!.reference.sha256,outcome:result as 'success'|'confirmed-defect'|'unknown',
        observedArtifactDigest:retained.get('artifact')!.reference.sha256,acceptedArtifactDigest:retained.get('accepted-artifact')?.reference.sha256??null,acceptanceDigest:retained.get('acceptance-evidence')?.reference.sha256??null,evidence:[...retained.values()].map(r=>r.manifestId).concat(audit.manifestId)};
      const preview=workspace.previewObservation(name,observation);return workspace.observe(name,observation,[preview.digest],author);
    });
  }
}

function learningArchiveScopes(root:string,author:string) {
  if(!existsSync(join(root,'manifests')))return [];
  const selected=catalogLearningArchive(root,author).filter((c):c is typeof c&{scopeDigest:string;population:string}=>!!c.scopeDigest&&!!c.population);
  return selected.filter((c,i)=>selected.findIndex(s=>s.scopeDigest===c.scopeDigest&&s.population===c.population)===i);
}
function terminalLearningUI(): LearningUI&{close():void} {
  if(!process.stdin.isTTY || !process.stdout.isTTY)throw Error('guided learning needs an interactive terminal; use explicit learning subcommands');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  return {close:()=>rl.close(),notify:text=>console.log(learningDisplay(text)),
    input:async(title,initial)=>{const answer=await rl.question(`${title}${initial?` [${initial}]`:''}: `);return answer||initial;},
    select:async(title,choices)=>{console.log(learningDisplay(title));choices.forEach((c,i)=>console.log(`${i+1}. ${learningDisplay(c)}`));const answer=await rl.question('Number (empty cancels): ');return choices[Number(answer)-1];},
    confirm:async(title,detail)=>(console.log(learningDisplay(`${title}\n${detail}`)),(await rl.question('Confirm [y/N]: ')).toLowerCase()==='y'),
    editor:async(title,text)=>{console.log(learningDisplay(`${title}\n${text}`));await rl.question('Enter to return (this is the complete display): ');return text;}};
}
export async function reviewLearningComparison(directory:string,name:string,ui:LearningUI) {
  const workspace=openLearningWorkspace(directory);let view=workspace.comparison(name);
  ui.notify(`${view.title}\n${view.scopeStatement}\nDeliberate review, not an earned automatic question.\n${view.limitations.join('\n')}`);
  const reviewed=new Set<string>();
  for(;;) {
    view=workspace.comparison(name);
    const choices=[...view.cards.map(c=>`Read variant ${c.displayLabel} (${c.artifactDigests.length} artifact(s))`),
      ...(view.revealReady?['Reveal model and cost']:['Record quality choice']), 'Adopt / reject / defer', 'Done'];
    const selected=await ui.select('Comparison — quality is separate from adoption',choices);if(!selected||selected==='Done')return;
    const index=choices.indexOf(selected);
    if(index<view.cards.length) {
      const card=view.cards[index];
      for(const digest of card.artifactDigests) {
        const bytes=workspace.artifact(name,card.label,digest);let text:string;
        try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{ui.notify('This artifact is not UTF-8 text; use a suitable full-artifact viewer. No review acknowledgement recorded.','warning');continue;}
        if(bytes.length>1024*1024){ui.notify('Artifact exceeds interactive viewer bound. Use learning artifact in a terminal; no partial view counts as full review.','warning');continue;}
        const display=learningDisplay(text),returned=await ui.editor(`Variant ${card.displayLabel} — complete artifact (${bytes.length} bytes; controls escaped)`,display);
        if(returned===display && await ui.confirm('Acknowledge complete artifact review?', 'Only confirm if you reviewed the complete artifact, not an excerpt. This does not accept or adopt it.'))reviewed.add(digest);
      }
    } else if(selected==='Record quality choice') {
      const all=[...new Set(view.cards.flatMap(c=>c.artifactDigests))],complete=all.length>0&&all.every(id=>reviewed.has(id));
      const answers=[...(complete?[...view.cards.map(c=>`Prefer ${c.displayLabel}`),...(view.cards.length>1?['Tie (all shown variants)']:[]),'None acceptable']:[]),'Insufficient evidence','Cancel'];
      const answer=await ui.select(complete?'Quality — full artifacts':'Full artifacts not yet acknowledged; only insufficient evidence is available',answers);if(!answer||answer==='Cancel')continue;
      const choice:BlindQualityChoice=answer==='Insufficient evidence'?{kind:'insufficient',labels:[]}:answer==='None acceptable'?{kind:'none',labels:[]}:answer.startsWith('Tie')?{kind:'tie',labels:view.cards.map(c=>c.label)}:{kind:'one',labels:[view.cards.find(c=>`Prefer ${c.displayLabel}`===answer)!.label]};
      const note=await ui.input('Reason / limitations (required)');if(!note)continue;
      if(await ui.confirm('Record immutable quality choice?', 'This locks the quality choice before reveal; it is not acceptance, calibration, or adoption.')) {workspace.choose(name,choice,{scope:'full-artifacts',note,reviewedArtifactDigests:[...reviewed]});ui.notify('Quality choice durably recorded. Identity remains hidden until you choose Reveal.');}
    } else if(selected==='Reveal model and cost')ui.notify(JSON.stringify(workspace.reveal(name),null,2));
    else if(selected==='Adopt / reject / defer') {
      const disposition=await ui.select('Adoption decision (not activation)',[...(view.revealReady&&['one','tie'].includes(view.choice!.kind)?['adopt']:[]),'reject','defer']);if(!disposition)continue;
      const note=await ui.input('Decision reason (required)');if(!note)continue;
      if(await ui.confirm(`Record ${disposition}?`,`${view.scopeStatement}\nNo active session or next order changes here.`)){workspace.decide(name,{disposition:disposition as LearningDecisionRequest['disposition'],note,priorDecisionId:view.decision?.id??null});ui.notify('Decision recorded. Adoption still needs independent eligibility, authority and original registry activation.');}
    }
  }
}
export async function runLearningWizard(options:{cwd:string;directory:string;ui:LearningUI}) {
  const {directory,ui,cwd}=options;
  if(!existsSync(directory)) {
    ui.notify('Connect an explicitly selected retained archive. This reads no live/private Pi session and calls no model.');
    const archive=await ui.input('Retained archive directory'),author=await ui.input('Review author');if(!archive||!author)return;
    const archiveRoot=resolve(cwd,archive),scopes=learningArchiveScopes(archiveRoot,author),labels=scopes.map((s,i)=>`${i+1}. ${s.description} (${s.population})`);
    const choice=scopes.length?await ui.select('Exact retained work scope',labels):undefined;if(scopes.length&&!choice)return;
    const selected=choice?scopes[labels.indexOf(choice)]:null;
    const population=selected?.population??await ui.input('Comparison-only population (no case scope available)'),scope=selected?'Retained case snapshot':await ui.input('Comparison-only scope description');if(!population||!scope)return;
    if(!await ui.confirm('Create learning workspace?',`${archiveRoot}\nPopulation: ${population}\nScope: ${scope}\nAuthor: ${author}\nFor an existing producer host use /grants learning so the exact snapshot is bound.`))return;
    createLearningWorkspace(directory,{archiveRoot,population,scopeDigest:selected?.scopeDigest??learningHash({declaredScope:scope}),author});
  }
  const workspace=openLearningWorkspace(directory);
  for(;;) {
    const status=workspace.inspect(Date.now());
    const selected=await ui.select('Learning — retained evidence, no model calls',['Readiness','Connect retained input','Review cases','Review comparisons','Record adopt / reject / defer','Propose hypothesis','Link original hypothesis','Trust / independent labels','Adoption / outcomes','Done']);
    if(!selected||selected==='Done')return;
    try {
      if(selected==='Readiness')ui.notify(formatLearningStatus(status));
      if(selected==='Connect retained input') {
        const catalog=catalogLearningArchive(status.configuration.archiveRoot,status.configuration.author),labels=catalog.map((c,i)=>`${i+1}. ${c.kind}: ${c.description}`);
        if(!labels.length){ui.notify('No compatible retained case batch or qualified comparison for this author. Run ordinary work first; no evidence will be fabricated.','warning');continue;}
        const item=await ui.select('Retained inputs in selected archive',labels);if(!item)continue;
        const c=catalog[labels.indexOf(item)],name=await ui.input('Short name (letters, digits, - or _)'),title=await ui.input('Display title');if(!name||!title)continue;
        const scope=c.kind==='comparison'?await ui.input('What complete artifacts will this quality review assess?'):undefined;if(c.kind==='comparison'&&!scope)continue;
        if(!await ui.confirm('Connect retained input?',`${title}\n${scope??'Case nominations remain unconfirmed.'}`))continue;
        if(c.kind==='cases')workspace.bindCases({name,title,version:c.version as 2|3,batchId:c.manifestId});
        else workspace.bindComparison({name,title,scopeStatement:scope!,comparisonManifestId:c.manifestId,caseReference:null,hypothesisManifestId:null,priorFeedbackManifestIds:[],adoptionBinding:null});
        ui.notify('Retained input connected. Reading never activates or reserves attention.');
      }
      if(selected==='Review comparisons') {
        const names=status.comparisons.map(c=>c.name),name=await ui.select('Choose retained comparison',names);if(name)await reviewLearningComparison(directory,name,ui);
      }
      if(selected==='Review cases') {
        const name=await ui.select('Choose case batch',status.cases.map(c=>c.name));if(!name)continue;
        const p=allCases(workspace,name),labels=p.items.map((c,i)=>`${i+1}. ${c.candidate.reason} — ${c.candidate.target.obligationId} (${c.disposition})`);
        const chosen=await ui.select('Retained nominations (not confirmed defects)',labels);if(!chosen)continue;const item=p.items[labels.indexOf(chosen)];
        await ui.editor('Case nomination — not an independent label',learningDisplay(JSON.stringify(item.candidate,null,2)));
        const refs=workspace.caseEvidence(name,item.caseManifestId),choices=refs.map((r,i)=>`${i+1}. ${r.role}: ${r.status==='available'?`${r.reference.parser.id} (${r.reference.retention})`:r.status}`);let cancelled=false;
        if(refs.length===1)ui.notify('Only nomination retained; no original observation link. This alone is not independent proof.','warning');
        for(;;) {
          const selected=await ui.select('Inspect retained case evidence (no bytes are edited)',[...choices,'Choose disposition','Back']);if(!selected||selected==='Back'){cancelled=true;break;}if(selected==='Choose disposition')break;
          const ref=refs[choices.indexOf(selected)],result=workspace.readCaseEvidence(name,item.caseManifestId,ref.manifestId);
          if(result.status!=='available'){ui.notify(`Evidence unavailable: ${result.status}`,'warning');continue;}
          await ui.editor(`${result.reference.retention==='exact'?'Exact':'Redacted — not full'} retained source (display only)`,artifactText(result.bytes));
        }
        if(cancelled)continue;
        const disposition=await ui.select('Your independent case disposition',['confirmed_defect','expected_behavior','exemplar','uncertain','skip']);if(!disposition)continue;
        const note=await ui.input('Evidence/reason (required)');if(note&&await ui.confirm('Record case disposition?',`${disposition}\n${note}\nThis is not a writing preference, adoption or test promotion.`)){workspace.decideCase(name,{caseManifestId:item.caseManifestId,priorDecisionId:item.priorDecisionId,disposition:disposition as WorkCaseDisposition,note});ui.notify('Case disposition durably recorded. Trust linkage is a separate action.');}
      }
      if(selected==='Record adopt / reject / defer') {
        const name=await ui.select('Retained comparison (defer/reject also works when evidence is unavailable)',status.comparisons.map(c=>c.name));if(!name)continue;
        const current=workspace.decisionStatus(name);let adopt=false;
        try {const c=workspace.comparison(name);adopt=c.revealReady&&!!c.choice&&['one','tie'].includes(c.choice.kind);}catch{/* Missing evidence cannot prevent recording a defer. */}
        const disposition=await ui.select(current.scopeStatement,[...(adopt?['adopt']:[]),'reject','defer']),note=await ui.input('Reason (required)');if(!disposition||!note)continue;
        if(await ui.confirm(`Record ${disposition}?`,'Intent only. No acceptance, activation, model calls or automatic exposure.')){workspace.decide(name,{disposition:disposition as LearningDecisionRequest['disposition'],note,priorDecisionId:current.current?.id??null});ui.notify('Decision durably recorded.');}
      }
      if(selected==='Propose hypothesis') {
        const name=await ui.select('Confirmed case batch',status.cases.map(c=>c.name));if(!name)continue;
        const flags:string[]=[];for(const [key,title] of [['name','Hypothesis short name'],['intervention','Proposed change'],['prediction','Falsifiable expected result'],['disproof','What would disprove it?'],['downside','Downside/risk'],['rollback','Rollback plan'],['alternative','Alternative explanation']] as const){const value=await ui.input(title);if(!value)break;flags.push(`--${key}`,value);}
        if(flags.length!==14)continue;
        if(await ui.confirm('Retain hypothesis?', 'Proposal only: no scenario edit, model call, adoption or causal claim.'))await runLearningCommand(['hypothesis',name,...flags,'--state',directory,'--confirm'],{cwd,write:t=>ui.notify(t)});
      }
      if(selected==='Link original hypothesis') {
        const comparison=await ui.select('Comparison',status.comparisons.map(c=>c.name)),batch=await ui.select('Confirmed case batch',status.cases.map(c=>c.name));if(!comparison||!batch)continue;
        const p=allCases(workspace,batch),labels=p.items.map((c,i)=>`${i+1}. ${c.candidate.target.obligationId} — ${c.disposition}`),item=await ui.select('Current independent case decision',labels),hypothesis=await ui.select('Original retained hypothesis',workspace.hypotheses().map(h=>h.name));if(!item||!hypothesis)continue;
        if(await ui.confirm('Link original evidence?', 'Only the comparison’s actual originating hypothesis is accepted. A new hypothesis cannot be retroactively presented as the experiment origin.'))await runLearningCommand(['link',comparison,'--cases',batch,'--item',String(labels.indexOf(item)+1),'--hypothesis',hypothesis,'--state',directory,'--confirm'],{cwd,write:t=>ui.notify(t)});
      }
      if(selected==='Trust / independent labels')await trustLearningWizard(directory,cwd,ui);
      if(selected==='Adoption / outcomes') {
        const name=await ui.select('Comparison',status.comparisons.map(c=>c.name));if(!name)continue;
        await runLearningCommand(['adoption',name,'--state',directory],{cwd,write:t=>ui.notify(t)});
        await runLearningCommand(['outcome',name,'--state',directory],{cwd,write:t=>ui.notify(t)});
        if(await ui.confirm('Record a later independent observation?', 'Requires an actual linked activation. Unknown is valid; exit zero is not quality. No adoption or rollback is performed.')) {
          const result=await ui.select('Observed result',['success','confirmed-defect','unknown']);if(!result)continue;
          const flags:string[]=['--result',result];
          for(const [key,title] of [['artifact','Complete later artifact file'],['original-requirement','Original requirement file'],['current-requirement','Current requirement file'],['evidence','Independent outcome evidence file'],['reference-author','Independent reference author'],['note','Evidence/reason']] as const){const value=await ui.input(title);if(!value)break;flags.push(`--${key}`,value);}
          if(flags.length!==14)continue;
          if(await ui.confirm('Was this exact artifact independently accepted?', 'No is normal. Never substitute an excerpt preference for full artifact acceptance.')) {const artifact=await ui.input('Exact independently accepted artifact file'),evidence=await ui.input('Independent acceptance evidence file');if(!artifact||!evidence)continue;flags.push('--accepted-artifact',artifact,'--acceptance-evidence',evidence);}
          if(await ui.confirm('Retain this independent outcome?', 'Links only to the scoped adoption. It does not become calibration, improvement proof or automatic rollback.'))await runLearningCommand(['outcome',name,...flags,'--state',directory,'--confirm'],{cwd,write:t=>ui.notify(t)});
        }
      }
    } catch(e) {ui.notify(e instanceof Error?e.message:'Learning action failed; no success claimed.','error');}
  }
}
async function trustLearningWizard(directory:string,cwd:string,ui:LearningUI) {
  const workspace=openLearningWorkspace(directory),action=await ui.select('Trust — independent evidence, never preference',['Readiness','Add unflagged evidence before freeze','Configure frozen policy','Link current case label','Label frozen unflagged sample','Back']);
  if(!action||action==='Back')return;
  if(action==='Readiness'){ui.notify(formatLearningTrust(workspace.inspect(Date.now()).trust));return;}
  if(action==='Add unflagged evidence before freeze') {
    const file=await ui.input('Explicit retained/source evidence file (no private sessions)'),name=await ui.input('Incident short name'),title=await ui.input('What unflagged incident does this evidence document?'),split=await ui.select('Predeclare split',['calibration','heldout','tuning']);
    if(file&&name&&title&&split&&await ui.confirm('Retain unflagged incident?', 'This is not a correctness label. Do not include secrets or private sessions.'))await runLearningCommand(['trust','sample',file,'--name',name,'--title',title,'--split',split,'--state',directory,'--confirm'],{cwd,write:t=>ui.notify(t)});return;
  }
  if(action==='Configure frozen policy') {
    const name=await ui.select('Case batch',workspace.inspect(0).cases.map(c=>c.name));if(!name)return;
    const detectors=[...new Set(allCases(workspace,name).items.map(c=>c.candidate.detector.id))],detector=await ui.select('Detector (version and population remain exact)',detectors),split=await ui.select('Predeclare evaluation split',['calibration','heldout','tuning']);if(!detector||!split)return;
    const max=await ui.input('Maximum unflagged sample (0–32; missing samples stay missing)','0');if(max===undefined)return;
    const flags:Record<string,string|boolean>={cases:name,detector,split,'max-unflagged':max};
    if(await ui.confirm('Configure automatic questions?', 'Default is silent. Explicit policy plus sufficient independent labels is required. This does not show a question or refill attention.')) {
      const count=await ui.input('Minimum resolved independent incidents','10'),lower=await ui.input('Minimum 95% interval lower bound','0.8'),quota=await ui.input('Total question attention budget','5'),days=await ui.input('Policy validity in days','7');if(!count||!lower||!quota||!days)return;
      Object.assign(flags,{'minimum-resolved':count,'minimum-lower-bound':lower,attention:quota,expires:days});
    }
    const setup=trustSetup(workspace,flags),preview=previewLearningTrust(directory,setup);
    if(await ui.confirm('Freeze this exact scoped policy?',JSON.stringify({...preview,notice:'No independent labels are created. Missing evidence keeps automatic questions silent.'},null,2))){configureLearningTrust(directory,setup,[preview.policyDigest]);ui.notify('Policy and predictions retained; independent labels still pending.');}return;
  }
  if(action==='Link current case label') {
    const name=await ui.select('Case batch',workspace.inspect(0).cases.map(c=>c.name));if(!name)return;
    const p=allCases(workspace,name),labels=p.items.map((c,i)=>`${i+1}. ${c.candidate.reason}: ${c.disposition}`),chosen=await ui.select('Current independently reviewed case',labels),author=await ui.input('Independent reference author');if(!chosen||!author)return;
    if(await ui.confirm('Link independent correctness label?', 'Use the actual case disposition; never treat writing preference, panel agreement or model self-report as detector accuracy.'))await runLearningCommand(['trust','label','--cases',name,'--item',String(labels.indexOf(chosen)+1),'--reference-author',author,'--state',directory,'--confirm'],{cwd,write:t=>ui.notify(t)});return;
  }
  const trust=workspace.trust(),view=trust.inspect(Date.now()),labels=view.sampledIncidentIds.map((id,i)=>`${i+1}. ${id.slice(0,12)} (frozen unflagged incident)`),chosen=await ui.select('Frozen sample',labels);if(!chosen)return;
  const miss=await ui.select('Independent review: was a defect missed?',['yes','no']),file=await ui.input('Independent evidence file'),author=await ui.input('Independent reference author'),note=await ui.input('Evidence/reason');
  if(miss&&file&&author&&note&&await ui.confirm('Record independent sample outcome?', 'This label is scope-bound and separate from positive precision.'))await runLearningCommand(['trust','unflagged','--item',String(labels.indexOf(chosen)+1),'--miss',miss,'--evidence',file,'--reference-author',author,'--note',note,'--state',directory,'--confirm'],{cwd,write:t=>ui.notify(t)});
}
