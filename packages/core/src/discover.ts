import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface DiscoveredSkill {
  name: string; // directory name
  dir: string; // absolute path to the skill dir
  testsDir: string; // absolute tests dir (under --specs when supplied)
  hasSpec: boolean; // tests/specification.yaml exists in exactly one root
  specPath: string; // selected path (or the --specs path when no spec exists)
  specSource: "skills" | "specs" | "both" | null;
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
export function discover(root: string, specsRoot?: string): DiscoveredSkill[] {
  const absRoot = resolve(root);
  if (!existsSync(absRoot) || !statSync(absRoot).isDirectory()) {
    throw new Error(`skills root is not a directory: ${root}`);
  }
  const absSpecsRoot = specsRoot ? resolve(specsRoot) : undefined;
  if (absSpecsRoot && (!existsSync(absSpecsRoot) || !statSync(absSpecsRoot).isDirectory())) {
    throw new Error(`specs root is not a directory: ${specsRoot}`);
  }
  const skills: DiscoveredSkill[] = [];
  for (const name of readdirSync(absRoot)) {
    if (name.startsWith(".")) continue;
    const dir = join(absRoot, name);
    if (!statSync(dir).isDirectory()) continue;
    if (!existsSync(join(dir, "SKILL.md"))) continue;
    const localSpecPath = join(dir, "tests", "specification.yaml");
    const overlayTestsDir = absSpecsRoot ? join(absSpecsRoot, name, "tests") : join(dir, "tests");
    const overlaySpecPath = join(overlayTestsDir, "specification.yaml");
    const local = existsSync(localSpecPath);
    const overlay = Boolean(absSpecsRoot && existsSync(overlaySpecPath));
    const specSource = local && overlay ? "both" : overlay ? "specs" : local ? "skills" : null;
    skills.push({
      name,
      dir,
      // An explicit --specs is authoritative. The local path is inspected only so
      // list can report it and duplicate specs can be refused rather than merged.
      testsDir: overlayTestsDir,
      hasSpec: absSpecsRoot ? overlay && !local : local,
      specPath: overlaySpecPath,
      specSource,
    });
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/**
 * Resolve a single skill by name; throws a helpful error if absent or specless.
 * A directory that exists but lacks a SKILL.md gets a specific error (rather than
 * the generic "no skill") so callers don't reimplement the SKILL.md existence check.
 */
export function resolveSkill(root: string, name: string, specsRoot?: string): DiscoveredSkill {
  const skill = discover(root, specsRoot).find((s) => s.name === name);
  if (!skill) {
    const dir = join(resolve(root), name);
    if (existsSync(dir) && statSync(dir).isDirectory() && !existsSync(join(dir, "SKILL.md"))) {
      throw new Error(`skill \`${name}\` has no SKILL.md (looked in ${dir})`);
    }
    throw new Error(`no skill \`${name}\` under ${root}`);
  }
  if (skill.specSource === "both") {
    throw new Error(`skill \`${name}\` has a specification.yaml in both --skills and --specs; remove one (specs are not merged)`);
  }
  return skill;
}
