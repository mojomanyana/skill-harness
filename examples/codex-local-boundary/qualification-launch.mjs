// Trusted fixed caller, not a generic worker launcher or a live authorization source.
import { constants, openSync, readSync, closeSync, fstatSync, readFileSync, writeFileSync, realpathSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { superviseTrustedHost } from '../../packages/core/dist/trusted-host-supervision.js';
import { codexCharterHash, validateCodexCharter, CODEX_RUNTIME_FILES } from '../../packages/adapters/dist/codex-subscription.js';
export const worker='/harness/examples/codex-local-boundary/qualification-worker.mjs';
const closed=(x,keys)=>{if(!x||Object.keys(x).sort().join()!==keys.sort().join())throw Error('closed launch declaration required');};
export function sourceHash(path){if(realpathSync(path)!==path)throw Error('source alias refused');const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=fstatSync(fd);if(!s.isFile()||s.size>256*1024*1024)throw Error('source size/type');const hash=createHash('sha256'),b=Buffer.alloc(65536);let n;while((n=readSync(fd,b,0,b.length,null)))hash.update(b.subarray(0,n));return hash.digest('hex');}finally{closeSync(fd);}}
export function loadLaunch(path,mode,approvalPath){
 if(process.execPath!=='/node'||process.execArgv.length||realpathSync('/out')!=='/out')throw Error('fixed namespace/runtime required');
 const raw=readFileSync(path);if(raw.length>2*1024*1024)throw Error('launch size');const launchSha256=createHash('sha256').update(raw).digest('hex'),config=JSON.parse(raw);
 closed(config,['version','profile','manifest','pins','limits']);if(config.version!=='supervised-producer-launch-v1'||!['fixture','subscription-live'].includes(config.profile))throw Error('launch profile');
 const m=config.manifest,c=m.charter;closed(m,['version','charter','journalPath','executionApproval','currentLiveCallBudget']);if(m.version!=='codex-executable-manifest-v1'||m.executionApproval!==null||m.currentLiveCallBudget!==0||m.journalPath!=='/out/owner'||c.runtime.sdkRoot!=='/sdk'||c.runtime.oauthFile!=='/auth/oauth.json')throw Error('fixed preparation paths/authority');
 closed(config.limits,['wallMs','settlementMs','maxOutputBytes']);if(config.limits.wallMs!==c.limits.wallMs||config.limits.wallMs>150000||config.limits.settlementMs!==2000||config.limits.maxOutputBytes!==65536)throw Error('supervision limits');
 for(const required of [worker,'/harness/examples/codex-local-boundary/qualification-launch.mjs','/harness/examples/codex-local-boundary/qualification-fixture-ports.mjs','/node',...CODEX_RUNTIME_FILES.map(f=>'/sdk/'+f),'/producer/packages/pi-daddy/src/producer-ipc.ts','/producer/packages/pi-daddy/src/resource-budget.ts','/harness/packages/adapters/dist/codex-subscription.js','/harness/packages/core/dist/trusted-host-supervision.js'])if(!config.pins[required])throw Error('missing source pin');
 for(const [p,h] of Object.entries(config.pins)){if(!/^\/(?:node$|harness\/|producer\/|sdk\/)/.test(p)||p.split('/').some(s=>s==='..'||s==='.pi')||!/^[a-f0-9]{64}$/.test(h)||sourceHash(p)!==h)throw Error('source pin mismatch');}
 for(const f of CODEX_RUNTIME_FILES)if(c.runtime.fingerprints[f]!==config.pins['/sdk/'+f])throw Error('SDK charter mismatch');
 const blockers=[];if(c.rolePolicy.some(r=>typeof r.canonical!=='string'||!r.canonical)||c.identityEvidence.kind!=='host-resolved')blockers.push('canonical-provenance');if(!c.accountId||c.accountId.startsWith('fixture-'))blockers.push('account-provenance');if(c.hostEvidence.kind!=='qualified-host')blockers.push('selected-host-scope-evidence');blockers.push('separate-live-approval');
 let approval;
 if(mode==='--prepare'){if(approvalPath)throw Error('prepare cannot execute');}
 else if(mode==='--fixture'){if(approvalPath||config.profile!=='fixture')throw Error('fixture cannot activate live');approval={scope:'fixture',charterSha256:codexCharterHash(c),approvalId:'local-inert-only',expiresAt:Date.now()+c.limits.wallMs+60000,journalPath:m.journalPath};validateCodexCharter(c,approval);}
 else if(mode==='--live'){if(config.profile!=='subscription-live'||!approvalPath)throw Error('separate live approval required');const a=JSON.parse(readFileSync(approvalPath));closed(a,['version','launchSha256','approvedLiveCalls','executionApproval']);if(a.version!=='supervised-producer-approval-v1'||a.launchSha256!==launchSha256||a.approvedLiveCalls!==5||a.executionApproval.scope!=='subscription-live')throw Error('exact launch approval mismatch');approval=a.executionApproval;validateCodexCharter(c,approval);if(approval.journalPath!==m.journalPath)throw Error('approved owner path');}
 else throw Error('launch mode');
 return {config,launchSha256,approval,blockers};
}
export async function releaseWhenSupervised(child,observed,id,signal,deadline){
 let terminal=false;void observed.then(()=>{terminal=true;},()=>{terminal=true;});
 // Flush admission rejection before any release; also refuse an expired/aborted start.
 await new Promise(resolve=>setImmediate(resolve));
 if(terminal||signal.aborted||performance.now()>=deadline){child.stdin.end();await observed;throw Error('supervision not active for release');}
 child.stdin.end(JSON.stringify({id,sequence:1})+'\n');
}
async function main(){
 const [mode,path,approvalPath,...extra]=process.argv.slice(2);if(extra.length||!path)throw Error('usage');
 const {config,launchSha256,blockers}=loadLaunch(path,mode,approvalPath);
 const argv=[worker,mode,path,...(approvalPath?[approvalPath]:[])];
 if(mode==='--prepare'){console.log(JSON.stringify({launchSha256,charterSha256:codexCharterHash(config.manifest.charter),readyForLive:false,blockers,executable:'/node',argv:['/harness/examples/codex-local-boundary/qualification-launch.mjs','--live',path,'/out/approval.json'],workerArgv:[worker,'--live',path,'/out/approval.json'],env:{},limits:config.limits,evidence:['/out/budget','/out/owner','/out/result.json','/out/process.json'],sourcePins:Object.keys(config.pins).length,approval:null,liveCalls:0}));return;}
 if(['budget','owner','result.json','process.json'].some(p=>existsSync('/out/'+p)))throw Error('prior original execution exists; no retry');
 const child=spawn('/node',argv,{cwd:'/out',env:{},detached:true,stdio:['pipe','pipe','pipe']});await once(child,'spawn');
 const controller=new AbortController();const abort=()=>controller.abort();process.once('SIGTERM',abort);process.once('SIGINT',abort);
 const deadline=performance.now()+config.limits.wallMs;
 const observed=superviseTrustedHost(child,{...config.limits,signal:controller.signal});
 // Only a bounded release frame; never an OAuth value, endpoint or arbitrary payload.
 child.stdin.on('error',()=>controller.abort());
 await releaseWhenSupervised(child,observed,launchSha256,controller.signal,deadline);
 const observation=await observed;process.off('SIGTERM',abort);process.off('SIGINT',abort);
 writeFileSync('/out/process.json',JSON.stringify({launchSha256,executable:'/node',argv,env:{},limits:config.limits,observation,acceptance:'not-assessed'},null,2)+'\n',{flag:'wx',mode:0o600});
 if(observation.outcome!=='completed')throw Error('original worker failed or unknown; never retry');
 console.log(JSON.stringify({launchSha256,process:observation.outcome,resultPath:'/out/result.json',acceptance:'not-assessed'}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('qualification launch refused or failed; no automatic retry');process.exitCode=1;});
