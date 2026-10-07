#!/usr/bin/env node
// Source-only research tool; the harness/runtime never imports this module.
import { createHash } from 'node:crypto';
import { open, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCases, parseLabels, scorePredictions, localCorpus } from './dataset.mjs';
import { makeRequest, callProvider } from './providers.mjs';

const terms = { openai: 'https://openai.com/policies/services-agreement/', jev: 'https://typesafe.ai/legal/mca' };
const help = `Source-only decision shadow pilot (Node >=20)
  preview --cases FILE --provider openai|jev --model MODEL
  run --cases FILE --provider openai|jev --model MODEL --out NEW.jsonl --allow-remote
  score --cases FILE --labels FILE --run RESULT.jsonl [--run RESULT2.jsonl]
  corpus --cases FILE --labels FILE --out NEW.json

preview, score and corpus are offline. run sends only the curated input and
question to the selected provider, bills its API, and requires its API key in
OPENAI_API_KEY or OPENROUTER_API_KEY. No retries. Output must be new.
Labels/predictions are research records, never runtime authority.
Corpus excludes predictions and is NOT approved for training.`;

function argumentsFor(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help') return { command: 'help', flags: {} };
  const commands = {
    preview: ['cases', 'provider', 'model'],
    run: ['cases', 'provider', 'model', 'out', 'allow-remote'],
    score: ['cases', 'labels', 'run'],
    corpus: ['cases', 'labels', 'out'],
  };
  if (!Object.hasOwn(commands, command)) throw new Error('Unknown command; use --help.');
  const allowed = commands[command];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i].slice(2);
    if (!rest[i].startsWith('--') || !allowed.includes(key)) throw new Error('Unknown option.');
    if (key in flags && !(command === 'score' && key === 'run')) throw new Error('Duplicate --' + key);
    if (key === 'allow-remote') { flags[key] = true; continue; }
    const value = rest[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing --' + key + ' value.');
    if (command === 'score' && key === 'run') (flags.run ??= []).push(value);
    else flags[key] = value;
  }
  for (const required of allowed) if (!(required in flags)) throw new Error('Required --' + required);
  return { command, flags };
}

async function textFile(path) {
  const info = await stat(path);
  if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error('Expected regular file <=4 MiB.');
  const bytes = await readFile(path);
  if (bytes.length > 4 * 1024 * 1024) throw new Error('File exceeded 4 MiB.');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error('Input file is not valid UTF-8.');
  }
}
async function jsonFile(path) {
  const text = await textFile(path);
  try { return JSON.parse(text); } catch { throw new Error('Invalid JSON input file.'); }
}
function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
function caseSetHash(cases) {
  return sha256(JSON.stringify(cases.map(c => ({ id: c.id, hash: c.hash }))));
}
function labelSetHash(labels) {
  return sha256(JSON.stringify([...labels].sort((a, b) => a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0)));
}
function validCreatedAt(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}
async function readRun(path, cases) {
  let rows;
  const text = await textFile(path);
  try { rows = text.trimEnd().split('\n').map(line => JSON.parse(line)); }
  catch { throw new Error('Invalid run JSONL; retain damaged evidence separately.'); }
  const [header, ...records] = rows;
  if (header?.schema !== 1 || header.kind !== 'decision-shadow-run' ||
      header.caseSetHash !== caseSetHash(cases) || header.caseCount !== cases.length ||
      header.trainingEligible !== false || !validCreatedAt(header.createdAt) ||
      !Object.hasOwn(terms, header.provider))
    throw new Error('Run header does not match this case set.');
  makeRequest(header.provider, header.requestedModel, cases[0]);
  if (records.length > cases.length) throw new Error('Too many prediction records.');
  for (const r of records) {
    const resolvedMatches = typeof r?.resolvedModel === 'string' &&
      r.resolvedModel.length > 0 && r.resolvedModel.length <= 256 &&
      (r.resolvedModel === header.requestedModel ||
        r.resolvedModel.startsWith(header.requestedModel + '-'));
    const validResolved = r?.status === 'error'
      ? r.resolvedModel === null || resolvedMatches
      : resolvedMatches;
    if (!r || r.kind !== 'prediction' || r.trainingEligible !== false ||
        !validResolved || !nullableMetric(r.latencyMs) || !r.usage ||
        !['inputTokens', 'outputTokens', 'costUsd'].every(key => nullableMetric(r.usage[key])) ||
        !(r.error === null || (typeof r.error === 'string' && r.error.length <= 512)))
      throw new Error('Invalid prediction record.');
  }
  return { header, records, runSha256: sha256(text) };
}
function nullableMetric(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}
function measurements(records) {
  const summarize = values => {
    const reported = values.filter(value => value !== null);
    return { reported: reported.length, attempted: records.length,
      total: reported.length ? reported.reduce((a, b) => a + b, 0) : null };
  };
  const latency = summarize(records.map(r => r.latencyMs));
  return {
    latencyMs: { reported: latency.reported, attempted: latency.attempted,
      mean: latency.reported ? latency.total / latency.reported : null },
    inputTokens: summarize(records.map(r => r.usage.inputTokens)),
    outputTokens: summarize(records.map(r => r.usage.outputTokens)),
    costUsd: summarize(records.map(r => r.usage.costUsd)),
  };
}
async function writeNew(path, value) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); }
  finally { await file.close(); }
}

