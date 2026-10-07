import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { main } from './cli.mjs';
import { parseCases, parseLabels } from './dataset.mjs';

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, {recursive:true,force:true}); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'decision-cli-')); dirs.push(dir);
  const dataset = {schema:1,cases:['a','b'].map(id=>({id,input:'Public fixture '+id,question:'Is the evidence complete?',
    provenance:'synthetic',source:{sha256:'a'.repeat(64),recordId:id},visibility:'public'}))};
  const cases = parseCases(dataset);
  const labels = {schema:1,labels:cases.map(c=>({caseId:c.id,caseHash:c.hash,value:true,kind:'test',
    actor:'fixture-test',evidenceSha256:'b'.repeat(64),independent:true}))};
  const casesPath=join(dir,'cases.json'), labelsPath=join(dir,'labels.json');
  await writeFile(casesPath,JSON.stringify(dataset)); await writeFile(labelsPath,JSON.stringify(labels));
  return {dir,casesPath,labelsPath,cases,labels};
}
const answer={status:'answered',probability:0.75,resolvedModel:'typesafe/jev-1.13',
  usage:{inputTokens:10,outputTokens:0,costUsd:null},latencyMs:5,error:null};
async function savedRunFixture() {
  const f = await fixture();
  const out = join(f.dir, 'run.jsonl');
  await main(['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13',
    '--out',out,'--allow-remote'], {
      providerCall: async () => answer, env:{OPENROUTER_API_KEY:'test'}, emit:()=>{},
    });
  const rows = (await readFile(out, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  const scoreArgs = ['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out];
  const writeRows = (changedRows: unknown[]) => writeFile(out, changedRows.map(row => JSON.stringify(row)).join('\n') + '\n');
  return { ...f, out, rows, scoreArgs, writeRows };
}
describe('source-only decision pilot CLI',()=>{
  it('previews only input/question without labels, source references or credentials',async()=>{
    const f=await fixture(); const emit=vi.fn(), providerCall=vi.fn();
    await main(['preview','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13'],{emit,providerCall,env:{}});
    expect(providerCall).not.toHaveBeenCalled();
    const payload=JSON.parse(emit.mock.calls[0][0]);
    expect(payload.count).toBe(2);
    expect(payload.requests[0].body).toEqual({model:'typesafe/jev-1.13',state:'Public fixture a',
      questions:{decision:{type:'noul',instructions:'Is the evidence complete?'}}});
    expect(JSON.stringify(payload.requests[0].body)).not.toContain('sha256');
    expect(JSON.stringify(payload.requests[0].body)).not.toContain('independent');
  });
  it('rejects removed OpenAI provider before output creation, key lookup, or network', async () => {
    const f = await fixture();
    const out = join(f.dir, 'must-not-exist.jsonl');
    const providerCall = vi.fn();
    await expect(main(['run','--cases',f.casesPath,'--provider','openai','--model','gpt-6-luna',
      '--out',out,'--allow-remote'], {
        providerCall,
        env:{OPENAI_API_KEY:'configured-but-unused'},
        emit:()=>{},
      })).rejects.toThrow('unsupported provider');
    expect(providerCall).not.toHaveBeenCalled();
    await expect(readFile(out)).rejects.toMatchObject({code:'ENOENT'});
  });
  it('requires explicit remote opt-in and refuses occupied output before calling provider',async()=>{
    const f=await fixture(); const providerCall=vi.fn(); const out=join(f.dir,'run.jsonl');
    const args=['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13','--out',out];
    await expect(main(args,{providerCall})).rejects.toThrow('Required --allow-remote');
    await writeFile(out,'retained');
    await expect(main([...args,'--allow-remote'],{providerCall,env:{OPENROUTER_API_KEY:'test'}})).rejects.toThrow();
    expect(providerCall).not.toHaveBeenCalled(); expect(await readFile(out,'utf8')).toBe('retained');
  });
  it('scores a saved fake run by exact case hashes and exports a label-only corpus',async()=>{
    const f=await fixture(); const out=join(f.dir,'run.jsonl'); const providerCall=vi.fn().mockResolvedValue(answer);
    await main(['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13','--out',out,'--allow-remote'],
      {providerCall,emit:()=>{},env:{OPENROUTER_API_KEY:'test-secret'}});
    const emit=vi.fn();
    await main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out],{emit});
    const report=JSON.parse(emit.mock.calls[0][0]).reports[0];
    expect(report).toMatchObject({attempted:2,scored:2,accuracy:1,brier:0.0625,missing:0});
    expect(report.measurements.costUsd).toEqual({reported:0,attempted:2,total:null});
    expect(await readFile(out,'utf8')).not.toContain('test-secret');
    const corpus=join(f.dir,'corpus.json');
    await main(['corpus','--cases',f.casesPath,'--labels',f.labelsPath,'--out',corpus],{emit:()=>{}});
    expect(JSON.parse(await readFile(corpus,'utf8'))).toMatchObject({trainingReady:false,rows:expect.any(Array)});
    expect(await readFile(corpus,'utf8')).not.toContain('probability');
    const changed=JSON.parse(await readFile(f.casesPath,'utf8')); changed.cases[0].question='Changed?';
    await writeFile(f.casesPath,JSON.stringify(changed));
    await expect(main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out])).rejects.toThrow('stale');
  });
  it('stops on first error, retains partial evidence and reports missing cases',async()=>{
    const f=await fixture(), out=join(f.dir,'partial.jsonl');
    const providerCall=vi.fn().mockRejectedValue(new Error('secret raw body'));
    await expect(main(['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13','--out',out,'--allow-remote'],
      {providerCall,env:{OPENROUTER_API_KEY:'test'},emit:()=>{}})).rejects.toThrow('stopped');
    expect(providerCall).toHaveBeenCalledTimes(1);
    expect(await readFile(out,'utf8')).not.toContain('secret raw body');
    const emit=vi.fn();
    await main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out],{emit});
    expect(JSON.parse(emit.mock.calls[0][0]).reports[0]).toMatchObject({errors:1,missing:1,scored:0,accuracy:null,brier:null});
  });
});

