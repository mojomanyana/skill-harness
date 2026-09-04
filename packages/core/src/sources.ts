import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import type { Scenario } from "./spec.js";
import { PROMPT_NORMALIZATION_SOURCE_DIGEST, PROMPT_NORMALIZATION_SOURCE_KEY } from "./prompt-normalization.js";
export { PROMPT_NORMALIZATION_SOURCE_DIGEST, PROMPT_NORMALIZATION_SOURCE_KEY } from "./prompt-normalization.js";

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
/**
 * The pre-0.4.0 combined key: one digest over a scenario's stimulus, rubric, policy
 * and gates together. Still read (runs recorded with it must keep comparing), never
 * written. See `scenarioDigest`.
 */
export const SCENARIO_PREFIX = "scenario:";
export const FIXTURE_PREFIX = "fixture:";

/**
 * The split: three (four, with gates) digests per scenario, each mapped to the
 * cheapest tool that can honestly restore freshness.
 *
 * | key | contents | drift means | remedy |
 * |---|---|---|---|
 * | `stimulus:<id>` | mode, turns, workspace, remote, agent-file path, fixture path, `assert.vitest`, `post_test` path | the transcripts answer a different question | `run` (model + judge) |
 * | `rubric:<id>` | title, checklist | transcripts fine, verdicts wrong | `grade` (judge only) |
 * | `policy:<id>` | critical, reps, pass_threshold | only the scoring moved | `rescore` (free) |
 * | `gates:<id>` | `diff_contains`, `diff_excludes` | needle wrong, behavior fine | `regate` (no subject call; judges fail→pass reps) |
 * | `rubric:__persona` | spec-level `judge_persona` | every verdict in the skill | `grade` per model |
 *
 * Why this matters more than it looks: with one key, lint had exactly one remedy for
 * any drift — "re-run" — so **correcting a rubric cost model spend**. Measured on the
 * reference corpus, two parked branches (one needle, one checklist rewrite) demanded
 * 135 rep-executions to restore freshness while producing zero new information about
 * the models. A gate that charges that much to fix a known-bad rubric is pressure to
 * leave the rubric in place, which inverts the point of having a gate.
 *
 * The strictness is unchanged: every edit still marks something stale. Only the price
 * of getting back to fresh changed.
 */
export const STIMULUS_PREFIX = "stimulus:";
export const RUBRIC_PREFIX = "rubric:";
export const POLICY_PREFIX = "policy:";
export const GATES_PREFIX = "gates:";

/**
 * The spec-level rubric key. `__persona` cannot collide with a scenario id: ids are
 * validated as `[A-Za-z][A-Za-z0-9_-]*`, so none can begin with an underscore.
 */
export const PERSONA_KEY = `${RUBRIC_PREFIX}__persona`;

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
/**
 * A scenario's fields, sorted into the four buckets, as canonical JSON.
 *
 * One function so the exhaustive-destructure trick below covers all four digests at
 * once: adding a field to `Scenario` or `SeededAssert` fails the build **here** until
 * someone decides which bucket — and therefore which remedy — it belongs to. A field
 * nobody assigned is a permanent staleness blind spot, and a field assigned to the
 * wrong bucket is worse than that: it would tell a user `rescore` is enough when the
 * transcripts are actually invalid.
 */
