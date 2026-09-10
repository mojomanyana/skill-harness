import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, readlinkSync } from 'node:fs';

/** Separate from linux-bwrap-digest-v1: this proves only a fixed IPC probe workload.
 * It MUST NOT be used to run arbitrary model/extension code. A model-bearing profile
 * additionally needs aggregate host/descendant memory/CPU/egress limits and token
 * semantics; these are deliberately reported unqualified rather than bypassed. */
export const CODEX_LOCAL_PROFILE = Object.freeze({id:'linux-bwrap-codex-ipc-probe-v1',network:'unshared-no-egress',credentials:'none',cpuSeconds:2,nofile:64,heapMiB:32,wallMs:3000,outputBytes:4096,arbitraryCode:false,modelExecutionQualified:false});
const CODE = `const fs=require('node:fs');let rootReadOnly=false;try{fs.writeFileSync('/usr/.codex-profile-write-probe','denied',{flag:'wx'});}catch(e){rootReadOnly=e.code==='EROFS';}const id=process.argv[1];process.stdout.write(JSON.stringify({frame:JSON.stringify({id,sequence:1})+'\\n',netNamespace:fs.readlinkSync('/proc/self/ns/net'),envKeys:Object.keys(process.env),pwd:process.env.PWD,rootReadOnly}));`;
export async function probeLocalCodexProfile(id:string) {
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(id))throw Error('bounded invocation identity required');
 if(process.platform!=='linux')throw Error('Linux namespaces required; no fallback');
 const parentNet=readlinkSync('/proc/self/ns/net'),node=realpathSync(process.execPath),fingerprints:Record<string,string>={};
 for(const p of [node,'/usr/bin/bwrap','/usr/bin/prlimit']){const s=lstatSync(p);if(!s.isFile()||(s.mode&0o022)||s.size>256*1024*1024)throw Error('untrusted runtime executable');fingerprints[p]=createHash('sha256').update(readFileSync(p)).digest('hex');}
 const args=['--unshare-all','--die-with-parent','--new-session','--cap-drop','ALL','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--dir','/runtime','--ro-bind',node,'/runtime/node','--proc','/proc','--dev','/dev','--clearenv','--chdir','/','--','/usr/bin/prlimit','--cpu=2:2','--nofile=64:64','--','/runtime/node','--max-old-space-size=32','-e',CODE,id];
 const proof=await new Promise<{frame:string;netNamespace:string;envKeys:string[];pwd:string;rootReadOnly:boolean}>((resolve,reject)=>{
  const child=spawn('/usr/bin/bwrap',args,{env:{},stdio:['ignore','pipe','pipe']});let bytes=0,failed:Error|undefined;const chunks:Buffer[]=[];
  // The original ChildProcess handle is retained. No discovery/PID/title cancellation.
  const fail=(e:Error)=>{failed??=e;child.kill('SIGKILL');};const timer=setTimeout(()=>fail(Error('local profile deadline')),CODEX_LOCAL_PROFILE.wallMs);
  child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>CODEX_LOCAL_PROFILE.outputBytes)fail(Error('local profile output bound'));else chunks.push(Buffer.from(b));});
  child.stderr.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>CODEX_LOCAL_PROFILE.outputBytes)fail(Error('local profile output bound'));});
  child.once('error',e=>{failed=e;});child.once('close',(code,signal)=>{clearTimeout(timer);if(failed){reject(failed);return;}if(code!==0||signal){reject(Error('local namespace probe failed; prerequisite NOT qualified'));return;}try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('malformed profile proof'));}});
 });
 if(proof.frame!==JSON.stringify({id,sequence:1})+'\n'||proof.rootReadOnly!==true||!Array.isArray(proof.envKeys)||proof.envKeys.join()!=='PWD'||proof.pwd!=='/'||(typeof proof.netNamespace!=='string'||proof.netNamespace===parentNet))throw Error('local profile invariant failed: '+JSON.stringify(proof));
 return {...proof,profile:CODEX_LOCAL_PROFILE,fingerprints,modelExecutionQualified:false as const,remaining:['aggregate model/host/descendant resource qualification','host-only subscription credential and egress boundary','provider output-token cap semantics']};
}
