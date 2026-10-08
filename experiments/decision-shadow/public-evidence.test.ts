import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, symlink, rename, truncate, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fsPromises from 'node:fs/promises';
import { parseCases } from './dataset.mjs';
import { verifySources, MAX_PUBLIC_SOURCE_FILE_BYTES, MAX_PUBLIC_SOURCE_TOTAL_BYTES, MAX_PUBLIC_SOURCE_FILES, MAX_PUBLIC_SOURCE_MANIFEST_BYTES } from './public-evidence.mjs';
import { makePublicEvidenceFixture, refreshPublicEvidenceFixture, fixtureHash } from './public-evidence-fixture.mjs';

const filesystem = vi.hoisted(() => ({ onOpen: null as null | ((path: unknown) => Promise<void>) }));
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    const handle = await actual.open(...args);
    try { await filesystem.onOpen?.(args[0]); return handle; }
    catch (error) { await handle.close(); throw error; }
  } };
});
let base: string;
beforeEach(async () => { base = await mkdtemp(join(tmpdir(), 'decision-public-evidence-')); });
afterEach(async () => { filesystem.onOpen = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(base, { recursive: true, force: true }); });
const verify = (fixture: any) => verifySources(parseCases(fixture.dataset), fixture.selection, fixture.evidenceRoot);
const prefix = 'Runtime execution evidence (process settlement; not workspace cleanup or task acceptance):\n```json\n';
async function refreshRuntime(fixture: any) {
  fixture.response.content[1].text = prefix + JSON.stringify(fixture.manifest.runtimeEvidence) + '\n```';
  return refreshPublicEvidenceFixture(fixture, { response: true });
}

