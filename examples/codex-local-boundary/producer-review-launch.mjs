// Prospective two-call review entry. Preparation never loads SDK, producer, or credentials.
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { prepareProducerReview } from '../../packages/adapters/dist/producer-review.js';
import { CODEX_RUNTIME_FILES } from '../../packages/adapters/dist/codex-subscription.js';
import { superviseTrustedHost } from '../../packages/core/dist/trusted-host-supervision.js';
import { sourceHash, releaseWhenSupervised } from './qualification-launch.mjs';
const entry=fileURLToPath(import.meta.url),worker=join(dirname(entry),'producer-review-worker.mjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const closed=(o,keys)=>{if(!o||Array.isArray(o)||Object.keys(o).sort().join()!==keys.sort().join())throw Error('closed review launch required');};
export function loadReviewLaunch(path,mode,approvalPath){
 if(!['--prepare','--fixture','--execute-approved'].includes(mode)||!isAbsolute(path)||realpathSync(path)!==path||process.execArgv.length)throw Error('review entry mode/path');
 const bytes=readFileSync(path);if(bytes.length>8*1024*1024)throw Error('review launch byte bound');const c=JSON.parse(bytes);closed(c,['version','profile','plan','runtime','outputRoot','pins','executionApproval']);
 if(!['producer-review-launch-v1','producer-review-launch-v2'].includes(c.version)||!['fixture','subscription-live'].includes(c.profile)||c.executionApproval!==null)throw Error('review launch version/authority');
 closed(c.runtime,['node','sdkRoot','producerRoot','oauthFile']);for(const p of Object.values(c.runtime))if(!isAbsolute(p)||resolve(p)!==p)throw Error('review runtime path');
 if(realpathSync(c.runtime.node)!==process.execPath||!isAbsolute(c.outputRoot)||resolve(c.outputRoot)!==c.outputRoot||realpathSync(dirname(c.outputRoot))!==dirname(c.outputRoot))throw Error('review runtime/output occurrence');
 const plan=prepareProducerReview(c.plan),launchSha256=hash(bytes),harness=resolve(dirname(entry),'../..');
 const installed=c.version==='producer-review-launch-v2';
 if(installed?(c.plan.version!=='producer-review-installed-v1'||c.plan.session.runRoot!==c.outputRoot):c.plan.version!=='producer-review-v1')throw Error('review session launch version mismatch');
 const selected=installed?c.plan.session.resources.slice(0,2).map(r=>r.path):[];
 if(installed&&c.plan.session.resources.slice(2).map(r=>r.path).join()!==[join(c.runtime.producerRoot,'packages/pi-daddy/extensions/grants.ts'),join(harness,'packages/pi-extension/dist/index.js')].join())throw Error('exact installed extension paths required');
 const required=[join(harness,'packages/adapters/dist/installed-review-session.js'),...(installed?[join(c.runtime.sdkRoot,'dist/index.js'),join(c.runtime.sdkRoot,'dist/core/sdk.js'),join(c.runtime.sdkRoot,'dist/core/agent-session.js'),join(c.runtime.sdkRoot,'dist/core/resource-loader.js'),join(c.runtime.sdkRoot,'dist/core/session-manager.js'),join(c.runtime.sdkRoot,'dist/core/extensions/runner.js'),join(c.runtime.sdkRoot,'dist/core/extensions/loader.js'),...c.plan.session.resources.map(r=>r.path)]:[]),entry,worker,join(dirname(entry),'qualification-launch.mjs'),c.runtime.node,...CODEX_RUNTIME_FILES.map(f=>join(c.runtime.sdkRoot,f)),join(harness,'packages/adapters/dist/producer-review.js'),join(harness,'packages/adapters/dist/codex-sdk-transport.js'),join(harness,'packages/adapters/dist/codex-https.js'),join(harness,'packages/adapters/dist/codex-subscription.js'),join(harness,'packages/adapters/dist/learning-journal.js'),join(harness,'packages/core/dist/trusted-host-supervision.js'),join(c.runtime.producerRoot,'packages/pi-daddy/src/producer-ipc.ts'),join(c.runtime.producerRoot,'packages/pi-daddy/src/resource-budget.ts')];
 if(!c.pins||typeof c.pins!=='object'||required.some(p=>!c.pins[p]))throw Error('review required runtime pins');
 for(const [p,h] of Object.entries(c.pins)){if(p===c.runtime.oauthFile||(p.split('/').includes('.pi')&&!selected.includes(p))||!(selected.includes(p)||p===c.runtime.node||[harness,c.runtime.sdkRoot,c.runtime.producerRoot].some(root=>p.startsWith(root+'/')))||!/^[a-f0-9]{64}$/.test(h)||sourceHash(p)!==h)throw Error('review source pin mismatch');}
 let approval=null;
 if(mode==='--prepare'){if(approvalPath)throw Error('prepare has no authority');}
 else if(mode==='--fixture'){
  if(c.profile!=='fixture'||approvalPath||!c.plan.accountId.startsWith('fixture-'))throw Error('fixture cannot enter subscription');
  approval={version:'producer-review-approval-v1',scope:'fixture',planSha256:plan.planSha256,journalPath:join(c.outputRoot,'owner'),approvalId:'offline-proof',expiresAt:Date.now()+c.plan.limits.wallMs,maxCalls:2};
 }else{
  if(c.profile!=='subscription-live'||!approvalPath)throw Error('separate fresh review approval required');
  const raw=readFileSync(approvalPath);if(raw.length>4096)throw Error('approval byte bound');const a=JSON.parse(raw);closed(a,['version','launchSha256','executionApproval']);approval=a.executionApproval;
  if(a.version!=='producer-review-launch-approval-v1'||a.launchSha256!==launchSha256)throw Error('review launch approval mismatch');
  closed(approval,['version','scope','planSha256','journalPath','approvalId','expiresAt','maxCalls']);
  if(approval.version!=='producer-review-approval-v1'||approval.scope!=='subscription-live'||approval.planSha256!==plan.planSha256||approval.maxCalls!==2||approval.journalPath!==join(c.outputRoot,'owner')||typeof approval.approvalId!=='string'||!approval.approvalId||!Number.isSafeInteger(approval.expiresAt)||approval.expiresAt<=Date.now())throw Error('review exact approval refused');
 }
 return {config:c,plan,launchSha256,approval};
}
async function main(){
 const [mode,path,approvalPath,...extra]=process.argv.slice(2);if(extra.length)throw Error('usage');const {config:c,plan,launchSha256}=loadReviewLaunch(path,mode,approvalPath);
 if(mode==='--prepare'){console.log(JSON.stringify({status:'PREPARED-NOT-AUTHORIZED',launchSha256,planSha256:plan.planSha256,packetBytes:Buffer.byteLength(c.plan.packet),maxCalls:2,tools:[],extensions:c.plan.session?.resources.filter(r=>r.kind==='extension')??[],installedSession:c.plan.session??null,liveCalls:0,approval:null,command:[c.runtime.node,entry,'--execute-approved',path,join(dirname(path),'fresh-approval.json')],limits:c.plan.limits,acceptance:'not-assessed'},null,2));return;}
 if(existsSync(c.outputRoot))throw Error('review output occurrence already consumed; no retry');mkdirSync(c.outputRoot,{mode:0o700});
 writeFileSync(join(c.outputRoot,'launch-claim.json'),JSON.stringify({launchSha256,at:new Date().toISOString(),maxCalls:2,mode})+'\n',{flag:'wx',mode:0o600});
 const argv=[worker,mode,path,...(approvalPath?[approvalPath]:[])],env={PATH:dirname(c.runtime.node)+':/usr/bin:/bin',HOME:join(c.outputRoot,'home'),PI_OFFLINE:'1'};
 const child=spawn(c.runtime.node,argv,{cwd:c.outputRoot,env,detached:true,stdio:['pipe','pipe','pipe']});
 let fixtureDiagnosticBytes=0;if(mode==='--fixture')child.stderr.on('data',chunk=>{const left=4096-fixtureDiagnosticBytes;if(left>0){const b=Buffer.from(chunk).subarray(0,left);fixtureDiagnosticBytes+=b.length;process.stderr.write(b);}});
 await once(child,'spawn');
 const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGTERM',abort);process.once('SIGINT',abort);
 const limits={wallMs:c.plan.limits.wallMs,settlementMs:2000,maxOutputBytes:65536},observed=superviseTrustedHost(child,{...limits,signal:controller.signal});child.stdin.on('error',abort);
 await releaseWhenSupervised(child,observed,launchSha256,controller.signal,performance.now()+limits.wallMs);
 const observation=await observed;process.off('SIGTERM',abort);process.off('SIGINT',abort);
 writeFileSync(join(c.outputRoot,'process.json'),JSON.stringify({launchSha256,observation,limits,acceptance:'not-assessed'})+'\n',{flag:'wx',mode:0o600});
 if(observation.outcome!=='completed')throw Error('review failed/unknown; original accounting retained');
 console.log(JSON.stringify({launchSha256,result:join(c.outputRoot,'result.json'),acceptance:'not-assessed'}));
}
if(process.argv[1]===entry)main().catch(()=>{console.error('review preparation/execution refused; no retry');process.exitCode=1;});
