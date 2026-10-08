/** Offline reader for pi-daddy 0.45.0 public captures. These hashes check local
 * bytes/record identities, not authenticity against a hostile same-uid process,
 * task approval, decision-time availability, content safety, or legal rights.
 * Linux only: held directory descriptors anchor every no-follow file lookup.
 */
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { basename, dirname, isAbsolute, join, normalize } from 'node:path';
import { parseCases } from './dataset.mjs';

export const MAX_PUBLIC_SOURCE_FILE_BYTES = 64 * 1024 * 1024;
export const MAX_PUBLIC_SOURCE_TOTAL_BYTES = 128 * 1024 * 1024;
export const MAX_PUBLIC_SOURCE_FILES = 256;
export const MAX_PUBLIC_SOURCE_MANIFEST_BYTES = 1024 * 1024;
const LIMITS = Object.freeze({ fileBytes: MAX_PUBLIC_SOURCE_FILE_BYTES, totalBytes: MAX_PUBLIC_SOURCE_TOTAL_BYTES,
  files: MAX_PUBLIC_SOURCE_FILES, manifestBytes: MAX_PUBLIC_SOURCE_MANIFEST_BYTES });
const HASH = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOOLS = ['delegate_describe', 'delegate', 'delegate_all', 'delegate_chain'];
const RUNTIME_PREFIX = 'Runtime execution evidence (process settlement; not workspace cleanup or task acceptance):\n```json\n';
const DIR_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function check(ok, message) { if (!ok) throw new TypeError(message); }
function object(value, name) { check(value !== null && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`); }
function keys(value, expected, name) {
  object(value, name);
  check(isDeepStrictEqual(Object.keys(value).sort(), [...expected].sort()), `${name} has unsupported or missing fields`);
}
function string(value, name, nullable = false) {
  if (nullable && value === null) return;
  check(typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0'), `${name} must be a bounded nonempty string`);
}
function publicText(value, name) { check(typeof value === 'string', name + ' must be a string'); }
function hash(value, name, nullable = false) { check(nullable && value === null || typeof value === 'string' && HASH.test(value), `${name} must be a lowercase SHA-256`); }
function integer(value, name, min = 0) { check(Number.isSafeInteger(value) && value >= min, `${name} must be a bounded integer`); }
function enumeration(value, allowed, name) { check(allowed.includes(value), `${name} has an unsupported value`); }
function array(value, name, max = 64) { check(Array.isArray(value) && value.length <= max, `${name} must be a bounded array`); }
function canonicalPath(path, name) {
  string(path, name);
  check(isAbsolute(path) && normalize(path) === path && (path === '/' || !path.endsWith('/')), `${name} must be canonical and absolute`);
  check(path.split('/').length <= 128, `${name} exceeds directory depth limit`);
}
function metadata(stat) { return ['dev','ino','mode','uid','gid','size','mtimeNs','ctimeNs'].map(key => stat[key].toString()).join(':'); }
function identity(stat) { return ['dev','ino','mode'].map(key => stat[key].toString()).join(':'); }
function json(bytes, name) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { throw new TypeError(`${name} must be UTF-8 JSON without a BOM`); }
}

class EvidenceReader {
  directories = [];
  captures = new Map();
  files = new Map();
  totalBytes = 0;
  constructor(root) { this.root = root; }
  async directory(parent, component, path, stable = false) {
    const handle = await open(parent ? `/proc/self/fd/${parent.handle.fd}/${component}` : '/', DIR_FLAGS);
    try {
      const stat = await handle.stat({ bigint: true });
      check(stat.isDirectory(), 'Evidence path component is not a directory');
      const record = { handle, parent, component, path, metadata: metadata(stat), identity: identity(stat), stable };
      this.directories.push(record);
      return record;
    } catch (error) { await handle.close(); throw error; }
  }
  async start() {
    let current = await this.directory(null, '', '/');
    let path = '';
    for (const component of this.root.split('/').filter(Boolean)) {
      path += '/' + component;
      current = await this.directory(current, component, path);
    }
    current.stable = true;
    this.rootDirectory = current;
  }
  async read(path, limit = MAX_PUBLIC_SOURCE_FILE_BYTES) {
    canonicalPath(path, 'Copied evidence path');
    const capturePath = dirname(path), captureId = basename(capturePath);
    check(dirname(capturePath) === this.root && UUID.test(captureId), 'Copied evidence must be directly inside a capture directory beneath the evidence root');
    const cached = this.files.get(path);
    if (cached) { check(cached.bytes.length <= limit, 'Evidence file exceeds its byte limit'); return cached.bytes; }
    check(this.files.size < MAX_PUBLIC_SOURCE_FILES, 'Evidence file-count limit exceeded');
    let directory = this.captures.get(captureId);
    if (!directory) {
      directory = await this.directory(this.rootDirectory, captureId, capturePath, true);
      this.captures.set(captureId, directory);
    }
    const name = basename(path);
    const handle = await open(`/proc/self/fd/${directory.handle.fd}/${name}`, FILE_FLAGS);
    try {
      const before = await handle.stat({ bigint: true });
      check(before.isFile(), 'Evidence must be an ordinary file');
      check(before.size <= BigInt(limit), 'Evidence file exceeds its byte limit');
      const size = Number(before.size);
      check(this.totalBytes + size <= MAX_PUBLIC_SOURCE_TOTAL_BYTES, 'Evidence total-byte limit exceeded');
      // Read at most the admitted size plus one byte, even if a writer grows it.
      const buffer = Buffer.alloc(size + 1);
      let length = 0;
      while (length < buffer.length) {
        const result = await handle.read(buffer, length, buffer.length - length, length);
        if (!result.bytesRead) break;
        length += result.bytesRead;
      }
      check(length === size, 'Evidence file changed size while reading');
      check(metadata(await handle.stat({ bigint: true })) === metadata(before), 'Evidence file metadata changed while reading');
      const bytes = buffer.subarray(0, length);
      this.files.set(path, { handle, directory, name, metadata: metadata(before), bytes });
      this.totalBytes += length;
      return bytes;
    } catch (error) { await handle.close(); throw error; }
  }
  async stable() {
    for (const directory of this.directories) {
      const current = await directory.handle.stat({ bigint: true });
      check(identity(current) === directory.identity && (!directory.stable || metadata(current) === directory.metadata), 'Evidence directory changed during verification');
      const reopened = await open(directory.parent ? `/proc/self/fd/${directory.parent.handle.fd}/${directory.component}` : '/', DIR_FLAGS);
      try { check(identity(await reopened.stat({ bigint: true })) === directory.identity, 'Evidence directory path changed during verification'); }
      finally { await reopened.close(); }
    }
    for (const file of this.files.values()) {
      check(metadata(await file.handle.stat({ bigint: true })) === file.metadata, 'Evidence file changed during verification');
      const reopened = await open(`/proc/self/fd/${file.directory.handle.fd}/${file.name}`, FILE_FLAGS);
      try { check(metadata(await reopened.stat({ bigint: true })) === file.metadata, 'Evidence file path changed during verification'); }
      finally { await reopened.close(); }
    }
  }
  async close() {
    await Promise.allSettled([...this.files.values()].map(file => file.handle.close()));
    await Promise.allSettled(this.directories.map(directory => directory.handle.close()));
  }
}

function requestedRow(row, index, tool) {
  keys(row, ['ordinal','agent','requestedDefinitionId','definitionId','executionId'], 'Requested row');
  check(row.ordinal === index + 1, 'Requested ordinals must be a contiguous ordered sequence');
  string(row.agent, 'Requested agent', true);
  hash(row.requestedDefinitionId, 'Requested definition identity', true);
  hash(row.definitionId, 'Observed definition identity', true);
  string(row.executionId, 'Execution identity', tool === 'delegate_describe');
  check(row.definitionId === null || row.agent !== null, 'An observed definition must identify its agent');
  if (tool === 'delegate_describe') check(row.executionId === null && row.requestedDefinitionId === null && row.agent !== null && row.definitionId !== null, 'Describe has a definition but no execution/requested definition identity');
}
function finalIdentity(final) {
  keys(final, ['state','sessionId','messageId','leafId','sha256'], 'Native final');
  check(final.state === 'complete', 'Native final must be complete');
  for (const key of ['sessionId','messageId','leafId']) string(final[key], 'Native final ' + key);
  hash(final.sha256, 'Native final hash');
}
function workerIdentity(value, executionId) {
  keys(value, ['revision','executionId','nonce','root','rootDevice','rootInode','bootId','pidNamespace','helperPid','helperStartTicks','helperSha256','workerPid','ownershipPath','receiptPath'], 'Cleanup identity');
  check(value.revision === 1 && value.executionId === executionId, 'Cleanup identity must bind the requested execution');
  for (const key of ['executionId','nonce','root','rootDevice','rootInode','bootId','pidNamespace','helperStartTicks','ownershipPath','receiptPath']) string(value[key], 'Cleanup identity ' + key);
  integer(value.helperPid, 'Helper pid', 1); integer(value.workerPid, 'Worker pid'); hash(value.helperSha256, 'Helper hash');
}
function cleanup(value, executionId) {
  if (value === null) return;
  object(value, 'Cleanup');
  if (value.state === 'not-started' || value.state === 'unknown') {
    const fields = ['state','reason'];
    if (value.state === 'unknown' && Object.hasOwn(value, 'identity')) fields.push('identity');
    keys(value, fields, 'Cleanup'); publicText(value.reason, 'Cleanup reason');
    if (Object.hasOwn(value, 'identity')) workerIdentity(value.identity, executionId);
    return;
  }
  keys(value, ['state','identity','receipt'], 'Cleanup');
  check(value.state === 'settled', 'Unsupported cleanup state'); workerIdentity(value.identity, executionId);
  keys(value.receipt, ['state','identity','workerCode','workerSignal','reason','reapedAll'], 'Cleanup receipt');
  check(value.receipt.state === 'settled' && value.receipt.reapedAll === true && isDeepStrictEqual(value.receipt.identity, value.identity), 'Cleanup receipt identity or settlement mismatch');
  if (value.receipt.workerCode !== null) integer(value.receipt.workerCode, 'Worker exit code');
  integer(value.receipt.workerSignal, 'Worker signal');
  enumeration(value.receipt.reason, ['worker-exit','owner-loss','cancelled','helper-signal','ownership-write-failed','start-failed'], 'Cleanup receipt reason');
}
function runtimeOutcome(outcome, index, requested) {
  keys(outcome, ['ordinal','ok','work','control','reason','exitCode','timedOut','aborted','truncated','spawnFailed','final','cleanup','observation','retention'], 'Runtime outcome');
  check(outcome.ordinal === index + 1, 'Runtime ordinals must follow requested order');
  check(typeof outcome.ok === 'boolean', 'Runtime ok must be boolean');
  enumeration(outcome.work, [null,'succeeded','failed','unknown'], 'Work state'); enumeration(outcome.control, [null,'failed'], 'Control state');
  if (outcome.reason !== null) publicText(outcome.reason, 'Runtime reason');
  if (outcome.exitCode !== null) integer(outcome.exitCode, 'Runtime exit code');
  for (const key of ['timedOut','aborted','truncated','spawnFailed']) check(outcome[key] === null || typeof outcome[key] === 'boolean', 'Runtime flags must be nullable booleans');
  if (outcome.final !== null) {
    object(outcome.final, 'Runtime final');
    if (outcome.final.state === 'unavailable') { keys(outcome.final, ['state','reason'], 'Unavailable final'); publicText(outcome.final.reason, 'Unavailable final reason'); }
    else finalIdentity(outcome.final);
  }
  cleanup(outcome.cleanup, requested.executionId);
  if (outcome.observation !== null) {
    keys(outcome.observation, ['state','reasons'], 'Observation');
    enumeration(outcome.observation.state, ['complete','incomplete'], 'Observation state');
    array(outcome.observation.reasons, 'Observation reasons');
    for (const reason of outcome.observation.reasons) publicText(reason, 'Observation reason');
  }
  if (outcome.retention !== null) { keys(outcome.retention, ['status'], 'Retention'); enumeration(outcome.retention.status, ['disabled','pending','retained','lost'], 'Retention status'); }
}
function binding(value) {
  if (value === null) return;
  keys(value, ['package','phase'], 'Definition binding');
  check(value.package === 'principal-pi-skills', 'Unsupported definition binding package'); string(value.phase, 'Definition phase');
}
async function capture(reader, reference) {
  keys(reference, ['path','sha256'], 'Manifest reference'); hash(reference.sha256, 'Manifest hash');
  const manifestBytes = await reader.read(reference.path, MAX_PUBLIC_SOURCE_MANIFEST_BYTES);
  check(digest(manifestBytes) === reference.sha256, 'Manifest hash mismatch');
  const manifest = json(manifestBytes, 'Manifest');
  keys(manifest, ['schema','version','captureId','ownerId','toolCallId','tool','state','response','requested','runtimeEvidence','finals','definitions'], 'Public manifest');
  check(manifest.schema === 'pi-daddy-public-evidence-v1' && manifest.version === 1 && manifest.state === 'returned', 'Unsupported public manifest version or state');
  check(UUID.test(manifest.captureId) && UUID.test(manifest.ownerId), 'Capture/owner identity must be a UUID');
  string(manifest.toolCallId, 'Tool-call identity'); enumeration(manifest.tool, TOOLS, 'Tool');
  const directory = join(reader.root, manifest.captureId);
  check(reference.path === join(directory, 'manifest.json'), 'Manifest path does not bind its capture identity');
  const refs = [{ kind: 'manifest', ...reference, bytes: manifestBytes.length }];
  const seen = new Set([reference.path]);
  async function copied(ref, filename, kind) {
    keys(ref, ['path','sha256','bytes'], 'Copied reference'); hash(ref.sha256, 'Copied hash'); integer(ref.bytes, 'Copied byte count');
    check(ref.path === join(directory, filename) && !seen.has(ref.path), 'Copied reference path is foreign or reused');
    seen.add(ref.path);
    check(ref.bytes <= MAX_PUBLIC_SOURCE_FILE_BYTES, 'Copied reference exceeds file-byte limit');
    const bytes = await reader.read(ref.path);
    check(bytes.length === ref.bytes && digest(bytes) === ref.sha256, 'Copied reference byte count or hash mismatch');
    refs.push({ kind, ...ref });
    return bytes;
  }
  array(manifest.requested, 'Requested', 8); check(manifest.requested.length > 0, 'Capture must identify a requested row');
  if (manifest.tool === 'delegate' || manifest.tool === 'delegate_describe') check(manifest.requested.length === 1, 'Single tool requires one requested row');
  manifest.requested.forEach((row, index) => requestedRow(row, index, manifest.tool));
  const executionIds = manifest.requested.map(row => row.executionId).filter(value => value !== null);
  check(new Set(executionIds).size === executionIds.length, 'Requested execution identities must be unique');
  const response = json(await copied(manifest.response, 'response.json', 'response'), 'Public response');
  keys(response, ['isError','content'], 'Public response'); check(typeof response.isError === 'boolean', 'Public isError must be boolean');
  array(response.content, 'Public content', 2);
  for (const block of response.content) { keys(block, ['type','text'], 'Public block'); check(block.type === 'text' && typeof block.text === 'string', 'Only public text blocks are supported'); }
  array(manifest.finals, 'Final copies', 8); array(manifest.definitions, 'Definition copies', 8);
  let outcomes = [];
  if (manifest.tool === 'delegate_describe') {
    check(manifest.runtimeEvidence === null && manifest.finals.length === 0 && response.content.length === 1 && response.isError === false, 'Describe capture has no runtime/final outcome');
  } else {
    const runtime = manifest.runtimeEvidence;
    keys(runtime, ['version','tool','requested','outcomes'], 'Runtime evidence');
    check(runtime.version === 1 && runtime.tool === manifest.tool && runtime.requested === manifest.requested.length, 'Runtime header does not match capture');
    array(runtime.outcomes, 'Runtime outcomes', 8); outcomes = runtime.outcomes;
    check(outcomes.length > 0 && outcomes.length <= manifest.requested.length, 'Runtime outcome count is invalid');
    if (manifest.tool !== 'delegate_chain') check(outcomes.length === manifest.requested.length, 'Non-chain captures must retain every outcome');
    outcomes.forEach((outcome, index) => runtimeOutcome(outcome, index, manifest.requested[index]));
    check(response.content.length === 2 && response.content[1].text.startsWith(RUNTIME_PREFIX) && response.content[1].text.endsWith('\n```'), 'Public response lacks its exact runtime evidence block');
    const projection = json(Buffer.from(response.content[1].text.slice(RUNTIME_PREFIX.length, -4)), 'Public runtime projection');
    check(isDeepStrictEqual(projection, runtime), 'Public runtime projection differs from manifest');
    const failed = outcomes.some(outcome => !outcome.ok || outcome.control === 'failed');
    if (manifest.tool !== 'delegate_chain') check(response.isError === failed, 'Public isError differs from runtime outcome');
    else if (failed || outcomes.length < manifest.requested.length || outcomes.some(outcome => outcome.final?.state === 'unavailable')) check(response.isError, 'Stopped chain must remain an error response');
    check(manifest.finals.length === outcomes.length, 'Every returned outcome must retain its final availability');
  }
  for (const [index, row] of manifest.finals.entries()) {
    keys(row, ['ordinal','executionId','final'], 'Final copy row');
    check(row.ordinal === index + 1 && row.executionId === manifest.requested[index].executionId, 'Final copy identity differs from requested execution');
    const final = outcomes[index].final;
    if (final?.state !== 'complete') { check(row.final === null, 'Unavailable native final cannot have a complete copy'); continue; }
    keys(row.final, ['state','sessionId','messageId','leafId','sha256','content'], 'Final copy');
    const { content, ...identity } = row.final;
    check(isDeepStrictEqual(identity, final), 'Final copy identity differs from runtime final');
    const bytes = await copied(content, `outcome-${row.ordinal}-final.txt`, 'final');
    check(bytes.length > 0 && digest(bytes) === final.sha256, 'Final copy differs from native final hash');
    // Only the authored block can bind final text; never match a JSON projection or recurse into prose paths.
    check(Buffer.from(response.content[0].text, 'utf8').includes(bytes), 'Complete final bytes are absent from authored public content');
  }
  const expectedDefinitions = manifest.requested.filter(row => row.definitionId !== null).map(row => JSON.stringify([row.agent, row.definitionId])).sort();
  const observedDefinitions = [];
  for (const [index, definition] of manifest.definitions.entries()) {
    keys(definition, ['agent','definitionId','sourceHash','bodySha256','binding','resources','body'], 'Definition copy');
    string(definition.agent, 'Definition agent'); hash(definition.definitionId, 'Definition identity'); hash(definition.sourceHash, 'Definition source hash', true); hash(definition.bodySha256, 'Definition body hash'); binding(definition.binding);
    observedDefinitions.push(JSON.stringify([definition.agent, definition.definitionId]));
    array(definition.resources, 'Definition resources'); check(definition.resources.length > 0, 'Definition source resources are missing');
    for (const [resourceIndex, resource] of definition.resources.entries()) {
      keys(resource, ['kind','path','copy'], 'Definition resource');
      enumeration(resource.kind, ['selected-skill','package','binding-manifest','delegated-agent'], 'Source kind');
      string(resource.path, 'Original source identity'); // Identity only: never open/resolve the original path.
      await copied(resource.copy, `definition-${index}-source-${resourceIndex}.bin`, 'source-copy');
    }
    const body = await copied(definition.body, `definition-${index}-body.txt`, 'definition-body');
    check(digest(body) === definition.bodySha256, 'Definition body copy differs from bodySha256');
  }
  check(isDeepStrictEqual(observedDefinitions.sort(), expectedDefinitions), 'Copied definitions differ from observed requested definitions');
  if (manifest.tool === 'delegate_describe') {
    const described = json(Buffer.from(response.content[0].text), 'Described definition');
    const definition = manifest.definitions[0];
    const expected = { version: 1, agent: definition.agent, bodySha256: definition.bodySha256, binding: definition.binding, definitionId: definition.definitionId };
    if (Object.hasOwn(described, 'sourceHash')) expected.sourceHash = definition.sourceHash;
    else check(definition.sourceHash === null, 'Described source hash is missing');
    check(isDeepStrictEqual(described, expected), 'Described definition differs from manifest source/body identity');
  }
  return { manifest, refs, responseIsError: response.isError, outcomes };
}

