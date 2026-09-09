// One offline suite: exact selected executable, actual producer/SDK, inert ports.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const [templatePath,producerRoot,dependencyRoot,evidenceRoot]=process.argv.slice(2);
const root=resolve('.'),template=JSON.parse(readFileSync(templatePath)),sdk=template.charter.runtime.sdkRoot;
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const pins={};
function inventory(host,guest){for(const entry of readdirSync(host,{withFileTypes:true})){if(entry.name==='node_modules')continue;const h=host+'/'+entry.name,g=guest+'/'+entry.name;if(entry.isDirectory())inventory(h,g);else if(entry.isFile())pins[g]=sha(h);}}
inventory(producerRoot,'/producer');
for(const pkg of ['core','adapters'])inventory(root+'/packages/'+pkg+'/dist','/harness/packages/'+pkg+'/dist');
for(const n of ['qualification-launch.mjs','qualification-worker.mjs','qualification-fixture-ports.mjs'])pins['/harness/examples/codex-local-boundary/'+n]=sha(root+'/examples/codex-local-boundary/'+n);
for(const n of Object.keys(template.charter.runtime.fingerprints))pins['/sdk/'+n]=sha(sdk+'/'+n);
pins['/node']=sha(process.execPath);
const launcher=await import('./qualification-launch.mjs'),frames=[];
const rejected=Promise.reject(Error('inert monitor refusal'));void rejected.catch(()=>{});
await assert.rejects(()=>launcher.releaseWhenSupervised({stdin:{end:b=>frames.push(b)}},rejected,'fixture-release',new AbortController().signal,Infinity),/inert monitor refusal/);
assert.deepEqual(frames,[undefined],'failed supervision must close stdin without releasing work');
const base={version:'supervised-producer-launch-v1',profile:'subscription-live',manifest:{version:template.version,charter:structuredClone(template.charter),journalPath:'/out/owner',executionApproval:null,currentLiveCallBudget:0},pins,limits:{wallMs:150000,settlementMs:2000,maxOutputBytes:65536}};
base.manifest.charter.runtime={...base.manifest.charter.runtime,sdkRoot:'/sdk',oauthFile:'/auth/oauth.json'};
const fixture=structuredClone(base);fixture.profile='fixture';fixture.manifest.charter.accountId='fixture-account';fixture.manifest.charter.identityEvidence={kind:'fixture',reference:'inert suite only'};fixture.manifest.charter.hostEvidence={kind:'fixture',reference:'network-unshared no-auth mount'};fixture.manifest.charter.rolePolicy.forEach((r,k)=>r.canonical='fixture-'+k);
const out=mkdtempSync(evidenceRoot+'/qualification-launch-');
function invoke(name,config,mode,extra=[]){const dir=out+'/'+name;const mkdir=spawnSync('/bin/mkdir',['-m','700',dir]);assert.equal(mkdir.status,0);writeFileSync(dir+'/launch.json',JSON.stringify(config,null,2)+'\n');const args=['--unshare-all','--die-with-parent','--new-session','--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp','--ro-bind',process.execPath,'/node','--ro-bind',sdk,'/sdk','--ro-bind',root,'/harness','--ro-bind',producerRoot,'/producer','--ro-bind',dependencyRoot+'/node_modules','/producer/node_modules','--ro-bind',dependencyRoot+'/packages/pi-daddy/node_modules','/producer/packages/pi-daddy/node_modules','--bind',dir,'/out','--clearenv','--chdir','/out','/node','/harness/examples/codex-local-boundary/qualification-launch.mjs',mode,'/out/launch.json',...extra];const r=spawnSync('/usr/bin/bwrap',args,{encoding:'utf8',timeout:170000,maxBuffer:1048576});writeFileSync(dir+'/command.json',JSON.stringify({executable:'/usr/bin/bwrap',argv:args,env:'cleared by bwrap',status:r.status,error:r.error?.message??null},null,2));writeFileSync(dir+'/stdout',r.stdout??'');writeFileSync(dir+'/stderr',r.stderr??'');assert.equal(r.error,undefined);return {r,dir};}
const prep=invoke('prepared-live',base,'--prepare');assert.equal(prep.r.status,0);const readiness=JSON.parse(prep.r.stdout);assert.equal(readiness.readyForLive,false);assert.ok(readiness.blockers.includes('canonical-provenance'));assert.ok(!existsSync(prep.dir+'/budget'));
const refused=invoke('unapproved-live',base,'--live');assert.notEqual(refused.r.status,0);assert.ok(!existsSync(refused.dir+'/budget'));
const cross=invoke('cross-mode',fixture,'--live');assert.notEqual(cross.r.status,0);assert.ok(!existsSync(cross.dir+'/budget'));
const tampered=structuredClone(fixture);tampered.pins['/harness/examples/codex-local-boundary/qualification-worker.mjs']='0'.repeat(64);const bad=invoke('wrong-source',tampered,'--fixture');assert.notEqual(bad.r.status,0);assert.ok(!existsSync(bad.dir+'/budget'));
const injected=invoke('fixture-approval',fixture,'--fixture',['/out/not-an-approval.json']);assert.notEqual(injected.r.status,0);assert.ok(!existsSync(injected.dir+'/budget'));
const success=invoke('exact-fixture',fixture,'--fixture');assert.equal(success.r.status,0,success.r.stderr);const processEvidence=JSON.parse(readFileSync(success.dir+'/process.json')),result=JSON.parse(readFileSync(success.dir+'/result.json'));assert.equal(processEvidence.observation.outcome,'completed');assert.equal(result.result.sourceKind,'producer-ipc-v1');assert.equal(result.result.calls,5);assert.equal(result.resources.attempts,5);assert.equal(result.resources.active,0);assert.equal(result.completions.length,5);assert.ok(result.completions.every((s,k)=>s.settlement==='acknowledged'&&s.child.text===JSON.stringify({id:fixture.manifest.charter.invocations[k].id,sequence:1})+'\n'));assert.equal(result.fixture.http,5);assert.equal(result.fixture.realCredentialReads,0);
// Repeat the SAME executable/path: original budget existence refuses before a second launch.
const cmd=JSON.parse(readFileSync(success.dir+'/command.json'));const again=spawnSync(cmd.executable,cmd.argv,{encoding:'utf8',timeout:15000});assert.notEqual(again.status,0);assert.equal(JSON.parse(readFileSync(success.dir+'/result.json')).result.calls,5);writeFileSync(success.dir+'/repeat-refused.json',JSON.stringify({status:again.status,stdout:again.stdout,stderr:again.stderr}));
writeFileSync(out+'/receipt.json',JSON.stringify({checks:8,liveCalls:0,realCredentialReads:0,readiness,sourcePins:pins,actualResult:result.result,process:processEvidence,scope:'selected executable -> supervised original producer five-role worker; fixture only'},null,2)+'\n');
console.log(JSON.stringify({passed:8,evidence:out,liveCalls:0,realCredentialReads:0}));
