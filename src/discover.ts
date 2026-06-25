import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
 */
export function discover(root: string): DiscoveredSkill[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`skills root is not a directory: ${root}`);
  }
  const skills: DiscoveredSkill[] = [];
  for (const name of readdirSync(root)) {
    if (name.startsWith(".")) continue;
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "SKILL.md"))) continue;
    const specPath = join(dir, "tests", "specification.yaml");
    skills.push({ name, dir, hasSpec: existsSync(specPath), specPath });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** Resolve a single skill by name; throws a helpful error if absent or specless. */
export function resolveSkill(root: string, name: string): DiscoveredSkill {
  const skill = discover(root).find((s) => s.name === name);
  if (!skill) {
    throw new Error(`no skill \`${name}\` under ${root}`);
  }
  return skill;
}
