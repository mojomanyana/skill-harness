import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './main.mjs';
import { parseCases } from './dataset.mjs';
import { createStorageConsent, learningDigest } from './learning-data.mjs';
import {
  createHandoffSource, retainHandoffSource, prepareHandoff,
  JEV_MODEL, JEV_PROVIDER, JEV_QUESTION,
} from '../../packages/pi-extension/src/jev-packet.js';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
async function saveJson(path: string, value: unknown) {
  await writeFile(path, JSON.stringify(value) + '\n', { flag: 'wx' });
  return path;
}
async function temporary() {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-import-cli-'));
  directories.push(dir);
  return dir;
}
function offlineOptions() {
  return {
    emit: vi.fn(),
    providerCall: vi.fn().mockRejectedValue(new Error('Provider calls are forbidden in this test')),
    piRunner: vi.fn().mockRejectedValue(new Error('Model calls are forbidden in this test')),
  };
}

// Every identity, consent, source and label here is a local test fixture. The real
// producer writes the receipt format; no real session or training data is collected.
async function selectedWorkflow(dir: string, index = 0) {
  const sessionId = `fixture-session-${index}`, toolCallId = `fixture-call-${index}`;
  const recordedAt = new Date().toISOString();
  const consent = createStorageConsent({
    sessionId, decision: 'granted', interactionId: `fixture-choice-${index}`, recordedAt,
  });
  const packet = prepareHandoff({
    candidate: `fixture-candidate-${index}`, stage: 'implementation',
    nextAction: 'Proceed to the next fixture stage',
    uncertainty: 'Whether the deterministic fixture condition holds',
    requirements: 'For this fixture only, proceed exactly when evidence.ready is true.',
    evidence: JSON.stringify({ ready: index !== 1, fixture: index }),
  });
  const source = createHandoffSource({
    packet, sessionId, toolCallId, consent, evidence: [],
    authorization: {
      kind: 'jev-workflow-paid-scope', interactionId: `fixture-paid-${index}`, sessionId,
      recordedAt, provider: JEV_PROVIDER, model: JEV_MODEL, question: JEV_QUESTION,
      maximumCalls: 3,
    },
  });
  const retained = retainHandoffSource(source, () => {}, join(dir, `storage-${index}`), []);
  // Deliberately conflicts with the negative case's independently derived label.
  retained.writeOutcome({ status: 'answered', probability: 0.99, verdict: 'APPROVE' });
  const content = Buffer.from('APPROVE: this fixture text is not independent ground truth.\n');
  const reportPath = join(dir, `review-${index}.txt`);
  await writeFile(reportPath, content);
  const engineering = retained.linkOutcome(`fixture-candidate-${index}`, [{
    path: reportPath, sha256: learningDigest(content), bytes: content.length, content,
  }], `fixture-outcome-${index}`, () => {});
  const caseDocument = { schema: 1, cases: [{
    id: `workflow-${index}`, input: packet.input, question: JEV_QUESTION,
    provenance: 'observed', visibility: 'public',
    source: { sha256: source.sha256, recordId: toolCallId },
  }] };
  const c = parseCases(caseDocument)[0];
  const entry = {
    caseId: c.id, caseHash: c.hash, taskGroup: `fixture-task-${index}`,
    lineageGroup: `fixture-lineage-${index}`, split: ['train', 'validation', 'test'][index],
    sessionId, fixtureOnly: false, decisionTimeReviewed: true, redactionReviewed: true,
    rights: 'local-export', exportApproved: true, trainingApproved: false,
    reviewer: 'fixture-curator',
  };
  const selection = {
    schema: 1, kind: 'decision-selected-workflow-input',
    source: { path: retained.path, sha256: source.sha256 },
    replacements: [], engineering: [engineering],
  };
  const paths = {
    cases: await saveJson(join(dir, `cases-${index}.json`), caseDocument),
    selection: await saveJson(join(dir, `selection-${index}.json`), selection),
    consent: await saveJson(join(dir, `consent-${index}.json`), consent),
    entry: await saveJson(join(dir, `entry-${index}.json`), entry),
  };
  const out = join(dir, `import-${index}.json`);
  const args = ['import-workflow', ...Object.entries(paths).flatMap(([key, path]) => [`--${key}`, path]), '--out', out];
  return { args, out, c, consent, retained, source };
}

