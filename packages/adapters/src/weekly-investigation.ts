import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { constants, openSync, fstatSync, writeSync, fsyncSync, closeSync, realpathSync } from 'node:fs';
import { screenResults, validateResults, parseLearningRequest, buildHypothesis, selectWeeklyInvestigation, authorizeInvestigation, previewInvestigationScenario, applyInvestigationScenario, freezeInvestigation, assertFrozenInvestigation, type Hypothesis, type InvestigationAuthority, type InvestigationScenarioPreview, type FrozenInvestigationInputs } from '@skill-harness/core';
import { createArchiveReadCapability, type ArchiveReadCapabilityOptions } from './archive-read-capability.js';
import { readArchiveSource } from './evidence-archive.js';
import { readLearningCase } from './learning-case.js';
import { learningJournal, learningCopy, learningHash, learningFile, registerLearningStore, verifyLearningStore } from './learning-journal.js';
export interface WeeklySupervisorInput {archiveRoot:string;week:string;population:string;policyDigest:string;maxCases:number;cases:{version:2|3;batchId:string;manifestId:string;decisionId:string}[];reader:Omit<ArchiveReadCapabilityOptions,'root'>}
export interface ModelArchiveRequest {kind:'producer-archive-model-v1';manifestIds:string[];maxInputBytes:number;proposalLimits:{subjectCalls:number;judgeCalls:number;wallMs:number}}
export interface InvestigationScreenRequest {manifestIds:string[];population:string}
export interface InvestigationFiles {spec:string;rubric:string;judgePolicy:string;heldout:string;configuration:string;skill:string}
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function confirmed(input:WeeklySupervisorInput){
 if(Object.keys(input).sort().join()!=='archiveRoot,cases,maxCases,policyDigest,population,reader,week'||!isAbsolute(input.archiveRoot))throw Error('closed absolute weekly input required');
 if(!Array.isArray(input.cases)||!input.cases.length||input.cases.length>32)throw Error('bounded confirmed cases required');
 return input.cases.map(c=>{const {candidate,current,matched}=readLearningCase(input.archiveRoot,c);if(!matched||current?.disposition!=='confirmed_defect'||candidate.detector.population!==input.population)throw Error('current confirmed case decision and population required');return candidate.id;});
}
function selection(input:WeeklySupervisorInput){const ids=confirmed(input),reader=createArchiveReadCapability({...input.reader,root:input.archiveRoot});return selectWeeklyInvestigation([],{week:input.week,population:input.population,policyDigest:input.policyDigest,archiveSnapshot:reader.snapshot.id,eligibleCaseIds:ids,maxCases:input.maxCases});}
export function createWeeklyInvestigation(directory:string,input:WeeklySupervisorInput){
 const safe=learningCopy(input),selected=selection(safe),initial={type:'initial',kind:'weekly-investigation-v1',input:safe,selection:selected};
 registerLearningStore(safe.archiveRoot,'weekly',selected.key,directory,learningHash(initial));
 try{learningJournal(directory,initial);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const old=learningJournal(directory).read()[0].value;if(learningHash(old)!==learningHash(initial))throw Error('weekly selection already frozen');}
 return openWeeklyInvestigation(directory);
}
/** Existing run is a finite inert data-only interpreter. The separate prepareModel/runModel
 * composition forwards only capability-selected frozen bytes to an original producer model seam;
 * it does not expose shell/filesystem tools or turn proposal evidence into execution authority. */
