import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildHypothesis, authorizeInvestigation, previewInvestigationScenario, applyInvestigationScenario, freezeInvestigation, assertFrozenInvestigation, selectWeeklyInvestigation } from '../src/investigation.js';
const h='a'.repeat(64); const roots:string[]=[];
const proposal=()=>({ archiveSnapshot:h, caseIds:[h], population:'layout', intervention:'change the fixed layout rubric', alternatives:['keep current rubric'], prediction:'fewer missed constraints', downside:'more review time', disproof:'held-out constraint coverage does not improve', rollback:'retain original rubric', limits:{subjectCalls:0,judgeCalls:0,wallMs:1000}, effectProfile:null });
afterEach(()=>{for(const p of roots.splice(0))rmSync(p,{recursive:true,force:true});});
describe('investigation-only approval and frozen promotion',()=>{
 it('requires separate host authority and never turns a proposal into adoption',()=>{
  const hypothesis=buildHypothesis(proposal()); expect(hypothesis.status).toBe('proposed');
  expect(()=>authorizeInvestigation(hypothesis,null)).toThrow(/authority/);
  const authority={id:'fixture-controller',investigations:[hypothesis.id],promotions:[]};
  expect(authorizeInvestigation(hypothesis,authority).scope).toBe('investigation-only');
  expect(()=>authorizeInvestigation({...hypothesis,proposal:{...hypothesis.proposal,prediction:'tampered'}},authority)).toThrow();
 });
 it('uses exact preview/target/base authorization and appends once through the existing spec writer',()=>{
  const root=mkdtempSync(join(tmpdir(),'investigation-'));roots.push(root);const path=join(root,'specification.yaml');
  writeFileSync(path,'# keep comment\nskill: demo\njudge_persona: strict\nship_bar: {total: 1, min_pass: 1, no_critical_fail: true}\ncritical: []\nscenarios:\n  - id: A1\n    title: baseline\n    turns: [hello]\n    checklist: [responds]\n');
  const hypothesis=buildHypothesis(proposal());const scenario={id:'A2',title:'frozen case',turns:['check the layout'],checklist:['identifies constraint']};
  const preview=previewInvestigationScenario(hypothesis,path,scenario);
  const authority={id:'fixture-controller',investigations:[hypothesis.id],promotions:[] as string[]};
  expect(()=>applyInvestigationScenario(hypothesis,preview,authority)).toThrow(/preview/);
  expect(readFileSync(path,'utf8')).not.toContain('A2');
  authority.promotions=[preview.digest];const result=applyInvestigationScenario(hypothesis,preview,authority);expect(result.replayed).toBe(false);
  expect(applyInvestigationScenario(hypothesis,preview,authority).replayed).toBe(true);
  expect(readFileSync(path,'utf8')).toContain('# keep comment');expect(readFileSync(path,'utf8').match(/id: A2/g)).toHaveLength(1);
  expect(()=>applyInvestigationScenario(hypothesis,{...preview,scenario:{...scenario,title:'changed'}},authority)).toThrow();
 });
 it('freezes one deterministic weekly sample rather than rescheduling changed inputs',()=>{
  const input={week:'2026-W37',population:'layout',policyDigest:h,archiveSnapshot:h,eligibleCaseIds:[h,'b'.repeat(64)],maxCases:1};
  const selected=selectWeeklyInvestigation([],input);
  expect(selected.selectedCaseIds).toHaveLength(1);
  expect(selectWeeklyInvestigation([selected],{...input,eligibleCaseIds:[...input.eligibleCaseIds].reverse()})).toEqual(selected);
  expect(()=>selectWeeklyInvestigation([selected],{...input,archiveSnapshot:'c'.repeat(64)})).toThrow(/frozen/);
 });
 it('freezes rubric/judge/held-out/configuration identity without claiming an executable qualified run',()=>{
  const hypothesis=buildHypothesis(proposal());const authority={id:'fixture-controller',investigations:[hypothesis.id],promotions:[]};
  const inputs={specSha256:h,rubricSha256:h,judgePolicySha256:h,heldoutSha256:h,configurationSha256:h};
  const frozen=freezeInvestigation(hypothesis,inputs,authority);expect(frozen.executionReady).toBe(false);
  expect(()=>assertFrozenInvestigation(frozen,inputs)).not.toThrow();
  expect(()=>assertFrozenInvestigation(frozen,{...inputs,rubricSha256:'b'.repeat(64)})).toThrow(/changed/);
  expect(()=>assertFrozenInvestigation(frozen,{...inputs,judgePolicySha256:'b'.repeat(64)})).toThrow(/changed/);
 });
});
