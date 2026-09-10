import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { learningCopy, learningHash } from './learning-journal.js';
import { readGovernedArchive, type GovernedArchiveRoute } from './archive-access.js';
import { retainArchiveSource, readArchiveSource } from './evidence-archive.js';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export interface PrincipalPayloadReceipt {version:'principal-check-payload-receipt-v1';archive_id:string;object_id:string;sha256:string;byte_length:number;origin_sha256:string}
/** Caller owns consent; this port neither reads source paths nor grants permission.
 * Archive identity is an explicit host binding, not authentication. */
export function createPrincipalPayloadPort(root:string,archiveId:string,route?:GovernedArchiveRoute){
 const access=route?learningCopy(route):undefined;
 if(!isAbsolute(root)||!/^[-a-zA-Z0-9:._]{1,128}$/.test(archiveId))throw Error('explicit archive identity/root required');
 return Object.freeze({version:'principal-check-payload-port-v1' as const,
  async retain(input:{bytes:Uint8Array;sha256:string;origin:unknown}):Promise<PrincipalPayloadReceipt>{
   if(!(input.bytes instanceof Uint8Array)||input.bytes.byteLength>1024*1024)throw Error('payload byte bound');
   const bytes=Buffer.from(input.bytes),origin=learningCopy(input.origin),originHash=learningHash(origin);if(sha(bytes)!==input.sha256)throw Error('payload digest mismatch');
   const stored=retainArchiveSource(root,{sourceId:`principal:${originHash}`,parser:{id:'principal-check-payload',version:'1'},retention:'exact',bytes});
   return {version:'principal-check-payload-receipt-v1',archive_id:archiveId,object_id:stored.manifestId,sha256:sha(bytes),byte_length:bytes.length,origin_sha256:originHash};
  },
  async read(raw:PrincipalPayloadReceipt,options:{max_bytes:number}){
   const receipt=learningCopy(raw);if(receipt.version!=='principal-check-payload-receipt-v1'||receipt.archive_id!==archiveId)throw Error('archive identity mismatch');
   if(!Number.isSafeInteger(options.max_bytes)||options.max_bytes<0||options.max_bytes>1024*1024||!Number.isSafeInteger(receipt.byte_length)||receipt.byte_length<0||receipt.byte_length>options.max_bytes)throw Error('payload read bound');
   const result=access?readGovernedArchive(root,receipt.object_id,options.max_bytes,access):readArchiveSource(root,receipt.object_id,options.max_bytes);if(result.status!=='available')throw Error('archive payload unavailable');
   if(result.reference.sourceId!==`principal:${receipt.origin_sha256}`||result.reference.parser.id!=='principal-check-payload'||result.reference.parser.version!=='1'||result.reference.retention!=='exact')throw Error('payload origin mismatch');
   if(result.bytes.length!==receipt.byte_length||sha(result.bytes)!==receipt.sha256)throw Error('payload readback mismatch');return {receipt,bytes:Buffer.from(result.bytes)};
  },
 });
}
