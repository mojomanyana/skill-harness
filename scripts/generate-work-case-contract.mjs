#!/usr/bin/env node
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildWorkCapture } from '../packages/core/dist/work-capture.js';
import { WORK_CAPTURE_SCHEMA, WORK_CASE_REVIEW_REQUEST_SCHEMA } from '../packages/core/dist/work-capture-schema.js';
import { retainWorkCandidate } from '../packages/adapters/dist/work-case-archive.js';
import { retainArchiveSource } from '../packages/adapters/dist/evidence-archive.js';
import { createWorkCaseReviewer } from '../packages/adapters/dist/work-case-review.js';
const mode=process.argv[2]; if(!['--write','--check'].includes(mode)) throw Error('usage: generate-work-case-contract.mjs --write|--check after direct build');
const sha=text=>createHash('sha256').update(text).digest('hex');
const root=mkdtempSync(join(tmpdir(),'work-case-contract-'));
try {
 const cases=Array.from({length:7},(_,i)=>buildWorkCapture({detector:{id:'repeat_without_progress',version:'fixture-v1',population:'layout'},target:{kind:'work',snapshotDigest:sha('synthetic scope'),obligationId:`layout-${i+1}`,obligationDigest:sha(`synthetic obligation ${i+1}`)},classification:'candidate_defect',reason:'repeat_without_progress',evidence:[sha('synthetic source reference')],metrics:{equivalentAttempts:2}}));
 const candidateIds=cases.map(c=>retainWorkCandidate(root,c));
 const batch={version:'work-candidate-batch-v1',observationId:sha('synthetic observation reference'),candidateIds,issues:[],expected:[],visibility:'silent',promotion:'not-authorized'};
 const batchId=retainArchiveSource(root,{sourceId:'fixture-batch',parser:{id:'work-candidate-batch',version:'1'},retention:'exact',bytes:Buffer.from(JSON.stringify(batch))}).manifestId;
 const reviewer=createWorkCaseReviewer(root,batchId,'operator:fixture');
 const request={caseManifestId:candidateIds[0],priorDecisionId:null,disposition:'skip',note:'synthetic fixture'};
 const response=reviewer.decide(request);
 const files={
  'contracts/work-capture/v2/work-case.schema.json':WORK_CAPTURE_SCHEMA,
  'contracts/work-capture/v2/review-request.schema.json':WORK_CASE_REVIEW_REQUEST_SCHEMA,
  'contracts/work-capture/v2/fixtures/cases.json':cases,
  'contracts/work-capture/v2/fixtures/batch.json':batch,
  'contracts/work-capture/v2/fixtures/review.json':{request,response,page:reviewer.list(0,5)},
 };
 for(const [path,value] of Object.entries(files)) {const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(mode==='--write'){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}else if(!readFileSync(path).equals(bytes))throw Error(`work case contract drift: ${path}`);}
 console.log('work-case schema and real store fixtures matched; seven synthetic incidents, bounded page and explicit skip');
}finally{rmSync(root,{recursive:true,force:true});}
