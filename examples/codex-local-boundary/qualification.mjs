// Production-capable entrypoint, NEVER invoked live by the local proofs.
// --prepare only hashes the private manifest. Execution needs a separate exact approval file.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { codexCharterHash, validateCodexCharter, executeCodexQualification, createCodexOAuthFilePort, CODEX_RUNTIME_FILES } from '../../packages/adapters/dist/codex-subscription.js';
import { createCodexHttpsPort } from '../../packages/adapters/dist/codex-https.js';
import { learningFile } from '../../packages/adapters/dist/learning-journal.js';
try {
 const [mode,manifestPath,approvalPath,...extra]=process.argv.slice(2);
 if(extra.length||!manifestPath||!['--prepare','--execute-approved'].includes(mode)||mode==='--prepare'&&approvalPath)throw Error('usage');
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));if(manifest.version!=='codex-executable-manifest-v1'||manifest.executionApproval!==null)throw Error('manifest');
 const c=manifest.charter,hash=codexCharterHash(c);
 if(mode==='--prepare')console.log(JSON.stringify({charterSha256:hash,execution:'NOT EXECUTED',approvalRequired:true,canonicalResolution:c.identityEvidence,hostQualification:c.hostEvidence,limits:c.limits,serverOutputTokenCap:null}));
 else {
  if(!approvalPath)throw Error('approval missing');const approval=JSON.parse(readFileSync(approvalPath,'utf8'));if(approval.scope!=='subscription-live')throw Error('fixture approval cannot enter production');
  validateCodexCharter(c,approval);
  if(approval.journalPath!==manifest.journalPath||resolve(manifest.journalPath)!==manifest.journalPath||realpathSync(dirname(manifest.journalPath))!==dirname(manifest.journalPath))throw Error('owner path');
  const transport=createCodexHttpsPort();transport.preflight();
  // Source files only. This does NOT read the OAuth file or establish transitive host trust.
  for(const relative of CODEX_RUNTIME_FILES){const bytes=learningFile(resolve(c.runtime.sdkRoot,relative),2*1024*1024);if(createHash('sha256').update(bytes).digest('hex')!==c.runtime.fingerprints[relative])throw Error('SDK fingerprint changed');}
  const {stream}=await import(pathToFileURL(resolve(c.runtime.sdkRoot,CODEX_RUNTIME_FILES[0])).href);
  const models=JSON.parse(learningFile(resolve(c.runtime.sdkRoot,CODEX_RUNTIME_FILES[2]),2*1024*1024).toString('utf8'))['openai-codex-responses'];
  const bindings=Object.fromEntries(c.invocations.map(i=>[i.model,{model:models[i.model],stream}]));
  const result=await executeCodexQualification(manifest.journalPath,c,approval,{bindings,credentials:createCodexOAuthFilePort(c.runtime.oauthFile),transport});
  console.log(JSON.stringify({outcome:result.outcome,calls:result.calls,executionMode:result.executionMode,liveQualified:false,routingDefault:null}));
 }
}catch {console.error('qualification entry refused or failed; no automatic retry');process.exitCode=1;}