describe('score provenance and snapshot validation', () => {
  it('hashes normalized labels and exact run bytes, distinguishing repeated same-model runs', async () => {
    const f = await fixture();
    const first = join(f.dir, 'first.jsonl');
    const second = join(f.dir, 'second.jsonl');
    const providerCall = vi.fn().mockResolvedValue(answer);
    const runArgs = (out: string) => ['run','--cases',f.casesPath,'--provider','jev',
      '--model','typesafe/jev-1.13','--out',out,'--allow-remote'];
    await main(runArgs(first), {providerCall,emit:()=>{},env:{OPENROUTER_API_KEY:'test'}});
    const firstText = await readFile(first, 'utf8');
    const rows = firstText.trimEnd().split('\n');
    const header = JSON.parse(rows[0]);
    header.createdAt = new Date(Date.parse(header.createdAt) + 1000).toISOString();
    await writeFile(second, [JSON.stringify(header), ...rows.slice(1)].join('\n') + '\n');

    const emit = vi.fn();
    await main(['score','--cases',f.casesPath,'--labels',f.labelsPath,
      '--run',first,'--run',second], {emit});
    const output = JSON.parse(emit.mock.calls[0][0]);
    expect(output.caseSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.labelSetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(output.reports).toHaveLength(2);
    expect(output.reports[0].requestedModel).toBe(output.reports[1].requestedModel);
    expect(output.reports[0].runSha256).toBe(
      createHash('sha256').update(firstText, 'utf8').digest('hex'));
    expect(output.reports[0].runSha256).not.toBe(output.reports[1].runSha256);
    expect(output.reports[0].createdAt).not.toBe(output.reports[1].createdAt);

    const changedLabels = {...f.labels, labels:f.labels.labels.map((label, index) =>
      index === 0 ? {...label, value:!label.value} : label)};
    await writeFile(f.labelsPath, JSON.stringify(changedLabels));
    const changedEmit = vi.fn();
    await main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',first],
      {emit:changedEmit});
    expect(JSON.parse(changedEmit.mock.calls[0][0]).labelSetHash)
      .not.toBe(output.labelSetHash);
  });

  it('rejects a BOM-prefixed run so accepted hashes cover exact bytes', async () => {
    const f = await fixture();
    const out = join(f.dir, 'bom.jsonl');
    const providerCall = vi.fn().mockResolvedValue(answer);
    await main(['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13',
      '--out',out,'--allow-remote'], {providerCall,emit:()=>{},env:{OPENROUTER_API_KEY:'test'}});
    const bytes = await readFile(out);
    await writeFile(out, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]));
    await expect(main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out]))
      .rejects.toThrow('Invalid run JSONL');
  });

  it('refuses mixed resolved snapshots while retaining the run file', async () => {
    const f = await fixture();
    const out = join(f.dir, 'mixed.jsonl');
    const providerCall = vi.fn()
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({...answer, resolvedModel:'typesafe/jev-1.13-20261002'});
    await main(['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13',
      '--out',out,'--allow-remote'], {providerCall,emit:()=>{},env:{OPENROUTER_API_KEY:'test'}});
    await expect(main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out]))
      .rejects.toThrow('multiple resolved models');
    expect(await readFile(out, 'utf8')).toContain('typesafe/jev-1.13-20261002');
  });

  it('rejects invalid timestamps, unresolved answers, invalid UTF-8, and inherited commands', async () => {
    const f = await fixture();
    const out = join(f.dir, 'bad.jsonl');
    const providerCall = vi.fn().mockResolvedValue(answer);
    await main(['run','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13',
      '--out',out,'--allow-remote'], {providerCall,emit:()=>{},env:{OPENROUTER_API_KEY:'test'}});
    const rows = (await readFile(out, 'utf8')).trimEnd().split('\n');
    const header = JSON.parse(rows[0]);
    header.createdAt = 'yesterday';
    await writeFile(out, [JSON.stringify(header), ...rows.slice(1)].join('\n') + '\n');
    await expect(main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out]))
      .rejects.toThrow('header');

    header.createdAt = new Date().toISOString();
    const prediction = JSON.parse(rows[1]);
    prediction.resolvedModel = null;
    await writeFile(out, [JSON.stringify(header), JSON.stringify(prediction), ...rows.slice(2)].join('\n') + '\n');
    await expect(main(['score','--cases',f.casesPath,'--labels',f.labelsPath,'--run',out]))
      .rejects.toThrow('Invalid prediction');

    await writeFile(f.casesPath, Buffer.from([0xff, 0xfe]));
    await expect(main(['preview','--cases',f.casesPath,'--provider','jev','--model','typesafe/jev-1.13']))
      .rejects.toThrow('valid UTF-8');
    await expect(main(['__proto__'])).rejects.toThrow('Unknown command');
  });
});

