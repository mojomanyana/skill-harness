import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface DiscoveredSkill {
  name: string; // directory name
  dir: string; // absolute path to the skill dir
  hasSpec: boolean; // tests/specification.yaml exists
  specPath: string; // path it would live at (whether or not it exists)
}

/**
 * Scan a skills root. A "skill" is any immediate subdirectory containing a
 * SKILL.md. It is testable iff `<skill>/tests/specification.yaml` exists.
 * Returns skills sorted by name (testable or not).
 *
 * `dir` and `specPath` are ABSOLUTE, whatever `root` was. They are handed to child
 * processes that run in a neutral cwd of the harness's choosing (`pi --skill
 * <dir>`), so a relative `--skills .` used to produce a path that resolved to
 * nothing over there — and pi accepts a nonexistent `--skill` path silently, exit 0
 * and a normal answer. The adapter refuses such a path too (see requireSkillDir),
 * but the honest fix is here, where the path is built.
 */
export function discover(root: string): DiscoveredSkill[] {
  const absRoot = resolve(root);
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new Error(`skills root is not a directory: ${root}`);
  }
  const skills: DiscoveredSkill[] = [];
  for (const name of readdirSync(absRoot)) {
    if (name.startsWith(".")) continue;
    const dir = join(absRoot, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "SKILL.md"))) continue;
    const specPath = join(dir, "tests", "specification.yaml");
    skills.push({ name, dir, hasSpec: existsSync(specPath), specPath });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Resolve a single skill by name; throws a helpful error if absent or specless.
 * A directory that exists but lacks a SKILL.md gets a specific error (rather than
 * the generic "no skill") so callers don't reimplement the SKILL.md existence check.
 */
export function resolveSkill(root: string, name: string): DiscoveredSkill {
  const skill = discover(root).find((s) => s.name === name);
  if (!skill) {
    const dir = join(resolve(root), name);
    if (existsSync(dir) && statSync(dir).isDirectory() && !existsSync(join(dir, "SKILL.md"))) {
      throw new Error(`skill \`${name}\` has no SKILL.md (looked in ${dir})`);
    }
    throw new Error(`no skill \`${name}\` under ${root}`);
  }
  return skill;
}
