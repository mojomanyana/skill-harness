import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runLocalReplay } from '../../../examples/factory-local-replay/replay.mjs';
import { openBlindIntervention } from '../src/blind-intervention.js';
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
describe('two-domain local factory replay',()=>{
 it('connects real implemented APIs without presenting fixtures as live qualification',async()=>{
  const root=mkdtempSync(join(tmpdir(),'factory-replay-'));roots.push(root);
  const result=await runLocalReplay(join(root,'new-output'));
  expect(result.kind).toBe('synthetic-local-replay');expect(result.liveQualified).toBe(false);
  expect(result.domains.map((d:any)=>d.domain)).toEqual(['software','layout']);
  for(const domain of result.domains){expect(domain.accepted).toBe(1);expect(domain.total).toBe(2);expect(domain.caseCount).toBeGreaterThanOrEqual(2);expect(domain.scenarioReplayed).toBe(true);expect(domain.routingDefault).toBeNull();expect(domain.grantExpansion).toBe(false);}
  for(const domain of result.domains){
   expect(domain.blindReviewId).toMatch(/^[a-f0-9]{64}$/);
   const reopened=openBlindIntervention(join(root,'new-output',domain.domain,'archive'),domain.blindReviewId,'operator:synthetic-fixture');
   expect(reopened.quality()).toEqual({kind:'one',labels:[reopened.view().cards[0].label]});
   expect(reopened.reveal().routingDefault).toBeNull();
   expect(()=>reopened.choose({kind:'none',labels:[]})).toThrow(/locked/);
  }
  expect(()=>runLocalReplay(join(root,'new-output'))).toThrow(/exist/);
 });
});
