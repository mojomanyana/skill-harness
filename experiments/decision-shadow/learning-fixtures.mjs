import { parseCases, parseLabels } from './dataset.mjs';
import { learningDigest, parseExperiment } from './learning-data.mjs';
export const FIXTURE_ORACLE_VERSION = 'mechanical-fixture-oracles-v1';
const COMMIT=/^[a-f0-9]{40}$/;
const PHASES=['planned','implemented','reviewed','integrated','verified'];
/** These predicates define synthetic fixtures only. They cannot interpret real prose or grant runtime authority. */
export function evaluateFixture(family,e) {
  if(!e || typeof e!=='object' || Array.isArray(e))return false;
  switch(family){
    case 'candidate': return typeof e.candidate==='string'&&COMMIT.test(e.candidate)&&e.tested===e.candidate&&e.reviewed===e.candidate;
    case 'phases': {
      if(!Array.isArray(e.required)||!e.required.length||new Set(e.required).size!==e.required.length||!Array.isArray(e.records))return false;
      const latest=new Map();for(const r of e.records){if(!r||typeof r.step!=='string'||!r.phases)return false;latest.set(r.step,r.phases);}
      return latest.size===e.required.length&&e.required.every(s=>typeof s==='string'&&s.length>0&&latest.has(s)&&PHASES.every(p=>latest.get(s)[p]==='complete'));
    }
    case 'findings': {
      if(e.historyObserved!==true||!Array.isArray(e.records))return false;
      const latest=new Map();for(const r of e.records){if(!r||typeof r.step!=='string'||!r.step.trim()||!Array.isArray(r.findings))return false;for(const f of r.findings){if(!f||typeof f.id!=='string'||!f.id||typeof f.source!=='string'||!f.source)return false;latest.set(JSON.stringify([r.step,f.source,f.id]),f.status);}}
      return [...latest.values()].every(s=>s==='verified');
    }
    case 'capability': return e.inventoryObserved===true&&Array.isArray(e.required)&&e.required.length>0&&Array.isArray(e.available)&&e.required.every(t=>typeof t==='string'&&e.available.includes(t))&&e.backendQualified===true;
    case 'report': return e.protocol==='saved-full-report-and-five-line-summary'&&((e.persistence==='available'&&e.requestedDelivery==='saved-full-report-and-five-line-summary'&&e.reportReference==='required')||(e.persistence==='unavailable'&&e.requestedDelivery==='blocked-no-invented-report'&&e.reportReference==='not-saved'));
    case 'cleanup': return typeof e.executionId==='string'&&e.executionId.length>0&&e.state==='settled'&&e.receipt?.state==='settled'&&e.receipt.executionId===e.executionId&&e.receipt.reapedAll===true;
    default: throw new TypeError('Unknown fixture oracle family');
  }
}
export function createLearningFixtures({recordedAt='2026-10-08T00:00:00.000Z'}={}) {
  const commit='a'.repeat(40),complete=Object.fromEntries(PHASES.map(p=>[p,'complete']));
  const families=[
    {family:'candidate',split:'train',question:'Do the records establish one exact full 40-character lowercase Git candidate shared by candidate, tested and reviewed?',facts:[{candidate:commit,tested:commit,reviewed:commit},{candidate:commit,tested:'b'.repeat(40),reviewed:commit},{candidate:commit,tested:commit,reviewed:'c'.repeat(40)},{candidate:'aaaaaaa',tested:'aaaaaaa',reviewed:'aaaaaaa'}]},
    {family:'phases',split:'train',question:'Do the latest snapshots cover exactly every required step with all five named phases complete? Earlier complete phases cannot fill later omissions.',facts:[{required:['step-1'],records:[{step:'step-1',phases:complete}]},{required:['step-1','step-2'],records:[{step:'step-1',phases:complete}]},{required:['step-1'],records:[{step:'step-1',phases:complete},{step:'step-extra',phases:complete}]},{required:['step-1'],records:[{step:'step-1',phases:complete},{step:'step-1',phases:{...complete,verified:'unknown'}}]}]},
    {family:'findings',split:'train',question:'Does the observed finding history establish that every finding identity (step, source, id) has an explicit latest verified disposition? Omission never clears an earlier finding.',facts:[{historyObserved:true,records:[{step:'step-1',findings:[]}]},{historyObserved:true,records:[{step:'step-1',findings:[{id:'f1',source:'report-a',status:'open'}]},{step:'step-1',findings:[{id:'f1',source:'report-a',status:'verified'}]}]},{historyObserved:true,records:[{step:'step-1',findings:[{id:'f1',source:'report-a',status:'open'}]},{step:'step-1',findings:[]}]},{historyObserved:true,records:[{step:'step-1',findings:[{id:'f1',source:'report-a',status:'open'}]},{step:'step-1',findings:[{id:'f1',source:'report-b',status:'verified'}]}]}]},
    {family:'capability',split:'validation',question:'Does the observed inventory establish every explicitly required tool and a qualified backend? Missing or unobserved capability evidence does not establish availability.',facts:[{inventoryObserved:true,required:['read','grep','find','ls'],available:['read','grep','find','ls'],backendQualified:true},{inventoryObserved:true,required:['read','grep','find','ls'],available:['read','bash'],backendQualified:true},{inventoryObserved:true,required:['read'],available:['read'],backendQualified:false},{inventoryObserved:false,required:['read'],available:['read'],backendQualified:true}]},
    {family:'report',split:'test',question:'Does this structured requested delivery comply with the selected saved-full-report/five-line-summary protocol, including its explicit unavailable-persistence blocked exception?',facts:[{protocol:'saved-full-report-and-five-line-summary',persistence:'available',requestedDelivery:'saved-full-report-and-five-line-summary',reportReference:'required'},{protocol:'saved-full-report-and-five-line-summary',persistence:'available',requestedDelivery:'complete-report-only-in-final',reportReference:'forbidden'},{protocol:'saved-full-report-and-five-line-summary',persistence:'available',requestedDelivery:'saved-full-report-and-five-line-summary',reportReference:'omitted'},{protocol:'saved-full-report-and-five-line-summary',persistence:'unavailable',requestedDelivery:'blocked-no-invented-report',reportReference:'not-saved'}]},
    {family:'cleanup',split:'test',question:'Do these records establish settled cleanup with a matching execution identity and reapedAll true? This does not establish task success or approval.',facts:[{executionId:'exec:one',state:'settled',receipt:{state:'settled',executionId:'exec:one',reapedAll:true}},{executionId:'exec:one',state:'settled',receipt:null},{executionId:'exec:one',state:'settled',receipt:{state:'settled',executionId:'exec:other',reapedAll:true}},{executionId:'exec:one',state:'settled',receipt:{state:'settled',executionId:'exec:one',reapedAll:false}}]},
  ];
  const caseDocument={schema:1,cases:families.flatMap(f=>f.facts.map((facts,i)=>{const input=JSON.stringify(facts);return {id:`fixture-${f.family}-${i+1}`,input,question:f.question,provenance:'synthetic',source:{sha256:learningDigest(input),recordId:`${FIXTURE_ORACLE_VERSION}/${f.family}/${i+1}`},visibility:'public'};}))};
  const cases=parseCases(caseDocument),receipts=[],labels=[],entries=[];
  for(const c of cases){const family=c.id.split('-')[1],f=families.find(f=>f.family===family);const value=evaluateFixture(family,JSON.parse(c.input));
    const receipt={schema:1,kind:'independent-decision-label',caseId:c.id,caseHash:c.hash,source:c.source,value,labelKind:'test',actor:FIXTURE_ORACLE_VERSION,independent:true,recordedAt,method:{kind:'deterministic-test',id:family,version:FIXTURE_ORACLE_VERSION+':'+learningDigest(evaluateFixture.toString())}};
    const bytes=JSON.stringify(receipt,null,2)+'\n';receipts.push({caseId:c.id,filename:c.id+'-label.json',bytes,sha256:learningDigest(bytes)});
    labels.push({caseId:c.id,caseHash:c.hash,value,kind:'test',actor:receipt.actor,evidenceSha256:learningDigest(bytes),independent:true});
    entries.push({caseId:c.id,caseHash:c.hash,taskGroup:'fixture-family-'+family,lineageGroup:'fixture-family-'+family,split:f.split,sessionId:null,fixtureOnly:true,decisionTimeReviewed:true,redactionReviewed:true,rights:'local-export',exportApproved:true,trainingApproved:false,reviewer:'prospective-synthetic-fixture-rule'});
  }
  const labelDocument={schema:1,labels};parseLabels(labelDocument,cases);
  const manifest=parseExperiment(cases,{schema:1,kind:'decision-learning-experiment',id:'mechanical-fixtures-24-v1',frozenAt:recordedAt,entries});
  return {caseDocument,labelDocument,manifest,labelReceipts:receipts,fixtureOnly:true,trainingEligible:false,scope:'24 synthetic mechanical plumbing cases; no observed examples or model-quality claims.'};
}
