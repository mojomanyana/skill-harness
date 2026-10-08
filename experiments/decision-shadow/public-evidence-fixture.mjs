/** Synthetic, public-only plumbing fixtures shaped by pi-daddy 0.45.0's producer.
 * No native session, API, installed runtime, or private source is opened.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { parseCases } from './dataset.mjs';
export const fixtureHash = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value) + '\n');
const prefix = 'Runtime execution evidence (process settlement; not workspace cleanup or task acceptance):\n```json\n';

export async function refreshPublicEvidenceFixture(fixture, { response = false } = {}) {
  if (response) {
    const bytes = encode(fixture.response);
    await writeFile(fixture.manifest.response.path, bytes);
    Object.assign(fixture.manifest.response, { sha256: fixtureHash(bytes), bytes: bytes.length });
  }
  const bytes = encode(fixture.manifest);
  await writeFile(fixture.manifestPath, bytes);
  for (const [index, item] of fixture.dataset.cases.entries()) {
    item.source.sha256 = fixtureHash(bytes);
    fixture.selection.selections[index].manifest.sha256 = fixtureHash(bytes);
  }
  const cases = parseCases(fixture.dataset);
  cases.forEach((item, index) => { fixture.selection.selections[index].caseHash = item.hash; });
  return fixture;
}

export async function makePublicEvidenceFixture(baseDir, options = {}) {
  const tool = options.tool ?? 'delegate';
  const count = options.count ?? (tool === 'delegate_all' || tool === 'delegate_chain' ? 2 : 1);
  const evidenceRoot = join(baseDir, 'public-evidence');
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  const captureId = randomUUID(), ownerId = randomUUID(), directory = join(evidenceRoot, captureId);
  await mkdir(directory, { mode: 0o700 });
  const toolCallId = 'public-fixture-call-' + randomUUID();
  const put = async (name, bytes) => {
    const path = join(directory, name);
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 });
    return { path, sha256: fixtureHash(bytes), bytes: bytes.length };
  };
  const describe = tool === 'delegate_describe';
  const requested = Array.from({ length: count }, (_, index) => ({
    ordinal: index + 1, agent: options.anonymous ? null : 'fixture-agent-' + (index + 1),
    requestedDefinitionId: describe || options.anonymous ? null : fixtureHash('definition-' + index),
    definitionId: options.anonymous || options.stopped && index > 0 ? null : fixtureHash('definition-' + index),
    executionId: describe ? null : randomUUID(),
  }));
  const definitions = [];
  const sourceBytes = options.sourceBytes ?? Buffer.from('\ufeff---\nname: public-fixture\n---\n# Fixture instructions\n');
  for (const request of requested.filter(row => row.definitionId !== null)) {
    const index = definitions.length;
    const bodyBytes = Buffer.from('# Fixture role\nUse only supplied public facts.\n');
    const resources = [];
    const kinds = options.boundDefinition ? ['selected-skill','package','binding-manifest','delegated-agent'] : ['selected-skill'];
    for (const [resource, kind] of kinds.entries()) resources.push({ kind,
      path: '/never-open-original-source/' + kind + '-' + index,
      copy: await put(`definition-${index}-source-${resource}.bin`, sourceBytes) });
    definitions.push({ agent: request.agent, definitionId: request.definitionId,
      sourceHash: fixtureHash(sourceBytes), bodySha256: fixtureHash(bodyBytes),
      binding: options.boundDefinition ? { package: 'principal-pi-skills', phase: 'build' } : null,
      resources, body: await put(`definition-${index}-body.txt`, bodyBytes) });
  }
  const outcomes = [], finals = [], authored = [];
  if (!describe) for (const request of requested.slice(0, options.stopped ? 1 : count)) {
    const identity = { revision: 1, executionId: request.executionId, nonce: randomUUID(),
      root: '/never-open-native-owner', rootDevice: '1', rootInode: '2', bootId: randomUUID(),
      pidNamespace: 'pid:[123]', helperPid: 123, helperStartTicks: '456', helperSha256: fixtureHash('native-helper'),
      workerPid: 124, ownershipPath: '/never-open-native-owner/ownership.json', receiptPath: '/never-open-native-owner/receipt.json' };
    const text = 'Public authored terminal output ' + request.ordinal + '.\n';
    const final = options.stopped ? { state: 'unavailable', reason: 'No attributable terminal final' } : {
      state: 'complete', sessionId: randomUUID(), messageId: 'message-' + request.ordinal,
      leafId: 'message-' + request.ordinal, sha256: fixtureHash(text) };
    outcomes.push({ ordinal: request.ordinal, ok: !options.stopped, work: options.stopped ? 'unknown' : 'succeeded',
      control: null, reason: options.stopped ? 'Execution stopped' : null, exitCode: options.stopped ? null : 0,
      timedOut: null, aborted: options.stopped ? true : null, truncated: null, spawnFailed: null,
      final, cleanup: options.stopped ? { state: 'unknown', identity, reason: 'Settlement unavailable' } : {
        state: 'settled', identity, receipt: { state: 'settled', identity, workerCode: 0, workerSignal: 0, reason: 'worker-exit', reapedAll: true } },
      observation: { state: 'complete', reasons: [] }, retention: { status: 'disabled' } });
    finals.push({ ordinal: request.ordinal, executionId: request.executionId,
      final: options.stopped ? null : { ...final, content: await put(`outcome-${request.ordinal}-final.txt`, Buffer.from(text)) } });
    authored.push(options.stopped ? 'Delegation stopped without a complete final.' : text);
  }
  const runtimeEvidence = describe ? null : { version: 1, tool, requested: count, outcomes };
  const definition = definitions[0];
  const response = describe ? { isError: false, content: [{ type: 'text', text: JSON.stringify({ version: 1,
    agent: definition.agent, sourceHash: definition.sourceHash, bodySha256: definition.bodySha256,
    binding: definition.binding, definitionId: definition.definitionId }) }] } : {
    isError: Boolean(options.stopped), content: [{ type: 'text', text: authored.join('\n---\n') },
      { type: 'text', text: prefix + JSON.stringify(runtimeEvidence) + '\n```' }] };
  const manifest = { schema: 'pi-daddy-public-evidence-v1', version: 1, captureId, ownerId, toolCallId, tool,
    state: 'returned', response: await put('response.json', encode(response)), requested, runtimeEvidence, finals, definitions };
  const manifestPath = join(directory, 'manifest.json');
  const ordinal = options.ordinal ?? 1, selected = requested[ordinal - 1];
  const dataset = { schema: 1, cases: [{ id: 'public-fixture', input: 'Explicitly curated public fixture; not a real workflow measurement.',
    question: 'Is sufficient public evidence available?', provenance: 'synthetic',
    source: { sha256: '0'.repeat(64), recordId: toolCallId }, visibility: 'public' }] };
  const selection = { schema: 1, kind: 'decision-public-sources', selections: [{ caseId: dataset.cases[0].id,
    caseHash: '0'.repeat(64), manifest: { path: manifestPath, sha256: '0'.repeat(64) }, captureId, toolCallId,
    ordinal, agent: selected.agent, definitionId: selected.definitionId, executionId: selected.executionId }] };
  return refreshPublicEvidenceFixture({ evidenceRoot, dataset, selection, manifest, manifestPath, response, sourceBytes });
}