describe.skipIf(process.platform !== 'linux')('offline public evidence verifier', () => {
  it.each(['delegate_describe','delegate','delegate_all','delegate_chain'])('verifies complete %s captures without exposing text or assessing authority', async tool => {
    const fixture = await makePublicEvidenceFixture(base, { tool, boundDefinition: true });
    const receipt = await verify(fixture);
    expect(receipt).toMatchObject({ schema: 1, status: 'verified-bytes-and-record-identities', platform: 'linux',
      captureCount: 1, trainingReady: false, trainingEligible: false,
      assessments: { approval: 'not-assessed', taskAcceptance: 'not-assessed', decisionTimeAvailability: 'not-assessed', redaction: 'not-assessed', rights: 'not-assessed' } });
    expect(receipt.limits).toEqual({ fileBytes: MAX_PUBLIC_SOURCE_FILE_BYTES, totalBytes: MAX_PUBLIC_SOURCE_TOTAL_BYTES,
      files: MAX_PUBLIC_SOURCE_FILES, manifestBytes: MAX_PUBLIC_SOURCE_MANIFEST_BYTES });
    expect(receipt.cases[0]).toMatchObject({ caseId: 'public-fixture', tool, source: fixture.dataset.cases[0].source });
    expect(receipt.artifactCount).toBe(receipt.cases[0].copiedRefs.length);
    expect(receipt.totalBytes).toBe(receipt.cases[0].copiedRefs.reduce((sum: number, ref: any) => sum + ref.bytes, 0));
    const serialized = JSON.stringify(receipt);
    for (const text of [fixture.dataset.cases[0].input, fixture.dataset.cases[0].question, 'Use only supplied public facts', 'Public authored terminal output', 'never-open-native-owner', 'never-open-original-source']) expect(serialized).not.toContain(text);
    for (const ref of receipt.cases[0].copiedRefs) expect(fixtureHash(await readFile(ref.path))).toBe(ref.sha256);
  });

  it('retains stopped chain and unexecuted selected occurrence without asserting approval', async () => {
    const fixture = await makePublicEvidenceFixture(base, { tool: 'delegate_chain', stopped: true });
    let receipt = await verify(fixture);
    expect(receipt.cases[0].observed).toMatchObject({ responseIsError: true, returnedOutcomeCount: 1,
      selectedOutcome: { ok: false, work: 'unknown', finalState: 'unavailable', cleanupState: 'unknown' } });
    const row = fixture.selection.selections[0], second = fixture.manifest.requested[1];
    Object.assign(row, { ordinal: second.ordinal, agent: second.agent, definitionId: second.definitionId, executionId: second.executionId });
    receipt = await verify(fixture);
    expect(receipt.cases[0].observed.selectedOutcome).toBeNull();
    expect(receipt.cases[0].requested.definitionId).toBeNull();
    expect(receipt.assessments.approval).toBe('not-assessed');
  });

  it('accepts anonymous delegation with a null observed definition and no source copies', async () => {
    const fixture = await makePublicEvidenceFixture(base, { anonymous: true });
    expect((await verify(fixture)).cases[0].requested).toMatchObject({ agent: null, definitionId: null, requestedDefinitionId: null });
  });

  it('checks the entire capture closure even when the selected case is the first child only', async () => {
    const fixture = await makePublicEvidenceFixture(base, { tool: 'delegate_all' });
    await writeFile(fixture.manifest.definitions[1].resources[0].copy.path, 'changed unselected child source');
    await expect(verify(fixture)).rejects.toThrow(/byte count or hash mismatch/);
  });

  it('hashes raw binary source bytes unchanged and never opens original resource or native receipt paths', async () => {
    const fixture = await makePublicEvidenceFixture(base, { sourceBytes: Buffer.from([0xef,0xbb,0xbf,0xff,0x00,0xfe]) });
    const original = join(base, 'original-source-fifo');
    execFileSync('mkfifo', [original]);
    fixture.manifest.definitions[0].resources[0].path = original;
    await refreshPublicEvidenceFixture(fixture);
    const receipt = await verify(fixture);
    expect(receipt.cases[0].copiedRefs.find((ref: any) => ref.kind === 'source-copy').sha256).toBe(fixtureHash(fixture.sourceBytes));
  });

  it('validates incoming case hashes again before opening evidence', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    const parsed = parseCases(fixture.dataset);
    parsed[0].input = 'Changed after parsing';
    await expect(verifySources(parsed, fixture.selection, '/this-evidence-root-does-not-exist')).rejects.toThrow(/parsed case hash is stale/);
  });

  it.each(['captureId','ordinal','agent','definitionId','executionId'])('rejects a wrong selected %s', async field => {
    const fixture = await makePublicEvidenceFixture(base);
    const row = fixture.selection.selections[0];
    row[field] = field === 'ordinal' ? 2 : field === 'definitionId' ? 'a'.repeat(64) : field === 'captureId' ? randomUUID() : 'foreign-identity';
    await expect(verify(fixture)).rejects.toThrow(/identity mismatch/);
  });

  it('binds source digest and recordId to the exact manifest and tool call', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    fixture.dataset.cases[0].source.recordId = 'different-call';
    fixture.selection.selections[0].caseHash = parseCases(fixture.dataset)[0].hash;
    await expect(verify(fixture)).rejects.toThrow(/Case source must bind/);
    fixture.dataset.cases[0].source.recordId = fixture.manifest.toolCallId;
    fixture.dataset.cases[0].source.sha256 = 'a'.repeat(64);
    fixture.selection.selections[0].caseHash = parseCases(fixture.dataset)[0].hash;
    await expect(verify(fixture)).rejects.toThrow(/Case source must bind/);
  });

  it('requires one ordered closed selection per case and can share a verified capture closure', async () => {
    const fixture = await makePublicEvidenceFixture(base, { tool: 'delegate_all' });
    const secondCase = { ...fixture.dataset.cases[0], id: 'second-case' };
    fixture.dataset.cases.push(secondCase);
    const secondRequest = fixture.manifest.requested[1];
    fixture.selection.selections.push({ ...fixture.selection.selections[0], caseId: 'second-case', caseHash: parseCases(fixture.dataset)[1].hash,
      ordinal: 2, agent: secondRequest.agent, definitionId: secondRequest.definitionId, executionId: secondRequest.executionId });
    const receipt = await verify(fixture);
    expect(receipt.cases.map((row: any) => row.caseId)).toEqual(['public-fixture','second-case']);
    expect(receipt.captureCount).toBe(1);
    expect(receipt.artifactCount).toBe(receipt.cases[0].copiedRefs.length);
    fixture.selection.selections.reverse();
    await expect(verify(fixture)).rejects.toThrow(/ordered case identities/);
    fixture.selection.selections.reverse();
    fixture.selection.selections.pop();
    await expect(verify(fixture)).rejects.toThrow(/one ordered selection/);
    fixture.selection.selections.push({ ...fixture.selection.selections[0] });
    await expect(verify(fixture)).rejects.toThrow(/ordered case identities/);
    fixture.selection.extra = true;
    await expect(verify(fixture)).rejects.toThrow(/unsupported or missing fields/);
  });

  it.each(['response','body','final'])('rejects changed %s bytes even with an intact manifest', async kind => {
    const fixture = await makePublicEvidenceFixture(base);
    const ref = kind === 'response' ? fixture.manifest.response : kind === 'body' ? fixture.manifest.definitions[0].body : fixture.manifest.finals[0].final.content;
    await writeFile(ref.path, 'altered');
    await expect(verify(fixture)).rejects.toThrow(/byte count or hash mismatch/);
  });

  it('ties bodySha256 and native final identity/hash to their copied bytes', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    fixture.manifest.definitions[0].bodySha256 = 'a'.repeat(64);
    await refreshPublicEvidenceFixture(fixture);
    await expect(verify(fixture)).rejects.toThrow(/bodySha256/);
    fixture.manifest.definitions[0].bodySha256 = fixture.manifest.definitions[0].body.sha256;
    fixture.manifest.finals[0].final.messageId = 'different-terminal-message';
    await refreshPublicEvidenceFixture(fixture);
    await expect(verify(fixture)).rejects.toThrow(/identity differs from runtime/);
    fixture.manifest.finals[0].final.messageId = fixture.manifest.runtimeEvidence.outcomes[0].final.messageId;
    fixture.manifest.runtimeEvidence.outcomes[0].final.sha256 = 'b'.repeat(64);
    fixture.manifest.finals[0].final.sha256 = 'b'.repeat(64);
    await refreshRuntime(fixture);
    await expect(verify(fixture)).rejects.toThrow(/native final hash/);
  });

  it('refuses missing complete-final copies, but preserves explicit absent native final/cleanup', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    fixture.manifest.finals[0].final = null;
    await refreshPublicEvidenceFixture(fixture);
    await expect(verify(fixture)).rejects.toThrow(/Final copy must be an object/);
    fixture.manifest.runtimeEvidence.outcomes[0].final = null;
    fixture.manifest.runtimeEvidence.outcomes[0].cleanup = null;
    await refreshRuntime(fixture);
    expect((await verify(fixture)).cases[0].observed.selectedOutcome).toMatchObject({ finalState: null, cleanupState: null });
  });

  it('refuses a final absent from authored output and projection/cleanup identity disagreement', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    fixture.response.content[0].text = 'Full final is not here';
    await refreshPublicEvidenceFixture(fixture, { response: true });
    await expect(verify(fixture)).rejects.toThrow(/absent from authored public content/);
    fixture.response.content[0].text = (await readFile(fixture.manifest.finals[0].final.content.path)).toString();
    fixture.response.content[1].text = prefix + JSON.stringify({ ...fixture.manifest.runtimeEvidence, requested: 2 }) + '\n```';
    await refreshPublicEvidenceFixture(fixture, { response: true });
    await expect(verify(fixture)).rejects.toThrow(/projection differs/);
    fixture.manifest.runtimeEvidence.outcomes[0].cleanup.receipt.identity = { ...fixture.manifest.runtimeEvidence.outcomes[0].cleanup.identity, nonce: randomUUID() };
    await refreshRuntime(fixture);
    await expect(verify(fixture)).rejects.toThrow(/receipt identity/);
  });

  it('binds delegate_describe public identity to the copied definition', async () => {
    const fixture = await makePublicEvidenceFixture(base, { tool: 'delegate_describe' });
    const described = JSON.parse(fixture.response.content[0].text);
    described.bodySha256 = 'c'.repeat(64);
    fixture.response.content[0].text = JSON.stringify(described);
    await refreshPublicEvidenceFixture(fixture, { response: true });
    await expect(verify(fixture)).rejects.toThrow(/Described definition differs/);
  });

  it('rejects traversal and foreign copy references before opening the named path', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    fixture.manifest.response.path = join(dirname(fixture.manifestPath), '..', 'foreign.json');
    await refreshPublicEvidenceFixture(fixture);
    await expect(verify(fixture)).rejects.toThrow(/foreign or reused/);
    fixture.selection.selections[0].manifest.path = fixture.manifestPath.replace('/manifest.json', '/../manifest.json');
    await expect(verify(fixture)).rejects.toThrow(/canonical and absolute/);
  });

  it.each(['root','ancestor','capture','file'])('refuses a %s symlink even when it points to valid evidence', async kind => {
    const fixture = await makePublicEvidenceFixture(base);
    if (kind === 'root') {
      const alias = join(base, 'root-alias'); await symlink(fixture.evidenceRoot, alias); fixture.evidenceRoot = alias;
    } else if (kind === 'ancestor') {
      const alias = base + '-alias';
      await symlink(base, alias);
      try { await expect(verifySources(parseCases(fixture.dataset), fixture.selection, join(alias,'public-evidence'))).rejects.toThrow(); }
      finally { await rm(alias); }
      return;
    } else {
      const path = kind === 'file' ? fixture.manifest.response.path : dirname(fixture.manifestPath);
      await rename(path, path + '-real'); await symlink(path + '-real', path);
    }
    await expect(verify(fixture)).rejects.toThrow();
  });

  it('refuses a FIFO without blocking and refuses oversized files before reading their contents', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    const path = fixture.manifest.response.path;
    await rm(path); execFileSync('mkfifo', [path]);
    await expect(verify(fixture)).rejects.toThrow(/ordinary file/);
    await rm(path); await writeFile(path, ''); await truncate(path, MAX_PUBLIC_SOURCE_FILE_BYTES + 1);
    await expect(verify(fixture)).rejects.toThrow(/file exceeds its byte limit/);
  });

  it('rejects malformed structured UTF-8/JSON while source binaries remain opaque', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    const invalid = Buffer.from([0xff]);
    await writeFile(fixture.manifest.response.path, invalid);
    Object.assign(fixture.manifest.response, { sha256: fixtureHash(invalid), bytes: invalid.length });
    await refreshPublicEvidenceFixture(fixture);
    await expect(verify(fixture)).rejects.toThrow(/UTF-8 JSON/);
  });

  it('applies a global unique-file bound across captures rather than restarting the quota per case', async () => {
    const first = await makePublicEvidenceFixture(base);
    for (let index = 1; index < 52; index++) {
      const next = await makePublicEvidenceFixture(base);
      next.dataset.cases[0].id = 'case-' + index;
      next.selection.selections[0].caseId = 'case-' + index;
      await refreshPublicEvidenceFixture(next);
      first.dataset.cases.push(next.dataset.cases[0]); first.selection.selections.push(next.selection.selections[0]);
    }
    await expect(verify(first)).rejects.toThrow(/file-count limit/);
  });

  it.each(['root','file'])('detects changed %s metadata after bytes have been read', async target => {
    const fixture = await makePublicEvidenceFixture(base);
    let changed = false;
    filesystem.onOpen = async path => {
      if (!changed && String(path).endsWith('/definition-0-body.txt')) {
        changed = true;
        const time = new Date(Date.now() + 30_000);
        await fsPromises.utimes(target === 'root' ? fixture.evidenceRoot : fixture.manifest.response.path, time, time);
      }
    };
    await expect(verify(fixture)).rejects.toThrow(/changed during verification/);
    expect(changed).toBe(true);
  });

  it('preserves empty or lengthy public reason strings without copying them into its receipt', async () => {
    const fixture = await makePublicEvidenceFixture(base, { stopped: true });
    const outcome = fixture.manifest.runtimeEvidence.outcomes[0];
    outcome.reason = ''; outcome.cleanup.reason = 'long public reason '.repeat(300);
    outcome.final.reason = ''; outcome.observation.reasons = ['', 'long public reason '.repeat(300)];
    await refreshRuntime(fixture);
    const receipt = await verify(fixture);
    expect(receipt.cases[0].observed.selectedOutcome.work).toBe('unknown');
    expect(JSON.stringify(receipt)).not.toContain('long public reason');
  });
  it('performs no fetch and leaves evidence bytes unchanged', async () => {
    const fixture = await makePublicEvidenceFixture(base);
    const fetch = vi.fn(() => { throw Error('Network call forbidden'); }); vi.stubGlobal('fetch', fetch);
    const before = await readFile(fixture.manifestPath);
    await verify(fixture);
    expect(fetch).not.toHaveBeenCalled();
    expect(await readFile(fixture.manifestPath)).toEqual(before);
  });
});