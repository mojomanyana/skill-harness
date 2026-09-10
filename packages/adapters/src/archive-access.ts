import { learningCopy,learningHash,learningJournal,registerLearningStore,verifyLearningStore } from './learning-journal.js';
import { readArchiveSource } from './evidence-archive.js';
export interface ArchiveAccessPolicy {archiveRoot:string;id:string;expiresAt:number;maxCalls:number;maxBytes:number;purposes:string[]}
export interface ArchiveConsent {manifestId:string;purpose:string;expiresAt:number}
export interface GovernedArchiveRoute {directory:string;purpose:string}
export function createArchiveAccess(path:string,raw:ArchiveAccessPolicy,permissions:string[]){
 const policy=learningCopy(raw),binding=learningHash(policy);if(!permissions.includes(binding))throw Error('exact archive policy permission required');
 validate(policy);registerLearningStore(policy.archiveRoot,'access',learningHash(policy.id),path,binding);learningJournal(path,{type:'archive-access-v1',policy,binding});return openArchiveAccess(path);
}
function validate(p:ArchiveAccessPolicy){if(typeof p.id!=='string'||!p.id.length||p.id.length>128||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<0||!Number.isSafeInteger(p.maxCalls)||p.maxCalls<1||p.maxCalls>1024||!Number.isSafeInteger(p.maxBytes)||p.maxBytes<1||p.maxBytes>64*1024*1024||!Array.isArray(p.purposes)||!p.purposes.length||p.purposes.length>16||new Set(p.purposes).size!==p.purposes.length||p.purposes.some(s=>typeof s!=='string'||!s.length||s.length>128))throw Error('bounded archive access policy required');}
/** Shared cooperative access owner. No history deletion, authentication, OS
 * deadline guarantee, or reinterpretation of legacy raw archive APIs. */
export function openArchiveAccess(path:string){
 const journal=learningJournal(path),first=journal.read()[0].value,policy=learningCopy(first.policy) as ArchiveAccessPolicy;validate(policy);
 if(first.type!=='archive-access-v1'||learningHash(policy)!==first.binding)throw Error('archive policy changed');
 const history=()=>{verifyLearningStore(policy.archiveRoot,'access',learningHash(policy.id),path,String(first.binding));return journal.read();};
 const clock=(now:number)=>{const rows=history();if(!Number.isSafeInteger(now)||now<Math.max(0,...rows.map(e=>Number(e.value.now??0))))throw Error('archive access clock rewind');journal.append(rows.at(-1)!.id,{type:'clock',now});if(now>=policy.expiresAt)throw Error('archive access expired');};
 const consent=(raw:ArchiveConsent)=>{const g=learningCopy(raw);if(!/^[a-f0-9]{64}$/.test(g.manifestId)||!policy.purposes.includes(g.purpose)||!Number.isSafeInteger(g.expiresAt)||g.expiresAt<0||g.expiresAt>policy.expiresAt)throw Error('consent outside policy');return g;};
 const digest=(g:ArchiveConsent)=>learningHash({policy:String(first.binding),consent:consent(g)});
 const revokeDigest=(id:string)=>learningHash({policy:String(first.binding),revoke:id});
 const inspect=()=>{const rows=history(),claims=rows.filter(e=>e.value.type==='read-claim'),lastObservedNow=Math.max(0,...rows.map(e=>Number(e.value.now??0)));return {policy:learningCopy(policy),lastObservedNow,consents:rows.filter(e=>e.value.type==='consented').map(e=>{const grant=e.value.grant as ArchiveConsent;return {id:e.value.consentId,grant:learningCopy(grant),state:rows.some(r=>r.value.type==='revoked'&&r.value.consentId===e.value.consentId)?'revoked':lastObservedNow>=Math.min(policy.expiresAt,grant.expiresAt)?'expired':'not-revoked-at-last-observed-clock'};}),calls:claims.length,bytes:claims.reduce((n,e)=>{const settled=rows.find(s=>s.value.type==='read-settled'&&s.value.claim===e.id);return n+Number(settled?settled.value.bytes:e.value.reserved);},0),pending:claims.filter(e=>!rows.some(s=>s.value.type==='read-settled'&&s.value.claim===e.id)).length};};
 return {inspect,previewConsent:digest,previewRevocation:revokeDigest,
  consent(raw:ArchiveConsent,permissions:string[],now:number){clock(now);const g=consent(raw),id=digest(g),rows=history();if(!permissions.includes(id)||now>=g.expiresAt)throw Error('exact current consent permission required');if(rows.some(e=>e.value.type==='revoked'&&e.value.consentId===id))throw Error('consent revoked');if(!rows.some(e=>e.value.type==='consented'&&e.value.consentId===id))journal.append(rows.at(-1)!.id,{type:'consented',consentId:id,grant:g,now});return id;},
  revoke(id:string,permissions:string[],now:number){clock(now);const rows=history();if(!permissions.includes(revokeDigest(id))||!rows.some(e=>e.value.type==='consented'&&e.value.consentId===id))throw Error('exact revocation permission required');if(!rows.some(e=>e.value.type==='revoked'&&e.value.consentId===id))journal.append(rows.at(-1)!.id,{type:'revoked',consentId:id,now});},
  read(manifestId:string,purpose:string,maxBytes:number,now=Date.now()){
   clock(now);const rows=history(),valid=rows.filter(e=>e.value.type==='consented').filter(e=>{const g=e.value.grant as ArchiveConsent;return g.manifestId===manifestId&&g.purpose===purpose&&now<g.expiresAt&&!rows.some(r=>r.value.type==='revoked'&&r.value.consentId===e.value.consentId);});
   if(valid.length!==1)throw Error('unique active manifest/purpose consent required');if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>8*1024*1024)throw Error('archive read bound');
   const used=inspect();if(used.calls>=policy.maxCalls||maxBytes>policy.maxBytes-used.bytes)throw Error('shared archive budget exhausted');
   const claim=journal.append(rows.at(-1)!.id,{type:'read-claim',manifestId,purpose,consentId:valid[0].value.consentId,reserved:maxBytes,now});
   const result=readArchiveSource(policy.archiveRoot,manifestId,maxBytes);journal.append(claim.id,{type:'read-settled',claim:claim.id,bytes:result.status==='available'?result.bytes.length:0,status:result.status,now});return result;
  },
 };
}
export function readGovernedArchive(root:string,manifestId:string,maxBytes:number,route:GovernedArchiveRoute,now=Date.now()){
 const access=openArchiveAccess(route.directory);if(access.inspect().policy.archiveRoot!==root)throw Error('governed archive root mismatch');return access.read(manifestId,route.purpose,maxBytes,now);
}