const linux = process.platform === 'linux' ? describe : describe.skip;
linux('workflow import CLI and independent-label export', () => {
  it('writes an exclusive private import without promoting provider advice or APPROVE text', async () => {
    const dir = await temporary(), fixture = await selectedWorkflow(dir), options = offlineOptions();
    await main(fixture.args, options);
    const bytes = await readFile(fixture.out, 'utf8'), imported = JSON.parse(bytes);
    expect(imported.caseDocument.cases[0].input).toBe(fixture.c.input);
    expect(imported.receipt).toMatchObject({
      kind: 'decision-selected-workflow-import', labelStatus: 'unlabeled',
      trainingEligible: false, exportEligible: false, providerPredictionsIncluded: false,
    });
    expect(imported).not.toHaveProperty('labels');
    expect(bytes).not.toContain('APPROVE');
    expect(bytes).not.toContain('0.99');
    expect((await stat(fixture.out)).mode & 0o777).toBe(0o600);
    await expect(main(fixture.args, options)).rejects.toMatchObject({ code: 'EEXIST' });
    expect(await readFile(fixture.out, 'utf8')).toBe(bytes);
    expect(await readFile(fixture.retained.path, 'utf8')).toBe(fixture.source.bytes);
    expect(options.providerCall).not.toHaveBeenCalled();
    expect(options.piRunner).not.toHaveBeenCalled();
  });

  it('requires separate deterministic labels before exporting three whole-task splits', async () => {
    const dir = await temporary(), options = offlineOptions();
    const imports = [], consents = [];
    for (let index = 0; index < 3; index++) {
      const fixture = await selectedWorkflow(dir, index);
      await main(fixture.args, options);
      imports.push(await readJson(fixture.out));
      consents.push(fixture.consent);
    }
    const caseDocument = { schema: 1, cases: imports.flatMap(item => item.caseDocument.cases) };
    const cases = parseCases(caseDocument);
    const paths = {
      cases: await saveJson(join(dir, 'cases.json'), caseDocument),
      experiment: await saveJson(join(dir, 'experiment.json'), {
        schema: 1, kind: 'decision-learning-experiment', id: 'workflow-cli-fixture',
        frozenAt: new Date().toISOString(), entries: imports.map(item => item.experimentEntry),
      }),
      labels: await saveJson(join(dir, 'labels.json'), { schema: 1, labels: [] }),
      'label-evidence': await saveJson(join(dir, 'label-evidence.json'), []),
      consents: await saveJson(join(dir, 'consents.json'), consents),
    };
    const exportArgs = (out: string) => [
      'export-learning', ...Object.entries(paths).flatMap(([key, path]) => [`--${key}`, path]),
      '--mode', 'reviewed-data', '--out', out,
    ];
    const unlabelled = join(dir, 'not-exported');
    await expect(main(exportArgs(unlabelled), options)).rejects.toThrow(/no export-eligible cases/);
    await expect(stat(unlabelled)).rejects.toMatchObject({ code: 'ENOENT' });

    const labels = [], references = [];
    for (const c of cases) {
      // The executable fixture rule, not either stored model judgment, is the oracle.
      const value = JSON.parse(JSON.parse(c.input).evidence).ready === true;
      const receipt = {
        schema: 1, kind: 'independent-decision-label', caseId: c.id, caseHash: c.hash,
        source: c.source, value, labelKind: 'test', actor: 'workflow-cli-fixture-oracle',
        independent: true, recordedAt: new Date().toISOString(),
        method: { kind: 'deterministic-test', id: 'evidence-ready-equals-true', version: '1' },
      };
      const path = await saveJson(join(dir, `${c.id}-label.json`), receipt);
      const sha256 = learningDigest(await readFile(path));
      references.push({ caseId: c.id, path, sha256 });
      labels.push({
        caseId: c.id, caseHash: c.hash, value, kind: 'test', actor: receipt.actor,
        independent: true, evidenceSha256: sha256,
      });
    }
    await writeFile(paths.labels, JSON.stringify({ schema: 1, labels }));
    await writeFile(paths['label-evidence'], JSON.stringify(references));
    const exported = join(dir, 'reviewed-export');
    await main(exportArgs(exported), options);
    expect(await readJson(join(exported, 'export-manifest.json'))).toMatchObject({
      counts: { train: 1, validation: 1, test: 1 }, trainingEligible: false,
      trainingExecuted: false, providerPredictionsIncluded: false, excluded: [],
    });
    for (const [index, split] of ['train', 'validation', 'test'].entries()) {
      const row = JSON.parse(await readFile(join(exported, `${split}.jsonl`), 'utf8'));
      expect(row).toMatchObject({
        caseId: `workflow-${index}`, taskGroup: `fixture-task-${index}`,
        lineageGroup: `fixture-lineage-${index}`, answer: index !== 1,
      });
      expect(row.label).toMatchObject({ kind: 'test', actor: 'workflow-cli-fixture-oracle' });
      expect(row).not.toHaveProperty('probability');
    }
    expect(options.providerCall).not.toHaveBeenCalled();
    expect(options.piRunner).not.toHaveBeenCalled();
  });
});
