import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, mkdir, rename, realpath } from 'node:fs/promises';
import { tmpdir, devNull } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const modulePath = fileURLToPath(new URL('./prepare.mjs', import.meta.url));
const gitEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' };
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-C', cwd, ...args], { env: gitEnv, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const run = (destination, env = gitEnv) => spawnSync(process.execPath, [modulePath, destination], { env, encoding: 'utf8', timeout: 30000 });
async function hashes(root, prefix = '') {
  const result = {};
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, await hashes(root, relative));
    else if (entry.isFile()) result[relative] = createHash('sha256').update(await readFile(join(root, relative))).digest('hex');
  }
  return result;
}

test('new labs isolate Git routing, preserve existing destinations and use fresh resource identities', async t => {
  const parent = await mkdtemp(join(tmpdir(), 'service-desk-preparer-'));
  const foreign = join(parent, 'existing-repo');
  await mkdir(foreign);
  git(foreign, 'init', '--initial-branch=main');
  await writeFile(join(foreign, 'sentinel.txt'), 'Existing unrelated work\n');
  git(foreign, 'add', '--', 'sentinel.txt');
  git(foreign, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${devNull}`, 'commit', '-m', 'Foreign fixture');
  const foreignBefore = await hashes(foreign);
  const destination = join(parent, 'lab');
  const inherited = { ...gitEnv, GIT_DIR: join(foreign, '.git'), GIT_WORK_TREE: foreign, GIT_COMMON_DIR: join(foreign, '.git'), GIT_INDEX_FILE: join(foreign, '.git', 'index'), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true' };
  const prepared = run(destination, inherited);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.deepEqual(await hashes(foreign), foreignBefore, 'Caller Git environment must not mutate an existing repository');
  const manifest = JSON.parse(prepared.stdout);
  assert.equal(manifest.seedCommits, 3);
  assert.equal(new Set(manifest.roots.map(row => dirname(row.path))).size, 3);
  for (const row of manifest.roots) {
    assert.equal(await realpath(git(row.path, 'rev-parse', '--show-toplevel')), row.path);
    assert.equal(await realpath(git(row.path, 'rev-parse', '--absolute-git-dir')), await realpath(join(row.path, '.git')));
    assert.equal(git(row.path, 'status', '--porcelain'), '');
    assert.equal(git(row.path, 'rev-parse', 'HEAD'), row.head);
  }
  for (const row of manifest.inventory) assert.equal(createHash('sha256').update(await readFile(join(destination, row.path))).digest('hex'), row.sha256);
  await writeFile(join(destination, 'keep.txt'), 'Keep existing product work\n');
  const before = await hashes(destination);
  assert.notEqual(run(destination).status, 0);
  assert.deepEqual(await hashes(destination), before);
  assert.notEqual(run('relative-destination').status, 0);
  const archived = join(parent, 'retained-lab');
  await rename(destination, archived);
  const recreated = run(destination);
  assert.equal(recreated.status, 0, recreated.stderr);
  assert.notEqual(JSON.parse(recreated.stdout).composeProject, manifest.composeProject, 'Reusing a path must not reuse old Docker resource names');
  assert.deepEqual(await hashes(archived), before);
  assert.deepEqual(await hashes(foreign), foreignBefore);
  t.diagnostic(`Synthetic fixtures retained at ${parent}; no Docker or model calls.`);
});
