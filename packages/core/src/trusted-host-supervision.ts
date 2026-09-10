import type { ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { qualificationProcessIdentity, cleanupQualificationProcessGroupAfterLeaderExit, terminateQualificationProcess, type QualificationProcessIdentity } from './qualification-process.js';

const monitored=new WeakSet<ChildProcess>();
export interface TrustedHostSupervisionLimits {wallMs:number;settlementMs:number;maxOutputBytes:number;signal:AbortSignal}
export interface TrustedHostProcessObservation {
 outcome:'completed'|'failed'|'aborted'|'timed-out'|'output-limit'|'unknown';
 identity:QualificationProcessIdentity;exitCode:number|null;signal:NodeJS.Signals|null;
 stdoutBytes:number;stderrBytes:number;truncated:boolean;cleanupAttempted:boolean;
 acceptance:'not-assessed';
}
/** Observe an ALREADY admitted, caller-owned detached Linux child, after its spawn event.
 * No spawn/authorization/accounting/retry is performed here. The parent event loop must
 * remain responsive. Occurrence-safe same-group cleanup is not hostile-code containment,
 * survivor/crash recovery, hard aggregate RAM/CPU, or proof of remote provider termination.
 * Bytes are discarded, not retained or hashed; the existing worker journal owns artifacts. */
export async function superviseTrustedHost(child:ChildProcess,limits:TrustedHostSupervisionLimits):Promise<TrustedHostProcessObservation> {
 if(process.platform!=='linux')throw Error('trusted host supervision requires Linux occurrence identity');
 if(!(limits.signal instanceof AbortSignal)||!Number.isSafeInteger(limits.wallMs)||limits.wallMs<1||limits.wallMs>150000||!Number.isSafeInteger(limits.settlementMs)||limits.settlementMs<100||limits.settlementMs>5000||!Number.isSafeInteger(limits.maxOutputBytes)||limits.maxOutputBytes<1||limits.maxOutputBytes>1048576)throw Error('bounded trusted host limits required');
 if(monitored.has(child))throw Error('original child already monitored; no retry');
 if(!child.pid||!child.stdout||!child.stderr||child.exitCode!==null||child.signalCode!==null)throw Error('live caller-owned child with output pipes required');
 const identity=qualificationProcessIdentity(child.pid),stat=readFileSync(`/proc/${child.pid}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);
 if(Number(fields[2])!==child.pid||fields[19]!==identity.start_ticks)throw Error('original detached process group required');
 monitored.add(child);
 const stdout=child.stdout,stderr=child.stderr;
 return new Promise(resolve=>{
  let reason:TrustedHostProcessObservation['outcome']|null=null,done=false,exited=false,closed=false,exitCode:number|null=null,signal:NodeJS.Signals|null=null,stdoutBytes=0,stderrBytes=0,cleanupAttempted=false;
  let settling:NodeJS.Timeout|undefined,cleanup:Promise<void>|null=null;
  const finish=(outcome:TrustedHostProcessObservation['outcome'])=>{
   if(done)return;done=true;clearTimeout(wall);clearTimeout(settling);limits.signal.removeEventListener('abort',abort);
   stdout.off('data',out);stderr.off('data',err);stdout.resume();stderr.resume();
   child.off('exit',exit);child.off('close',close);child.off('error',error);
   // On unknown, the caller still owns this child and occurrence. Never claim settlement.
   resolve({outcome,identity,exitCode,signal,stdoutBytes,stderrBytes,truncated:stdoutBytes+stderrBytes>limits.maxOutputBytes,cleanupAttempted,acceptance:'not-assessed'});
  };
  const boundSettlement=()=>{settling??=setTimeout(()=>finish('unknown'),limits.settlementMs);};
  const stop=(why:TrustedHostProcessObservation['outcome'])=>{
   if(done)return;reason??=why;boundSettlement();
   if(cleanupAttempted)return;cleanupAttempted=true;
   try{terminateQualificationProcess(child,identity);}catch{finish('unknown');}
  };
  const out=(b:Buffer)=>{stdoutBytes+=b.length;if(stdoutBytes+stderrBytes>limits.maxOutputBytes)stop('output-limit');};
  const err=(b:Buffer)=>{stderrBytes+=b.length;if(stdoutBytes+stderrBytes>limits.maxOutputBytes)stop('output-limit');};
  const abort=()=>stop('aborted');
  const error=()=>stop('failed');
  const complete=()=>{
   if(!exited||!closed||done)return;
   void (cleanup??Promise.resolve()).then(()=>finish(reason??(exitCode===0?'completed':'failed')),()=>finish('unknown'));
  };
  const exit=(code:number|null,sig:NodeJS.Signals|null)=>{
   exited=true;exitCode=code;signal=sig;clearTimeout(wall);boundSettlement();cleanupAttempted=true;
   cleanup=cleanupQualificationProcessGroupAfterLeaderExit(child.pid,identity);
   // Attach rejection handling immediately, even if descendant-held pipes never close.
   void cleanup.catch(()=>finish('unknown'));complete();
  };
  const close=()=>{closed=true;complete();};
  const wall=setTimeout(()=>stop('timed-out'),limits.wallMs);
  stdout.on('data',out);stderr.on('data',err);child.once('error',error);child.once('exit',exit);child.once('close',close);
  limits.signal.addEventListener('abort',abort,{once:true});if(limits.signal.aborted)abort();
 });
}
