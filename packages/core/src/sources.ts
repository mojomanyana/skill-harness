import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { Scenario } from "./spec.js";

/**
 * What a run measured, as a map of `key -> sha256`, recorded in results.yaml so
 * lint can prove a published result still describes the current inputs.
 *
 * A run measures more than the skill text. It measures the SKILL.md, any agent
 * file, **the scenario definition itself** (turns, checklist, gates) and **the
 * fixture** the scenario starts from. Hashing only the first two — which is what
 * shipped through 0.2.1 — meant editing a checklist or swapping a fixture left
 * every published result looking current.
 *
 * ## Key scheme
 *
 * | key | means |
 * |---|---|
 * | `SKILL.md` | the skill text, resolved against the skill dir |
 * | `scenario:<id>` | the semantic content of one scenario in the spec |
 * | `fixture:<path>` | every file under one fixture dir |
 * | anything else | a file path resolved against the spec's dir (`system_prompt_file`) |
 *
 * The prefixed forms cannot collide with a relative path key, because a
 * `system_prompt_file` is a path and `:` is not a path separator here. Old
 * results carrying only bare-path keys keep resolving exactly as before.
 *
 * ## Why per-scenario, not one hash of specification.yaml
 *
 * Hashing the whole spec file would mark **every** historical run stale the
 * moment a spec grows by one scenario — the precise noise `lint`'s scenario-set
 * check already exists to prevent ("a spec reshape must not consistency-flag
 * every historical run"). A per-scenario digest says what actually changed:
 * editing A1's checklist marks A1 stale and leaves A2 alone; appending a new
 * scenario marks nothing stale, because nothing already measured changed.
 *
 * It also ignores formatting: the digest is built from the *parsed* scenario, so
 * reindenting the YAML or reordering scenarios is correctly a no-op, while
 * changing a single checklist word is correctly a change.
 */
export const SCENARIO_PREFIX = "scenario:";
export const FIXTURE_PREFIX = "fixture:";

/** sha256 of a file, or null when it doesn't exist / isn't readable. */
export function fileSha256(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Stable sha256 over a directory tree: every file's relative path (POSIX-slashed,
 * sorted) and contents. Null if the directory is missing or unreadable.
 *
 * Sorting is what makes it stable — readdir order is filesystem-dependent, so an
 * unsorted walk would produce different digests for identical trees on different
 * machines and turn CI into a staleness alarm. Paths are hashed alongside
 * contents so that renaming a fixture file is a change, and separators are
 * normalised so a Linux-recorded hash still matches on Windows.
 */
export function dirSha256(dir: string): string | null {
  let files: string[];
  try {
    files = walk(dir).sort();
  } catch {
    return null;
  }
  const h = createHash("sha256");
  for (const rel of files) {
    h.update(rel);
    h.update("\0");
    try {
      h.update(readFileSync(join(dir, rel)));
    } catch {
      return null; // a file that vanished mid-walk makes the whole digest untrustworthy
    }
    h.update("\0");
  }
  return h.digest("hex");
}

/** Relative POSIX paths of every file under `dir`, recursively. Throws if `dir` is unreadable. */
function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...walk(join(dir, e.name), rel));
    } else if (e.isFile()) {
      out.push(rel);
    }
    // symlinks/sockets/etc. are deliberately skipped: a fixture is plain files,
    // and following links could hash something outside the fixture entirely.
  }
  return out;
}

/**
 * A scenario's semantic digest: everything that changes what the scenario
 * measures, and nothing that doesn't.
 *
 * Built from the parsed scenario rather than its YAML text, so formatting is
 * irrelevant. `critical` is included because it changes whether the scenario can
 * block a ship; `title` is included because it is what a reader of the scorecard
 * believes was tested.
 */