function facets(s: Scenario): { stimulus: string; rubric: string; policy: string; gates: string | null } {
  const {
    id, title, critical, mode, turns, checklist, fixture, assert, traceAssert, trajectoryAssert,
    workspace, remote, systemPromptFile, extensions, eventSources, reps, passThreshold,
    covers: _coversIsMetadata,
    ...restScenario
  } = s;
  const _scenarioExhaustive: Record<string, never> = restScenario;
  void _scenarioExhaustive;
  // `covers` is destructured into a discard on purpose, and this comment is the
  // decision the guard demanded: it belongs to NO digest. It records which
  // instruction sections a scenario is declared to exercise, which changes what
  // `--affected` selects next time — not what any past run measured. Bucketing it
  // anywhere would charge a re-run (or at best a re-score) for editing a label,
  // which is the exact trap the facet split was built to remove.
  void _coversIsMetadata;

  const { vitest, diff_contains, diff_excludes, post_test, ...restAssert } = assert ?? {};
  const _assertExhaustive: Record<string, never> = restAssert;
  void _assertExhaustive;

  // `traceAssert` is a GATE, not stimulus: it is evaluated against a trace the run
  // already saved, so `regate` can re-answer it without re-running the subject model.
  // Note the asymmetry with `env.extensions` in Phase 3, which IS stimulus — one
  // changes what gets executed, the other only what we conclude from it.
  const hasGates = diff_contains !== undefined || diff_excludes !== undefined || traceAssert !== undefined || trajectoryAssert !== undefined;
  return {
    // `vitest` and the `post_test` PATH are stimulus, not gates: both change what the
    // run executes in the workspace, and neither can be re-evaluated from a saved
    // diff. (`post_test`'s CONTENTS get their own file-path key, hashed separately.)
    // `extensions` is STIMULUS, not a gate — note the asymmetry with `traceAssert`
    // below. Changing which extensions load changes what the model can DO, so the
    // old transcripts describe a different agent and only a re-run can answer.
    // Changing an assertion only changes what we conclude from evidence already on
    // disk, which `regate` can redo without a subject re-run.
    // APPENDED CONDITIONALLY, never as a fixed slot. This tuple is positional and
    // its hash is stored in every published results.yaml, so adding an
    // unconditional element re-hashes every scenario that never used the field —
    // measured: 62 real lint findings became 261 across the reference corpus, all of
    // them demanding paid re-runs for scenarios nobody had edited.
    stimulus: JSON.stringify([
      id, mode, turns, workspace, remote, systemPromptFile ?? null,
      fixture ?? null, vitest ?? null, post_test ?? null,
      ...(extensions ? [extensions] : []),
      // Event-source paths choose which native ledgers are captured. A saved
      // normalized artifact cannot answer for a source that was never collected,
      // so changing this is stimulus and needs a re-run.
      ...(eventSources ? [eventSources] : []),
    ]),
    rubric: JSON.stringify([id, title, checklist]),
    policy: JSON.stringify([id, critical, reps ?? null, passThreshold ?? null]),
    // Same rule as `stimulus` above: conditional, so a needle-gated scenario that
    // declares no trace assertions keeps the digest it was published with.
    gates: hasGates
      ? JSON.stringify([
          id, diff_contains ?? null, diff_excludes ?? null,
          ...(traceAssert ? [traceAssert] : []),
          ...(trajectoryAssert ? [trajectoryAssert] : []),
        ])
      : null,
  };
}