export function openWeeklyInvestigation(directory:string){
 const journal=learningJournal(directory),initial=journal.read()[0].value;
 if(initial.kind!=='weekly-investigation-v1'||initial.type!=='initial')throw Error('wrong supervisor journal');
 const input=initial.input as unknown as WeeklySupervisorInput,selected=initial.selection as ReturnType<typeof selectWeeklyInvestigation>;
 const inspect=()=>{verifyLearningStore(input.archiveRoot,'weekly',selected.key,directory,learningHash(initial));const events=journal.read();let state='prepared',hypothesis:Hypothesis|null=null,approved=false,preview:InvestigationScenarioPreview|null=null,frozen:ReturnType<typeof freezeInvestigation>|null=null,files:InvestigationFiles|null=null,skillHash:string|null=null;
  for(const {value:v} of events.slice(1)){
   switch(v.type){
    case 'model-prepared':if(state!=='prepared')throw Error('invalid model preparation');state='model-prepared';break;
    case 'claim':if(!['prepared','model-prepared'].includes(state))throw Error('invalid supervisor claim');state='claimed';break;
    case 'read':if(state!=='claimed')throw Error('invalid read phase');break;
    case 'proposed':if(state!=='claimed')throw Error('invalid proposal phase');hypothesis=buildHypothesis((v.hypothesis as Hypothesis).proposal);if(hypothesis.id!==(v.hypothesis as Hypothesis).id)throw Error('proposal identity changed');state='proposed';break;
    case 'failed':if(state!=='claimed')throw Error('invalid failure phase');state='failed';break;
    case 'approved':if(state!=='proposed')throw Error('invalid approval phase');approved=true;state='approved';break;
    case 'promotion-pending':if(state!=='approved')throw Error('invalid promotion phase');preview=v.preview as InvestigationScenarioPreview;state='promotion-pending';break;
    case 'promoted':if(state!=='promotion-pending')throw Error('invalid promotion completion');state='promoted';break;
    case 'frozen':if(state!=='promoted')throw Error('invalid freeze phase');frozen=v.frozen as ReturnType<typeof freezeInvestigation>;files=v.files as unknown as InvestigationFiles;skillHash=String(v.skillHash);state='frozen';break;
    case 'edit-pending':if(state!=='frozen')throw Error('invalid edit phase');state='edit-pending';break;
    case 'edited':if(state!=='edit-pending')throw Error('invalid edit completion');skillHash=String(v.skillHash);state='edited';break;
    case 'screened':if(!['frozen','edited'].includes(state))throw Error('invalid screen phase');break;
    default:throw Error('unknown supervisor event');
   }
  }
  return learningCopy({state,hypothesis,approved,preview,frozen,files,skillHash,selection:selected,tip:events.at(-1)!.id});
 };
 inspect();const append=(prior:string,value:Record<string,unknown>)=>journal.append(prior,value);
 const inputs=(files:InvestigationFiles):FrozenInvestigationInputs=>({specSha256:sha(learningFile(files.spec)),rubricSha256:sha(learningFile(files.rubric)),judgePolicySha256:sha(learningFile(files.judgePolicy)),heldoutSha256:sha(learningFile(files.heldout)),configurationSha256:sha(learningFile(files.configuration))});
 const evaluation=()=>{const s=inspect();if(!s.frozen||!s.files||!['frozen','edited'].includes(s.state))throw Error('frozen investigation required');confirmed(input);assertFrozenInvestigation(s.frozen,inputs(s.files));if(sha(learningFile(s.files.skill))!==s.skillHash)throw Error('candidate changed outside authorized edit');return {frozen:s.frozen,caseIds:s.hypothesis!.proposal.caseIds,skillSha256:s.skillHash,executionReady:false as const};};
 const previewScreen=(request:InvestigationScreenRequest)=>{const evaluated=evaluation(),s=inspect(),input=learningCopy(request);if(Object.keys(input).sort().join()!=='manifestIds,population'||typeof input.population!=='string'||!input.population.length||input.population.length>512||!Array.isArray(input.manifestIds)||!input.manifestIds.length||input.manifestIds.length>16||new Set(input.manifestIds).size!==input.manifestIds.length||input.manifestIds.some(id=>!/^[a-f0-9]{64}$/.test(id)))throw Error('bounded distinct screen sources required');
  const binding={input,freeze:evaluated.frozen.digest,skillSha256:evaluated.skillSha256,scenarioId:String(s.preview!.scenario.id)};return {...binding,digest:learningHash(binding)};};
 return {inspect,evaluation,previewScreen,
  prepareModel(raw:ModelArchiveRequest){
   const request=learningCopy(raw),s=inspect();confirmed(input);
   if(Object.keys(request).sort().join()!=='kind,manifestIds,maxInputBytes,proposalLimits'||request.kind!=='producer-archive-model-v1'||!Number.isSafeInteger(request.maxInputBytes)||request.maxInputBytes<1||request.maxInputBytes>3000||!Array.isArray(request.manifestIds)||!request.manifestIds.length||new Set(request.manifestIds).size!==request.manifestIds.length||request.manifestIds.length>input.reader.maxCalls||request.manifestIds.some(id=>!input.reader.manifestIds.includes(id))||Object.keys(request.proposalLimits).sort().join()!=='judgeCalls,subjectCalls,wallMs'||Object.values(request.proposalLimits).some(n=>!Number.isSafeInteger(n)||n<0)||request.proposalLimits.wallMs<1)throw Error('bounded archive-only model request required');
   const old=journal.read().find(e=>e.value.type==='model-prepared');if(old){if(learningHash(old.value.request)!==learningHash(request)||s.state!=='model-prepared')throw Error('model preparation changed or already claimed');return learningCopy(old.value.prepared) as {digest:string;input:string};}
   if(s.state!=='prepared')throw Error('weekly owner already claimed');
   const reader=createArchiveReadCapability({...input.reader,root:input.archiveRoot});const sources=request.manifestIds.map(id=>{const r=reader.read(id);return {manifestId:r.manifestId,sha256:r.reference.sha256,bytesBase64:r.bytes.toString('base64')};});
   const text=JSON.stringify({selection:selected,sources,proposalLimits:request.proposalLimits});if(Buffer.byteLength(text)>request.maxInputBytes)throw Error('archive model input overbudget');
   const prepared={input:text,digest:learningHash({request,input:text,selection:selected})};append(s.tip,{type:'model-prepared',request,prepared,sourceKind:'producer-archive-model-v1'});return prepared;
  },
  async runModel(preparedDigest:string,planSha256:string,invoke:(input:string)=>Promise<{hostPath:string;id:string}>){
   const s=inspect(),prepared=journal.read().find(e=>e.value.type==='model-prepared')?.value;if(s.state!=='model-prepared'||!prepared||(prepared.prepared as any).digest!==preparedDigest||!/^([a-f0-9]{64})$/.test(planSha256))throw Error('frozen model preparation required');confirmed(input);
   const tip=append(s.tip,{type:'claim',sourceKind:'producer-archive-model-v1',preparedDigest,planSha256}).id;
   try{const ref=await invoke(String((prepared.prepared as any).input)),rows=learningJournal(ref.hostPath).read(),obs=rows.find(r=>r.value.type==='observation'&&r.value.id===ref.id),bound=rows.find(r=>r.value.type==='producer-ipc-bound'&&r.value.id===ref.id),settled=rows.find(r=>r.value.type==='producer-ipc-settled'&&r.value.id===ref.id);
    if(!obs||!bound||!settled||bound.value.bindingHash!==settled.value.bindingHash||(bound.value.binding as any).charterSha256!==planSha256)throw Error('original model settlement required');
    const h=buildHypothesis(JSON.parse(Buffer.from(String(obs.value.outputBase64),'base64').toString('utf8')));if(h.proposal.archiveSnapshot!==selected.archiveSnapshot||h.proposal.population!==selected.population||learningHash([...h.proposal.caseIds].sort())!==learningHash([...selected.selectedCaseIds].sort())||learningHash(h.proposal.limits)!==learningHash((prepared.request as ModelArchiveRequest).proposalLimits))throw Error('model proposal scope/limits mismatch');confirmed(input);append(tip,{type:'proposed',hypothesis:h,sourceKind:'producer-archive-model-v1',source:{...ref,observation:obs.id,settlement:settled.id,planSha256},approved:false});return h;
   }catch(error){try{append(tip,{type:'failed',reason:'model-retro-failed; no retry'});}catch(persist){throw new AggregateError([error,persist],'retro failure persistence unknown');}throw error;}
  },
  screen(request:InvestigationScreenRequest,authorizedLinks:readonly string[]){const s=inspect(),preview=previewScreen(request);if(!authorizedLinks.includes(preview.digest))throw Error('independent exact screen linkage authority required');if(inspect().tip!==s.tip)throw Error('stale screen snapshot');const seen=new Set<string>();
   const results=preview.input.manifestIds.map(id=>{const source=readArchiveSource(input.archiveRoot,id);if(source.status!=='available'||source.reference.retention!=='exact'||source.reference.parser.id!=='skill-harness-results'||source.bytes.length>65536)throw Error('retained screen results unavailable');if(seen.has(source.reference.sha256))throw Error('duplicate screen evidence bytes');seen.add(source.reference.sha256);
    const result=validateResults(parseLearningRequest(source.bytes.toString('utf8')));if(source.reference.parser.version!==String(result.schema)||typeof result.skill!=='string'||typeof result.model!=='string'||new Set(result.scenarios.map(r=>r.id)).size!==result.scenarios.length||!result.scenarios.some(r=>r.id===preview.scenarioId))throw Error('screen result scenario/schema binding mismatch');return result;});
   const report=screenResults(results),receipt={...preview,report:{scenarios:report.scenarios.filter(r=>r.id===preview.scenarioId),criteria:report.criteria.filter(r=>r.scenario_id===preview.scenarioId)},exploratory:true as const,populationMatches:preview.input.population===selected.population,comparisonQualified:false as const};
   const old=journal.read().find(e=>e.value.type==='screened'&&(e.value.receipt as typeof receipt).digest===receipt.digest);if(old){if(learningHash(old.value.receipt)!==learningHash(receipt))throw Error('screen receipt changed');return receipt;}
   append(s.tip,{type:'screened',receipt});return receipt;
  },
  run(program:unknown){const before=inspect();if(before.state!=='prepared')throw Error('weekly job already claimed; no automatic retry');confirmed(input);
   let tip=journal.append(before.tip,{type:'claim'}).id;
   try{const host=learningCopy(program) as {kind:string;requests:Record<string,unknown>[]};if(host.kind!=='inert-v1'||Object.keys(host).sort().join()!=='kind,requests'||!Array.isArray(host.requests)||host.requests.length>128)throw Error('host denied');
    const reader=createArchiveReadCapability({...input.reader,root:input.archiveRoot});let reads=0,h:Hypothesis|null=null;
    for(const request of host.requests){if(h)throw Error('request after proposal denied');if(request.tool==='archive.read'&&Object.keys(request).sort().join()==='manifestId,tool'){
      const result=reader.read(String(request.manifestId));tip=append(tip,{type:'read',manifestId:result.manifestId,sha256:result.reference.sha256}).id;reads++;
     }else if(request.tool==='hypothesis'&&Object.keys(request).sort().join()==='proposal,tool'){
      h=buildHypothesis(request.proposal as Hypothesis['proposal']);if(!reads||h.proposal.archiveSnapshot!==selected.archiveSnapshot||h.proposal.population!==selected.population||learningHash([...h.proposal.caseIds].sort())!==learningHash([...selected.selectedCaseIds].sort())||h.proposal.limits.subjectCalls!==0||h.proposal.limits.judgeCalls!==0)throw Error('confirmed case/read linkage or inert budget mismatch');
     }else throw Error('capability denied');
    }
    if(!h)throw Error('hypothesis missing');confirmed(input);append(tip,{type:'proposed',hypothesis:h});return h;
   }catch(error){try{append(tip,{type:'failed',reason:'inert-host-refused-or-failed'});}catch(persist){throw new AggregateError([error,persist],'supervisor failed; failure persistence unknown');}throw error;}
  },
  approve(authority:InvestigationAuthority){const s=inspect();if(!s.hypothesis)throw Error('hypothesis required');const approval=authorizeInvestigation(s.hypothesis,authority);if(s.approved)return approval;if(s.state!=='proposed')throw Error('proposal required');confirmed(input);append(s.tip,{type:'approved',approval});return approval;},
  preview(specPath:string,scenario:Record<string,unknown>){const s=inspect();if(!s.approved||!s.hypothesis)throw Error('investigation approval required');confirmed(input);return previewInvestigationScenario(s.hypothesis,specPath,scenario);},
  promote(preview:InvestigationScenarioPreview,authority:InvestigationAuthority){const s=inspect();if(!s.hypothesis||!s.approved)throw Error('approved investigation required');authorizeInvestigation(s.hypothesis,authority);if(!authority.promotions.includes(preview.digest))throw Error('exact promotion authority required');confirmed(input);
   if(['promoted','frozen','edited'].includes(s.state)&&s.preview?.digest===preview.digest){if(learningHash(s.preview)!==learningHash(preview))throw Error('promotion identity changed');if(sha(learningFile(preview.specPath))!==preview.afterSha256)throw Error('promoted scenario changed');return {scenarioId:String(preview.scenario.id),replayed:true,sha256:preview.afterSha256,scope:'scenario-only' as const};}
   if(s.state!=='approved')throw Error('pending effects are not retried');if(learningHash(previewInvestigationScenario(s.hypothesis,preview.specPath,preview.scenario))!==learningHash(preview))throw Error('promotion identity changed');const pending=append(s.tip,{type:'promotion-pending',preview});const result=applyInvestigationScenario(s.hypothesis,preview,authority);append(pending.id,{type:'promoted',result});return result;},
  freeze(files:InvestigationFiles,authority:InvestigationAuthority){const s=inspect();if(s.state!=='promoted'||!s.hypothesis||!s.preview||files.spec!==s.preview.specPath||sha(learningFile(files.spec))!==s.preview.afterSha256)throw Error('promoted scenario binding required');confirmed(input);const safe=learningCopy(files);for(const key of Object.keys(safe) as (keyof InvestigationFiles)[]){learningFile(safe[key]);safe[key]=realpathSync(safe[key]);}if(Object.keys(safe).sort().join()!=='configuration,heldout,judgePolicy,rubric,skill,spec'||new Set(Object.values(safe)).size!==6)throw Error('distinct frozen evaluation and candidate paths required');const frozen=freezeInvestigation(s.hypothesis,inputs(safe),authority);append(s.tip,{type:'frozen',frozen,files:safe,skillHash:sha(learningFile(safe.skill))});return frozen;},
  previewEdit(text:string){evaluation();const s=inspect();if(s.state!=='frozen'||typeof text!=='string'||Buffer.byteLength(text)>1024*1024)throw Error('frozen bounded edit required');return learningHash({freeze:s.frozen!.digest,path:s.files!.skill,before:s.skillHash,after:sha(Buffer.from(text))});},
  edit(text:string,authorizedDigests:readonly string[]){const id=this.previewEdit(text),s=inspect();if(!authorizedDigests.includes(id))throw Error('independent exact edit authority required');confirmed(input);const pending=append(s.tip,{type:'edit-pending',editId:id});
   const fd=openSync(s.files!.skill,constants.O_WRONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);try{const stat=fstatSync(fd);if(!stat.isFile()||stat.nlink!==1)throw Error('edit destination changed');
    // Whole-file replacement is bounded and explicitly approved. Partial writes remain pending/error.
    const bytes=Buffer.from(text);let n=0;while(n<bytes.length){const k=writeSync(fd,bytes,n,bytes.length-n,n);if(!k)throw Error('edit write stalled');n+=k;}
    // Truncate only this explicitly approved candidate, never an evaluation input or historical evidence.
    truncateCandidate(fd,bytes.length);fsyncSync(fd);
   }finally{closeSync(fd);}const current=sha(learningFile(s.files!.skill));if(current!==sha(Buffer.from(text)))throw Error('edited candidate bytes changed');append(pending.id,{type:'edited',skillHash:current});return evaluation();}
 };
}
import { ftruncateSync as truncateCandidate } from 'node:fs';
