import { createHash } from 'node:crypto';
import type { WorkSignalFacts } from '@skill-harness/core';
import { readGovernedArchive, type GovernedArchiveRoute } from './archive-access.js';
import { learningCopy } from './learning-journal.js';
/** Operational fixed-order fact adapter, not arbitrary model/host fact inference.
 * The caller supplies independent scope/source pins; all actual bytes use consent. */
export function readFixedOrderFacts(root:string,manifestId:string,route:GovernedArchiveRoute,raw:{producerCommit:string;scopeDigest:string;population:string;obligations:string[]},now=Date.now()){
 const expected=learningCopy(raw);if(!/^[a-f0-9]{40}$/.test(expected.producerCommit)||!/^[a-f0-9]{64}$/.test(expected.scopeDigest)||typeof expected.population!=='string'||!expected.population.length||expected.population.length>512||/[\u0000-\u001f\u007f]/.test(expected.population)||!Array.isArray(expected.obligations)||expected.obligations.length>128||expected.obligations.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('explicit fact source/scope pins required');
 const read=readGovernedArchive(root,manifestId,1024*1024,route,now);if(read.status!=='available'||read.reference.retention!=='exact'||read.reference.parser.id!=='factory-order-readback'||read.reference.parser.version!=='1')throw Error('exact governed order readback required');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read.bytes));if(value.kind!=='actual-fixed-profile-order'||value.producerCommit!==expected.producerCommit||!Array.isArray(value.nodes)||!value.nodes.length||value.nodes.length>128||value.nodes.some((n:any)=>!n||!expected.obligations.includes(n.obligation?.digest)||typeof n.state!=='string'))throw Error('order facts source/scope mismatch');
 const digest=createHash('sha256').update(read.bytes).digest('hex');
 const facts:WorkSignalFacts={scopeDigest:expected.scopeDigest,version:'fixed-order-facts-v1',population:expected.population,expectedWaits:[],checkpoints:[],violations:value.nodes.filter((n:any)=>n.state==='exhausted').map((n:any)=>({obligationDigest:n.obligation.digest,status:'FAIL',evidence:digest})),priorAccepted:[]};
 return {facts,source:{manifestId,sha256:digest,producerCommit:expected.producerCommit},unknownNodes:value.nodes.filter((n:any)=>!['satisfied','exhausted'].includes(n.state)).length,acceptance:'not-assessed' as const};
}