export async function main(argv, { emit = console.log, env = process.env, providerCall = callProvider } = {}) {
  const { command, flags } = argumentsFor(argv);
  if (command === 'help') { emit(help); return; }
  const cases = parseCases(await jsonFile(flags.cases));
  if (command === 'preview' || command === 'run') {
    const requests = cases.map(c => makeRequest(flags.provider, flags.model, c));
    if (command === 'preview') {
      emit(JSON.stringify({ schema: 1, caseSetHash: caseSetHash(cases), count: cases.length,
        trainingEligible: false, requests: requests.map((request, i) =>
          ({ caseId: cases[i].id, caseHash: cases[i].hash, ...request })) }, null, 2));
      return;
    }
    const apiKey = env[flags.provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'];
    if (!apiKey?.trim()) throw new Error('Selected provider API key is not configured.');
    const file = await open(flags.out, 'wx', 0o600);
    const append = async row => { await file.writeFile(JSON.stringify(row) + '\n'); await file.sync(); };
    let failures = 0;
    try {
      await append({ schema: 1, kind: 'decision-shadow-run', provider: flags.provider,
        requestedModel: flags.model, createdAt: new Date().toISOString(), caseCount: cases.length,
        caseSetHash: caseSetHash(cases), trainingEligible: false, termsUrl: terms[flags.provider] });
      for (const c of cases) {
        let result;
        try { result = await providerCall(flags.provider, flags.model, c, { apiKey }); }
        catch { result = { status: 'error', probability: null, resolvedModel: null,
          usage: { inputTokens: null, outputTokens: null, costUsd: null }, latencyMs: null, error: 'Provider call failed.' }; }
        await append({ kind: 'prediction', caseId: c.id, caseHash: c.hash, ...result, trainingEligible: false });
        if (result.status === 'error') { failures++; break; }
      }
    } finally { await file.close(); }
    emit(JSON.stringify({ saved: resolve(flags.out), errors: failures, trainingEligible: false }));
    if (failures) throw new Error('Run stopped after a provider error; saved partial evidence. No retry was made.');
    return;
  }
  const labels = parseLabels(await jsonFile(flags.labels), cases);
  if (command === 'corpus') {
    await writeNew(flags.out, localCorpus(cases, labels));
    emit(JSON.stringify({ saved: resolve(flags.out), trainingReady: false }));
    return;
  }
  const reports = [];
  for (const path of flags.run) {
    const { header, records, runSha256 } = await readRun(path, cases);
    const resolvedModels = [...new Set(records.map(r => r.resolvedModel).filter(Boolean))];
    if (resolvedModels.length > 1) {
      throw new Error('Run contains multiple resolved models; retain this evidence and use a new single-snapshot run.');
    }
    reports.push({
      provider: header.provider,
      requestedModel: header.requestedModel,
      resolvedModels,
      runSha256,
      createdAt: header.createdAt,
      ...scorePredictions(cases, labels, records.map(({caseId,caseHash,status,probability}) =>
        ({caseId,caseHash,status,probability}))),
      measurements: measurements(records),
      trainingEligible: false,
    });
  }
  emit(JSON.stringify({
    schema: 1,
    threshold: 0.5,
    caseSetHash: caseSetHash(cases),
    labelSetHash: labelSetHash(labels),
    reports,
  }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
