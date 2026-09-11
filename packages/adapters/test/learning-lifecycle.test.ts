import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retainArchiveSource } from '../src/evidence-archive.js';
import { readLearningLifecycle, retainLearningLifecycle } from '../src/learning-lifecycle.js';

const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'learning-lifecycle-'));roots.push(root);
 const source=(id:string)=>retainArchiveSource(root,{sourceId:id,parser:{id:'fixture',version:'1'},retention:'exact',bytes:Buffer.from(id)}).manifestId;
 return {root,caseId:source('case'),hypothesisId:source('hypothesis'),comparisonId:source('comparison'),choiceId:source('choice'),adoptionId:source('adoption'),rollbackId:source('rollback'),outcomeId:source('outcome')};
}
describe('retained learning lifecycle navigation',()=>{
 it('links a substantive case through comparison and optional decision/outcome stages without inventing completion',()=>{
  const f=fixture();
  const prepared=retainLearningLifecycle(f.root,{caseManifestId:f.caseId,hypothesisManifestId:f.hypothesisId,comparisonManifestId:f.comparisonId,choiceManifestId:null,adoptionManifestId:null,rollbackManifestId:null,outcomeManifestIds:[],predecessorManifestId:null});
  expect(readLearningLifecycle(f.root,prepared)).toMatchObject({state:'awaiting-human-choice',links:{case:f.caseId,hypothesis:f.hypothesisId,comparison:f.comparisonId,choice:null,adoption:null,rollback:null,outcomes:[]}});
  const observed=retainLearningLifecycle(f.root,{caseManifestId:f.caseId,hypothesisManifestId:f.hypothesisId,comparisonManifestId:f.comparisonId,choiceManifestId:f.choiceId,adoptionManifestId:f.adoptionId,rollbackManifestId:f.rollbackId,outcomeManifestIds:[f.outcomeId],predecessorManifestId:prepared});
  expect(readLearningLifecycle(f.root,observed)).toMatchObject({state:'outcome-observed',predecessorManifestId:prepared,links:{rollback:f.rollbackId,outcomes:[f.outcomeId]}});
  expect(()=>retainLearningLifecycle(f.root,{caseManifestId:f.caseId,hypothesisManifestId:f.hypothesisId,comparisonManifestId:f.comparisonId,choiceManifestId:null,adoptionManifestId:null,rollbackManifestId:null,outcomeManifestIds:[],predecessorManifestId:observed})).toThrow(/cannot regress/);
 });
 it('fails closed on skipped dependencies and non-existent retained links',()=>{
  const f=fixture(),base={caseManifestId:f.caseId,hypothesisManifestId:f.hypothesisId,comparisonManifestId:f.comparisonId,choiceManifestId:null,adoptionManifestId:null,rollbackManifestId:null,outcomeManifestIds:[],predecessorManifestId:null};
  expect(()=>retainLearningLifecycle(f.root,{...base,adoptionManifestId:f.adoptionId})).toThrow(/choice/);
  expect(()=>retainLearningLifecycle(f.root,{...base,comparisonManifestId:'0'.repeat(64)})).toThrow(/unavailable/);
 });
});
