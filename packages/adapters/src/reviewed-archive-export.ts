import { constants, openSync, closeSync, writeSync, fsyncSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { learningJournal, learningCopy, learningHash, learningFile } from './learning-journal.js';
import { readArchiveSource } from './evidence-archive.js';
export interface ReviewedExportPolicy {archiveRoot:string;manifestIds:string[];destination:string;expiresAt:number;redact:string[];maxBytes:number}
const sha=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const credential=/(?:ghp_|github_pat_|sk-(?:live-|proj-)?)[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|authorization\s*:\s*bearer\s+\S+/i;
/** Duration is a cooperative access lease, not physical erasure or revocation of
 * previously exported bytes. Existing archive/history is NEVER deleted. */
export function createReviewedArchiveExport(path:string,raw:ReviewedExportPolicy,policyPermissions:string[]){
 const policy=learningCopy(raw),digest=learningHash(policy);if(!policyPermissions.includes(digest))throw Error('exact export policy permission required');
 if(!isAbsolute(policy.archiveRoot)||!isAbsolute(policy.destination)||!Number.isSafeInteger(policy.expiresAt)||policy.expiresAt<0||!Number.isSafeInteger(policy.maxBytes)||policy.maxBytes<1||policy.maxBytes>1024*1024||!Array.isArray(policy.manifestIds)||!policy.manifestIds.length||policy.manifestIds.length>16||new Set(policy.manifestIds).size!==policy.manifestIds.length||policy.manifestIds.some(s=>!/^[a-f0-9]{64}$/.test(s))||!Array.isArray(policy.redact)||policy.redact.length>64||policy.redact.some(s=>typeof s!=='string'||!s.length||s.length>4096))throw Error('bounded reviewed export policy required');
 learningJournal(path,{type:'reviewed-export-v1',policy,policyDigest:digest});return openReviewedArchiveExport(path);
}
export function openReviewedArchiveExport(path:string){
 const journal=learningJournal(path),first=journal.read()[0].value,policy=first.policy as ReviewedExportPolicy;
 if(first.type!=='reviewed-export-v1'||learningHash(policy)!==first.policyDigest)throw Error('export policy changed');
 const clock=(now:number)=>{const rows=journal.read(),last=Math.max(0,...rows.map(r=>Number(r.value.now??0)));if(!Number.isSafeInteger(now)||now<last)throw Error('export clock rewind');journal.append(rows.at(-1)!.id,{type:'access',now});if(now>=policy.expiresAt)throw Error('export access lease expired');};
 const render=()=>{let total=0;const sources=policy.manifestIds.map(id=>{const read=readArchiveSource(policy.archiveRoot,id,policy.maxBytes-total);if(read.status!=='available')throw Error('export source unavailable or over bound');total+=read.bytes.length;let content=new TextDecoder('utf-8',{fatal:true}).decode(read.bytes);for(const literal of policy.redact)content=content.split(literal).join('[REDACTED]');if(credential.test(content))throw Error('credential pattern remains; revise explicit redaction policy');return {manifestId:id,sourceSha256:sha(read.bytes),exportSha256:sha(content),representation:'reviewed-view-not-authority',content};});const content=JSON.stringify({version:'reviewed-archive-export-v1',sources},null,2)+'\n';if(Buffer.byteLength(content)>2*policy.maxBytes+16384)throw Error('redacted export size bound');return {content,digest:learningHash({policyDigest:first.policyDigest,content}),expiresAt:policy.expiresAt};};
 return {preview(now:number){clock(now);const preview=render(),rows=journal.read();journal.append(rows.at(-1)!.id,{type:'previewed',digest:preview.digest,now});return preview;},
  export(previewDigest:string,reviewPermissions:string[],now:number){
   clock(now);if(!reviewPermissions.includes(previewDigest))throw Error('exact reviewed preview permission required');const rows=journal.read();if(!rows.some(r=>r.value.type==='previewed'&&r.value.digest===previewDigest))throw Error('preview must precede export');
   if(rows.some(r=>r.value.type==='export-claimed'))throw Error('export already claimed; no automatic retry');const preview=render();if(preview.digest!==previewDigest)throw Error('preview/source changed');
   const parent=dirname(policy.destination),stat=lstatSync(parent);if(!stat.isDirectory()||stat.isSymbolicLink()||realpathSync(parent)!==resolve(parent)||(stat.mode&0o077)||(process.getuid&&stat.uid!==process.getuid()))throw Error('private owned export destination required');
   const claim=journal.append(rows.at(-1)!.id,{type:'export-claimed',digest:previewDigest,now});const data=Buffer.from(preview.content),fd=openSync(policy.destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
   try{let offset=0;while(offset<data.length){const n=writeSync(fd,data,offset,data.length-offset);if(!n)throw Error('export write stalled');offset+=n;}fsyncSync(fd);}finally{closeSync(fd);}
   const dir=openSync(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{fsyncSync(dir);}finally{closeSync(dir);}
   if(!learningFile(policy.destination,data.length).equals(data))throw Error('export readback mismatch');const receipt={delivery:'local-reviewed-file' as const,previewDigest,sha256:sha(data),bytes:data.length,expiresAt:policy.expiresAt,physicalErasure:false};journal.append(claim.id,{type:'exported',receipt,now});return receipt;
  },
 };
}
