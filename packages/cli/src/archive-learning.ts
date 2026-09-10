import { constants, openSync, readSync, fstatSync, closeSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { createArchiveAccess, openArchiveAccess, readFixedOrderFacts, type ArchiveAccessPolicy, type ArchiveConsent, createWeeklyInvestigation, openWeeklyInvestigation, createTrustLifecycle, openTrustLifecycle, type WeeklySupervisorInput, type TrustLifecycleInput, type TrustReferenceOutcome, type InvestigationFiles, type InvestigationScreenRequest } from '@skill-harness/adapters';
import { parseLearningRequest, type InvestigationAuthority, type InvestigationScenarioPreview, type CalibrationPrediction } from '@skill-harness/core';
import type { Args } from './cli.js';
/** Explicit operator requests, not a scheduler or model route. The inert host cannot invoke this CLI. */
export function cmdArchiveLearning(args:Args){
 if(args._.length!==1||Object.keys(args.flags).sort().join()!=='request,state'||typeof args.flags.state!=='string'||!isAbsolute(args.flags.state)||typeof args.flags.request!=='string')throw Error('archive weekly|trust|access requires --state /absolute/directory --request file');
 const fd=openSync(args.flags.request,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);let text:string;
 try{const stat=fstatSync(fd);if(!stat.isFile()||stat.size>65536)throw Error('bounded regular learning request required');const bytes=Buffer.alloc(65537);let n=0;while(n<bytes.length){const k=readSync(fd,bytes,n,bytes.length-n,n);if(!k)break;n+=k;}if(n>65536)throw Error('learning request exceeds bound');text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,n));}finally{closeSync(fd);}
 const request=parseLearningRequest(text) as {operation:string;input:unknown;authority:unknown};
 if(Object.keys(request).sort().join()!=='authority,input,operation')throw Error('closed learning request required');
 const input=request.input,authority=request.authority,state=args.flags.state;
 let result:unknown;
 if(args._[0]==='access'){
  if(request.operation==='create')result=createArchiveAccess(state,input as ArchiveAccessPolicy,authority as string[]).inspect();
  else{const access=openArchiveAccess(state);switch(request.operation){
   case 'inspect':result=access.inspect();break;
   case 'preview-consent':result=access.previewConsent(input as ArchiveConsent);break;
   case 'consent':{const p=input as {grant:ArchiveConsent;now:number};result=access.consent(p.grant,authority as string[],p.now);break;}
   case 'preview-revocation':result=access.previewRevocation(input as string);break;
   case 'revoke':{const p=input as {id:string;now:number};access.revoke(p.id,authority as string[],p.now);result={recorded:true};break;}
   case 'facts':{const p=input as {manifestId:string;purpose:string;expected:Parameters<typeof readFixedOrderFacts>[3];now:number};result=readFixedOrderFacts(access.inspect().policy.archiveRoot,p.manifestId,{directory:state,purpose:p.purpose},p.expected,p.now);break;}
   default:throw Error('unsupported access operation; raw read/export is not a CLI operation');
  }}
 }else if(args._[0]==='weekly'){
  if(request.operation==='create'){result=createWeeklyInvestigation(state,input as WeeklySupervisorInput).inspect();}
  else {const job=openWeeklyInvestigation(state);switch(request.operation){
   case 'inspect':result=job.inspect();break;
   case 'run':result=job.run(request.input);break;
   case 'approve':result=job.approve(authority as InvestigationAuthority);break;
   case 'preview':{const p=request.input as {specPath:string;scenario:Record<string,unknown>};result=job.preview(p.specPath,p.scenario);break;}
   case 'promote':result=job.promote(input as InvestigationScenarioPreview,authority as InvestigationAuthority);break;
   case 'freeze':result=job.freeze(input as InvestigationFiles,authority as InvestigationAuthority);break;
   case 'preview-edit':result=job.previewEdit(input as string);break;
   case 'edit':result=job.edit(input as string,authority as string[]);break;
   case 'evaluation':result=job.evaluation();break;
   case 'preview-screen':result=job.previewScreen(input as InvestigationScreenRequest);break;
   case 'screen':result=job.screen(input as InvestigationScreenRequest,authority as string[]);break;
   default:throw Error('unsupported weekly operation');
  }}
 }else if(args._[0]==='trust'){
  if(request.operation==='create'){result=createTrustLifecycle(state,input as TrustLifecycleInput,authority as string[]).inspect(0);}
  else {const job=openTrustLifecycle(state);switch(request.operation){
   case 'inspect':result=job.inspect(input as number);break;
   case 'predict':job.predict(input as CalibrationPrediction);result={recorded:true};break;
   case 'correct':{const p=request.input as {prior:string;prediction:CalibrationPrediction;reason:string};job.correct(p.prior,p.prediction,p.reason);result={recorded:true};break;}
   case 'outcome':job.outcome(input as TrustReferenceOutcome,authority as string[]);result={recorded:true};break;
   case 'expose':{const p=request.input as {id:string;now:number};result=job.expose(p.id,p.now);break;}
   default:throw Error('unsupported trust operation');
  }}
 }else throw Error('unsupported learning family');
 console.log(JSON.stringify(result,null,2));
}
