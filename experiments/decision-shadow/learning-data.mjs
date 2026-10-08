import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize } from 'node:path';
import { parseCases, parseLabels } from './dataset.mjs';
import { trainingAssets } from './learning-training.mjs';

export const learningDigest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
function canonical(value) { return Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value !== null && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value); }
function check(ok, message) { if (!ok) throw new TypeError(message); }
function keys(v, names, name) { check(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('|') === [...names].sort().join('|'), `${name}: unsupported or missing fields`); }
function text(v, name, max = 256) { check(typeof v === 'string' && v.trim().length > 0 && v.length <= max && !v.includes('\0'), `${name}: invalid text`); }
function sha(v) { check(typeof v === 'string' && /^[0-9a-f]{64}$/.test(v), 'invalid SHA-256'); }
function date(v) { check(typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v)), 'invalid timestamp'); }
function bool(v) { check(typeof v === 'boolean', 'expected boolean'); }
function choice(v, allowed, name) { check(allowed.includes(v), `${name}: unsupported value`); }
function parsedCases(cases) {
  check(Array.isArray(cases), 'cases must be parsed cases');
  const raw = cases.map(c => { keys(c, ['id','input','question','provenance','source','visibility','hash'], 'parsed case'); const {hash,...rest}=c; return rest; });
  const validated = parseCases({schema:1,cases:raw});
  validated.forEach((c,i) => check(c.hash === cases[i].hash, 'stale parsed case hash'));
  return validated;
}
const CONSENT_KEYS = ['schema','kind','sessionId','decision','interactionId','recordedAt','source','scope'];
export function createStorageConsent({sessionId, decision, interactionId, recordedAt}) {
  return parseStorageConsent({schema:1,kind:'decision-session-storage-consent',sessionId,decision,interactionId,recordedAt,source:'explicit-user-response',scope:'selected-session-data-for-lora-review'},sessionId);
}
export function parseStorageConsent(record, expectedSessionId) {
  keys(record,CONSENT_KEYS,'storage consent'); text(expectedSessionId,'expected session ID');
  check(record.schema===1 && record.kind==='decision-session-storage-consent' && record.source==='explicit-user-response' && record.scope==='selected-session-data-for-lora-review','unsupported consent contract');
  text(record.sessionId,'session ID'); text(record.interactionId,'interaction ID'); date(record.recordedAt);
  check(record.sessionId===expectedSessionId,'storage consent belongs to another session');
  choice(record.decision,['granted','declined'],'consent');
  return structuredClone(record);
}
function consentFor(consents, sessionId) {
  check(Array.isArray(consents), 'consents must be an array');
  const matches=consents.filter(c=>c.sessionId===sessionId);
  check(matches.length===1,'one explicit current-session storage consent required');
  const c=parseStorageConsent(matches[0],sessionId); check(c.decision==='granted','session storage declined; advice remains allowed'); return c;
}
const ENTRY_KEYS=['caseId','caseHash','taskGroup','lineageGroup','split','sessionId','fixtureOnly','decisionTimeReviewed','redactionReviewed','rights','exportApproved','trainingApproved','reviewer'];
function parseEntry(c,e) {
  keys(e,ENTRY_KEYS,'experiment entry');check(e.caseId===c.id && e.caseHash===c.hash,'experiment case identity mismatch');
  for(const k of ['taskGroup','lineageGroup','reviewer'])text(e[k],k);
  choice(e.split,['train','validation','test','unassigned'],'split');
  choice(e.rights,['unknown','local-export','local-training'],'rights');
  for(const k of ['fixtureOnly','decisionTimeReviewed','redactionReviewed','exportApproved','trainingApproved'])bool(e[k]);
  if(c.provenance==='observed'){text(e.sessionId,'observed session ID');check(!e.fixtureOnly,'observed case cannot be a synthetic fixture');}
  else check(e.sessionId===null && e.fixtureOnly===true,'synthetic data must remain fixture-only, without session consent');
  return structuredClone(e);
}
export function parseExperiment(cases,manifest) {
  cases=parsedCases(cases); keys(manifest,['schema','kind','id','frozenAt','entries'],'experiment');
  check(manifest.schema===1 && manifest.kind==='decision-learning-experiment','unsupported experiment');text(manifest.id,'experiment ID');date(manifest.frozenAt);
  check(Array.isArray(manifest.entries) && manifest.entries.length===cases.length,'one ordered experiment entry required per case');
  const entries=cases.map((c,i)=>parseEntry(c,manifest.entries[i]));
  const groups=new Map(), duplicates=new Map();
  function bind(map,key,split,what){if(map.has(key))check(map.get(key)===split,`${what} crosses splits`);else map.set(key,split);}
  entries.forEach((e,i)=>{
    bind(groups,'task:'+e.taskGroup,e.split,'task group');bind(groups,'lineage:'+e.lineageGroup,e.split,'lineage group');
    if(e.sessionId!==null)bind(groups,'session:'+e.sessionId,e.split,'session');
    // Conservative whitespace/case normalization catches formatting-only duplicates, even if their questions differ.
    bind(duplicates,learningDigest(cases[i].input.normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase()),e.split,'duplicate input');
    bind(duplicates,'source:'+cases[i].source.sha256+':'+cases[i].source.recordId,e.split,'source record');
  });
  return {...structuredClone(manifest),entries};
}
async function readExplicit(path, expected, limit=1024*1024) {
  text(path,'artifact path',4096);check(process.platform==='linux','Evidence review requires Linux no-follow directory descriptors');
  check(isAbsolute(path) && normalize(path)===path && !path.endsWith('/'),'artifact path must be canonical and absolute');sha(expected);
  const components=path.split('/').filter(Boolean);check(components.length<=128,'artifact path too deep');
  check(!components.some(p=>['sessions','native-sessions','auth.json','.env'].includes(p.toLowerCase())),'private session or credential paths are unsupported');
  const directories=[], flags=constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW|constants.O_NONBLOCK;
  const identity=s=>[s.dev,s.ino,s.mode].map(String).join(':');
  const metadata=s=>[s.dev,s.ino,s.mode,s.size,s.mtimeNs,s.ctimeNs].map(String).join(':');
  let file;
  try {
    let handle=await open('/',flags);directories.push({handle,parent:null,name:'/',identity:identity(await handle.stat({bigint:true}))});
    for(const name of components.slice(0,-1)) {const parent=handle;handle=await open(`/proc/self/fd/${parent.fd}/${name}`,flags);directories.push({handle,parent,name,identity:identity(await handle.stat({bigint:true}))});}
    const name=components.at(-1), parent=handle;
    file=await open(`/proc/self/fd/${parent.fd}/${name}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const before=await file.stat({bigint:true});check(before.isFile()&&before.size<=BigInt(limit),'artifact must be a bounded ordinary file');
    const b=Buffer.alloc(Number(before.size)+1);let n=0;while(n<b.length){const r=await file.read(b,n,b.length-n,n);if(!r.bytesRead)break;n+=r.bytesRead;}
    check(n===Number(before.size)&&metadata(before)===metadata(await file.stat({bigint:true})),'artifact changed while reading');
    const reopened=await open(`/proc/self/fd/${parent.fd}/${name}`,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    try{check(metadata(before)===metadata(await reopened.stat({bigint:true})),'artifact path changed while reading');}finally{await reopened.close();}
    for(const d of directories){const h=await open(d.parent?`/proc/self/fd/${d.parent.fd}/${d.name}`:'/',flags);try{check(identity(await h.stat({bigint:true}))===d.identity,'artifact ancestor changed');}finally{await h.close();}}
    const bytes=b.subarray(0,n);check(learningDigest(bytes)===expected,'artifact hash mismatch');return bytes;
  } finally {if(file)await file.close();await Promise.allSettled(directories.map(d=>d.handle.close()));}
}
function json(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));}
export async function reviewLabelEvidence({cases,labels,references}) {
  cases=parsedCases(cases);labels=parseLabels({schema:1,labels},cases);
  check(labels.length<=100 && Array.isArray(references) && references.length===labels.length && references.length<=cases.length,'one bounded label evidence reference required per label');
  const seen=new Set(), reviewed=[];
  for(const label of labels){
    const matches=references.filter(r=>r.caseId===label.caseId);check(matches.length===1,'duplicate or missing label evidence');const r=matches[0];
    keys(r,['caseId','path','sha256'],'label reference');check(!seen.has(r.path),'label receipt reused');seen.add(r.path);check(r.sha256===label.evidenceSha256,'label evidence digest mismatch');
    const receipt=json(await readExplicit(r.path,r.sha256));
    keys(receipt,['schema','kind','caseId','caseHash','source','value','labelKind','actor','independent','recordedAt','method'],'label receipt');
    check(receipt.schema===1 && receipt.kind==='independent-decision-label','model/audit output is not independent label evidence');
    for(const k of ['caseId','caseHash','value','actor','independent'])check(receipt[k]===label[k],'label receipt disagrees with '+k);
    check(receipt.labelKind===label.kind,'label provenance mismatch');date(receipt.recordedAt);
    const c=cases.find(c=>c.id===label.caseId);keys(receipt.source,['sha256','recordId'],'label source');check(canonical(receipt.source)===canonical(c.source),'label source mismatch');
    keys(receipt.method,['kind','id','version'],'label method');check(receipt.method.kind===(label.kind==='human'?'human-review':'deterministic-test'),'prediction cannot supply a label');text(receipt.method.id,'method');text(receipt.method.version,'method version');
    reviewed.push({caseId:c.id,caseHash:c.hash,reference:{...r},label:{...label},method:{...receipt.method},recordedAt:receipt.recordedAt});
  }
  return {schema:1,kind:'decision-label-evidence-review',reviewed,meaning:'Exact receipt bytes and declared provenance checked; human identity, truth, independence and rights remain explicit reviewer assertions.'};
}
export async function importSelectedCase({caseDocument,selection,sessionConsent,experimentEntry}) {
  const cases=parseCases(caseDocument);check(cases.length===1 && cases[0].provenance==='observed','import requires exactly one observed case');const c=cases[0];
  const e=parseEntry(c,experimentEntry);const consent=parseStorageConsent(sessionConsent,e.sessionId);check(consent.decision==='granted','session storage declined; advice remains allowed');
  check(e.decisionTimeReviewed && e.redactionReviewed,'decision-time and redaction review required');
  keys(selection,['schema','kind','sessionId','source','fragments'],'public selection');check(selection.schema===1 && selection.kind==='decision-selected-public-input' && selection.sessionId===e.sessionId,'selection session mismatch');
  keys(selection.source,['path','sha256'],'selected source');check(selection.source.sha256===c.source.sha256,'selected source hash mismatch');
  const primary=json(await readExplicit(selection.source.path,selection.source.sha256));check(primary.toolCallId===c.source.recordId,'selected source tool-call identity mismatch');
  check(Array.isArray(selection.fragments) && selection.fragments.length>0 && selection.fragments.length<=16,'select 1..16 explicit public fragments');
  const parts=[],refs=[];
  for(const f of selection.fragments){
    keys(f,['path','sha256','jsonlLine','jsonPointer','start','end','replacements'],'fragment');
    let s=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await readExplicit(f.path,f.sha256));
    if(f.jsonlLine!==null){check(Number.isSafeInteger(f.jsonlLine)&&f.jsonlLine>0,'invalid JSONL line');s=s.split('\n')[f.jsonlLine-1];check(s!==undefined,'missing JSONL line');}
    if(f.jsonPointer!==null){check(typeof f.jsonPointer==='string' && f.jsonPointer.startsWith('/'),'invalid JSON pointer');let v=JSON.parse(s);for(const key of f.jsonPointer.slice(1).split('/').map(k=>k.replace(/~1/g,'/').replace(/~0/g,'~'))){check(v && typeof v==='object' && Object.hasOwn(v,key),'missing selected field');v=v[key];}check(typeof v==='string','selected field must be public text');s=v;}
    const points=Array.from(s);check(Number.isSafeInteger(f.start)&&Number.isSafeInteger(f.end)&&f.start>=0&&f.end>f.start&&f.end<=points.length,'invalid excerpt range');let excerpt=points.slice(f.start,f.end).join('');
    check(Array.isArray(f.replacements) && f.replacements.length<=32,'invalid redactions');for(const r of f.replacements){keys(r,['from','to'],'redaction');text(r.from,'redaction source',4096);check(typeof r.to==='string' && /^<[A-Z0-9_ -]{1,80}>$/.test(r.to),'redaction must use a placeholder');check(excerpt.includes(r.from),'redaction source absent');excerpt=excerpt.replaceAll(r.from,r.to);}
    parts.push(excerpt);refs.push({...f,replacements:f.replacements.map(r=>({fromSha256:learningDigest(r.from),fromCodepoints:Array.from(r.from).length,to:r.to}))});
  }
  check(parts.join('\n\n')===c.input,'case input must equal exact selected redacted fragments joined by two newlines');
  return {caseDocument:structuredClone(caseDocument),experimentEntry:e,receipt:{schema:1,kind:'decision-selected-public-import',caseId:c.id,caseHash:c.hash,sessionId:e.sessionId,consentHash:learningDigest(consent),source:structuredClone(selection.source),fragments:refs,trainingEligible:false,automaticCollection:false}};
}
export async function prepareExport({cases,labels,manifest,consents,labelEvidence,mode}) {
  cases=parsedCases(cases);manifest=parseExperiment(cases,manifest);choice(mode,['fixture-demo','reviewed-data'],'export mode');
  const reviewed=await reviewLabelEvidence({cases,labels,references:labelEvidence});const byId=new Map(reviewed.reviewed.map(r=>[r.caseId,r]));
  const splitRows={train:[],validation:[],test:[]},excluded=[],included=[];
  for(const [i,c] of cases.entries()){
    const e=manifest.entries[i],reasons=[];const label=byId.get(c.id);
    if(!label)reasons.push('independent label unavailable');if(e.split==='unassigned')reasons.push('split unassigned');
    if(!e.decisionTimeReviewed||!e.redactionReviewed)reasons.push('input review missing');
    if(!e.exportApproved||e.rights==='unknown')reasons.push('local export permission or rights missing');
    if(mode==='fixture-demo' && !e.fixtureOnly)reasons.push('fixture demo excludes observed data');
    if(mode==='reviewed-data' && e.fixtureOnly)reasons.push('synthetic fixture excluded from reviewed training data');
    if(!e.fixtureOnly){try{consentFor(consents,e.sessionId);}catch(error){reasons.push(error.message);}}
    if(reasons.length){excluded.push({caseId:c.id,reasons});continue;}
    const row={caseId:c.id,caseHash:c.hash,taskGroup:e.taskGroup,lineageGroup:e.lineageGroup,sessionId:e.sessionId,fixtureOnly:e.fixtureOnly,input:c.input,question:c.question,answer:label.label.value,label:{...label.label},source:{...c.source}};
    splitRows[e.split].push(row);included.push(e);
  }
  check(included.length>0,'no export-eligible cases');
  const trainingEligible=mode==='reviewed-data'&&excluded.length===0&&Object.values(splitRows).every(rows=>rows.length>0)&&included.every(e=>!e.fixtureOnly&&e.trainingApproved&&e.rights==='local-training');
  const files={...trainingAssets()};
  for(const [split,rows] of Object.entries(splitRows))files[`${split}.jsonl`]=rows.map(r=>JSON.stringify(r)+'\n').join('');
  const metadata={schema:1,kind:'decision-learning-export',mode,experimentId:manifest.id,experimentHash:learningDigest(manifest),trainingEligible,trainingExecuted:false,providerPredictionsIncluded:false,counts:Object.fromEntries(Object.entries(splitRows).map(([s,r])=>[s,r.length])),excluded,review:{frozenAt:manifest.frozenAt,eligibilityRecords:included,independentLabelReceipts:reviewed.reviewed.map(r=>({...r.reference,recordedAt:r.recordedAt})),sessionConsents:[...new Set(included.filter(e=>e.sessionId!==null).map(e=>e.sessionId))].map(sessionId=>{const c=consentFor(consents,sessionId);return {sessionId,sha256:learningDigest(c),decision:c.decision,interactionId:c.interactionId,recordedAt:c.recordedAt};})},files:Object.fromEntries(Object.entries(files).map(([name,s])=>[name,{sha256:learningDigest(s),bytes:Buffer.byteLength(s)}]))};
  files['export-manifest.json']=JSON.stringify(metadata,null,2)+'\n';
  return {schema:1,kind:'prepared-decision-learning-export',metadata,files};
}
export async function writePreparedExport({prepared,directory}) {
  keys(prepared,['schema','kind','metadata','files'],'prepared export');check(prepared.schema===1&&prepared.kind==='prepared-decision-learning-export','unsupported prepared export');text(directory,'output directory',4096);check(isAbsolute(directory),'output directory must be absolute');
  const allowed=['train.jsonl','validation.jsonl','test.jsonl','export-manifest.json','train-lora.py','training-config.example.json','requirements-training.txt','TRAINING.md'];
  check(Object.keys(prepared.files).sort().join('|')===[...allowed].sort().join('|'),'unexpected export files');
  check(prepared.files['export-manifest.json']===JSON.stringify(prepared.metadata,null,2)+'\n','export metadata mismatch');
  for(const [name,s] of Object.entries(prepared.files)){check(typeof s==='string','export file must be text');if(name!=='export-manifest.json')check(prepared.metadata.files[name]?.sha256===learningDigest(s)&&prepared.metadata.files[name]?.bytes===Buffer.byteLength(s),'prepared export bytes changed');}
  await mkdir(directory,{mode:0o700}); // Must be new. No recursive parent creation, deletion or replacement.
  for(const [name,s] of Object.entries(prepared.files))await writeFile(join(directory,name),s,{encoding:'utf8',flag:'wx',mode:0o600});
  return {directory,trainingEligible:prepared.metadata.trainingEligible,files:Object.fromEntries(Object.entries(prepared.files).map(([name,s])=>[name,{sha256:learningDigest(s),bytes:Buffer.byteLength(s)}]))};
}
