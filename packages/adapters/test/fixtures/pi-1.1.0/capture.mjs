import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
const pi110 = process.env.SCOUT_HARNESS_PI110 === '1';
const expectedPi = pi110 ? '1.1.0' : '1.0.4';
const referenceRoot = pi110 ? '/opt/reference-pi110' : '/opt/reference';
const { getAdapter } = await import(referenceRoot + '/node_modules/@skill-harness/adapters/dist/index.js');

// This is transport qualification with a scripted local provider, never a quality score.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
const { readResults, piQualificationFailure } = await import(referenceRoot + '/node_modules/@skill-harness/core/dist/index.js');
assert.equal(piQualificationFailure(expectedPi), null);
assert.ok(piQualificationFailure('9.9.9')); assert.equal(piQualificationFailure('1.0.4'), null); assert.equal(piQualificationFailure('1.1.0'), null);
assert.ok(piQualificationFailure(null));

const adapter = getAdapter('pi');
const requests = [];
let fixtureError;
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.url, '/v1/chat/completions');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
    const cli = body.model.endsWith('-cli');
    const mcp = body.model === 'mcp-fixture';
    const judge = body.model === 'judge-fixture' || body.model === 'judge-cli'; if (judge) assert.equal(body.tools?.length ?? 0, 0, 'Judge must advertise no tools');
    if (requests.length > 60) throw new Error('Unexpected fixture loop');
    const wrong = JSON.stringify(body.messages).includes('PIPELINE_WRONG_ANSWER');
    const vote = wrong ? 'FAIL' : 'PASS';
    const hasRead = body.messages.some(message => message.role === 'tool');
    const tool = !judge && !hasRead;
    const answer = judge ? cli ? JSON.stringify({ votes: [{ criterion: 1, vote, reason: wrong ? 'Transcript contradicts the fixture.' : 'Transcript matches the fixture.' }], verdict: vote, reason: 'Synthetic pipeline probe only.' }) : 'FIXTURE_JUDGE_RECEIPT'
      : wrong ? 'PIPELINE_WRONG_ANSWER: Acorn Cache 2.0 never supports offline reads.' : 'Acorn Cache 2.0 supports offline reads. Source: release.txt:1.';
    const delta = tool ? { role: 'assistant', tool_calls: [{ index: 0, id: 'fixture-read', type: 'function',
      function: { name: mcp ? 'mcp__probe__echo' : 'read', arguments: JSON.stringify(mcp ? {} : { path: cli ? 'release.txt' : '/workspace/release.txt' }) } }] }
      : { role: 'assistant', content: answer };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = (delta, finish_reason) => ({ id: 'fixture', object: 'chat.completion.chunk', created: 1,
      model: body.model, choices: [{ index: 0, delta, finish_reason }] });
    res.write(`data: ${JSON.stringify(chunk(delta, null))}\n\n`);
    res.write(`data: ${JSON.stringify(chunk({}, tool ? 'tool_calls' : 'stop'))}\n\n`);
    res.end('data: [DONE]\n\n');
  } catch (error) { fixtureError = error; res.writeHead(500); res.end('fixture error'); }
});
await mkdir('/workspace/agent', { recursive: true });
process.env.PI_CODING_AGENT_DIR = '/workspace/agent';
const qualifiedPath = pi110 ? '/usr/local/bin:/usr/bin:/bin' : '/opt/harness-pi/node_modules/.bin:/usr/local/bin:/usr/bin:/bin';
process.env.PATH = qualifiedPath;
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const model = id => ({ id, name: id, reasoning: false, input: ['text'], contextWindow: 128000,
    maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
  await writeFile('/workspace/agent/models.json', JSON.stringify({ providers: { fixture: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'synthetic-not-a-credential',
    models: [model('subject-fixture'), model('judge-fixture'), model('mcp-fixture')],
  } } }));
  const config = JSON.parse(await readFile('/workspace/agent/models.json', 'utf8'));
  config.providers.local = { ...config.providers.fixture, models: [model('subject-cli'), model('judge-cli')] };
  await writeFile('/workspace/agent/models.json', JSON.stringify(config));
  await writeFile('/workspace/release.txt', 'Acorn Cache 2.0 supports offline reads.\n');
  const version = await adapter.version({ cwd: '/workspace' });
  assert.equal(version, expectedPi);
  const req = { skillDir: '/opt/research/research', model: { provider: 'fixture', model: 'subject-fixture' },
    turns: ['Read release.txt and answer whether Acorn Cache 2.0 supports offline reads.'], cwd: '/workspace', scenarioId: 'transport-only', rep: 0 };
  const runs = [];
  for (const mode of ['red', 'green', 'force']) {
    const start = requests.length;
    const result = await adapter.runStructured({ ...req, mode });
    if (fixtureError) throw fixtureError;
    assert.equal(result.executionFailure, undefined, result.transcript);
    assert.equal(result.providerFailure, undefined, result.transcript);
    assert.equal(result.traces.length, 1);
    assert.equal(result.traces[0].final_status, 'complete');
    assert.equal(result.traces[0].tool_calls[0].name, 'read');
    assert.equal(result.traces[0].tool_calls[0].isError, false);
    assert.match(result.transcript, /supports offline reads/);
    const prompt = JSON.stringify(requests[start].messages);
    if (mode === 'red') assert.doesNotMatch(prompt, /Investigate a question using reachable evidence/);
    if (mode === 'green') assert.match(prompt, /Investigate a question using reachable evidence/);
    if (mode === 'force') assert.match(prompt, /Do not impose time, token, call-count or review-round budgets/);
    runs.push({ mode, complete: true, readCalls: result.traces[0].tool_calls.length, fixtureRequests: requests.length - start });
  }
  const judge = await adapter.judge({ model: { provider: 'fixture', model: 'judge-fixture' }, prompt: 'Return the fixed fixture receipt.', cwd: '/workspace' });
  assert.equal(judge.trim(), 'FIXTURE_JUDGE_RECEIPT');
  assert.equal(await readFile('/workspace/release.txt', 'utf8'), 'Acorn Cache 2.0 supports offline reads.\n');
  const pipeline = [];
  async function executeProcess(command, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args,
        { cwd: '/workspace', env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
      child.stdout.on('data', chunk => { output += chunk; });
      child.stderr.on('data', chunk => { output += chunk; });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
    });
  }
  const executeCli = args => executeProcess(process.execPath, [referenceRoot + '/node_modules/skill-harness/bin.js', ...args]);
  async function resultFiles(root) {
    const paths = [];
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) paths.push(...await resultFiles(path));
      else if (entry.name === 'results.yaml') paths.push(path);
    }
    return paths;
  }
  const scenario = (id, wrong = false, gate = false) => ({ id, title: id, critical: true,
    mode: 'seeded', fixture: 'fixtures/source', reps: 1, pass_threshold: 1,
    turns: [wrong ? 'PIPELINE_WRONG_ANSWER: Read release.txt then answer the offline question.' : 'Read release.txt and answer the offline question.'],
    checklist: ['Trusted fixture: Acorn Cache 2.0 supports offline reads. The answer must say so.'],
    assert: { trace: { require_calls: [{ tool: 'read', args: { path: { equals: gate ? 'never-read.txt' : 'release.txt' } } }],
      forbid_calls: ['bash', 'write', 'edit'], unchanged_paths: ['**'] } } });
  for (const mixed of [false, true]) {
    const root = mixed ? '/workspace/pipeline-mixed' : '/workspace/pipeline-clean';
    const tests = root + '/research/tests';
    await mkdir(tests + '/fixtures/source', { recursive: true });
    await writeFile(tests + '/fixtures/source/release.txt', 'Acorn Cache 2.0 supports offline reads.\n');
    const scenarios = mixed ? [scenario('good'), scenario('judge-fail', true), scenario('gate-fail', false, true)] : [scenario('good')];
    await writeFile(tests + '/specification.yaml', JSON.stringify({ schema: 1, skill: 'research', judge_persona: 'Synthetic pipeline probe.',
      ship_bar: { total: scenarios.length, min_pass: scenarios.length, no_critical_fail: true }, scenarios }));
    const before = requests.length;
    const run = await executeCli(['run', 'research', '--skills', '/opt/research', '--specs', root,
      '--model', 'local:subject-cli', '--judge', 'local:judge-cli', '--mode', 'green', '--reps', '1']);
    if (fixtureError) throw fixtureError;
    assert.equal(run.code, mixed ? 1 : 0, run.output);
    const files = await resultFiles(root);
    assert.equal(files.length, 1, run.output);
    const saved = readResults(dirname(files[0]));
    assert.equal(saved.effective_grade.ship, !mixed, JSON.stringify(saved));
    const verdicts = Object.fromEntries(saved.scenarios.map(item => [item.id, item.judge_verdict]));
    assert.equal(verdicts.good, 'PASS');
    if (mixed) {
      assert.equal(verdicts['judge-fail'], 'FAIL');
      assert.equal(saved.scenarios.find(item => item.id === 'gate-fail').objective.status, 'FAIL');
    }
    const judgeCalls = requests.slice(before).filter(request => request.model === 'judge-cli').length;
    assert.equal(judgeCalls, mixed ? 2 : 1, 'Failed objective gates must not call a judge');
    pipeline.push({ mixed, exitCode: run.code, fixtureShip: saved.effective_grade.ship, verdicts, judgeCalls });
  }
  // Scratch MCP server exposes only a fixed string; it never reads host data.
  await writeFile('/workspace/mcp-probe.mjs', `
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (!('id' in message)) return;
  let result;
  if (message.method === 'initialize') result = { protocolVersion: message.params.protocolVersion,
    capabilities: { tools: {} }, serverInfo: { name: 'scout-probe', version: '1' } };
  else if (message.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'Fixed probe value', inputSchema: { type: 'object', properties: {} } }] };
  else if (message.method === 'tools/call') {
    appendFileSync('/workspace/mcp-calls.txt', 'called\\n');
    result = { content: [{ type: 'text', text: 'SCOUT_MCP_FIXED_RESPONSE' }] };
  } else if (message.method === 'ping') result = {};
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported probe method' } }) + '\\n'); return; }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\\n');
});
`);
  await writeFile('/workspace/agent/mcp.json', JSON.stringify({ mcpServers: { probe: {
    command: process.execPath, args: ['/workspace/mcp-probe.mjs'], exposure: 'direct', timeout: 5,
  } } }));
  const calls = async () => (await readFile('/workspace/mcp-calls.txt', 'utf8').catch(error => {
    if (error.code === 'ENOENT') return ''; throw error;
  })).split('\n').filter(Boolean).length;
  const mcpProbe = [];
  for (const [version, executable] of [['1.0.4', '/opt/harness-pi/node_modules/.bin/pi'], ['1.1.0', '/usr/local/bin/pi']]) {
    const listing = await executeProcess(executable, ['mcp', 'list']);
    assert.match(listing.output, /probe/, 'MCP positive control configuration missing: ' + listing.output);
    for (const [disabled, extensionsDisabled, readOnlyTools] of [[false, false, false], [false, false, true], [false, true, true], [true, false, false], [true, true, true]]) {
      const before = await calls(); const requestStart = requests.length;
      const run = await executeProcess(executable, [...(extensionsDisabled ? ['--no-extensions'] : []), '--no-skills', '--no-context-files',
        '--no-session', ...(readOnlyTools ? ['--tools', 'read'] : []), ...(disabled ? ['--no-mcp'] : []), '--mode', 'json',
        '--provider', 'fixture', '--model', 'mcp-fixture', '-p', 'Run the fixed MCP echo probe once.']);
      if (fixtureError) throw fixtureError;
      assert.equal(run.code, 0, run.output); if (version === '1.1.0' && !disabled && !extensionsDisabled && !readOnlyTools) await writeFile('/qualification/pi-1.1.0-success.jsonl', run.output);
      if (disabled || (!extensionsDisabled && !readOnlyTools)) assert.equal((await calls()) - before, disabled ? 0 : 1, listing.output + '\n' + run.output.slice(-2200));
      const advertised = requests[requestStart].tools.some(tool => tool.function.name === 'mcp__probe__echo');
      assert.equal(advertised, (await calls()) - before === 1);
      mcpProbe.push({ version, noMcp: disabled, extensionsDisabled, toolFilter: readOnlyTools ? 'read' : 'default', advertised, calls: (await calls()) - before });
    }
  }
  const judgeAfterMcp = await adapter.judge({ model: { provider: 'fixture', model: 'judge-fixture' }, prompt: 'Return the fixed fixture receipt.', cwd: '/workspace' }); assert.equal(judgeAfterMcp.trim(), 'FIXTURE_JUDGE_RECEIPT'); const beforeHarnessMcp = await calls();
  const inherited = await adapter.runStructured({ ...req, model: { provider: 'fixture', model: 'mcp-fixture' }, mode: 'red' });
  assert.equal(inherited.executionFailure, undefined, inherited.transcript);
  const harnessConfiguredMcpCalls = (await calls()) - beforeHarnessMcp;
  assert.equal(inherited.traces[0].tool_calls[0].name, 'mcp__probe__echo');
  assert.equal(harnessConfiguredMcpCalls, 0, 'Undeclared MCP must not execute');
  assert.equal(inherited.traces[0].tool_calls[0].isError, true);
  console.log(JSON.stringify({ status: 'passed', profile: 'harness-transport', harness: '0.29.0', pi: version, runs, pipeline, mcpProbe, harnessConfiguredMcpCalls,
    qualificationCandidate: pi110 ? 'scout-evaluation-pi110-v1' : null,
    unknownVersionRefused: piQualificationFailure('9.9.9') !== null, judgeTransport: 'scripted-local-only', subscriptionAuthQualified: false,
    modelQualityEvaluated: false, providerCalls: 0, fixtureRequests: requests.length,
    limitations: ['CLI scores are synthetic controls, not research quality', 'Green verifies discoverability, not autonomous skill selection',
      'No subscription authentication or real model quality measured', 'MCP probe covers Pi and published harness, not governed Daddy child execution'] }));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
