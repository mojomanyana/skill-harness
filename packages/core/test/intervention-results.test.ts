import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { freezeIntervention } from '../src/intervention.js';
import { interventionEvidenceFromResults } from '../src/intervention-results.js';
const h='a'.repeat(64), output=Buffer.from('synthetic output');
const manifest=()=>freezeIntervention({family:'intervention',investigationSha256:h,resourceMetric:'wall_ms',axes:['model'],common:{mode:'force',scenarioSha256:h,rubricSha256:h,fixtureSha256:h,heldoutSha256:h,harnessSha256:h,judgePolicySha256:h},proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:[{id:'a',configuration:{model:'fixture:a',effort:'low',skill:h,prompt:h,configuration:h}},{id:'b',configuration:{model:'fixture:b',effort:'low',skill:h,prompt:h,configuration:h}}]});
function result(m:ReturnType<typeof manifest>){
 const objective={status:'PASS',assertions:[{kind:'skill_delivered',status:'PASS',detail:'fixture'}]};
 return {schema:3,skill:'fixture',harness:'pi',model:'fixture:a',judge:{provider:'fixture',model:'judge'},timestamp:'fixture',label:null,mode:'force',source_hashes:{'intervention:manifest':m.id,'intervention:inputs':m.inputDigest},effective_grade:{passed:1,total:1,pct:100,letter:'A',ship:true,note:''},subject_invocations:[{scenario_id:'A1',repetition:0,prompt:{capture_version:'prompt-provenance-v1',request_index:0,raw_sha256:h,normalized_sha256:h,normalization_rule:'cwd-line-v1',bytes:1,contract_sha256:h,contract_bytes:1,contract_occurrences:1,mechanism:'append-system-prompt',status:'PASS'}}],scenarios:[{id:'A1',criterion_count:1,judge_verdict:'PASS',judge_reason:'fixture',suspect:false,override:null,note:'',objective,rep_judgments:[{repetition:0,recorded_verdict:'PASS',objective,judgments:[{ordinal:1,judge:{provider:'fixture',model:'judge'},verdict:'PASS',reason:'fixture',suspect:false,criteria:[{index:1,verdict:'PASS',reason:'fixture'}]}]}]}]};
}
describe('existing results to intervention evidence',()=>{
 it('validates schema3 and preserves recorded cell votes with actual output identity',()=>{
  const m=manifest();const {evidence:e,sourceResults}=interventionEvidenceFromResults(m,'a',result(m),new Map([['A1:0',output]]));
  expect(sourceResults.scenarios[0].rep_judgments![0].judgments[0].criteria![0].reason).toBe('fixture');
  expect(e.cells[0].criteria).toEqual(['PASS']);expect(e.cells[0].artifactSha256).toBe(createHash('sha256').update(output).digest('hex'));
 });
 it('does not stamp missing frozen input binding onto historical results',()=>{
  const m=manifest();const r=result(m);r.source_hashes={} as any;
  expect(()=>interventionEvidenceFromResults(m,'a',r,new Map())).toThrow(/binding/);
  expect(()=>interventionEvidenceFromResults(m,'b',result(m),new Map())).toThrow(/model/);
 });
});
