import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
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
  /** Env for the subject process. `<run-dir>` and `<workspace>` are substituted per rep. */
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

/**
 * `realpathSync(p)`, or `p` when it cannot be resolved.
 *
 * A path that does not exist has no real path, and refusing here would replace
 * the two callers' specific messages ("outside the skills root", "cannot be read
 * — pi would start with nothing to spawn") with a bare ENOENT. The lexical path
 * is the strictly safer fallback for the containment check: an absent path
 * cannot be a symlink out of the corpus.
 */
function realpathOr(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * `require_definitions`, refusing anything that is not a non-negative integer.
 *
 * A tolerant `Number(x) || 0` reads `require_definitions: six` (and any value
 * YAML hands over as a string) as 0, which does not disable a typo — it disables
 * the REFUSAL the key exists to make, so an arm that seeds nothing runs green and
 * measures nothing. The one failure mode this key defends against is the one a
 * silent default reintroduces.
 */
function parseRequireDefinitions(file: string, name: string, raw: unknown): number {
  if (raw === undefined || raw === null) return 0;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(
      `${file}: arm \`${name}\` require_definitions is ${JSON.stringify(raw)} — it must be a non-negative integer, ` +
        `and a value that silently read as 0 would disable the refusal it exists to make.`,
    );
  }
  return n;
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

    // Resolved here, but NOT existence-checked here: `loadArms` reads every
    // declared arm, so validating all of them would make one arm's
    // machine-specific path (the corpus's `pi-daddy` points into a checkout that
    // exists on one box) fail `--arm <some-other-arm>` — and `resolveArm`'s
    // "unknown arm" message — for an arm the caller never asked for. The refusal
    // moved to `resolveArm`, where only the SELECTED arm is checked.
    const extensions = (Array.isArray(entry.extensions) ? entry.extensions : []).map((p) => {
      const expanded = expandHome(String(p));
      return isAbsolute(expanded) ? expanded : resolve(skillsRoot, expanded);
    });

    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries((entry.env ?? {}) as Record<string, unknown>)) {
      // A nested object/array value stringifies as the literal text
      // "[object Object]" (or a comma-joined array) via `String(v)`, which would
      // reach the subject process as a corrupted env var with no indication
      // anything went wrong. Refused instead — env values must be scalars.
      if (v !== null && typeof v === "object") {
        throw new Error(`${file}: arm \`${name}\` env.${k} is not a scalar value — got ${JSON.stringify(v)}`);
      }
      env[k] = String(v);
    }

    out.set(name, {
      name,
      extensions,
      seedSkills: (Array.isArray(entry.seed_skills) ? entry.seed_skills : []).map(String),
      requireDefinitions: parseRequireDefinitions(file, name, entry.require_definitions),
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
  // Same refusal `extensionFlags` makes, made earlier and for the same reason:
  // pi accepts a missing `--extension` path by starting without it, so the
  // scenario would silently test an agent with no delegation tool at all.
  for (const abs of arm.extensions) {
    if (!existsSync(abs)) {
      throw new Error(`arm \`${arm.name}\` names extension ${abs}, which does not exist — pi would start without it`);
    }
  }
  return arm;
}

/** pi's second skill root, which pi-daddy reads too. */
function defaultAmbientSkillsDir(): string {
  return join(homedir(), ".pi", "agent", "skills");
}

/**
 * Copy an arm's definitions into `<workspace>/.pi/skills/` and return the count.
 *
 * Three refusals, each with a negative control in the suite, because a
 * positive-only check measures less than it claims:
 *
 *  1. **Fewer definitions than required.** pi-daddy spawns definitions by path.
 *     Zero definitions means the arm has nothing to spawn, so it would run green
 *     and measure nothing — a vacuous result shaped exactly like a finding.
 *  2. **A missing seed directory** — the `--skill <nonexistent>` class: pi accepts
 *     silently, so the run would look fine and measure a different thing.
 *  3. **A non-empty ambient skills root.** pi-daddy reads `~/.pi/agent/skills` as
 *     well as the workspace, so anything there is an uncontrolled variable in the
 *     measurement. Empty on the reference box today — that is luck, not a
 *     guarantee, and this check is what turns it into one. It runs for any
 *     non-control arm, even one that declares no `seed_skills` — pi-daddy
 *     reads that root independently of whether the workspace was seeded, so
 *     an arm can't opt out of the guarantee just by not seeding.
 */
export function seedArmDefinitions(
  arm: Arm,
  skillsRoot: string,
  workspaceCwd: string,
  opts: { ambientSkillsDir?: string } = {},
): number {
  // The control arm loads no extension at all, so nothing can read the
  // ambient root on its behalf — it's the only arm exempt from the check
  // below. Every other arm must pass it even when it declares no
  // seed_skills: pi-daddy reads ~/.pi/agent/skills independently of seeding,
  // so an arm that loads pi-daddy via `extensions` alone must not be able to
  // skip the guarantee that root is empty.
  if (arm.name === NONE_ARM.name) return 0;

  const ambient = opts.ambientSkillsDir ?? defaultAmbientSkillsDir();
  let ambientEntries: string[] = [];
  try {
    ambientEntries = readdirSync(ambient);
  } catch (err) {
    // Absent is as good as empty: nothing can leak from a directory that
    // isn't there. Anything else (e.g. EACCES) is not equivalent to empty —
    // it means we couldn't verify the guarantee, so it must surface, not be
    // silently read as "clean".
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      ambientEntries = [];
    } else {
      throw new Error(
        `arm \`${arm.name}\`: could not read the ambient skill root ${ambient}: ${(err as Error).message} — ` +
          `pi-daddy reads it as well as the workspace, so this can't be verified empty.`,
      );
    }
  }
  if (ambientEntries.length > 0) {
    throw new Error(
      `arm \`${arm.name}\`: the ambient skill root ${ambient} is not empty (${ambientEntries.slice(0, 5).join(", ")}) — ` +
        `pi-daddy reads it as well as the workspace, so those definitions would be an uncontrolled variable in the measurement. ` +
        `Move them aside for the run.`,
    );
  }

  // Checked BEFORE the early return below, not after: an empty (or vacuously
  // typo'd — `seed_skill:` instead of `seed_skills:`) list must hit the same
  // `require_definitions` refusal as a directory that seeds too few. This is
  // the same bypass shape the ambient-root check above was already hoisted to
  // avoid — an arm with `require_definitions: 6` and no `seed_skills` would
  // otherwise seed 0, return early, and run tagged `+pi-daddy` with nothing to
  // spawn: the exact vacuous arm this refusal exists to prevent.
  if (arm.seedSkills.length === 0) {
    if (arm.requireDefinitions > 0) {
      throw new Error(
        `arm \`${arm.name}\`: seeded 0 definition(s) (no \`seed_skills\` declared) but require_definitions is ${arm.requireDefinitions} — ` +
          `pi-daddy would have nothing to spawn, and the arm would measure nothing while looking green.`,
      );
    }
    return 0;
  }

  const dest = join(workspaceCwd, ".pi", "skills");
  mkdirSync(dest, { recursive: true });

  // `realpathSync` and not `resolve`: `resolve` is pure lexical arithmetic on the
  // path string, so a `seed_skills` entry naming a SYMLINK inside the corpus that
  // points outside it passes a `startsWith` check on the lexical path and seeds
  // from outside the corpus anyway — the containment guarantee held for `../..`
  // and not for the equivalent written as a link.
  const resolvedRoot = realpathOr(resolve(skillsRoot));
  const seen = new Set<string>();
  for (const rel of arm.seedSkills) {
    const src = realpathOr(resolve(skillsRoot, rel));
    // `seed_skills` entries are meant to name directories WITHIN the corpus —
    // `resolve(skillsRoot, "../..")` is accepted by `resolve()` without complaint,
    // and would seed the workspace from whatever happens to sit outside the
    // corpus root. Refused rather than silently followed.
    if (src !== resolvedRoot && !src.startsWith(resolvedRoot + sep)) {
      throw new Error(
        `arm \`${arm.name}\`: seed_skills entry ${JSON.stringify(rel)} resolves to ${src}, which is outside the skills root ${resolvedRoot} — refusing to seed from outside the corpus`,
      );
    }
    let names: string[];
    try {
      names = readdirSync(src);
    } catch {
      throw new Error(`arm \`${arm.name}\`: seed_skills names ${src}, which cannot be read — pi would start with nothing to spawn`);
    }
    for (const name of names) {
      const from = join(src, name);
      if (!name.endsWith(".md")) continue;
      let isFile: boolean;
      try {
        isFile = statSync(from).isFile();
      } catch (err) {
        // A dangling symlink (or a file removed between readdir and stat) throws
        // here uncaught otherwise — an unclassified crash instead of a message
        // naming the offending file.
        throw new Error(
          `arm \`${arm.name}\`: seed_skills entry ${JSON.stringify(rel)} contains ${from}, which cannot be read (${(err as Error).message}) — likely a dangling symlink`,
        );
      }
      if (!isFile) continue;
      // `dest` is ONE flat directory, so two seed dirs shipping the same basename
      // resolve to the same destination path: the second copy silently overwrites
      // the first. Counting copies rather than files then lets `require_definitions:
      // 6` be satisfied by 6 copies that left 3 files on disk — the vacuous arm the
      // refusal exists to prevent, reached through the refusal itself. Refused,
      // because the alternative is that whichever entry is listed last wins and
      // nothing says so.
      if (seen.has(name)) {
        throw new Error(
          `arm \`${arm.name}\`: two seed_skills entries both provide \`${name}\` (latest: ${from}) — ` +
            `they are copied into the one flat directory ${dest}, so one would silently overwrite the other. ` +
            `Rename one, or drop the duplicate entry.`,
        );
      }
      seen.add(name);
      copyFileSync(from, join(dest, name));
    }
  }

  // Distinct definitions ON DISK, which is what pi-daddy can actually spawn.
  const count = seen.size;
  if (count < arm.requireDefinitions) {
    throw new Error(
      `arm \`${arm.name}\`: seeded ${count} definition(s) into ${dest} but require_definitions is ${arm.requireDefinitions} — ` +
        `pi-daddy would have nothing (or too little) to spawn, and the arm would measure nothing while looking green.`,
    );
  }
  return count;
}
