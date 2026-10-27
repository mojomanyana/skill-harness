// Run with Node >=22.19.0. All answers are scripted controls, never model-quality evidence.
// capture.mjs RUNTIME_PREFIX HARNESS_CHECKOUT NEW_OUTPUT [native|adapter]
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile, readdir, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [runtimeArg, harnessArg, outputArg, stage = 'native'] = process.argv.slice(2);
assert.ok(runtimeArg && harnessArg && outputArg && ['native', 'adapter'].includes(stage));
const runtime = resolve(runtimeArg), harness = resolve(harnessArg), output = resolve(outputArg);
const fixtureDir = dirname(fileURLToPath(import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output); // New result path only.
const save = (name, value) => writeFile(join(output, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const versions = {};
for (const name of ['pi-coding-agent', 'pi-ai', 'pi-agent-core', 'pi-codemode', 'pi-mcp', 'pi-tui']) {
  versions[name] = JSON.parse(await readFile(join(runtime, 'node_modules/@earendil-works', name, 'package.json'))).version;
  assert.equal(versions[name], '1.4.0');
}
const cli = join(runtime, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
const home = join(output, 'home'), agent = join(output, 'agent'), work = join(output, 'work'), bin = join(output, 'bin'), guards = join(output, 'guards');
const skillRoot = join(output, 'skills'), skillDir = join(skillRoot, 'fixture-research');
for (const dir of [home, agent, work, bin, guards, skillDir]) await mkdir(dir, { recursive: true });
const source = 'Acorn Cache 2.0 supports offline reads.\n';
const finalText = 'Acorn Cache 2.0 supports offline reads. Source: release.txt:1.';
const skill = '---\nname: fixture-research\ndescription: FIXTURE_SKILL_DESCRIPTION\n---\n\n# Fixture research\nFIXTURE_SKILL_BODY: cite release.txt when answering the offline question.\n';
await writeFile(join(skillDir, 'SKILL.md'), skill);
await writeFile(join(work, 'release.txt'), source);
await writeFile(join(agent, 'settings.json'), JSON.stringify({ retry: { enabled: false }, compaction: { enabled: false } }));
await mkdir(join(agent, 'extensions'));
await writeFile(join(agent, 'extensions/ambient.mjs'), 'throw new Error("Ambient extensions must not load in this fixture");\n');
const selectedExtension = join(output, 'declared.mjs');
await writeFile(selectedExtension, `export default function(pi) { pi.registerTool({ name: 'fixture_echo', label: 'Fixture', description: 'Selected extension fixture', parameters: { type: 'object', properties: {}, additionalProperties: false }, async execute() { return { content: [{ type: 'text', text: 'DECLARED_EXTENSION_RESULT' }] }; } }); }\n`);
const cases = [['red', 'transport'], ['green', 'transport'], ['force', 'transport'], ['red', 'tool-error'], ['red', 'denied-tool'],
  ['red', 'mcp-denied'], ['red', 'extension-ok'], ['red', 'extension-filtered'], ['red', 'length'], ['red', 'provider-error']];
const selectedTools = selectedModel => selectedModel === 'extension-ok' ? ['read', 'fixture_echo'] : ['read'];
const requests = [];
let fixtureError;
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.url, '/v1/chat/completions');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
    assert.ok(requests.length < 120, 'Unexpected scripted request loop');
    if (body.model === 'provider-error') {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'invalid_api_key: synthetic failure', type: 'invalid_request_error', code: 'invalid_api_key' } })); return;
    }
    const judge = body.model === 'judge';
    if (judge) assert.equal(body.tools?.length ?? 0, 0, 'Judge must advertise no tools');
    const hasTool = body.messages.some(message => message.role === 'tool');
    const tool = !judge && !hasTool && body.model !== 'length';
    const wrong = JSON.stringify(body.messages).includes('PIPELINE_WRONG_ANSWER');
    const vote = wrong ? 'FAIL' : 'PASS';
    const answer = judge ? JSON.stringify({ votes: [{ criterion: 1, vote, reason: 'Scripted transport control.' }], verdict: vote, reason: 'Scripted transport control.' })
      : body.model === 'multi-turn' && JSON.stringify(body.messages.at(-1)).includes('SECOND_TURN') ? 'SECOND_TURN_RECEIPT'
      : wrong ? 'PIPELINE_WRONG_ANSWER: offline reads are unsupported.' : finalText;
    const name = body.model.startsWith('extension-') ? 'fixture_echo' : body.model === 'denied-tool' ? 'write' : body.model === 'mcp-denied' ? 'mcp__probe__echo' : 'read';
    const args = name === 'write' ? { path: 'forbidden.txt', content: 'must not be written' }
      : name === 'read' ? { path: body.model === 'tool-error' ? 'missing.txt' : 'release.txt' } : {};
    const delta = tool ? { role: 'assistant', tool_calls: [{ index: 0, id: `fixture-${requests.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }
      : { role: 'assistant', content: answer };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = (delta, finish_reason) => ({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] });
    res.write(`data: ${JSON.stringify(chunk(delta, null))}\n\n`);
    res.write(`data: ${JSON.stringify(chunk({}, tool ? 'tool_calls' : body.model === 'length' ? 'length' : 'stop'))}\n\n`);
    res.end('data: [DONE]\n\n');
  } catch (error) { fixtureError = error; res.writeHead(500); res.end('fixture error'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const guard = join(fixtureDir, 'network-guard.mjs');
const env = { HOME: home, PATH: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`,
  PI_CODING_AGENT_DIR: agent, NODE_OPTIONS: `--import=${guard}`, PI_FIXTURE_PORT: String(port), PI_FIXTURE_GUARD_DIR: guards,
  NO_COLOR: '1', TERM: 'dumb', LANG: 'C.UTF-8' };
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, env);
const model = id => ({ id, name: id, reasoning: false, input: ['text'], contextWindow: 100000, maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
await writeFile(join(agent, 'models.json'), JSON.stringify({ providers: { local: { baseUrl: `http://127.0.0.1:${port}/v1`, api: 'openai-completions', apiKey: 'synthetic-not-a-credential',
  models: ['transport', 'tool-error', 'denied-tool', 'mcp-denied', 'extension-ok', 'extension-filtered', 'multi-turn', 'length', 'provider-error', 'judge'].map(model) } } }));
assert.ok(!cli.includes("'"));
await writeFile(join(bin, 'pi'), `#!/bin/sh\nexec '${process.execPath}' '${cli}' "$@"\n`); await chmod(join(bin, 'pi'), 0o700);
const processReceipts = [];
async function execute(command, args, cwd = work) {
  const start = Date.now();
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', bytes = 0;
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 90000);
    const collect = key => chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } else if (key === 'stdout') stdout += chunk; else stderr += chunk; };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let groupGone = false;
      try { process.kill(-child.pid, 0); } catch (error) { groupGone = error.code === 'ESRCH'; }
      processReceipts.push({ pid: child.pid, code, signal, groupGone, bytes, elapsedMs: Date.now() - start });
      if (!groupGone) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      resolvePromise({ code, signal, stdout, stderr, groupGone });
    });
  });
}
const flag = mode => mode === 'red' ? ['--no-skills'] : mode === 'green' ? ['--skill', skillDir] : ['--no-skills', '--append-system-prompt', skill];
const prompt = 'Read release.txt and answer whether Acorn Cache 2.0 supports offline reads.';
const runs = [];
try {
  assert.equal((await execute(join(bin, 'pi'), ['--version'])).stdout.trim(), '1.4.0');
  if (stage === 'native') {
    for (const [mode, selectedModel] of cases) {
      const requestStart = requests.length;
      const result = await execute(join(bin, 'pi'), [...flag(mode), '--no-context-files', '--no-extensions',
        ...(selectedModel.startsWith('extension-') ? ['--extension', selectedExtension] : []), '--no-session', '--tools', selectedTools(selectedModel).join(','), '--mode', 'json', '--provider', 'local', '--model', selectedModel, '-p', prompt]);
      if (fixtureError) throw fixtureError;
      assert.equal(result.groupGone, true); assert.equal(result.signal, null);
      const events = result.stdout.trim().split('\n').map(line => JSON.parse(line));
      assert.ok(events.some(event => event.type === 'agent_settled'));
      const messages = events.filter(event => event.type === 'message_end' && event.message?.role === 'assistant').map(event => event.message);
      const last = messages.at(-1);
      assert.equal(last.stopReason, selectedModel === 'provider-error' ? 'error' : selectedModel === 'length' ? 'length' : 'stop');
      if (selectedModel !== 'provider-error') assert.equal(last.content.filter(block => block.type === 'text').map(block => block.text).join(''), finalText);
      const advertised = requests[requestStart].tools.map(tool => tool.function.name);
      assert.deepEqual(advertised, selectedTools(selectedModel));
      const end = events.filter(event => event.type === 'tool_execution_end');
      if (['transport', 'extension-ok'].includes(selectedModel)) assert.equal(end.at(-1)?.isError, false);
      if (['tool-error', 'denied-tool', 'mcp-denied', 'extension-filtered'].includes(selectedModel)) assert.equal(end.at(-1)?.isError, true);
      const modelPrompt = JSON.stringify(requests[requestStart].messages);
      if (mode === 'red') assert.doesNotMatch(modelPrompt, /FIXTURE_SKILL_DESCRIPTION|FIXTURE_SKILL_BODY/);
      if (mode === 'green') { assert.match(modelPrompt, /FIXTURE_SKILL_DESCRIPTION/); assert.doesNotMatch(modelPrompt, /FIXTURE_SKILL_BODY/); }
      if (mode === 'force') assert.match(modelPrompt, /FIXTURE_SKILL_BODY/);
      const file = `${mode}-${selectedModel}.jsonl`;
      await save(file, result.stdout); await save(`${mode}-${selectedModel}.stderr.txt`, result.stderr);
      runs.push({ mode, model: selectedModel, file, sha256: digest(result.stdout), exitCode: result.code, stopReason: last.stopReason,
        settled: true, toolError: end.at(-1)?.isError ?? null, advertisedTools: advertised, scriptedRequests: requests.length - requestStart });
    }
  } else {
    const { getAdapter } = await import(pathToFileURL(join(harness, 'packages/adapters/dist/index.js')));
    const { piQualificationFailure, readResults } = await import(pathToFileURL(join(harness, 'packages/core/dist/index.js')));
    const adapter = getAdapter('pi');
    assert.equal(piQualificationFailure('1.4.0'), null);
    for (const version of [null, '1.2.0', '1.3.0', '1.4.1', '9.9.9']) assert.ok(piQualificationFailure(version));
    for (const [mode, selectedModel] of cases) {
      const result = await adapter.runStructured({ skillDir, model: { provider: 'local', model: selectedModel }, mode, turns: [prompt], tools: selectedTools(selectedModel),
        extensions: selectedModel.startsWith('extension-') ? [selectedExtension] : undefined, cwd: work, scenarioId: 'transport-only', rep: 0 });
      const trace = result.traces[0];
      assert.equal(trace.final_status, selectedModel === 'length' ? 'truncated' : selectedModel === 'provider-error' ? 'error' : 'complete');
      if (['length', 'provider-error'].includes(selectedModel)) assert.ok(result.executionFailure);
      else { assert.equal(result.executionFailure, undefined); assert.equal(trace.final_text, finalText); }
      if (['tool-error', 'denied-tool', 'mcp-denied', 'extension-filtered'].includes(selectedModel)) assert.equal(trace.tool_calls[0].isError, true);
      if (['transport', 'extension-ok'].includes(selectedModel)) assert.equal(trace.tool_calls[0].isError, false);
      await save(`${mode}-${selectedModel}.result.json`, result);
      runs.push({ mode, model: selectedModel, finalStatus: trace.final_status, executionFailure: result.executionFailure ?? null });
    }
    const multi = await adapter.runStructured({ skillDir, model: { provider: 'local', model: 'multi-turn' }, mode: 'red', turns: [prompt, 'SECOND_TURN: acknowledge this second turn.'], tools: ['read'], cwd: work, scenarioId: 'multi-turn', rep: 0 });
    assert.equal(multi.executionFailure, undefined); assert.equal(multi.traces.length, 2);
    assert.deepEqual(multi.traces.map(trace => trace.final_text), [finalText, 'SECOND_TURN_RECEIPT']);
    assert.ok(multi.traces.every(trace => trace.final_status === 'complete'));
    await save('multi-turn.result.json', multi);
    runs.push({ mode: 'red', model: 'multi-turn', turns: 2, finalStatuses: multi.traces.map(trace => trace.final_status) });
    const scenario = (id, wrong = false, gate = false) => ({ id, title: id, critical: true, mode: 'seeded', fixture: 'fixtures/source', reps: 1, pass_threshold: 1,
      turns: [wrong ? 'PIPELINE_WRONG_ANSWER: ' + prompt : prompt], checklist: ['The answer says Acorn Cache 2.0 supports offline reads.'],
      assert: { trace: { require_calls: [{ tool: 'read', args: { path: { equals: gate ? 'never-read.txt' : 'release.txt' } }, outcome: 'success' }], forbid_calls: ['write', 'bash', 'edit'], unchanged_paths: ['**'] } } });
    const pipeline = [];
    for (const mixed of [false, true]) {
      const specs = join(output, mixed ? 'pipeline-mixed' : 'pipeline-clean'), tests = join(specs, 'fixture-research/tests');
      await mkdir(join(tests, 'fixtures/source'), { recursive: true }); await writeFile(join(tests, 'fixtures/source/release.txt'), source);
      const scenarios = mixed ? [scenario('good'), scenario('judge-fail', true), scenario('gate-fail', false, true)] : [scenario('good')];
      await writeFile(join(tests, 'specification.yaml'), JSON.stringify({ schema: 1, skill: 'fixture-research', judge_persona: 'Scripted pipeline fixture.',
        env: { tools: ['read'] }, ship_bar: { total: scenarios.length, min_pass: scenarios.length, no_critical_fail: true }, scenarios }));
      const before = requests.length;
      const result = await execute(process.execPath, [join(harness, 'bin/skill-harness.js'), 'run', 'fixture-research', '--skills', skillRoot, '--specs', specs,
        '--model', 'local:transport', '--judge', 'local:judge', '--mode', 'green', '--reps', '1', '--parallel', '1']);
      await save(`${mixed ? 'mixed' : 'clean'}-pipeline.log`, result.stdout + result.stderr);
      assert.equal(result.code, mixed ? 1 : 0, result.stdout + result.stderr); assert.equal(result.groupGone, true);
      async function resultsAt(dir) { const found = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const path = join(dir, entry.name); if (entry.isDirectory()) found.push(...await resultsAt(path)); else if (entry.name === 'results.yaml') found.push(path); } return found; }
      const files = await resultsAt(tests); assert.equal(files.length, 1);
      const saved = readResults(dirname(files[0])); assert.equal(saved.effective_grade.ship, !mixed);
      const verdicts = Object.fromEntries(saved.scenarios.map(item => [item.id, item.judge_verdict])); assert.equal(verdicts.good, 'PASS');
      if (mixed) { assert.equal(verdicts['judge-fail'], 'FAIL'); assert.equal(saved.scenarios.find(item => item.id === 'gate-fail').objective.status, 'FAIL'); }
      const judgeCalls = requests.slice(before).filter(request => request.model === 'judge').length; assert.equal(judgeCalls, mixed ? 2 : 1);
      pipeline.push({ mixed, exitCode: result.code, fixtureShip: saved.effective_grade.ship, verdicts, scriptedJudgeRequests: judgeCalls });
    }
    await save('pipeline.json', pipeline);
  }
  assert.equal(await readFile(join(work, 'release.txt'), 'utf8'), source);
  assert.deepEqual((await readdir(work)).sort(), ['release.txt']);
  const network = await Promise.all((await readdir(guards)).map(file => readFile(join(guards, file), 'utf8').then(JSON.parse)));
  assert.ok(network.length > 0); assert.ok(network.every(item => item.blocked === 0));
  for (const item of network) {
    let gone = false; try { process.kill(item.pid, 0); } catch (error) { gone = error.code === 'ESRCH'; }
    assert.equal(gone, true, `Observed child ${item.pid} still exists`);
  }
  await save('requests.json', requests);
  await save('processes.json', processReceipts);
  await save('network.json', network);
  const files = [];
  for (const file of await readdir(output)) if (file.endsWith('.jsonl')) files.push({ file, sha256: digest(await readFile(join(output, file))) });
  await save('qualification.json', { schema: 1, status: 'passed', stage, producer: '@earendil-works/pi-coding-agent@1.4.0', versions, node: process.version,
    harnessVersion: JSON.parse(await readFile(join(harness, 'package.json'))).version, runs, files,
    scriptedRequests: requests.length, realProviderCalls: 0, unchangedSource: true, allDirectProcessGroupsGone: processReceipts.every(item => item.groupGone), allObservedProcessesGone: true,
    networkGuard: 'application-level single-loopback-endpoint', blockedNetworkAttempts: 0, isolatedHome: true,
    limits: ['Scripted answers and grades do not qualify model quality or authentication.', 'Green checks description discovery, not autonomous skill selection.',
      'No OS network containment, governed Daddy child, real MCP server or provider performance claim.'],
    captureSources: await Promise.all(['capture.mjs', 'network-guard.mjs'].map(async file => ({ file, sha256: digest(await readFile(join(fixtureDir, file))) }))) });
  console.log(JSON.stringify({ status: 'passed', stage, output, scriptedRequests: requests.length, realProviderCalls: 0 }));
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