function sha(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

export function stimulusDigest(s: Scenario): string {
  return sha(facets(s).stimulus);
}

export function rubricDigest(s: Scenario): string {
  return sha(facets(s).rubric);
}

export function policyDigest(s: Scenario): string {
  return sha(facets(s).policy);
}

/** Null when the scenario declares no needle gates — no key is recorded for it. */
export function gatesDigest(s: Scenario): string | null {
  const g = facets(s).gates;
  return g === null ? null : sha(g);
}

/** The spec-level judge persona, which is rubric for every scenario at once. */
export function personaDigest(persona: string): string {
  return sha(JSON.stringify(["__persona", persona]));
}

/**
 * The pre-0.4.0 combined digest: everything about a scenario in one hash.
 *
 * **Read-only now** — `sourceHashes` writes the four split keys instead. Kept because
 * `lint` must still compare runs that recorded `scenario:<id>`, and those runs are
 * every scorecard published before 0.4.0. Deleting it would turn "no findings" into
 * "no comparison" for the entire existing corpus, silently.
 *
 * Its bytes must therefore never change again: this is a stored-hash format, not an
 * implementation detail. The facet digests take new fields; this one is frozen at the
 * 0.3.x field set, which is why it does not go through `facets()`.
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
  /**
   * The spec's `judge_persona`. Required rather than optional: an optional field that
   * silently disables the `rubric:__persona` comparison is the blind-spot shape this
   * module exists to prevent, and making it required lets the compiler find every
   * caller instead of leaving one quietly un-checked.
   */
  judgePersona: string;
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
  // Two digests of one file, and both are load-bearing. `SKILL.md` is the raw bytes,
  // kept so an older skill-harness reading this record still has the key it knows and so
  // `restamp` has a proof to upgrade from; `skill:prompt` is the text the model actually
  // receives, and is the one lint compares (see `isSupersededKey`).
  hashes[SKILL_KEY] = fileSha256(resolve(ctx.skillDir, "SKILL.md")) ?? UNREADABLE;
  hashes[SKILL_PROMPT_KEY] = promptDocDigestOfFile(resolve(ctx.skillDir, "SKILL.md")) ?? UNREADABLE;

  hashes[PERSONA_KEY] = personaDigest(ctx.judgePersona);

  for (const s of ctx.scenarios) {
    // Split, not combined: each facet's drift has a different cheapest remedy, and a
    // single key could only ever name the most expensive one. The legacy
    // `scenario:<id>` key is deliberately NOT written any more — see scenarioDigest.
    hashes[STIMULUS_PREFIX + s.id] = stimulusDigest(s);
    hashes[RUBRIC_PREFIX + s.id] = rubricDigest(s);
    hashes[POLICY_PREFIX + s.id] = policyDigest(s);
    const gates = gatesDigest(s);
    if (gates !== null) hashes[GATES_PREFIX + s.id] = gates;

    // An agent file is a prompt document too, delivered with `--append-system-prompt`,
    // and its `tools:` header is read by the harness rather than the model — so it gets
    // the same pair of digests, for the same reasons, as SKILL.md above.
    if (s.systemPromptFile && !(s.systemPromptFile in hashes)) {
      const abs = resolve(ctx.specDir, s.systemPromptFile);
      hashes[s.systemPromptFile] = fileSha256(abs) ?? UNREADABLE;
      hashes[PROMPT_PREFIX + s.systemPromptFile] = promptDocDigestOfFile(abs) ?? UNREADABLE;
    }

    // Extension CONTENTS, not just the paths the stimulus digest already covers.
    // An orchestration scenario's subagent tool lives in these files: editing one
    // changes what the model could do without changing a single character of the
    // spec, which is precisely the drift the staleness gate exists to catch.
    for (const ext of s.extensions ?? []) {
      if (ext in hashes) continue;
      hashes[ext] = fileSha256(resolve(ctx.specDir, ext)) ?? UNREADABLE;
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
  if (key === PROMPT_NORMALIZATION_SOURCE_KEY) return PROMPT_NORMALIZATION_SOURCE_DIGEST;
  if (key === SKILL_KEY) return fileSha256(resolve(ctx.skillDir, "SKILL.md"));
  if (key === SKILL_PROMPT_KEY) return promptDocDigestOfFile(resolve(ctx.skillDir, "SKILL.md"));

  // Before the unknown-prefix guard below, which would otherwise swallow these as keys
  // from a newer skill-harness. A deleted agent file must still resolve to null ("gone"),
  // not undefined ("not comparable").
  if (key.startsWith(PROMPT_PREFIX)) {
    return promptDocDigestOfFile(resolve(ctx.specDir, key.slice(PROMPT_PREFIX.length)));
  }

  if (key === PERSONA_KEY) return personaDigest(ctx.judgePersona);

  // Facet keys, and the legacy combined key, all resolve per scenario id. A removed
  // scenario is a reshape, not staleness, on every kind.
  const facetResolvers: Array<[string, (s: Scenario) => string | null]> = [
    [STIMULUS_PREFIX, stimulusDigest],
    [RUBRIC_PREFIX, rubricDigest],
    [POLICY_PREFIX, policyDigest],
    [GATES_PREFIX, gatesDigest],
    [SCENARIO_PREFIX, scenarioDigest],
  ];
  for (const [prefix, digest] of facetResolvers) {
    if (!key.startsWith(prefix)) continue;
    const s = ctx.scenarios.find((x) => x.id === key.slice(prefix.length));
    if (!s) return undefined; // removed → reshape, not stale
    // gatesDigest returns null when the scenario no longer declares needles. That is
    // a real change (the gate the run recorded is gone), so null — "no longer
    // exists" — is the honest answer rather than "not comparable".
    return digest(s);
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
  if (key === PROMPT_NORMALIZATION_SOURCE_KEY) return "the prompt normalization rule registry";
  if (key === PERSONA_KEY) return "the judge persona";
  // Deliberately the same label as the raw-bytes key: only one of the pair is ever
  // compared (see `isSupersededKey`), and a reader of a lint finding cares which FILE
  // moved, not which of two digests of it was the one consulted.
  if (key === SKILL_PROMPT_KEY) return SKILL_KEY;
  if (key.startsWith(PROMPT_PREFIX)) return key.slice(PROMPT_PREFIX.length);
  if (key.startsWith(STIMULUS_PREFIX)) return `the stimulus for \`${key.slice(STIMULUS_PREFIX.length)}\``;
  if (key.startsWith(RUBRIC_PREFIX)) return `the rubric for \`${key.slice(RUBRIC_PREFIX.length)}\``;
  if (key.startsWith(POLICY_PREFIX)) return `the scoring policy for \`${key.slice(POLICY_PREFIX.length)}\``;
  if (key.startsWith(GATES_PREFIX)) return `the gates for \`${key.slice(GATES_PREFIX.length)}\``;
  if (key.startsWith(SCENARIO_PREFIX)) return `scenario \`${key.slice(SCENARIO_PREFIX.length)}\``;
  if (key.startsWith(FIXTURE_PREFIX)) return `fixture \`${key.slice(FIXTURE_PREFIX.length)}\``;
  return key;
}

/**
 * The cheapest command that honestly restores freshness for this key kind.
 *
 * This string is the feature. Before the split, lint's only remedy was "re-run", so a
 * one-word checklist fix cost a full model pass — pressure to leave a known-bad rubric
 * in place. Naming the actual remedy is what converts that into a free command.
 */
export function remedyForKey(key: string): string {
  if (key === PROMPT_NORMALIZATION_SOURCE_KEY) return "re-run — prompt provenance cannot be recomputed without the original model-visible payload";
  if (key === PERSONA_KEY) {
    return "re-grade each model's saved transcripts (`grade <run-dir>`) — judge-only, no model spend";
  }
  if (key.startsWith(RUBRIC_PREFIX)) {
    return "re-grade from the saved transcripts (`grade <run-dir>`) — judge-only, no model spend";
  }
  if (key.startsWith(POLICY_PREFIX)) {
    return "re-score the saved reps (`rescore <run-dir>`) — free, offline";
  }
  if (key.startsWith(GATES_PREFIX)) {
    return "re-evaluate gates against saved artifacts (`regate <run-dir>`) — no subject call; fail→pass reps require judge calls";
  }
  // A pre-split run recorded one hash over stimulus + rubric + policy + gates, so
  // which of them moved is genuinely unknowable from the record. Naming a cheap
  // remedy here would be a guess dressed as a fact.
  if (key.startsWith(SCENARIO_PREFIX)) {
    return "re-run — this run predates the stimulus/rubric/policy split, so which part changed cannot be told from what it recorded";
  }
  return "re-run"; // stimulus:, SKILL.md, fixture:, agent files, post_test contents
}

/** The skill-text key. Skill-wide: it belongs to every scenario at once. */
export const SKILL_KEY = "SKILL.md";

/**
 * The model-visible digests of the two prompt documents a run delivers: the skill text
 * and any `system_prompt_file`. They measure what the model RECEIVES, where the bare
 * keys above (`SKILL.md`, `<agent path>`) measure the file's raw bytes.
 *
 * | key | contents |
 * |---|---|
 * | `skill:prompt` | SKILL.md's body + its model-visible frontmatter |
 * | `prompt:<path>` | the same, for one `system_prompt_file` |
 *
 * Both are prefixed, so a skill-harness OLDER than this one reads them through
 * `currentHashFor`'s unknown-prefix guard and reports "not comparable" rather than a
 * confident wrong finding about a source that is fine.
 */
export const SKILL_PROMPT_KEY = "skill:prompt";
export const PROMPT_PREFIX = "prompt:";

/**
 * Frontmatter keys the model never receives: capability declarations the HARNESS
 * consumes to build a tool allowlist.
 *
 * Why a denylist and not an allowlist of "body + description". An allowlist makes the
 * safe-looking choice the dangerous one: the day a harness starts putting some new
 * frontmatter key in context, every published number silently stops being protected and
 * nothing says so. A denylist fails the other way — a newly-invented inert key charges
 * one unnecessary re-run until it is named here, which is a one-line patch and a visible
 * complaint. This module already takes that side everywhere else (see `UNREADABLE`, and
 * the unknown-prefix guard in `currentHashFor`): a blind spot is the worst outcome, and
 * a false alarm is merely expensive.
 *
 * `tools` and `allowed-tools` are the two spellings of the same ceiling in the reference
 * corpus. Both are read by pi/pi-daddy to build a `--tools` allowlist; neither is ever
 * rendered into the model's context.
 */
const CAPABILITY_KEYS = new Set(["allowed-tools", "tools"]);

/** Opening `---` on line 1 only — a `---` further down is a horizontal rule. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** A prompt document split into its frontmatter text (null when it has none) and its body. */
export function splitPromptDoc(text: string): { frontmatter: string | null; body: string } {
  const m = FRONTMATTER_RE.exec(text);
  // Unterminated frontmatter falls through to "all body", the same call
  // instruction-coverage.ts makes: treat the whole file as content rather than lose it.
  return m ? { frontmatter: m[1], body: text.slice(m[0].length) } : { frontmatter: null, body: text };
}

/**
 * Parsed YAML in a stable shape: object keys sorted, string scalars trimmed.
 *
 * Trimmed because YAML block style is not stimulus — `description: >` clips a trailing
 * newline that `description: <text>` does not, so an author refolding a paragraph the
 * model receives identically would otherwise be charged a re-run.
 */
function canonicalValue(v: unknown): unknown {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(canonicalValue);
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, val]) => [k, canonicalValue(val)]);
  }
  return v;
}

