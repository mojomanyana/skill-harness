import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, dirname, basename, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { devNull } from 'node:os';
import { execFileSync } from 'node:child_process';

const source = dirname(fileURLToPath(import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const layouts = [
  ['web', 'clients/service-desk-web'],
  ['api', 'services/service-desk-api'],
  ['contracts', 'packages/service-desk-contracts'],
];

export async function prepare(destination) {
  if (!destination || !isAbsolute(destination)) throw Error('Choose a new absolute lab directory.');
  const requested = resolve(destination);
  const parent = await realpath(dirname(requested));
  const root = join(parent, basename(requested));
  if (root === parent) throw Error('The lab must be a new child directory.');
  // Repository/config overrides from the caller must never redirect a seed operation.
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  gitEnv.GIT_CONFIG_GLOBAL = devNull;
  gitEnv.GIT_CONFIG_NOSYSTEM = '1';
  execFileSync('git', ['--version'], { env: gitEnv, encoding: 'utf8', timeout: 10000 });
  // Validate every input before creating anything. Existing destinations are never reused.
  const inputs = await Promise.all(['brief.txt', 'follow-up.txt', 'acceptance.json'].map(async name =>
    ({ name, bytes: await readFile(join(source, name)) })));
  JSON.parse(inputs.find(input => input.name === 'acceptance.json').bytes.toString('utf8'));
  await mkdir(root);
  const emptyTemplate = join(root, 'context', '.git-template');
  const git = (cwd, args) => execFileSync('git', ['-C', cwd, '-c', `core.hooksPath=${emptyTemplate}`, '-c', 'core.fsmonitor=false', ...args],
    { env: gitEnv, encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const roots = [];
  const inventory = [];
  await mkdir(join(root, 'context'));
  await mkdir(emptyTemplate);
  for (const { name, bytes } of inputs) {
    const relative = 'context/' + name;
    await writeFile(join(root, relative), bytes, { flag: 'wx' });
    inventory.push({ path: relative, sha256: sha(bytes) });
  }
  for (const [role, relative] of layouts) {
    const directory = join(root, relative);
    await mkdir(directory, { recursive: true });
    const contents = {
      'README.md': `# Service desk ${role}\n\nSynthetic empty trial baseline. Product requirements live in the lab context directory.\n`,
      '.gitignore': 'node_modules/\ndist/\ncoverage/\n.env\n.env.*\n!.env.example\n.pi/\n.principal/\n.skill-harness/\n',
    };
    for (const [name, text] of Object.entries(contents)) {
      await writeFile(join(directory, name), text, { flag: 'wx' });
      inventory.push({ path: relative + '/' + name, sha256: sha(text) });
    }
    git(directory, ['init', '--template=' + emptyTemplate, '--initial-branch=codex/service-desk-trial']);
    const actualRoot = await realpath(git(directory, ['rev-parse', '--show-toplevel']));
    const actualGit = await realpath(git(directory, ['rev-parse', '--absolute-git-dir']));
    if (actualRoot !== await realpath(directory) || actualGit !== await realpath(join(directory, '.git'))) {
      throw Error('Git repository identity differs from the new seed directory; no files were staged.');
    }
    git(directory, ['add', '--', 'README.md', '.gitignore']);
    git(directory, ['-c', 'user.name=Harness Product Trial', '-c', 'user.email=trial@example.invalid',
      '-c', 'commit.gpgsign=false',
      'commit', '-m', 'Seed synthetic service-desk trial']);
    roots.push({ role, relative, path: await realpath(directory), head: git(directory, ['rev-parse', 'HEAD']) });
  }
  const manifest = { schema: 1, status: 'prepared-not-run', root,
    composeProject: 'desk-' + randomBytes(8).toString('hex'), roots, inventory,
    productImplemented: false, workspaceAuthority: 'not-granted-by-preparation',
    modelCalls: 0, servicesStarted: false, seedCommits: roots.length };
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) {
    process.stderr.write('Usage: node prepare.mjs /absolute/path/to/NEW-lab\n');
    process.exitCode = 1;
  } else {
    prepare(process.argv[2]).then(result => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
      .catch(error => { process.stderr.write(`Preparation stopped: ${error.message}\nNo existing destination was overwritten. Inspect any new partial lab before retrying.\n`); process.exitCode = 1; });
  }
}
