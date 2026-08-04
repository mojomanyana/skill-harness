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
 * Separation from bare-path keys is conventional, not guaranteed: `scenario:A1`
 * is a legal POSIX filename, so nothing stops someone naming an agent file that.
 * In practice `system_prompt_file` and `post_test` values are ordinary relative
 * paths, and a `<name>:` prefix is reserved for this scheme. Old results carrying
 * only bare-path keys keep resolving exactly as before.
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

/**
 * Recorded in place of a hash when a source existed but could not be read.
 *
 * Omitting it instead — which is what an early version did — is the worst
 * available option: `lint` only ever iterates the keys a run recorded, so a
 * source dropped at record time is never compared again for the life of that
 * result. A fixture briefly unreadable during a run could then be replaced
 * wholesale and `lint` would still report 0 findings, which is verbatim the miss
 * this module was written to close.
 *
 * Not valid sha256 hex, so it can never equal a real digest and always surfaces.
 */
export const UNREADABLE = "unreadable";

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
  // Destructured, with the remainder pinned to `Record<string, never>`, so that
  // adding a field to `Scenario` or `SeededAssert` FAILS THE BUILD here instead of
  // silently escaping the digest. A field nobody remembered to add is a permanent
  // staleness blind spot — edit it and every published result still looks current,
  // which is precisely the bug this module exists to kill. This PR added two
  // SeededAssert fields and remembered both; that only proves the discipline works
  // while someone is looking, so the compiler now does the looking.
  const {
    id, title, critical, mode, turns, checklist, fixture, assert,
    workspace, remote, systemPromptFile, reps, passThreshold, ...restScenario
  } = s;
  const _scenarioExhaustive: Record<string, never> = restScenario;
  void _scenarioExhaustive;

  const { vitest, diff_contains, diff_excludes, post_test, ...restAssert } = assert ?? {};
  const _assertExhaustive: Record<string, never> = restAssert;
  void _assertExhaustive;

  const canonical = JSON.stringify([
    id,
    title,
    critical,
    mode,
    turns,
    checklist,
    fixture ?? null,
    assert ? [vitest ?? null, diff_contains ?? null, diff_excludes ?? null, post_test ?? null] : null,
    workspace,
    remote,
    systemPromptFile ?? null,
    reps ?? null,
    passThreshold ?? null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Absolute path a fixture key refers to. Fixtures resolve against the spec's dir, like workspace.ts. */
function fixtureAbs(specDir: string, fixture: string): string {
  return isAbsolute(fixture) ? fixture : resolve(specDir, fixture);
}

/**
 * The fixture path a scenario actually runs in, or undefined.
 *
 * The EFFECTIVE workspace fixture, which is not always `scenario.fixture`: an
 * inline scenario with `env.workspace: fixture:PATH` sets `workspace.fixture`
 * and leaves `scenario.fixture` unset. Exported and shared with lint, which
 * needs the identical rule — a second copy of this expression is how the hashed
 * set and the checked set drift apart.
 */
export function effectiveFixture(s: Scenario): string | undefined {
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

  // UNREADABLE rather than omission on every branch below: a source we failed to
  // hash must stay visible to lint, not vanish from the record. See UNREADABLE.
  hashes["SKILL.md"] = fileSha256(resolve(ctx.skillDir, "SKILL.md")) ?? UNREADABLE;

  for (const s of ctx.scenarios) {
    hashes[SCENARIO_PREFIX + s.id] = scenarioDigest(s);

    if (s.systemPromptFile && !(s.systemPromptFile in hashes)) {
      hashes[s.systemPromptFile] = fileSha256(resolve(ctx.specDir, s.systemPromptFile)) ?? UNREADABLE;
    }

    // The post-test IS the gate on a post_test scenario, and it lives outside the
    // fixture tree by convention (`fixture: fixtures/A1`, `post_test: post/A1.test.ts`),
    // so neither the fixture digest nor the scenario digest — which holds only the
    // path string — covers its contents. Tightening an assertion in it changes what
    // the scorecard measured; without this it would change nothing lint can see.
    const pt = s.assert?.post_test;
    if (pt && !(pt in hashes)) {
      hashes[pt] = fileSha256(isAbsolute(pt) ? pt : resolve(ctx.specDir, pt)) ?? UNREADABLE;
    }

    const fx = effectiveFixture(s);
    if (fx && !(FIXTURE_PREFIX + fx in hashes)) {
      hashes[FIXTURE_PREFIX + fx] = dirSha256(fixtureAbs(ctx.specDir, fx)) ?? UNREADABLE;
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
  if (key === "SKILL.md") return fileSha256(resolve(ctx.skillDir, "SKILL.md"));

  if (key.startsWith(SCENARIO_PREFIX)) {
    const id = key.slice(SCENARIO_PREFIX.length);
    const s = ctx.scenarios.find((x) => x.id === id);
    return s ? scenarioDigest(s) : undefined; // removed → reshape, not stale
  }

  if (key.startsWith(FIXTURE_PREFIX)) {
    return dirSha256(fixtureAbs(ctx.specDir, key.slice(FIXTURE_PREFIX.length)));
  }

  // A prefixed key this version doesn't know is written by a NEWER skill-harness.
  // Falling through to the path branch would resolve `agent:foo` as a filename,
  // find nothing, and report a confident "agent:foo no longer exists" — a wrong
  // finding about a source that is fine. Not comparable is the honest answer.
  if (/^[a-z][a-z0-9-]*:/.test(key)) return undefined;

  return fileSha256(resolve(ctx.specDir, key)); // system_prompt_file, post_test
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
