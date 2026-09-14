import { mkdirSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  buildHypothesis, buildAdoptionBinding, authorizeAdoption, authorizeRollback, buildRollbackRequest,
  classifyProductionObservation, type HypothesisProposal, type Hypothesis, type AdoptionBinding,
  type AdoptionAuthority, type AdoptionFacts, type AdoptionReceipt, type RollbackRequest,
  type ProductionObservation, type BlindQualityChoice,
} from '@skill-harness/core';
import { learningCopy, learningHash, learningJournal, registerLearningStore, verifyLearningStore } from './learning-journal.js';
import { readArchiveSource, readArchiveSourceReference, retainArchiveSource } from './evidence-archive.js';
import { createWorkCaseReviewer, createWorkSignalReviewer, type WorkCaseReviewRequest } from './work-case-review.js';
import { readLearningCase, type LearningCaseReference } from './learning-case.js';
import { readWorkCandidate } from './work-case-archive.js';
import { readWorkSignalCase } from './work-signal-cases.js';
import { openBlindIntervention, readBlindInterventionBinding } from './blind-intervention.js';
import { openTrustLifecycle, createTrustLifecycle, trustPolicyDigest, type TrustLifecycleInput } from './trust-lifecycle.js';
import { retainLearningLifecycle } from './learning-lifecycle.js';