export function scenarioDigest(s: Scenario): string {
  const canonical = JSON.stringify([
    s.id,
    s.title,
    s.critical,
    s.mode,
    s.turns,
    s.checklist,
    s.fixture ?? null,
    s.assert
      ? [s.assert.vitest ?? null, s.assert.diff_contains ?? null, s.assert.diff_excludes ?? null, s.assert.post_test ?? null]
      : null,
    s.workspace,
    s.remote,
    s.systemPromptFile ?? null,
    s.reps ?? null,
    s.passThreshold ?? null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Absolute path a fixture key refers to. Fixtures resolve against the spec's dir, like workspace.ts. */
function fixtureAbs(specDir: string, fixture: string): string {
  return isAbsolute(fixture) ? fixture : resolve(specDir, fixture);
}

/** The fixture path a scenario actually runs in, or undefined. Mirrors lint's effective-workspace rule. */
function effectiveFixture(s: Scenario): string | undefined {
  return typeof s.workspace === "object" && s.workspace !== null ? s.workspace.fixture : undefined;
}

export interface SourceContext {
  skillDir: string;
  specDir: string; // dirname(specPath)
  scenarios: Scenario[];
}

/**
 * Hash every source this run measures: SKILL.md, each distinct
 * `system_prompt_file`, each scenario's definition, and each distinct fixture
 * tree. Entries that can't be read are omitted — a missing source is lint's
 * problem to report, not run's to crash on.
 */
export function sourceHashes(ctx: SourceContext): Record<string, string> {
  const hashes: Record<string, string> = {};

  const skillMd = fileSha256(resolve(ctx.skillDir, "SKILL.md"));
  if (skillMd) hashes["SKILL.md"] = skillMd;

  for (const s of ctx.scenarios) {
    hashes[SCENARIO_PREFIX + s.id] = scenarioDigest(s);

    if (s.systemPromptFile && !(s.systemPromptFile in hashes)) {
      const h = fileSha256(resolve(ctx.specDir, s.systemPromptFile));
      if (h) hashes[s.systemPromptFile] = h;
    }

    const fx = effectiveFixture(s);
    if (fx && !(FIXTURE_PREFIX + fx in hashes)) {
      const h = dirSha256(fixtureAbs(ctx.specDir, fx));
      if (h) hashes[FIXTURE_PREFIX + fx] = h;
    }
  }
  return hashes;
}

/**
 * The current hash for a recorded key, or null when the source is gone.
 *
 * `undefined` is distinct from `null` and means "not comparable": the key names a
 * scenario the spec no longer has. That is a spec *reshape*, not staleness — the
 * same stance lint's scenario-set check already takes — so the caller stays quiet
 * rather than reporting a removed scenario as a stale measurement.
 *
 * Sharing this resolver with `sourceHashes` is what keeps recording and checking
 * from drifting: a new key kind is defined once, for both sides.
 */
export function currentHashFor(key: string, ctx: SourceContext): string | null | undefined {
  if (key === "SKILL.md") return fileSha256(join(ctx.skillDir, "SKILL.md"));

  if (key.startsWith(SCENARIO_PREFIX)) {
    const id = key.slice(SCENARIO_PREFIX.length);
    const s = ctx.scenarios.find((x) => x.id === id);
    return s ? scenarioDigest(s) : undefined; // removed → reshape, not stale
  }

  if (key.startsWith(FIXTURE_PREFIX)) {
    return dirSha256(fixtureAbs(ctx.specDir, key.slice(FIXTURE_PREFIX.length)));
  }

  return fileSha256(resolve(ctx.specDir, key)); // system_prompt_file
}

/** Human label for a recorded key, used in lint messages. */
export function describeSourceKey(key: string): string {
  if (key.startsWith(SCENARIO_PREFIX)) return `scenario \`${key.slice(SCENARIO_PREFIX.length)}\``;
  if (key.startsWith(FIXTURE_PREFIX)) return `fixture \`${key.slice(FIXTURE_PREFIX.length)}\``;
  return key;
}

/** The scenario id a key belongs to, for per-scenario lint findings. Undefined for skill-wide keys. */
export function scenarioIdForKey(key: string, scenarios: Scenario[]): string | undefined {
  if (key.startsWith(SCENARIO_PREFIX)) return key.slice(SCENARIO_PREFIX.length);
  if (key.startsWith(FIXTURE_PREFIX)) {
    const fx = key.slice(FIXTURE_PREFIX.length);
    const owners = scenarios.filter((s) => effectiveFixture(s) === fx);
    // Only attribute a shared fixture to a scenario when exactly one owns it —
    // naming an arbitrary one of several would misdirect the re-run.
    return owners.length === 1 ? owners[0].id : undefined;
  }
  return undefined;
}
