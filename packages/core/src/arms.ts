import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";

/**
 * An arm: a named bundle of harness-side conditions a run is measured under.
 *
 * Why arms live HERE and not in `specification.yaml`. An arm is meant to be
 * A/B'd — the control and the treatment must be the same experiment run twice.
 * Declaring it in the spec would move the spec digest, which both stales every
 * committed run in the corpus and makes control and treatment textually
 * different experiments. So `arms.yaml` is deliberately part of NO digest, and
 * the arm is carried in the run-dir TAG instead: `lint` and `stability` key on
 * the tag, so two arms are separate lineages that can never be misread as one
 * lineage flipping its verdict run-over-run.
 */
export interface Arm {
  name: string;
  /** Absolute paths, one `--extension` each. */
  extensions: string[];
  /** Dirs (relative to the skills root) copied into `<workspace>/.pi/skills/`. */
  seedSkills: string[];
  /** Minimum definitions the seeding must produce, else the run ERRORs. */
  requireDefinitions: number;
  /** Env for the subject process. `<run-dir>` is substituted per run. */
  env: Record<string, string>;
}

/** The implicit control: today's behaviour, byte-identical, no extensions. */
export const NONE_ARM: Arm = { name: "none", extensions: [], seedSkills: [], requireDefinitions: 0, env: {} };

/** `none` is the control's name; an arm may not shadow it. */
const RESERVED = new Set(["none"]);

/**
 * Arm names become a path segment, so they are restricted to what survives one
 * unambiguously — no separators, no dots, nothing needing quoting.
 */
const NAME_RE = /^[A-Za-z0-9_-]+$/;

function expandHome(p: string): string {
  return p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p;
}

/** `<skills-root>/tests/arms.yaml`, or an empty map when the corpus declares none. */
export function loadArms(skillsRoot: string): Map<string, Arm> {
  const file = join(skillsRoot, "tests", "arms.yaml");
  const out = new Map<string, Arm>();
  if (!existsSync(file)) return out;

  const doc = yaml.load(readFileSync(file, "utf8")) as { arms?: unknown } | null;
  const raw = Array.isArray(doc?.arms) ? (doc!.arms as Record<string, unknown>[]) : [];

  for (const entry of raw) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!NAME_RE.test(name)) {
      throw new Error(`${file}: arm name \`${name}\` must match ${NAME_RE} — it becomes a run-directory segment`);
    }
    if (RESERVED.has(name)) throw new Error(`${file}: arm name \`${name}\` is reserved for the implicit control`);
    if (out.has(name)) throw new Error(`${file}: two arms are both named \`${name}\``);

    const extensions = (Array.isArray(entry.extensions) ? entry.extensions : []).map((p) => {
      const expanded = expandHome(String(p));
      const abs = isAbsolute(expanded) ? expanded : resolve(skillsRoot, expanded);
      // Same refusal `extensionFlags` makes, made earlier and for the same reason:
      // pi would start without it and the scenario would silently test an agent
      // with no delegation tool at all.
      if (!existsSync(abs)) {
        throw new Error(`${file}: arm \`${name}\` names extension ${abs}, which does not exist — pi would start without it`);
      }
      return abs;
    });

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries((entry.env ?? {}) as Record<string, unknown>)) env[k] = String(v);

    out.set(name, {
      name,
      extensions,
      seedSkills: (Array.isArray(entry.seed_skills) ? entry.seed_skills : []).map(String),
      requireDefinitions: Number(entry.require_definitions ?? 0) || 0,
      env,
    });
  }
  return out;
}

/** The named arm, or the control when no `--arm` was given. */
export function resolveArm(skillsRoot: string, name: string | null): Arm {
  if (!name || name === NONE_ARM.name) return NONE_ARM;
  const arms = loadArms(skillsRoot);
  const arm = arms.get(name);
  if (!arm) {
    const known = [...arms.keys()];
    throw new Error(
      `unknown arm \`${name}\` — ${known.length ? `declared arms: ${known.join(", ")}` : `no arms declared in ${join(skillsRoot, "tests", "arms.yaml")}`}`,
    );
  }
  return arm;
}