const SHA = /^[a-f0-9]{64}$/;
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
function closed(value: unknown, keys: string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join() !== [...keys].sort().join()) throw Error('closed learning workspace input required');
}
function text(value: unknown, max = 4000): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw Error('bounded learning text required');
}
function hash(value: unknown): asserts value is string { if (typeof value !== 'string' || !SHA.test(value)) throw Error('retained digest required'); }
function path(value: string) { if (!isAbsolute(value) || resolve(value) !== value) throw Error('canonical absolute learning path required'); }
function named(value: { name: string; title: string }) { if (!NAME.test(value.name)) throw Error('learning name must be a short slug'); text(value.title, 512); }
function clock(now: number) { if (!Number.isSafeInteger(now) || now < 0) throw Error('valid learning clock required'); }
const message = (error: unknown) => error instanceof Error ? error.message : 'learning evidence unavailable';
function source(root: string, id: string, parser?: string) {
  hash(id); const r = readArchiveSource(root, id);
  if (r.status !== 'available' || r.reference.retention !== 'exact' || parser && (r.reference.parser.id !== parser || r.reference.parser.version !== '1')) throw Error('retained learning evidence missing, changed or unsupported');
  return r;
}
function jsonSource<T>(root: string, id: string, parser?: string): T {
  return learningCopy(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source(root, id, parser).bytes))) as T;
}
function retain(root: string, parser: string, value: unknown) {
  return retainArchiveSource(root, { sourceId: `${parser}-${learningHash(value).slice(0,32)}`, parser: { id: parser, version: '1' }, retention: 'exact', bytes: Buffer.from(JSON.stringify(value)) }).manifestId;
}
/** Creates only explicitly selected private local directories; never follows a symlink. */
export function prepareLearningDirectory(directory: string): void {
  path(directory);
  try { const s = lstatSync(directory); if (!s.isDirectory() || s.isSymbolicLink()) throw Error('learning directory substitution'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; prepareLearningDirectory(dirname(directory)); mkdirSync(directory, { mode: 0o700 }); }
  for(let p=directory;;p=dirname(p)) {const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('learning directory ancestor substitution');if(p===dirname(p))break;}
}
export interface LearningWorkspaceInput { archiveRoot: string; scopeDigest: string; population: string; author: string }
export interface LearningCaseBinding { name: string; title: string; version: 2|3; batchId: string }
export interface LearningComparisonBinding {
  name: string; title: string; scopeStatement: string; comparisonManifestId: string;
  caseReference: LearningCaseReference|null; hypothesisManifestId: string|null;
  priorFeedbackManifestIds: string[]; adoptionBinding: AdoptionBinding|null;
}
export interface LearningQualityReview { scope: 'full-artifacts'; note: string; reviewedArtifactDigests: string[] }
export interface LearningDecisionRequest { disposition: 'adopt'|'reject'|'defer'; note: string; priorDecisionId: string|null }
export interface LearningRegistryReceipt {
  version: 'learning-registry-receipt-v1'; operation: 'activate'|'rollback'; requestId: string;
  adoptionId: string; scopeDigest: string; candidateDigest: string; revision: number;
  /** Exact original registry inspect()/activate()/rollback() response retained by its owner. */
  registryManifestId: string;
}
function validInput(input: LearningWorkspaceInput) {
  closed(input, ['archiveRoot','scopeDigest','population','author']); path(input.archiveRoot); hash(input.scopeDigest); text(input.population,512); text(input.author,512);
  if(/[\u0000-\u001f\u007f]/.test(input.population+input.author))throw Error('single-line population and explicit author required');
}
const workspaceKey = (input: LearningWorkspaceInput) => learningHash({ scopeDigest: input.scopeDigest, population: input.population, author: input.author });

/** Composition over the existing archive and CAS journals. No worker callbacks, model calls,
 * exposure, registry mutation, authentication or hostile-same-UID protection. */
export function createLearningWorkspace(directory: string, input: LearningWorkspaceInput) {
  const safe = learningCopy(input); validInput(safe); path(directory);
  prepareLearningDirectory(dirname(directory)); prepareLearningDirectory(safe.archiveRoot);
  const initial = { type: 'learning-workspace-v1', input: safe };
  let exists=true;try {lstatSync(directory);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;exists=false;}
  if(exists) {
    if(learningHash(learningJournal(directory).read()[0].value)!==learningHash(initial))throw Error('learning workspace already bound');
    return openLearningWorkspace(directory);
  }
  registerLearningStore(safe.archiveRoot, 'workspace', workspaceKey(safe), directory, learningHash(initial));
  try { learningJournal(directory, initial); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; if (learningHash(learningJournal(directory).read()[0].value) !== learningHash(initial)) throw Error('learning workspace already bound'); }
  return openLearningWorkspace(directory);
}

export function openLearningWorkspace(directory: string) {
  path(directory); const journal = learningJournal(directory), initial = journal.read()[0].value;
  closed(initial, ['type','input']); if (initial.type !== 'learning-workspace-v1') throw Error('wrong learning workspace');
  const input = initial.input as unknown as LearningWorkspaceInput; validInput(input);
  const history = () => {
    verifyLearningStore(input.archiveRoot, 'workspace', workspaceKey(input), directory, learningHash(initial));
    const rows=journal.read(),names=new Set<string>(),decisions=new Map<string,string>();
    const known=new Set(['case-binding','comparison-binding','comparison-context','hypothesis-binding','unflagged-binding','trust-binding','quality-pending','quality','decision','adoption','activation','rollback-request','rollback','outcome','lifecycle']);
    for(const row of rows.slice(1)) {
      const v=row.value;if(!known.has(String(v.type)))throw Error('unknown learning workspace event');
      if(String(v.type).endsWith('-binding') && v.type!=='trust-binding') {
        const b=v.binding as {name:string};if(!b||!NAME.test(b.name)||names.has(`${v.type}:${b.name}`))throw Error('duplicate or invalid learning binding');names.add(`${v.type}:${b.name}`);
      }
      if(v.type==='decision') {
        const r=v.request as LearningDecisionRequest;
        if(!r||r.priorDecisionId!==(decisions.get(String(v.name))??null))throw Error('learning decision history fork');decisions.set(String(v.name),row.id);
      }
    }
    return rows;
  };
  const events = () => history().map(e => e.value);
  const append = (value: Record<string,unknown>, prior = history().at(-1)!.id) => journal.append(prior, value);
  const bindings = <T>(type: string): T[] => events().filter(e => e.type === type).map(e => e.binding as T);
  const selected = <T extends {name:string}>(type: string, name: string): T => {
    const b = bindings<T>(type).find(b => b.name === name); if (!b) throw Error(`unknown retained learning name: ${name}`); return learningCopy(b);
  };
  const bound = (type: string, binding: {name:string}) => {
    const before=history().at(-1)!.id;
    const old = bindings<{name:string}>(type).find(b => b.name === binding.name);
    if (old) { if (learningHash(old) !== learningHash(binding)) throw Error('learning name already bound; use a new name for changed evidence'); return; }
    if (bindings(type).length >= 128) throw Error('learning binding limit reached'); append({type,binding},before);
  };
  const reviewer = (b: LearningCaseBinding) => b.version === 3 ? createWorkSignalReviewer(input.archiveRoot,b.batchId,input.author) : createWorkCaseReviewer(input.archiveRoot,b.batchId,input.author);
  const validateCases = (b: LearningCaseBinding) => {
    closed(b,['name','title','version','batchId']); named(b); if (![2,3].includes(b.version)) throw Error('unsupported case version'); hash(b.batchId);
    const r = reviewer(b); for(let offset=0;;offset+=5) { const p = r.list(offset); for(const c of p.items) if (c.candidate.detector.population !== input.population || c.candidate.target.snapshotDigest !== input.scopeDigest) throw Error('case snapshot scope or population mismatch'); if (offset+5>=p.total) break; }
    return r;
  };
  const caseEvidenceIds = (name:string,caseManifestId:string) => {
    const binding=selected<LearningCaseBinding>('case-binding',name),r=validateCases(binding);
    for(let offset=0;;offset+=5) {
      const page=r.list(offset),item=page.items.find(c=>c.caseManifestId===caseManifestId);
      if(item) {
        // Candidate.evidence contains byte/protocol digests, NOT archive manifest IDs.
        const observationId=binding.version===3?readWorkSignalCase(input.archiveRoot,caseManifestId).observationId:jsonSource<{observationId?:string}>(input.archiveRoot,binding.batchId,'work-candidate-batch').observationId;
        if(observationId===undefined)return [caseManifestId]; // Explicit legacy nomination-only view.
        hash(observationId);const observed=readArchiveSourceReference(input.archiveRoot,observationId);
        if(binding.version===2&&observed.status==='available'&&!item.candidate.evidence.includes(observed.reference.sha256))throw Error('observation link is outside case evidence');
        return [caseManifestId,observationId];
      }
      if(offset+5>=page.total)break;
    }
    throw Error('case outside named batch');
  };
  const hypothesis = (id: string) => {
    const h = jsonSource<Hypothesis>(input.archiveRoot,id,'factory-hypothesis');
    if (learningHash(buildHypothesis(h.proposal)) !== learningHash(h) || h.proposal.population !== input.population) throw Error('hypothesis changed or population mismatch');
    return h;
  };
  const validateComparison = (b: LearningComparisonBinding) => {
    closed(b,['name','title','scopeStatement','comparisonManifestId','caseReference','hypothesisManifestId','priorFeedbackManifestIds','adoptionBinding']); named(b); text(b.scopeStatement);
    const metadata = readBlindInterventionBinding(input.archiveRoot,b.comparisonManifestId,input.author);
    if (!Array.isArray(b.priorFeedbackManifestIds) || b.priorFeedbackManifestIds.length>32 || new Set(b.priorFeedbackManifestIds).size!==b.priorFeedbackManifestIds.length) throw Error('bounded prior feedback required');
    b.priorFeedbackManifestIds.forEach(id=>source(input.archiveRoot,id));
    const c = b.caseReference ? readLearningCase(input.archiveRoot,b.caseReference) : null;
    if (c && (!c.matched || c.candidate.detector.population!==input.population || c.candidate.target.snapshotDigest!==input.scopeDigest)) throw Error('case decision stale or snapshot scope/population mismatch');
    const h = b.hypothesisManifestId ? hypothesis(b.hypothesisManifestId) : null;
    if (h && c && !h.proposal.caseIds.includes(c.candidate.id)) throw Error('hypothesis case mismatch');
    if (h && metadata.investigationDigest!==h.id) throw Error('comparison belongs to a different retained hypothesis');
    if (b.adoptionBinding) {
      const {version,id,...draft} = b.adoptionBinding;
      if (version!=='adoption-binding-v1' || buildAdoptionBinding(draft).id!==id || b.adoptionBinding.scopeDigest!==input.scopeDigest || b.adoptionBinding.experimentDigest!==metadata.experimentDigest || !h || !c || c.current?.disposition!=='confirmed_defect' || b.adoptionBinding.hypothesisDigest!==h.id) throw Error('adoption case/hypothesis/comparison/scope mismatch');
    }
    return openBlindIntervention(input.archiveRoot,b.comparisonManifestId,input.author);
  };
  const comparisonBinding = (name: string) => {
    const b=selected<LearningComparisonBinding>('comparison-binding',name);
    const context=events().filter(e=>e.type==='comparison-context'&&e.name===name).at(-1);
    return context ? {...b,...learningCopy(context.context) as Pick<LearningComparisonBinding,'caseReference'|'hypothesisManifestId'|'adoptionBinding'>} : b;
  };
  const last = (type: string, name: string) => events().filter(e=>e.type===type && e.name===name).at(-1);
  const decision = (name: string) => {
    const e = history().filter(e=>e.value.type==='decision' && e.value.name===name).at(-1);
    return e ? {id:e.id,...e.value.request as unknown as LearningDecisionRequest} : null;
  };
  const adoption = (name: string): AdoptionReceipt => {
    const e = last('adoption',name); if (!e) throw Error('authorized adoption receipt missing');
    if(learningHash(jsonSource(input.archiveRoot,String(e.manifestId),'learning-adoption'))!==learningHash(e.receipt))throw Error('retained adoption receipt changed or missing');
    return learningCopy(e.receipt) as AdoptionReceipt;
  };
  const quality = (name: string) => {
    const b = comparisonBinding(name), blind = validateComparison(b), choice = blind.quality(), receipt = last('quality',name);
    if (receipt) {
      if(learningHash(receipt.choice)!==learningHash(choice)) throw Error('durable quality choice changed');
      const {manifestId,...body}=receipt;
      if(learningHash(jsonSource(input.archiveRoot,String(manifestId),'learning-quality'))!==learningHash(body))throw Error('retained quality receipt changed or missing');
    }
    return {b,blind,choice,receipt};
  };
  const requireQuality = (name: string) => { const q = quality(name); if (!q.choice || !q.receipt) throw Error('durable full-artifact-scope quality receipt required; excerpt feedback is not a choice'); return q; };
  const validateTrustScope = (c: TrustLifecycleInput) => {
    if(c.archiveRoot!==input.archiveRoot || c.component.population!==input.population)throw Error('trust archive/population mismatch');
    const incidents=new Set<string>(),unflagged=bindings<{manifestId:string;split:string}>('unflagged-binding');
    for(const row of c.cohort) {
      if(row.flagged) {
        const p=source(input.archiveRoot,row.manifestId).reference.parser;
        const candidate=p.id==='work-capture'?readWorkCandidate(input.archiveRoot,row.manifestId):p.id==='work-signal-case'?readWorkSignalCase(input.archiveRoot,row.manifestId).candidate:null;
        if(!candidate || candidate.target.snapshotDigest!==input.scopeDigest || candidate.detector.population!==input.population || c.component.kind==='detector' && learningHash(candidate.detector)!==learningHash({id:c.component.id,version:c.component.version,population:c.component.population}))throw Error('trust cohort requires actual same-snapshot scoped cases');
        const key=learningHash(candidate.target);if(incidents.has(key))throw Error('trust cohort repeats one work incident');incidents.add(key);
      } else if(!unflagged.some(b=>b.manifestId===row.manifestId&&b.split===row.split))throw Error('unflagged cohort source not explicitly bound to this workspace scope');
    }
  };
  const currentTrust = () => {
    const e = events().filter(e=>e.type==='trust-binding').at(-1); if (!e) return null;
    const trust = openTrustLifecycle(String(e.directory)), c = trust.configuration();
    validateTrustScope(c);
    if (trustPolicyDigest(c)!==e.policyId) throw Error('trust policy mismatch'); return trust;
  };
  const registryEvidence = (id: string, operation: LearningRegistryReceipt['operation'], name: string, permitted: readonly string[]) => {
    if (!permitted.includes(id)) throw Error('independent exact registry linkage authority required');
    const r = jsonSource<LearningRegistryReceipt>(input.archiveRoot,id,'learning-registry-receipt');
    closed(r,['version','operation','requestId','adoptionId','scopeDigest','candidateDigest','revision','registryManifestId']);
    const a = adoption(name);
    if (r.version!=='learning-registry-receipt-v1' || r.operation!==operation || r.adoptionId!==a.id || r.scopeDigest!==input.scopeDigest || !Number.isSafeInteger(r.revision) || r.revision<1 || r.candidateDigest!==(operation==='activate'?a.candidateDigest:a.rollbackCandidateDigest)) throw Error('registry receipt outside adopted scope');
    text(r.requestId,128);
    const view = jsonSource<Record<string,unknown>>(input.archiveRoot,r.registryManifestId);
    if (view.version!=='factory-registry-view-v1' || view.scopeDigest!==r.scopeDigest || view.candidateDigest!==r.candidateDigest || view.revision!==r.revision) throw Error('original registry observation mismatch');
    if (operation==='activate') {
      const active=view.activation as {requestId?:unknown;receipt?:{id?:unknown}}|null|undefined;
      const change=view.lastChange as {operation?:unknown;requestId?:unknown;adoptionId?:unknown}|null|undefined;
      if (view.application!=='applied' || view.requestId!==r.requestId || change?.operation!=='activate' || change.requestId!==r.requestId || change.adoptionId!==r.adoptionId || active?.requestId!==r.requestId || active.receipt?.id!==r.adoptionId || learningHash(active.receipt)!==learningHash(a)) throw Error('activation not applied by original registry for the exact request and adoption');
    }
    if (operation==='rollback' && (view.application!=='applied' || view.requestId!==r.requestId || r.requestId!==(last('rollback-request',name)?.request as RollbackRequest|undefined)?.id)) throw Error('rollback not applied by original registry');
    return r;
  };
  history();
  return {
    configuration: () => learningCopy(input),
    dashboardBinding() {
      const trust=currentTrust(),binding=events().filter(e=>e.type==='trust-binding').at(-1);
      return {trustDirectory:trust&&binding?String(binding.directory):null,trustPolicyId:trust?trust.inspect(0).policyId:null};
    },
    preparedAdoption(name: string) { return last('adoption',name)?adoption(name):null; },
    adoptionStatus(name: string) {
      const b=comparisonBinding(name),a=last('adoption',name),activation=last('activation',name),rollback=last('rollback',name);
      const receipt=a?adoption(name):null;
      if(activation) registryEvidence(String(activation.manifestId),'activate',name,[String(activation.manifestId)]);
      if(rollback) registryEvidence(String(rollback.manifestId),'rollback',name,[String(rollback.manifestId)]);
      return {binding:b.adoptionBinding,receipt,activationManifestId:activation?String(activation.manifestId):null,rollbackManifestId:rollback?String(rollback.manifestId):null};
    },
    bindCases(raw: LearningCaseBinding) { const b=learningCopy(raw); validateCases(b); bound('case-binding',b); return b; },
    bindComparison(raw: LearningComparisonBinding) { const b=learningCopy(raw); validateComparison(b); bound('comparison-binding',b); return {name:b.name,comparisonManifestId:b.comparisonManifestId}; },
    linkComparisonContext(name: string, context: Pick<LearningComparisonBinding,'caseReference'|'hypothesisManifestId'|'adoptionBinding'>) {
      const before=history().at(-1)!.id,b=comparisonBinding(name),safe=learningCopy(context);
      closed(safe,['caseReference','hypothesisManifestId','adoptionBinding']);
      for(const key of ['caseReference','hypothesisManifestId','adoptionBinding'] as const) if(b[key]!==null && learningHash(b[key])!==learningHash(safe[key])) throw Error('comparison context cannot replace retained links');
      validateComparison({...b,...safe});
      if(learningHash({caseReference:b.caseReference,hypothesisManifestId:b.hypothesisManifestId,adoptionBinding:b.adoptionBinding})!==learningHash(safe)) append({type:'comparison-context',name,context:safe},before);
      return {name,linked:true};
    },
    comparisonContext(name: string) {
      const b=comparisonBinding(name); validateComparison(b);
      return {caseReference:b.caseReference,hypothesisManifestId:b.hypothesisManifestId,adoptionBinding:b.adoptionBinding};
    },
    bindTrust(trustDirectory: string) {
      const before=history().at(-1)!.id;
      path(trustDirectory); const trust=openTrustLifecycle(trustDirectory), config=trust.configuration();
      validateTrustScope(config);
      const old=currentTrust(); if(old) { if(old.inspect(0).policyId!==trust.inspect(0).policyId) throw Error('trust is frozen for this workspace; no attention refill'); return; }
      append({type:'trust-binding',directory:trustDirectory,policyId:trust.inspect(0).policyId},before);
    },
    configureTrust(raw: TrustLifecycleInput, authorizedPolicyDigests: readonly string[]) {
      const config=learningCopy(raw);
      validateTrustScope(config);
      const existing=currentTrust(); if(existing && existing.inspect(0).policyId!==trustPolicyDigest(config)) throw Error('trust already frozen; no attention refill');
      const trust=createTrustLifecycle(join(directory,'trust'),config,authorizedPolicyDigests); this.bindTrust(join(directory,'trust')); return trust.inspect(0);
    },
    trust() { const trust=currentTrust(); if(!trust) throw Error('trust not configured; use learning trust setup'); return trust; },
    addUnflagged(raw: {name:string;title:string;manifestId:string;split:'calibration'|'heldout'|'tuning'}) {
      const b=learningCopy(raw); closed(b,['name','title','manifestId','split']); named(b); source(input.archiveRoot,b.manifestId);
      if(!['calibration','heldout','tuning'].includes(b.split)) throw Error('explicit unflagged split required');
      if(currentTrust()) throw Error('cohort already frozen; cannot add samples after labels');
      bound('unflagged-binding',b); return b;
    },
    unflagged() { return bindings<{name:string;title:string;manifestId:string;split:'calibration'|'heldout'|'tuning'}>('unflagged-binding').map(b=>{source(input.archiveRoot,b.manifestId); return {...b,incidentId:learningHash({scope:input.scopeDigest,evidence:source(input.archiveRoot,b.manifestId).reference.sha256})};}); },
    cases(name: string, offset=0) { const b=selected<LearningCaseBinding>('case-binding',name); return {...validateCases(b).list(offset),batchId:b.batchId,version:b.version}; },
    caseEvidence(name:string,caseManifestId:string) {return caseEvidenceIds(name,caseManifestId).map(manifestId=>({manifestId,role:manifestId===caseManifestId?'nomination':'frozen-inputs',...readArchiveSourceReference(input.archiveRoot,manifestId)}));},
    readCaseEvidence(name:string,caseManifestId:string,manifestId:string) {
      if(!caseEvidenceIds(name,caseManifestId).includes(manifestId))throw Error('evidence outside selected case');
      return readArchiveSource(input.archiveRoot,manifestId);
    },
    decideCase(name: string, request: WorkCaseReviewRequest) { return validateCases(selected<LearningCaseBinding>('case-binding',name)).decide(learningCopy(request)); },
    hypotheses() {
      const named=bindings<{name:string;manifestId:string}>('hypothesis-binding');
      const origins=bindings<LearningComparisonBinding>('comparison-binding').map(b=>comparisonBinding(b.name)).filter(b=>b.hypothesisManifestId).map(b=>({name:`origin:${b.name}`,manifestId:b.hypothesisManifestId!}));
      return [...named,...origins.filter(b=>!named.some(n=>n.manifestId===b.manifestId))].map(b=>({...b,hypothesis:hypothesis(b.manifestId)}));
    },
    propose(name: string, proposal: HypothesisProposal, hypothesisName = name) {
      const h=buildHypothesis(proposal); if(h.proposal.population!==input.population) throw Error('hypothesis population mismatch');
      const rows=this.cases(name); const all=[...rows.items]; for(let offset=5;offset<rows.total;offset+=5) all.push(...this.cases(name,offset).items);
      if(h.proposal.caseIds.some(id=>!all.some(c=>c.candidate.id===id && c.disposition==='confirmed_defect'))) throw Error('current confirmed cases required for hypothesis');
      if(!NAME.test(hypothesisName)) throw Error('hypothesis name must be a short slug');
      const manifestId=retain(input.archiveRoot,'factory-hypothesis',h); bound('hypothesis-binding',{name:hypothesisName,manifestId} as {name:string});
      return {hypothesis:h,manifestId};
    },
    comparison(name: string) {
      const q=quality(name), cards=q.blind.view().cards.map((c,i)=>({...c,displayLabel:String.fromCharCode(65+i)}));
      const d=decision(name),a=this.adoptionStatus(name);
      const outcomes=events().filter(e=>e.type==='outcome'&&e.name===name).map(e=>{
        const {manifestId,...body}=e;
        if(learningHash(jsonSource(input.archiveRoot,String(manifestId),'learning-outcome'))!==learningHash(body))throw Error('retained outcome changed or missing');
        const observation=e.observation as ProductionObservation;observation.evidence.forEach(id=>source(input.archiveRoot,id));
        const classification=classifyProductionObservation(adoption(name),observation);
        if(learningHash(classification)!==learningHash(e.classification))throw Error('outcome classification changed');
        return {manifestId:e.manifestId,classification};
      });
      return {
        name,title:q.b.title,scopeStatement:q.b.scopeStatement,mode:'deliberate-review' as const,
        cards,choice:q.choice,qualityScope:q.receipt?'full-artifacts':q.choice?'legacy-unscoped':null,
        priorFeedback:q.b.priorFeedbackManifestIds.map(manifestId=>({manifestId,scope:'prior-feedback-only' as const})),
        decision:d,activation:a.activationManifestId?'recorded':'not-activated',rollback:a.rollbackManifestId?'recorded':'not-recorded',outcomes,
        adoptionReadiness:{state:a.rollbackManifestId?'rollback-recorded':a.activationManifestId?'activation-recorded':'deferred',reason:a.rollbackManifestId?'original registry rollback recorded; historical activation retained':a.activationManifestId?'original activation receipt linked; current registry state remains producer-owned':!q.b.adoptionBinding?'scoped candidate and independent eligibility/authority not configured':!q.receipt?'full-artifact quality choice missing':d?.disposition!=='adopt'?'explicit adoption intent missing':!a.receipt?'independent adoption authority and current eligible facts required':'prepared only; original registry activation still required'},
        laterOutcomeReadiness:outcomes.length?'observations-linked (not an improvement claim)':'no later outcome observed',
        revealReady:!!q.choice&&!!q.receipt,
        adoptionConfigured:!!q.b.adoptionBinding,
        limitations:['Artifact content may disclose identity.','A quality choice is not acceptance, calibration or adoption.',...(q.b.priorFeedbackManifestIds.length?['Previously exposed feedback is linked, not a fresh blind experiment.']:[])],
      };
    },
    artifact(name: string, label: string, digest: string) { return quality(name).blind.readArtifact(label,digest); },
    choose(name: string, raw: BlindQualityChoice, rawReview: LearningQualityReview) {
      const before=history().at(-1)!.id,review=learningCopy(rawReview),q=quality(name),choice=q.blind.previewChoice(learningCopy(raw));
      if(q.choice&&learningHash(q.choice)!==learningHash(choice))throw Error('blind quality choice locked');
      closed(review,['scope','note','reviewedArtifactDigests']); text(review.note);
      const required=[...new Set(q.blind.view().cards.flatMap(c=>c.artifactDigests))].sort();
      if(review.scope!=='full-artifacts' || !required.length&&choice.kind!=='insufficient' || !Array.isArray(review.reviewedArtifactDigests) || new Set(review.reviewedArtifactDigests).size!==review.reviewedArtifactDigests.length || review.reviewedArtifactDigests.some(h=>!required.includes(h)) || choice.kind!=='insufficient' && learningHash([...review.reviewedArtifactDigests].sort())!==learningHash(required)) throw Error('explicit complete artifact review required; excerpts do not qualify');
      review.reviewedArtifactDigests.sort();
      if(q.receipt) { if(learningHash(q.receipt.choice)!==learningHash(choice) || learningHash(q.receipt.review)!==learningHash(review)) throw Error('quality receipt locked'); return learningCopy(q.receipt); }
      const pending=last('quality-pending',name), request={choice,review};
      if(pending && learningHash(pending.request)!==learningHash(request)) throw Error('quality write pending; repeat the exact choice to finish');
      const claimed=pending?before:append({type:'quality-pending',name,request},before).id;
      const actual=q.blind.choose(choice);
      const receipt={type:'quality',name,choice:actual,review,author:input.author,comparisonManifestId:q.b.comparisonManifestId};
      const manifestId=retain(input.archiveRoot,'learning-quality',receipt); append({...receipt,manifestId},claimed); return {...receipt,manifestId};
    },
    reveal(name: string) { return requireQuality(name).blind.reveal(); },
    decisionStatus(name: string) {const b=comparisonBinding(name);return {name,title:b.title,scopeStatement:b.scopeStatement,current:decision(name)};},
    decide(name: string, raw: LearningDecisionRequest) {
      const before=history().at(-1)!.id,request=learningCopy(raw); closed(request,['disposition','note','priorDecisionId']); text(request.note);
      if(!['adopt','reject','defer'].includes(request.disposition)) throw Error('choose adopt, reject or defer');
      if(request.priorDecisionId!==null) hash(request.priorDecisionId);
      comparisonBinding(name); const old=decision(name);
      if(old && learningHash({disposition:old.disposition,note:old.note,priorDecisionId:old.priorDecisionId})===learningHash(request)) return old;
      if((old?.id??null)!==request.priorDecisionId) throw Error('stale learning decision');
      if(last('adoption',name)) throw Error('adoption already authorized; use explicit rollback rather than replacing its decision');
      if(request.disposition==='adopt') { const q=requireQuality(name); if(!['one','tie'].includes(q.choice!.kind)) throw Error('positive quality choice required for adoption intent'); }
      const e=append({type:'decision',name,request,author:input.author},before); return {id:e.id,...request};
    },
    prepareAdoption(name: string, authority: AdoptionAuthority|null, facts: AdoptionFacts, now: number) {
      const before=history().at(-1)!.id,q=requireQuality(name), b=q.b.adoptionBinding;
      if(!b || decision(name)?.disposition!=='adopt') throw Error('scoped binding and explicit adopt decision required');
      const selected=q.blind.reveal().arms.filter(a=>q.choice!.labels.includes(a.label));
      if(!selected.some(a=>a.configuration.configuration===b.candidateDigest)) throw Error('adoption candidate is not a quality-selected configuration');
      const receipt=authorizeAdoption(b,authority,facts,now), old=last('adoption',name);
      if(old) { if(learningHash(old.receipt)!==learningHash(receipt)) throw Error('adoption receipt locked'); return receipt; }
      append({type:'adoption',name,receipt,manifestId:retain(input.archiveRoot,'learning-adoption',receipt)},before); return receipt;
    },
    linkActivation(name: string, manifestId: string, authorizedManifestIds: readonly string[]) {
      const before=history().at(-1)!.id,receipt=registryEvidence(manifestId,'activate',name,authorizedManifestIds), old=last('activation',name);
      if(old) { if(old.manifestId!==manifestId) throw Error('activation link locked'); return receipt; }
      append({type:'activation',name,manifestId},before); return receipt;
    },
    previewRollback(name: string, reason: RollbackRequest['reason'], evidence: string[], expiresAt?: number) {
      if(!this.adoptionStatus(name).activationManifestId) throw Error('observed activation required before rollback'); evidence.forEach(id=>source(input.archiveRoot,id));
      return buildRollbackRequest(adoption(name),reason,evidence,expiresAt);
    },
    prepareRollback(name: string, request: RollbackRequest, authority: AdoptionAuthority|null, now: number, current: {adoptionId:string;candidateDigest:string;scopeDigest:string}) {
      const before=history().at(-1)!.id;
      if(!this.adoptionStatus(name).activationManifestId) throw Error('observed activation required before rollback');
      request.evidence.forEach(id=>source(input.archiveRoot,id));
      if(buildRollbackRequest(adoption(name),request.reason,[...request.evidence],request.expiresAt).id!==request.id) throw Error('rollback request changed');
      const result=authorizeRollback(adoption(name),request,authority,now,current),old=last('rollback-request',name);
      if(old) { if(learningHash(old.request)!==learningHash(request)) throw Error('rollback request locked'); return result; }
      append({type:'rollback-request',name,request:learningCopy(request)},before); return result;
    },
    linkRollback(name: string, manifestId: string, authorizedManifestIds: readonly string[]) {
      const before=history().at(-1)!.id,receipt=registryEvidence(manifestId,'rollback',name,authorizedManifestIds),old=last('rollback',name);
      const activation=jsonSource<LearningRegistryReceipt>(input.archiveRoot,String(last('activation',name)?.manifestId),'learning-registry-receipt');
      if(receipt.revision<=activation.revision) throw Error('rollback registry revision must follow activation');
      if(old) { if(old.manifestId!==manifestId) throw Error('rollback link locked'); return receipt; }
      append({type:'rollback',name,manifestId},before); return receipt;
    },
    previewObservation(name: string, raw: ProductionObservation) {
      if(!this.adoptionStatus(name).activationManifestId) throw Error('later outcome needs observed activation, not just prepared adoption');
      const observation=learningCopy(raw); closed(observation,['id','adoptionId','candidateDigest','scopeDigest','originalRequirementDigest','currentRequirementDigest','outcome','acceptanceDigest','acceptedArtifactDigest','observedArtifactDigest','evidence']);
      observation.evidence.forEach(id=>source(input.archiveRoot,id));
      const classification=classifyProductionObservation(adoption(name),observation);
      return {observation,classification,digest:learningHash({name,observation})};
    },
    observe(name: string, raw: ProductionObservation, authorizedDigests: readonly string[], referenceAuthor?: string) {
      const before=history().at(-1)!.id,preview=this.previewObservation(name,raw); if(!authorizedDigests.includes(preview.digest)) throw Error('independent exact observation authority required');
      const old=events().find(e=>e.type==='outcome'&&e.name===name&&(e.observation as ProductionObservation).id===raw.id);
      if(old) { if(learningHash(old.observation)!==learningHash(preview.observation)) throw Error('outcome identity conflict'); return learningCopy(old); }
      if(referenceAuthor!==undefined) text(referenceAuthor,512);
      const value={type:'outcome',name,...preview,...(referenceAuthor===undefined?{}:{referenceAuthor})}; const manifestId=retain(input.archiveRoot,'learning-outcome',value); append({...value,manifestId},before); return {...value,manifestId};
    },
    lifecycle(name: string) {
      const before=history().at(-1)!.id,q=quality(name), b=q.b;
      this.comparison(name); // Revalidate every linked retained receipt before advancing navigation.
      if(!b.caseReference || !b.hypothesisManifestId) return {state:'incomplete-links',manifestId:null};
      const activation=last('activation',name), rollback=last('rollback',name), prior=last('lifecycle',name);
      const links={caseManifestId:b.caseReference.manifestId,hypothesisManifestId:b.hypothesisManifestId,comparisonManifestId:b.comparisonManifestId,
        choiceManifestId:q.receipt?String(q.receipt.manifestId):null,adoptionManifestId:activation?String(activation.manifestId):null,rollbackManifestId:rollback?String(rollback.manifestId):null,
        outcomeManifestIds:events().filter(e=>e.type==='outcome'&&e.name===name).map(e=>String(e.manifestId))};
      if(prior && learningHash(prior.links)===learningHash(links)) return {state:'linked',manifestId:String(prior.manifestId)};
      const manifestId=retainLearningLifecycle(input.archiveRoot,{...links,predecessorManifestId:prior?String(prior.manifestId):null}); append({type:'lifecycle',name,links,manifestId},before); return {state:'linked',manifestId};
    },
    inspect(now: number) {
      clock(now);
      const cases=bindings<LearningCaseBinding>('case-binding').map(b=>{try {const p=validateCases(b).list(); return {name:b.name,title:b.title,state:'ready',total:p.total,reason:'deliberate review; nomination is not confirmation'};} catch(e) {return {name:b.name,title:b.title,state:'deferred',total:null,reason:message(e)};}});
      const comparisons=bindings<LearningComparisonBinding>('comparison-binding').map(b=>{try {const v=this.comparison(b.name); return {state:'ready',reason:v.revealReady?'quality recorded; adoption remains separate':'quality choice pending; identity and cost hidden',...v};} catch(e) {return {name:b.name,title:b.title,state:'deferred',reason:message(e),decision:decision(b.name)};}});
      let trust: Record<string,unknown>; try { const t=currentTrust(); trust=t?{state:'configured',...t.inspect(now),automaticExposure:t.previewExposure(now)}:{state:'deferred',reason:'trust not configured',automaticExposure:{mode:'silent',reason:'policy-unavailable'}}; } catch(e) { trust={state:'deferred',reason:message(e),automaticExposure:{mode:'silent',reason:'invalid-trust-evidence'}}; }
      return {version:'learning-workspace-view-v1' as const,configuration:learningCopy(input),mode:'deliberate-review' as const,cases,comparisons,trust,automaticExposureReserved:false,delegationStarted:false,acceptance:'not-assessed' as const};
    },
  };
}

/** Explicit operator-selected archive inventory, not discovery of private sessions. Names/indices
 * are presentation only; callers bind the full immutable manifest before any decision. */
export interface LearningCatalogItem {kind:'cases'|'comparison';manifestId:string;version:1|2|3;description:string;scopeDigest?:string;population?:string}
export function catalogLearningArchive(root: string, author: string): LearningCatalogItem[] {
  path(root); text(author,512);
  const dir=join(root,'manifests');
  for(let p=dir;;p=dirname(p)) {const s=lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('archive manifest directory substituted');if(p===dirname(p))break;}
  const files=readdirSync(dir); if(files.length>8192) throw Error('archive catalog bound exceeded');
  return files.filter(id=>SHA.test(id)).sort().flatMap<LearningCatalogItem>(manifestId=>{
    const r=readArchiveSourceReference(root,manifestId); if(r.status!=='available') return [];
    const p=r.reference.parser;
    if(p.id==='work-candidate-batch'&&p.version==='1' || p.id==='work-signal-batch'&&p.version==='1') {
      try {const page=(p.id==='work-signal-batch'?createWorkSignalReviewer(root,manifestId,author):createWorkCaseReviewer(root,manifestId,author)).list();
        return [{kind:'cases',manifestId,version:p.id==='work-signal-batch'?3:2,description:`${page.total} nomination(s)${page.items[0]?` — ${page.items[0].candidate.target.obligationId}: ${page.items[0].candidate.reason}`:''}`,...(page.items[0]?{scopeDigest:page.items[0].candidate.target.snapshotDigest,population:page.items[0].candidate.detector.population}:{})}];
      } catch {return [];}
    }
    if(p.id==='blind-intervention'&&p.version==='1') { try { readBlindInterventionBinding(root,manifestId,author); return [{kind:'comparison' as const,manifestId,version:1 as const,description:'Retained comparison (identity hidden)'}]; } catch { return []; } }
    return [];
  });
}
