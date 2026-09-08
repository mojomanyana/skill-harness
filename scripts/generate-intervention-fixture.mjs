#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { freezeIntervention, assessIntervention, interventionEvidenceDigest, createBlindComparison } from '../packages/core/dist/intervention.js';
const mode=process.argv[2];if(!['--write','--check'].includes(mode))throw Error('usage: generate-intervention-fixture.mjs --write|--check after direct build');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');const h=sha('synthetic common inputs');
const manifest=freezeIntervention({family:'intervention',investigationSha256:h,resourceMetric:'wall_ms',axes:['model'],common:{mode:'force',scenarioSha256:h,rubricSha256:h,fixtureSha256:h,heldoutSha256:h,harnessSha256:h,judgePolicySha256:h},proposer:'fixture:proposer',judge:'fixture:judge',cases:[{id:'A1',criteria:1,reps:1,threshold:1,critical:false}],arms:['a','b'].map(id=>({id,configuration:{model:`fixture:${id}`,effort:'fixture',skill:h,prompt:h,configuration:h}}))});
const artifacts=new Map(['a','b'].map(id=>{const bytes=Buffer.from(`Synthetic Layout ${id.toUpperCase()}\n`);return[sha(bytes),bytes];}));
const hashes=[...artifacts.keys()];
const evidence=['a','b'].map((armId,i)=>({armId,inputDigest:manifest.inputDigest,artifactDigests:[hashes[i]],cells:[{caseId:'A1',repetition:0,delivery:'PASS',objective:'PASS',criteria:['PASS'],suspect:false,artifactSha256:hashes[i]}],cost:i+1,costUnit:'wall_ms'}));
const qualified={manifestId:manifest.id,proposer:{requested:'fixture:proposer',canonical:'fixture-proposer'},judge:{requested:'fixture:judge',canonical:'fixture-judge'},subjects:{a:{requested:'fixture:a',canonical:'fixture-subject-a'},b:{requested:'fixture:b',canonical:'fixture-subject-b'}},evidenceDigests:Object.fromEntries(evidence.map(e=>[e.armId,interventionEvidenceDigest(e)])),artifacts};
const assessment=assessIntervention(manifest,evidence,qualified), blind=createBlindComparison(manifest,assessment,'0'.repeat(64));
const view=blind.view(), choice=blind.choose({kind:'tie',labels:view.cards.map(c=>c.label)}), reveal=blind.reveal();
const output={'contracts/intervention/v1/fixtures/manifest.json':manifest,'contracts/intervention/v1/fixtures/assessment.json':assessment,'contracts/intervention/v1/fixtures/blind-view.json':view,'contracts/intervention/v1/fixtures/choice.json':choice,'contracts/intervention/v1/fixtures/reveal.json':reveal};
for(const [path,value] of Object.entries(output)){const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');if(mode==='--write'){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);}else if(!readFileSync(path).equals(bytes))throw Error(`fixture drift: ${path}`);}
for(const [hash,bytes] of artifacts){const path=`contracts/intervention/v1/fixtures/artifact-${hash}.txt`;if(mode==='--write')writeFileSync(path,bytes);else if(!readFileSync(path).equals(bytes))throw Error(`artifact drift: ${path}`);}
console.log('intervention fixtures matched; fixed synthetic qualification/evidence, no model calls or real blind study');
