import { closeSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

/** Resolve configuration only. Declining storage must never create collection directories. */
export function resolveDataRoot({env=process.env, home=homedir(), override} = {}) {
  const value = override !== undefined ? override : env.SKILL_HARNESS_DATA_ROOT !== undefined
    ? env.SKILL_HARNESS_DATA_ROOT : join(home, '.skill-harness');
  if (typeof value !== 'string' || !value.trim() || /[\p{Cc}\p{Cf}]/u.test(value) || !isAbsolute(value))
    throw new TypeError('Skill Harness data root must be a nonempty absolute path');
  return resolve(value);
}
/** Preserve existing permissions; reject links rather than chmod or redirect an existing tree. */
export function ensurePrivateDirectory(path) {
  const directory = resolveDataRoot({override:path});
  const anchor = parse(directory).root;
  let current = anchor;
  for (const part of relative(anchor, directory).split(sep).filter(Boolean)) {
    current = join(current, part);
    try { mkdirSync(current, {mode:0o700}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    const info = lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Skill Harness collection path must contain ordinary directories, not links');
  }
  const info = lstatSync(directory);
  if (process.platform !== 'win32' && ((info.mode & 0o077) !== 0 ||
      (process.getuid && info.uid !== process.getuid())))
    throw new Error('Skill Harness collection directory must be owned by the current user with mode 0700');
  return directory;
}
export function writePrivateNew(path, bytes) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
}
export function createSessionCollection(root, kind, sessionId) {
  if (!['jev-workflow','jev-manual'].includes(kind)) throw new TypeError('Unsupported collection kind');
  if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 256 ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(sessionId))
    throw new TypeError('Collection requires an explicit valid session identity');
  const base = ensurePrivateDirectory(root);
  const family = ensurePrivateDirectory(join(base, kind));
  const session = ensurePrivateDirectory(join(family, `session-${createHash('sha256').update(sessionId).digest('hex')}`));
  return mkdtempSync(join(session, kind === 'jev-workflow' ? 'selection-' : 'run-'));
}