/**
 * The frontmatter a run can observe, canonically. Built from the PARSED YAML for the
 * same reason the scenario digests are built from the parsed scenario: reindenting or
 * reordering keys changes no stimulus and must not read as a change.
 *
 * Unparseable frontmatter is hashed VERBATIM rather than dropped. Dropping it would mean
 * a file whose frontmatter is malformed quietly loses that half of its protection — and
 * a malformed header is exactly when an author is most likely to be mid-edit.
 */
function modelVisibleFrontmatter(fm: string | null): unknown {
  if (fm === null) return null;
  let parsed: unknown;
  try {
    parsed = yaml.load(fm);
  } catch {
    return ["unparsed", fm];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return ["unparsed", fm];
  return [
    "parsed",
    Object.entries(parsed as Record<string, unknown>)
      .filter(([k]) => !CAPABILITY_KEYS.has(k))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, canonicalValue(v)]),
  ];
}

/**
 * The digest of a prompt document: its body verbatim, plus every frontmatter field the
 * model can actually receive.
 *
 * The gate exists to protect published claims, so "the current text" has to mean the text
 * the model was given. Hashing the raw bytes — which is what shipped through 0.7.0 —
 * charged a full re-run for edits no graded run could observe: measured on the reference
 * corpus, adding one `allowed-tools:` key to seven SKILL.md files with byte-identical
 * bodies took lint from 2 findings to 22, and 20 of those demanded paid re-waves.
 *
 * Versioned in the hashed tuple (`prompt-doc/1`) because this is a stored-hash format: if
 * the rule for "model-visible" ever changes, the tag changes with it and old digests stay
 * legible as what they were.
 */
