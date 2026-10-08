import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { main } from './cli.mjs';
import { makePublicEvidenceFixture } from './public-evidence-fixture.mjs';

const dirs: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'decision-source-cli-')); dirs.push(dir);
  const f = await makePublicEvidenceFixture(dir);
  const casesPath = join(dir, 'cases.json'), sourcesPath = join(dir, 'sources.json');
  const casesText = JSON.stringify(f.dataset), sourcesText = JSON.stringify(f.selection, null, 2) + '\n';
  await writeFile(casesPath, casesText); await writeFile(sourcesPath, sourcesText);
  const out = join(dir, 'verification.json');
  const args = ['verify-sources', '--cases', casesPath, '--sources', sourcesPath,
    '--evidence-root', f.evidenceRoot, '--out', out];
  return { ...f, dir, casesPath, sourcesPath, casesText, sourcesText, out, args };
}

describe.skipIf(process.platform !== 'linux')('offline public source verification CLI', () => {
  it('writes an identity receipt without a provider, credential lookup or copied case text', async () => {
    const f = await fixture(), providerCall = vi.fn(), emit = vi.fn();
    const fetch = vi.fn(() => { throw new Error('offline command called fetch'); });
    vi.stubGlobal('fetch', fetch);
    const env = new Proxy({}, { get() { throw new Error('offline command read credentials'); } });
    await main(f.args, { providerCall, emit, env });
    const text = await readFile(f.out, 'utf8'), receipt = JSON.parse(text);
    expect(receipt).toMatchObject({ schema: 1, kind: 'decision-public-source-verification',
      status: 'verified-bytes-and-record-identities', trainingReady: false, trainingEligible: false,
      assessments: { approval: 'not-assessed', taskAcceptance: 'not-assessed',
        decisionTimeAvailability: 'not-assessed', redaction: 'not-assessed', rights: 'not-assessed' } });
    expect(receipt.caseSetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.selectionFileSha256).toBe(createHash('sha256').update(f.sourcesText).digest('hex'));
    expect(receipt.createdAt).toBe(new Date(receipt.createdAt).toISOString());
    expect(receipt.cases).toHaveLength(f.dataset.cases.length);
    expect(text).not.toContain(f.dataset.cases[0].input);
    expect(text).not.toContain(f.dataset.cases[0].question);
    expect(providerCall).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    expect(JSON.parse(emit.mock.calls[0][0])).toMatchObject({ saved: f.out, caseCount: f.dataset.cases.length,
      trainingReady: false, trainingEligible: false });
    expect(await readFile(f.casesPath, 'utf8')).toBe(f.casesText);
    expect(await readFile(f.sourcesPath, 'utf8')).toBe(f.sourcesText);
  });

  it('refuses changed case inputs before creating a success receipt', async () => {
    const f = await fixture(), providerCall = vi.fn();
    const changed = structuredClone(f.dataset); changed.cases[0].input += ' Changed decision input.';
    await writeFile(f.casesPath, JSON.stringify(changed));
    await expect(main(f.args, { providerCall, emit: () => {} })).rejects.toThrow();
    await expect(readFile(f.out)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(providerCall).not.toHaveBeenCalled();
  });

  it('preserves an occupied receipt and rejects malformed selection JSON without outputs', async () => {
    const f = await fixture(); await writeFile(f.out, 'original receipt');
    await expect(main(f.args, { emit: () => {} })).rejects.toThrow();
    expect(await readFile(f.out, 'utf8')).toBe('original receipt');
    const another = join(f.dir, 'must-not-exist.json');
    await writeFile(f.sourcesPath, '{bad');
    await expect(main([...f.args.slice(0, -1), another], { emit: () => {} })).rejects.toThrow('Invalid JSON source selection');
    await expect(readFile(another)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not add provenance receipts to provider requests or turn verified sources into labels', async () => {
    const f = await fixture(); await main(f.args, { emit: () => {} });
    const providerCall = vi.fn(), emit = vi.fn();
    await main(['preview', '--cases', f.casesPath, '--provider', 'jev', '--model', 'typesafe/jev-1.13'],
      { providerCall, emit, env: {} });
    const preview = JSON.parse(emit.mock.calls[0][0]);
    expect(preview.requests[0].body).toEqual({ model: 'typesafe/jev-1.13', state: f.dataset.cases[0].input,
      questions: { decision: { type: 'noul', instructions: f.dataset.cases[0].question } } });
    const labels = join(f.dir, 'labels.json'), corpus = join(f.dir, 'corpus.json');
    await writeFile(labels, JSON.stringify({ schema: 1, labels: [] }));
    await main(['corpus', '--cases', f.casesPath, '--labels', labels, '--out', corpus], { providerCall, emit: () => {} });
    expect(JSON.parse(await readFile(corpus, 'utf8'))).toMatchObject({ trainingReady: false, rows: [] });
    expect(providerCall).not.toHaveBeenCalled();
  });

  it('has no provider/remote/label option or implicit source scan', async () => {
    const f = await fixture(), providerCall = vi.fn();
    for (const extra of [['--allow-remote'], ['--provider', 'jev'], ['--labels', 'labels.json']]) {
      await expect(main([...f.args, ...extra], { providerCall })).rejects.toThrow('Unknown option');
    }
    await expect(main(['verify-sources', '--cases', f.casesPath, '--evidence-root', f.evidenceRoot, '--out', f.out],
      { providerCall })).rejects.toThrow('Required --sources');
    await expect(readFile(f.out)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(providerCall).not.toHaveBeenCalled();
  });
});
