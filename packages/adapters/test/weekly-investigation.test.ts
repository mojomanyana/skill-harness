import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWeeklyInvestigation, openWeeklyInvestigation } from '../src/weekly-investigation.js';
import { retainWorkSignalObservation } from '../src/work-signal-observation.js';
import { captureWorkSignalCases } from '../src/work-signal-cases.js';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { createWorkSignalReviewer } from '../src/work-case-review.js';
const h='a'.repeat(64),o='b'.repeat(64),p='c'.repeat(64);
function fixture(confirm=true){
 const root=mkdtempSync(join(tmpdir(),'weekly-connected-')),archive=join(root,'archive');
 const observation=retainWorkSignalObservation(archive,{snapshotDigest:h,scopeValid:true,obligations:[{id:'layout',digest:o,intentDigest:p,policyDigest:p,artifactDigest:p,acceptance:'unaccepted',coverage:'available'}]}, {scopeDigest:h,version:'fixture-v1',population:'layout',expectedWaits:[],checkpoints:[{obligationDigest:o,deadlineMs:10,observedAt:11,status:'pending',evidence:p}],violations:[],priorAccepted:[]});
 const batch=captureWorkSignalCases(archive,observation.manifestId),review=createWorkSignalReviewer(archive,batch.batchId,'fixture-operator');
 const decision=review.decide({caseManifestId:batch.candidateIds[0],priorDecisionId:null,disposition:confirm?'confirmed_defect':'uncertain',note:'fixture reference'}).current;
 const directory=join(root,'supervisor');
 const input={archiveRoot:archive,week:'2026-W37',population:'layout',policyDigest:h,maxCases:1,cases:[{version:3 as const,batchId:batch.batchId,manifestId:batch.candidateIds[0],decisionId:decision.id}],reader:{manifestIds:[observation.manifestId],maxCalls:2,maxBytes:65536,durationMs:1000,representations:['exact' as const]}};
 const files=Object.fromEntries(['spec','rubric','judgePolicy','heldout','configuration','skill'].map(k=>{const path=join(root,k);writeFileSync(path,k==='spec'?'skill: fixture\njudge_persona: fixture\nship_bar: {total: 1, min_pass: 1, no_critical_fail: true}\ncritical: []\nscenarios:\n  - id: A0\n    title: base\n    turns: [hi]\n    checklist: [responds]\n':k,{mode:0o600});return[k,path];})) as Record<'spec'|'rubric'|'judgePolicy'|'heldout'|'configuration'|'skill',string>;
 return {root,directory,input,files,review,batch,decision};
}
function proposal(job:ReturnType<typeof createWeeklyInvestigation>){ const s=job.inspect().selection;return {archiveSnapshot:s.archiveSnapshot,caseIds:s.selectedCaseIds,population:s.population,intervention:'change fixture',alternatives:['keep'],prediction:'fixed check passes',downside:'review effort',disproof:'check fails',rollback:'restore baseline',limits:{subjectCalls:0,judgeCalls:0,wallMs:1000},effectProfile:null}; }
it('connects confirmed durable cases, weekly execution, exact promotion, freeze and authorized edit across reopen',()=>{
 const f=fixture(),job=createWeeklyInvestigation(f.directory,f.input);
 const hypothesis=job.run({kind:'inert-v1',requests:[{tool:'archive.read',manifestId:f.input.reader.manifestIds[0]},{tool:'hypothesis',proposal:proposal(job)}]});
 const auth={id:'fixture-operator',investigations:[hypothesis.id],promotions:[] as string[]};
 job.approve(auth);
 expect(()=>job.edit('changed',[])).toThrow(/frozen/);
 const preview=job.preview(f.files.spec,{id:'A1',title:'confirmed case',turns:['check'],checklist:['satisfies fixture']});
 expect(()=>job.promote(preview,auth)).toThrow(/authority/);
 auth.promotions=[preview.digest];job.promote(preview,auth);expect(job.promote(preview,auth).replayed).toBe(true);
 expect(()=>job.freeze({...f.files,skill:`${f.root}/./rubric`},auth)).toThrow(/distinct/);
 expect(()=>job.freeze({...f.files,skill:f.files.rubric},auth)).toThrow(/distinct/);
 const reopened=openWeeklyInvestigation(f.directory);expect(reopened.inspect().hypothesis?.id).toBe(hypothesis.id);
 expect(()=>reopened.run({kind:'inert-v1',requests:[]})).toThrow(/claimed/);
 reopened.freeze(f.files,auth);
 const edit=reopened.previewEdit('candidate');expect(()=>reopened.edit('candidate',[])).toThrow(/authority/);
 reopened.edit('candidate',[edit]);expect(readFileSync(f.files.skill,'utf8')).toBe('candidate');
 const evaluated=reopened.evaluation();expect(evaluated.executionReady).toBe(false);expect(evaluated.caseIds).toEqual(hypothesis.proposal.caseIds);
 const result=retainArchiveSource(f.input.archiveRoot,{sourceId:'legacy-screen-fixture',parser:{id:'skill-harness-results',version:'2'},retention:'exact',bytes:Buffer.from(JSON.stringify({schema:2,skill:'fixture',model:'fixture:subject',scenarios:[{id:'A1',judge_verdict:'PASS'}]}))});
 const screenRequest={manifestIds:[result.manifestId],population:'different-population'};
 expect(()=>reopened.screen(screenRequest,[])).toThrow(/authority/);
 const previewScreen=reopened.previewScreen(screenRequest),screen=reopened.screen(screenRequest,[previewScreen.digest]);
 expect(screen.exploratory).toBe(true);expect(screen.populationMatches).toBe(false);expect(screen.report.scenarios[0].classification).toBe('UNKNOWN');
 expect(reopened.screen(screenRequest,[previewScreen.digest])).toEqual(screen);
 const malformed=retainArchiveSource(f.input.archiveRoot,{sourceId:'missing-delivery-fixture',parser:{id:'skill-harness-results',version:'3'},retention:'exact',bytes:Buffer.from(JSON.stringify({schema:3,skill:'fixture',model:'fixture:subject',scenarios:[{id:'A1'}]}))});
 const invalidRequest={manifestIds:[malformed.manifestId],population:'layout'};expect(()=>reopened.screen(invalidRequest,[reopened.previewScreen(invalidRequest).digest])).toThrow(/delivery observations/);
 writeFileSync(f.files.rubric,'changed rubric');expect(()=>reopened.evaluation()).toThrow(/frozen/);
 expect(readFileSync(f.files.spec,'utf8').match(/id: A1/g)).toHaveLength(1);
});
it('refuses unconfirmed or superseded decisions, and changed weekly selection',()=>{
 const f=fixture(false);expect(()=>createWeeklyInvestigation(f.directory,f.input)).toThrow(/confirmed/);
 const g=fixture(),job=createWeeklyInvestigation(g.directory,g.input);
 expect(createWeeklyInvestigation(g.directory,g.input).inspect().selection.id).toBe(job.inspect().selection.id);
 expect(()=>createWeeklyInvestigation(join(g.root,'duplicate-week'),g.input)).toThrow(/bound/);
 expect(()=>createWeeklyInvestigation(g.directory,{...g.input,policyDigest:p})).toThrow();
 g.review.decide({caseManifestId:g.batch.candidateIds[0],priorDecisionId:g.decision.id,disposition:'expected_behavior',note:'correction'});
 expect(()=>job.run({kind:'inert-v1',requests:[{tool:'hypothesis',proposal:proposal(job)}]})).toThrow(/confirmed/);
});
for(const tool of ['bash','filesystem.write','session.write','grant.expand','herdr.socket','network.fetch']) it(`denies ${tool} without touching skill or accepting a proposal`,()=>{
 const f=fixture(),job=createWeeklyInvestigation(f.directory,f.input);const before=readFileSync(f.files.skill);
 expect(()=>job.run({kind:'inert-v1',requests:[{tool,path:f.files.skill,value:'bad'}]})).toThrow(/denied/);
 expect(readFileSync(f.files.skill)).toEqual(before);expect(openWeeklyInvestigation(f.directory).inspect().state).toBe('failed');
 expect(()=>job.run({kind:'inert-v1',requests:[]})).toThrow(/claimed/);
});
it('denies unapproved archive reads, forged case linkage and corrupt journals',()=>{
 const f=fixture(),job=createWeeklyInvestigation(f.directory,f.input);
 expect(()=>job.run({kind:'inert-v1',requests:[{tool:'archive.read',manifestId:p}]})).toThrow(/refused/);
 const g=fixture(),other=createWeeklyInvestigation(g.directory,g.input);
 expect(()=>other.run({kind:'inert-v1',requests:[{tool:'hypothesis',proposal:{...proposal(other),caseIds:[p]}}]})).toThrow(/link/);
 appendFileSync(join(g.directory,'events.jsonl'),'partial');expect(()=>openWeeklyInvestigation(g.directory)).toThrow(/incomplete/);
});