export function promptDocDigest(text: string): string {
  const { frontmatter, body } = splitPromptDoc(text);
  return sha(JSON.stringify(["prompt-doc/1", modelVisibleFrontmatter(frontmatter), body]));
}

/** `promptDocDigest` of a file, or null when it doesn't exist / isn't readable. */
export function promptDocDigestOfFile(path: string): string | null {
  try {
    return promptDocDigest(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * True when `key` is a raw-bytes key whose model-visible counterpart THIS RUN also
 * recorded — in which case the counterpart is the honest comparison and the raw-bytes one
 * must be skipped.
 *
 * Both keys keep being written, and this is why: an older skill-harness reading a newer
 * results.yaml still finds the bare `SKILL.md` key and keeps checking it, and `restamp`
 * needs the raw-bytes hash as the proof it upgrades from. Superseding at COMPARISON time
 * rather than dropping the key at record time is what buys both.
 *
 * `UNREADABLE` on EITHER side supersedes nothing. If the counterpart is unreadable there
 * is nothing better to compare against; and if the raw-bytes key itself is unreadable, the
 * run never verified that document at all — a fact lint must keep reporting, since the
 * one thing this module refuses to do is let an unhashed source drop out of checking for
 * the life of a result.
 */
export function isSupersededKey(key: string, recorded: Record<string, string>): boolean {
  if (key === SKILL_PROMPT_KEY || key.startsWith(PROMPT_PREFIX)) return false;
  if (recorded[key] === UNREADABLE) return false;
  const upgraded = key === SKILL_KEY ? SKILL_PROMPT_KEY : PROMPT_PREFIX + key;
  const v = recorded[upgraded];
  return v !== undefined && v !== UNREADABLE;
}

/**
 * Every recorded key whose drift could change THIS scenario's verdict — excluding the
 * two skill-wide ones (`SKILL.md`, `rubric:__persona`), which callers handle
 * separately because they move every scenario at once.
 *
 * Written for run-over-run comparison (see stability.ts): "did these two runs ask this
 * scenario the same question, judged by the same rubric?" is answerable from the
 * recorded hashes, and only if you know which keys belong to the scenario. Derived
 * from the spec rather than from the key strings, because the path-shaped keys
 * (`system_prompt_file`, `post_test`) carry no scenario id at all.
 *
 * `policy:<id>` is deliberately NOT here. Its `reps`/`pass_threshold` half is already
 * compared as an *aggregation* shape (1 draw vs a majority of 3 is the comparison a
 * hash cannot express), and its `critical` half changes whether a verdict can block a
 * ship, never what the verdict is. Including it would report a critical-set edit as
 * "these runs measured different things", which is false.
 *
 * Both key generations are returned: 0.4.0+ runs carry the split facet keys, older
 * ones the combined `scenario:<id>`. A caller comparing two runs must not treat a
 * combined digest and a split one as comparable — they hash different byte layouts —
 * so it compares only keys BOTH runs recorded, and treats "no shared key" as
 * unverifiable rather than unchanged.
 */
export function scenarioSourceKeys(s: Scenario): string[] {
  const keys = [
    STIMULUS_PREFIX + s.id,
    RUBRIC_PREFIX + s.id,
    SCENARIO_PREFIX + s.id, // legacy combined (pre-0.4.0 runs)
  ];
  if (gatesDigest(s) !== null) keys.push(GATES_PREFIX + s.id);
  if (s.systemPromptFile) {
    keys.push(s.systemPromptFile); // the agent file IS the stimulus
    keys.push(PROMPT_PREFIX + s.systemPromptFile); // ...as the model receives it
  }
  for (const ext of s.extensions ?? []) keys.push(ext); // an edited extension is new stimulus
  if (s.assert?.post_test) keys.push(s.assert.post_test); // its contents are the gate
  const fx = effectiveFixture(s);
  if (fx) keys.push(FIXTURE_PREFIX + fx);
  return keys;
}

/** The scenario id a key belongs to, for per-scenario lint findings. Undefined for skill-wide keys. */
export function scenarioIdForKey(key: string, scenarios: Scenario[]): string | undefined {
  if (key === PERSONA_KEY) return undefined; // spec-level: belongs to no single scenario
  for (const p of [STIMULUS_PREFIX, RUBRIC_PREFIX, POLICY_PREFIX, GATES_PREFIX]) {
    if (key.startsWith(p)) return key.slice(p.length);
  }
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
