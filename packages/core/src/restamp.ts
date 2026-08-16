import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import yaml from "js-yaml";
import { loadSpec } from "./spec.js";
import { resultsPath } from "./results.js";
import { enumerateRunDirs } from "./lint.js";
import {
  promptDocDigest,
  SKILL_KEY, SKILL_PROMPT_KEY, PROMPT_PREFIX, UNREADABLE,
} from "./sources.js";

/**
 * Upgrade already-committed runs to the model-visible digests, without re-running anything.
 *
 * ## Why a command and not a rule inside lint
 *
 * A stored hash is one-way. A run recorded before 0.8.0 carries only sha256 of SKILL.md's
 * RAW BYTES, so once that file has been edited there is nothing in the record — and
 * nothing saved beside it; run dirs hold transcripts, not a copy of the skill — that can
 * say whether the edit touched the body or only the frontmatter. Lint therefore cannot
 * retroactively forgive a frontmatter-only edit on a legacy record, and pretending
 * otherwise would mean dropping the check that catches real body edits across the whole
 * published corpus.
 *
 * What CAN be established, and is the entire proof this command rests on: when the
 * recorded raw-bytes hash still equals the file's current raw-bytes hash, that run
 * measured the exact bytes on disk right now. The model-visible digest of those same
 * bytes is then a true statement about what that run measured, and recording it is
 * bookkeeping rather than a claim. Any record that fails the check is left untouched —
 * it stays honestly stale, and `run` is the only thing that can clear it.
 *
 * So the migration is: upgrade while the board is green, and every later
 * frontmatter-only edit is free. Skipping it costs nothing either — a legacy record with
 * an unedited skill keeps matching on the raw-bytes key exactly as before.
 *
 * ## `--from <ref>`, for when the edit already landed
 *
 * Nobody discovers a gate over-fires until it has over-fired, so the green worktree the
 * paragraph above assumes is usually already gone. The pre-edit bytes are still in git,
 * and they carry the same proof in two steps: the recorded hash matches `<ref>`'s bytes
 * (so the run measured THOSE), and `<ref>`'s model-visible digest equals today's (so the
 * text the model receives has not moved since). Only then is the digest recorded.
 *
 * It is the same proof, not a weaker one — with no `--from`, "the ref" is just the
 * working tree, which is why both go through one code path.
 *
 * Free and offline: no model, no judge, no network. It rewrites only `source_hashes`.
 */

/**
 * Three exclusive buckets that SUM to `runs`, plus `partial` as a subset of `upgraded`.
 *
 * Summing is the point. These counters are the only thing an operator can judge a
 * migration by, and "18 upgraded, 20 left alone" out of 140 leaves 102 records
 * unaccounted for — which reads like the command quietly skipped them rather than like
 * the 102 having nothing to upgrade.
 */
export interface RestampReport {
  /** Run records examined. `upgraded + unprovable + unchanged`. */
  runs: number;
  /** Records that gained at least one model-visible digest, and were rewritten. */
  upgraded: number;
  /**
   * Records that gained NOTHING because a document they measured has already moved —
   * honestly stale, and `run` is the only remedy.
   */
  unprovable: number;
  /** Records with nothing to do: no `source_hashes`, unreadable, or already upgraded. */
  unchanged: number;
  /** Of `upgraded`, those still carrying a document that could not be proven. */
  partial: number;
  /** `<runDir>: <key>` for each digest added, for the CLI to print. */
  added: string[];
}

/**
 * The `source_hashes` map of a raw-loaded results doc, or null when the doc has none.
 * Read from the RAW yaml rather than through `readResults` on purpose: this rewrites the
 * file, and `readResults` migrates schema 1 → 2 in memory, so writing its output back
 * would silently upgrade the schema of records nobody asked to touch.
 */
function rawHashes(doc: unknown): Record<string, string> | null {
  if (!doc || typeof doc !== "object") return null;
  const h = (doc as Record<string, unknown>).source_hashes;
  if (!h || typeof h !== "object" || Array.isArray(h)) return null;
  return h as Record<string, string>;
}

export interface RestampOptions {
  /** Git ref holding the bytes the runs measured, for a tree that has already been edited. */
  from?: string;
}

/**
 * `git show <ref>:<path>` as BYTES, or null when the ref, the repo, or the path isn't there.
 *
 * `execFileSync` with a buffer encoding rather than the shared `exec` helper: that one
 * accumulates stdout as decoded strings, so a multi-byte character landing on a chunk
 * boundary would come back with a replacement character and hash to something the run
 * never recorded. This comparison is byte-exact by definition, so it reads bytes.
 */
function bytesAtRef(abs: string, ref: string): Buffer | null {
  const cwd = dirname(abs);
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" }).trim();
    const rel = relative(top, abs).split("\\").join("/");
    return execFileSync("git", ["show", `${ref}:${rel}`], { cwd, maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null; // no git, no repo, no such ref, or the file did not exist there
  }
}

/**
 * The bytes a run is claimed to have measured: `<ref>`'s copy, or the working tree's when
 * no ref was given. Null when they cannot be read at all, which proves nothing and so
 * upgrades nothing.
 */
function measuredBytes(abs: string, from: string | undefined): Buffer | null {
  if (from !== undefined) return bytesAtRef(abs, from);
  try {
    return readFileSync(abs);
  } catch {
    return null;
  }
}

/**
 * Fail loudly when `--from` names something git cannot resolve.
 *
 * Without this the whole migration degrades into "0 upgraded, everything left alone",
 * which is indistinguishable from a corpus that genuinely cannot be proven — measured on
 * a clone whose only local branch was the feature branch, where `--from main` silently
 * did nothing and read as the tool being broken. A ref the operator got wrong is their
 * mistake to see, not one to absorb.
 */
function assertRefResolves(dir: string, ref: string): void {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: dir, stdio: "ignore" });
  } catch {
    throw new Error(
      `--from \`${ref}\` does not resolve to a commit in the repo holding ${dir} — ` +
        `check the ref exists locally (a fresh clone often has no local \`main\`; try \`origin/main\`)`,
    );
  }
}