describe('saved-run producer invariants', () => {
  it('rejects contradictory states, unsupported refusals, and unsanitized errors', async () => {
    const f = await savedRunFixture();
    const mutations = [
      { name:'answer with error', change:(row: any) => { row.error = 'invalid provider response'; } },
      { name:'JEV refusal', change:(row: any) => { row.status = 'refused'; row.probability = null; } },
      { name:'error with probability', change:(row: any) => { row.status = 'error'; row.error = 'provider request failed'; } },
      { name:'error without diagnostic', change:(row: any) => { row.status = 'error'; row.probability = null; } },
      { name:'raw provider error', change:(row: any) => {
        row.status = 'error'; row.probability = null; row.error = 'raw provider response';
      } },
      { name:'unsupported resolved snapshot', change:(row: any) => { row.resolvedModel = 'typesafe/jev-1.13-forged'; } },
    ];
    for (const {name, change} of mutations) {
      const rows = structuredClone(f.rows);
      change(rows[2]);
      await f.writeRows(rows);
      const emit = vi.fn();
      await expect(main(f.scoreArgs, {emit}), name).rejects.toThrow('Invalid prediction');
      expect(emit, name).not.toHaveBeenCalled();
    }
  });

  it('rejects missing interior cases, out-of-order rows, and rows after an error', async () => {
    const f = await savedRunFixture();
    const postError = structuredClone(f.rows);
    postError[1] = {...postError[1], status:'error', probability:null, error:'provider request failed'};
    for (const rows of [
      [f.rows[0], f.rows[2]],
      [f.rows[0], f.rows[2], f.rows[1]],
      postError,
    ]) {
      await f.writeRows(rows);
      const emit = vi.fn();
      await expect(main(f.scoreArgs, {emit})).rejects.toThrow('Invalid prediction');
      expect(emit).not.toHaveBeenCalled();
    }
  });

  it('scores header-only runs, interrupted answer prefixes, and a terminal error', async () => {
    const f = await savedRunFixture();
    const terminal = structuredClone(f.rows);
    terminal[2] = {...terminal[2], status:'error', probability:null, resolvedModel:null,
      usage:{inputTokens:null,outputTokens:null,costUsd:null}, latencyMs:null, error:'Provider call failed.'};
    const variants = [
      {rows:f.rows.slice(0, 1), expected:{attempted:0, missing:2, errors:0, scored:0, accuracy:null}},
      {rows:f.rows.slice(0, 2), expected:{attempted:1, missing:1, errors:0, scored:1, accuracy:1}},
      {rows:terminal, expected:{attempted:2, missing:0, errors:1, scored:1, accuracy:1}},
    ];
    for (const {rows, expected} of variants) {
      await f.writeRows(rows);
      const emit = vi.fn();
      await main(f.scoreArgs, {emit});
      const report = JSON.parse(emit.mock.calls[0][0]).reports[0];
      expect(report).toMatchObject(expected);
      expect(report.runSha256).toBe(createHash('sha256').update(await readFile(f.out)).digest('hex'));
    }
  });

  it('rejects fractional, unsafe, and negative token counts in imported records', async () => {
    const f = await savedRunFixture();
    for (const key of ['inputTokens', 'outputTokens']) {
      for (const value of [0.5, Number.MAX_SAFE_INTEGER + 1, -1]) {
        const rows = structuredClone(f.rows);
        rows[1].usage[key] = value;
        await f.writeRows(rows);
        const emit = vi.fn();
        await expect(main(f.scoreArgs, {emit})).rejects.toThrow('Invalid prediction');
        expect(emit).not.toHaveBeenCalled();
      }
    }
  });

  it('refuses unsafe token sums and overflowing costs instead of emitting corrupt totals', async () => {
    const f = await savedRunFixture();
    for (const [key, value] of [['inputTokens', Number.MAX_SAFE_INTEGER], ['outputTokens', Number.MAX_SAFE_INTEGER], ['costUsd', 1e308]] as const) {
      const rows = structuredClone(f.rows);
      for (const row of rows.slice(1)) row.usage[key] = value;
      await f.writeRows(rows);
      const emit = vi.fn();
      await expect(main(f.scoreArgs, {emit})).rejects.toThrow('Measurement totals');
      expect(emit).not.toHaveBeenCalled();
    }
  });

  it('computes a finite latency mean when summing valid measurements would overflow', async () => {
    const f = await savedRunFixture();
    const rows = structuredClone(f.rows);
    for (const row of rows.slice(1)) row.latencyMs = Number.MAX_VALUE;
    await f.writeRows(rows);
    const emit = vi.fn();
    await main(f.scoreArgs, {emit});
    expect(JSON.parse(emit.mock.calls[0][0]).reports[0].measurements.latencyMs)
      .toEqual({reported:2, attempted:2, mean:Number.MAX_VALUE});
  });
});

it('checked-in eight-case examples parse and join', async () => {
  const cases = parseCases(JSON.parse(await readFile(new URL('./examples/cases.json', import.meta.url), 'utf8')));
  const labels = parseLabels(
    JSON.parse(await readFile(new URL('./examples/labels.json', import.meta.url), 'utf8')),
    cases,
  );
  expect(cases).toHaveLength(8);
  expect(labels).toHaveLength(8);
  expect(labels.map(label => label.caseId).sort()).toEqual(cases.map(item => item.id).sort());
});
