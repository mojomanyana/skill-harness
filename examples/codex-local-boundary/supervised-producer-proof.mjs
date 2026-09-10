// Network-unshared/no-home fixture only. Original producer/SDK work lives in the child;
// this responsive parent does not load credentials, authorize calls or take over its permits.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { superviseTrustedHost } from '/harness/packages/core/dist/trusted-host-supervision.js';
const child=spawn('/node',['/harness/examples/codex-local-boundary/producer-qualification-proof.mjs'],{cwd:'/',env:{},detached:true,stdio:['ignore','pipe','pipe']});
await once(child,'spawn');
const observation=await superviseTrustedHost(child,{wallMs:60000,settlementMs:2000,maxOutputBytes:65536,signal:new AbortController().signal});
writeFileSync('/out/host-process.json',JSON.stringify(observation,null,2)+'\n');
assert.equal(observation.outcome,'completed');assert.equal(observation.acceptance,'not-assessed');
const proof=JSON.parse(readFileSync('/out/proof.json','utf8'));assert.equal(proof.scenarios,10);assert.equal(proof.liveCalls,0);assert.equal(proof.realCredentialReads,0);
console.log(JSON.stringify({process:observation.outcome,producerSdkScenarios:proof.scenarios,liveCalls:0,realCredentialReads:0,scope:'trusted-worker supervision, not hostile-code or live qualification'}));
