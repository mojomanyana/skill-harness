import { it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalCodexHost, inspectCodexRoleSeparation } from '../src/codex-host-observer.js';
const policy=()=>[{role:'proposer' as const,model:'gpt-5.4',canonical:'p',lineage:'shared'}, {role:'subject' as const,model:'gpt-5.6-sol',canonical:'s',lineage:'shared'}, {role:'judge' as const,model:'gpt-5.5',canonical:'j',lineage:'shared'}];
it('refuses known canonical aliases and unknown canonical resolution before owner creation',()=>{
 for(const canonical of ['p','j',null]) {const p=join(mkdtempSync(join(tmpdir(),'role-policy-')),'owner');const rows=policy().map(r=>r.role==='subject'?{...r,canonical}:r);expect(()=>createLocalCodexHost(p,{version:'codex-host-local-v1',maxCalls:1,wallMs:1000,invocations:[{id:'s',role:'subject',model:'gpt-5.6-sol',effort:'low',instructions:'integer',input:'2+2',expectedSha256:'0'.repeat(64),subjectId:null}]},rows)).toThrow();expect(existsSync(p)).toBe(false);}
});
it('discloses shared/unknown lineage without claiming training independence',()=>{expect(inspectCodexRoleSeparation(policy())).toMatchObject({state:'CONSISTENT_DECLARATION_ONLY',disclosures:['shared lineage: shared'],liveQualified:false});expect(inspectCodexRoleSeparation(policy().map(r=>({...r,lineage:null})))).toMatchObject({state:'CONSISTENT_DECLARATION_ONLY',disclosures:['lineage unresolved; correlation unknown']});});