/**
 * Write via a temp file in the same directory, then rename.
 *
 * `rename(2)` is atomic within a filesystem, so a reader sees the old file or the new one
 * and never a half-written one. It matters more here than in the writers that produce a
 * run: this loops over an entire published corpus rewriting records that already hold
 * measurements nobody can reproduce without spending model tokens, so an interrupt or a
 * full disk partway through would truncate exactly the artifacts the command exists to
 * preserve. The temp file is `.tmp`-suffixed beside the target rather than in the system
 * temp dir, because a cross-device rename is not atomic — and is not even permitted.
 */
function writeAtomically(path: string, text: string): void {
  const tmp = `${path}.restamp.tmp`;
  writeFileSync(tmp, text, "utf8");
  try {
    renameSync(tmp, path);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* the rename failure is what matters */ }
    throw e;
  }
}

/** What one prompt document can prove, computed once and reused across every run. */
interface Provable {
  /** sha256 of the bytes a run must have recorded for the ref to describe it. */
  measuredRaw: string | null;
  /** Model-visible digest of those same bytes. */
  measuredPrompt: string | null;
  /** Model-visible digest of the file as it stands now — what gets recorded. */
  currentPrompt: string | null;
}

/** Upgrade every provable record under one skill's tests/results. */
export function restampSkill(skillDir: string, opts: RestampOptions = {}): RestampReport {
  const report: RestampReport = { runs: 0, upgraded: 0, unprovable: 0, unchanged: 0, partial: 0, added: [] };
  const specPath = join(skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const specDir = dirname(specPath);

  // Only `system_prompt_file` paths, resolved from the CURRENT spec. The other
  // path-shaped keys (`post_test`, `env.extensions`) name code, not prompt documents:
  // every byte of those reaches the run, so they keep hashing raw and are left alone.
  const promptDocs = new Map<string, string>([[SKILL_KEY, resolve(skillDir, "SKILL.md")]]);
  for (const s of spec.scenarios) {
    if (s.systemPromptFile) promptDocs.set(s.systemPromptFile, resolve(specDir, s.systemPromptFile));
  }

  if (opts.from !== undefined) assertRefResolves(skillDir, opts.from);

  // Resolved once per document, not once per run: with `--from`, each resolution is two
  // git invocations, and a corpus of 140 runs would otherwise pay for them 140 times over.
  const provable = new Map<string, Provable>();
  for (const [legacyKey, abs] of promptDocs) {
    const measured = measuredBytes(abs, opts.from);
    let currentPrompt: string | null = null;
    try {
      currentPrompt = promptDocDigest(readFileSync(abs, "utf8"));
    } catch {
      currentPrompt = null;
    }
    provable.set(legacyKey, {
      measuredRaw: measured === null ? null : createHash("sha256").update(measured).digest("hex"),
      measuredPrompt: measured === null ? null : promptDocDigest(measured.toString("utf8")),
      currentPrompt,
    });
  }

  for (const runDir of enumerateRunDirs(join(skillDir, "tests", "results"))) {
    report.runs++;
    let doc: unknown;
    try {
      doc = yaml.load(readFileSync(resultsPath(runDir), "utf8"));
    } catch {
      // Unreadable/malformed → lint already reports it; never rewrite what we can't read.
      // Still bucketed: every record counted in `runs` has to be accounted for somewhere.
      report.unchanged++;
      continue;
    }
    const hashes = rawHashes(doc);
    if (!hashes) {
      report.unchanged++; // predates source_hashes → nothing to upgrade from
      continue;
    }

    let blocked = false;
    const additions: Array<[string, string]> = [];
    for (const legacyKey of promptDocs.keys()) {
      const recorded = hashes[legacyKey];
      if (recorded === undefined || recorded === UNREADABLE) continue; // never measured → nothing proven
      const upgradedKey = legacyKey === SKILL_KEY ? SKILL_PROMPT_KEY : PROMPT_PREFIX + legacyKey;
      if (hashes[upgradedKey] !== undefined) continue; // already upgraded
      const p = provable.get(legacyKey)!;
      if (p.currentPrompt === null) continue; // the file is gone; lint reports that itself
      // Two steps, and both are required. First: this run measured the reference bytes —
      // otherwise the reference says nothing about THIS run. Second: those bytes and
      // today's carry the same model-visible text — otherwise what the model reads has
      // genuinely moved and only a re-run can speak for it.
      if (p.measuredRaw === null || recorded !== p.measuredRaw || p.measuredPrompt !== p.currentPrompt) {
        blocked = true;
        continue;
      }
      additions.push([upgradedKey, p.currentPrompt]);
    }

    if (additions.length === 0) {
      // Exclusive: a record that gained nothing is `unprovable` only if something
      // actually blocked it, and `unchanged` otherwise.
      if (blocked) report.unprovable++;
      else report.unchanged++;
      continue;
    }
    for (const [k, v] of additions) {
      hashes[k] = v;
      report.added.push(`${runDir}: ${k}`);
    }
    writeAtomically(resultsPath(runDir), yaml.dump(doc, { lineWidth: 100 }));
    report.upgraded++;
    if (blocked) report.partial++;
  }
  return report;
}
