import { createHash } from "node:crypto";
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { parseSpec } from "./spec.js";

/**
 * The single choke point for appending a scenario to an existing
 * `specification.yaml`.
 *
 * Two callers need this — `add-test` and capture promotion — and a second
 * implementation is how they would drift into disagreeing about what a valid
 * write is. Everything here is deliberately append-shaped: a spec is
 * hand-authored and full of comments, and a round trip through
 * `yaml.load`/`yaml.dump` would silently reformat it and drop every comment the
 * author wrote. So the existing bytes are never re-serialized — the new block is
 * concatenated onto them and the *result* is validated before anything is
 * written.
 */

/** Thrown when the spec on disk moved between the caller reading it and writing. */
export class ConcurrentSpecModification extends Error {
  constructor(specPath: string) {
    super(
      `${specPath} changed on disk since it was read — refusing to append. ` +
        `Re-read the spec and retry; appending now would validate against a file that no longer exists.`,
    );
    this.name = "ConcurrentSpecModification";
  }
}

/** Thrown when the scenario being appended collides with one already in the spec. */
export class DuplicateScenarioId extends Error {
  constructor(id: string, specPath: string) {
    super(`scenario id \`${id}\` already exists in ${specPath}`);
    this.name = "DuplicateScenarioId";
  }
}

/** SHA-256 of spec text. Callers hold one across a read→confirm→write cycle. */
export function specSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Render one scenario as a YAML block that can be concatenated onto a spec.
 *
 * Dumps `{ scenarios: [scenario] }` and strips the top-level key, leaving the
 * correctly-indented list item. Going through `yaml.dump` rather than string
 * templating is what makes arbitrary user text — quotes, colons, newlines,
 * leading dashes — safe to embed.
 */
export function renderScenarioBlock(scenario: Record<string, unknown>): string {
  const dumped = yaml.dump({ scenarios: [scenario] }, { lineWidth: -1, noRefs: true });
  return "\n" + dumped.replace(/^scenarios:\n/, "");
}

export interface AppendScenarioOptions {
  specPath: string;
  /** Plain object in spec field order; serialized by `renderScenarioBlock`. */
  scenario: Record<string, unknown>;
  /**
   * SHA-256 the caller last saw. When supplied and the file no longer matches,
   * the append is refused rather than layered onto someone else's edit.
   */
  baseSha256?: string;
}

export interface AppendScenarioResult {
  id: string;
  /** SHA-256 of the spec AFTER the append — the caller's new baseline. */
  sha256: string;
  /** The block that was appended, for preview/echo. */
  block: string;
}

/**
 * Validate and atomically append a scenario.
 *
 * Order matters and is load-bearing: read → detect concurrent modification →
 * reject duplicate id → build → **validate the merged text** → write. The
 * validation is on the merged result, not the block alone, because a block that
 * parses in isolation can still break the file it lands in.
 *
 * The write is temp-file-plus-rename rather than `appendFileSync`. An append
 * interrupted partway through leaves a syntactically broken spec on disk; a
 * rename either happened or did not.
 */
export function appendScenario(opts: AppendScenarioOptions): AppendScenarioResult {
  const { specPath, scenario, baseSha256 } = opts;

  const current = readFileSync(specPath, "utf8");
  if (baseSha256 !== undefined && specSha256(current) !== baseSha256) {
    throw new ConcurrentSpecModification(specPath);
  }

  const id = scenario.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error("scenario needs a non-empty string `id`");
  }

  const existing = parseSpec(current, specPath);
  if (existing.scenarios.some((s) => s.id === id)) {
    throw new DuplicateScenarioId(id, specPath);
  }

  const block = renderScenarioBlock(scenario);
  const merged = current + block;
  parseSpec(merged, specPath); // throws if the append broke the spec

  atomicWrite(specPath, merged);
  return { id, sha256: specSha256(merged), block };
}

/**
 * Write via a sibling temp file and rename.
 *
 * Sibling, not `/tmp`: `rename(2)` is only atomic within a filesystem, and a
 * cross-device rename would silently degrade to copy-then-delete — exactly the
 * torn write this exists to prevent.
 */
function atomicWrite(path: string, text: string): void {
  const tmp = join(dirname(path), `.${Date.now()}-${process.pid}.specwrite.tmp`);
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // Best effort: the original file is untouched either way, and masking the
      // real failure with a cleanup error would hide why the write failed.
    }
    throw err;
  }
}