/** Verify selected public closures only. Caller case text is validated for its
 * hash but never copied into the receipt, searched for paths, or transmitted.
 */
export async function verifySources(cases, selection, evidenceRoot) {
  check(process.platform === 'linux', 'Public source verification requires Linux held-directory-FD reads');
  canonicalPath(evidenceRoot, 'Evidence root'); check(evidenceRoot !== '/', 'Evidence root cannot be the filesystem root');
  array(cases, 'Cases', 100);
  const raw = cases.map(item => { keys(item, ['id','input','question','provenance','source','visibility','hash'], 'Parsed case'); const { hash: ignored, ...original } = item; return original; });
  const validated = parseCases({ schema: 1, cases: raw });
  validated.forEach((item, index) => check(item.hash === cases[index].hash, 'Incoming parsed case hash is stale'));
  keys(selection, ['schema','kind','selections'], 'Source selection');
  check(selection.schema === 1 && selection.kind === 'decision-public-sources', 'Unsupported source selection version');
  array(selection.selections, 'Selections', 100);
  check(selection.selections.length === validated.length, 'Require exactly one ordered selection per case');
  for (const [index, row] of selection.selections.entries()) {
    keys(row, ['caseId','caseHash','manifest','captureId','toolCallId','ordinal','agent','definitionId','executionId'], 'Source selection row');
    const item = validated[index];
    check(row.caseId === item.id && row.caseHash === item.hash, 'Selections must match exact ordered case identities');
    keys(row.manifest, ['path','sha256'], 'Manifest selection'); hash(row.manifest.sha256, 'Selected manifest hash');
    check(item.source.sha256 === row.manifest.sha256 && item.source.recordId === row.toolCallId, 'Case source must bind the manifest hash and tool-call identity');
    check(UUID.test(row.captureId), 'Selected capture identity must be a UUID'); string(row.toolCallId, 'Selected tool-call identity'); integer(row.ordinal, 'Selected ordinal', 1);
    string(row.agent, 'Selected agent', true); hash(row.definitionId, 'Selected observed definition identity', true); string(row.executionId, 'Selected execution identity', true);
  }
  const reader = new EvidenceReader(evidenceRoot);
  try {
    await reader.start();
    const captures = new Map(), rows = [];
    for (const row of selection.selections) {
      let verified = captures.get(row.manifest.path);
      if (!verified) { verified = await capture(reader, row.manifest); captures.set(row.manifest.path, verified); }
      check(verified.refs[0].sha256 === row.manifest.sha256, 'Repeated manifest selections disagree on hash');
      const { manifest, refs, outcomes } = verified;
      check(manifest.captureId === row.captureId && manifest.toolCallId === row.toolCallId, 'Selected capture/tool-call identity mismatch');
      const requested = manifest.requested[row.ordinal - 1];
      check(requested !== undefined && ['ordinal','agent','definitionId','executionId'].every(key => requested[key] === row[key]), 'Selected requested row identity mismatch');
      const outcome = outcomes[row.ordinal - 1];
      rows.push({ caseId: row.caseId, caseHash: row.caseHash, source: { sha256: row.manifest.sha256, recordId: manifest.toolCallId },
        captureId: manifest.captureId, ownerId: manifest.ownerId, toolCallId: manifest.toolCallId, tool: manifest.tool,
        requested: { ...requested }, manifest: { ...row.manifest }, copiedRefs: refs.map(ref => ({ ...ref })),
        observed: { responseIsError: verified.responseIsError, returnedOutcomeCount: outcomes.length,
          selectedOutcome: outcome ? { ok: outcome.ok, work: outcome.work, control: outcome.control,
            finalState: outcome.final?.state ?? null, cleanupState: outcome.cleanup?.state ?? null,
            observationState: outcome.observation?.state ?? null, retentionStatus: outcome.retention?.status ?? null } : null } });
    }
    await reader.stable();
    return { schema: 1, kind: 'decision-public-source-verification', status: 'verified-bytes-and-record-identities',
      platform: 'linux', evidenceRoot, limits: { ...LIMITS }, artifactCount: reader.files.size, totalBytes: reader.totalBytes,
      captureCount: captures.size, cases: rows, trainingReady: false, trainingEligible: false,
      assessments: { approval: 'not-assessed', taskAcceptance: 'not-assessed', decisionTimeAvailability: 'not-assessed', redaction: 'not-assessed', rights: 'not-assessed' } };
  } finally { await reader.close(); }
}