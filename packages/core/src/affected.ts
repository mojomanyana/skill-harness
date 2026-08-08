import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Scenario } from "./spec.js";
import { parseSections, sectionAtLine, parseCoversRef } from "./instruction-coverage.js";
import { exec } from "./util/exec.js";

/**
 * Which scenarios could plausibly be affected by a change.
 *
 * The governing asymmetry: **an under-inclusive set is dangerous and an
 * over-inclusive one is merely expensive.** Missing a regression means shipping
 * it; running extra scenarios costs tokens. So every ambiguity resolves toward
 * selecting more, and anything the mapping cannot explain selects everything.
 *
 * An affected run is always partial and can never report SHIP. It is an
 * iteration tool — a full run is still what clears a skill for publishing.
 */

export type SelectionReason =
  | { kind: "covers"; detail: string }
  | { kind: "critical" }
  | { kind: "under-pressure" }
  | { kind: "stimulus-changed"; detail: string }
  | { kind: "unmapped-change"; detail: string }
  | { kind: "no-covers-declared" };

export interface SelectedScenario {
  id: string;
  reasons: SelectionReason[];
}

export interface AffectedResult {
  selected: SelectedScenario[];
  /** True when the mapping could not be trusted and everything was selected. */
  conservative: boolean;
  /** Human-readable account of why, when `conservative`. */
  conservativeReason: string | null;
  /** Files in the diff that no scenario maps to. */
  unmappedFiles: string[];
}

export interface DiffHunk {
  file: string;
  /** 1-based first changed line in the NEW file; 0 for a pure deletion. */
  start: number;
  /** Number of changed lines; 0 for a pure deletion at `start`. */
  count: number;
}

/**
 * Parse `git diff --unified=0` hunk headers.
 *
 * `--unified=0` matters: with context lines the hunk range covers unchanged text,
 * and a change at the top of one section would be attributed to the section above
 * it too. Over-selection is the safe direction, but only when it is *reasoned*
 * over-selection rather than an artefact of a flag.
 */
export function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let file: string | null = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      file = p === "/dev/null" ? null : p.replace(/^b\//, "");
      continue;
    }
    if (!line.startsWith("@@") || file === null) continue;
    const m = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!m) continue;
    hunks.push({ file, start: Number(m[1]), count: m[2] === undefined ? 1 : Number(m[2]) });
  }
  return hunks;
}

/** Files the diff touched (added, modified or deleted). */
export function parseDiffFiles(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split("\n")) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (m) {
      files.add(m[1]);
      files.add(m[2]);
    }
  }
  return [...files];
}

export interface AffectedOptions {
  scenarios: Scenario[];
  /** Dir `covers` and fixture paths resolve against. */
  specDir: string;
  /** Unified diff text (`git diff --unified=0 <base>`). */
  diff: string;
  /** Repo root the diff paths are relative to. */
  repoRoot: string;
}

/** Run `git diff --unified=0 <base>` in a repo. Empty string when git fails. */
export async function gitDiff(repoRoot: string, base: string): Promise<string> {
  const r = await exec("git", ["diff", "--unified=0", base], { cwd: repoRoot, timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`git diff --unified=0 ${base} failed: ${r.stderr.trim() || `exit ${r.code}`}`);
  return r.stdout;
}

/**
 * Select the scenarios a change could affect.
 *
 * Always unions in every critical and every B-series scenario, whatever the diff
 * said. Those are the ship gates: if the mapping is wrong — and a mapping built
 * from author-written labels can be — the scenarios that decide releases are the
 * worst possible ones to skip.
 */
export function selectAffected(opts: AffectedOptions): AffectedResult {
  const { scenarios, specDir, diff, repoRoot } = opts;
  const reasons = new Map<string, SelectionReason[]>();
  const add = (id: string, reason: SelectionReason) => {
    const list = reasons.get(id) ?? [];
    list.push(reason);
    reasons.set(id, list);
  };

  const selectAll = (why: string): AffectedResult => {
    for (const s of scenarios) if (!reasons.has(s.id)) add(s.id, { kind: "unmapped-change", detail: why });
    return {
      selected: [...reasons.entries()].map(([id, rs]) => ({ id, reasons: rs })),
      conservative: true,
      conservativeReason: why,
      unmappedFiles: [],
    };
  };

  // The ship gates, unconditionally.
  for (const s of scenarios) {
    if (s.critical) add(s.id, { kind: "critical" });
    if (/^B/i.test(s.id)) add(s.id, { kind: "under-pressure" });
  }

  const hunks = parseDiffHunks(diff);
  const changedFiles = parseDiffFiles(diff);

  // A scenario with no `covers` cannot be excluded by a coverage mapping — there
  // is nothing to consult. Selecting it is the only honest answer.
  for (const s of scenarios) {
    if (!s.covers || s.covers.length === 0) add(s.id, { kind: "no-covers-declared" });
  }

  // Stimulus files: a changed fixture, post-test, agent file or extension changes
  // what the scenario RUNS, regardless of any instruction text.
  const stimulusFiles = (s: Scenario): string[] => {
    const files: string[] = [];
    if (s.fixture) files.push(s.fixture);
    if (s.assert?.post_test) files.push(s.assert.post_test);
    if (s.systemPromptFile) files.push(s.systemPromptFile);
    for (const e of s.extensions ?? []) files.push(e);
    return files;
  };
  const changedAbs = new Set(changedFiles.map((f) => resolve(repoRoot, f)));
  for (const s of scenarios) {
    for (const f of stimulusFiles(s)) {
      const abs = resolve(specDir, f);
      // Directory-ish match too: a fixture is a tree, and a change anywhere in it
      // counts.
      const hit = [...changedAbs].some((c) => c === abs || c.startsWith(`${abs}/`));
      if (hit) add(s.id, { kind: "stimulus-changed", detail: f });
    }
  }

  // Reverse the covers map: changed line → section → scenarios.
  const sectionsFor = new Map<string, ReturnType<typeof parseSections> | null>();
  const load = (abs: string) => {
    if (sectionsFor.has(abs)) return sectionsFor.get(abs)!;
    const parsed = existsSync(abs) ? parseSections(readFileSync(abs, "utf8")) : null;
    sectionsFor.set(abs, parsed);
    return parsed;
  };

  const coversIndex = new Map<string, string[]>(); // "abs#slug" | "abs" -> scenario ids
  for (const s of scenarios) {
    for (const raw of s.covers ?? []) {
      const ref = parseCoversRef(raw);
      const abs = resolve(specDir, ref.file);
      const key = ref.slug === undefined ? abs : `${abs}#${ref.slug}`;
      coversIndex.set(key, [...(coversIndex.get(key) ?? []), s.id]);
    }
  }

  const unmappedFiles = new Set<string>();
  for (const hunk of hunks) {
    const abs = resolve(repoRoot, hunk.file);
    // Only instruction files participate; a changed source file is not a section.
    const referenced = [...coversIndex.keys()].some((k) => k === abs || k.startsWith(`${abs}#`));
    if (!referenced) continue;

    const sections = load(abs);
    if (sections === null) {
      // The file is referenced but gone — a rename or delete. Nothing can be
      // mapped, and guessing would be worse than admitting it.
      return selectAll(`${hunk.file} is referenced by \`covers\` but is not readable — it may have been renamed or deleted`);
    }

    for (const id of coversIndex.get(abs) ?? []) add(id, { kind: "covers", detail: `${hunk.file} (whole file)` });

    const lines = hunk.count === 0 ? [hunk.start] : Array.from({ length: hunk.count }, (_, i) => hunk.start + i);
    let mappedAny = false;
    for (const line of lines) {
      const section = sectionAtLine(sections, line);
      if (!section) continue; // preamble before the first heading
      const ids = coversIndex.get(`${abs}#${section.slug}`) ?? [];
      for (const id of ids) add(id, { kind: "covers", detail: `${hunk.file}#${section.slug}` });
      if (ids.length > 0) mappedAny = true;
    }
    if (!mappedAny && (coversIndex.get(abs) ?? []).length === 0) unmappedFiles.add(hunk.file);
  }

  // A wholesale rewrite defeats line mapping: every line looks changed, and the
  // sections that "match" are an artefact of the rewrite's shape.
  const rewritten = hunks.filter((h) => h.count > 200);
  if (rewritten.length > 0) {
    return selectAll(`${rewritten[0].file} changed by ${rewritten[0].count} lines in one hunk — too large to map to sections reliably`);
  }

  return {
    selected: [...reasons.entries()].map(([id, rs]) => ({ id, reasons: rs })),
    conservative: false,
    conservativeReason: null,
    unmappedFiles: [...unmappedFiles],
  };
}

/** One line per selected scenario, naming every reason it was picked. */
export function formatAffected(result: AffectedResult, total: number): string {
  const out: string[] = [];
  if (result.conservative) {
    out.push(`selecting ALL ${total} scenario(s): ${result.conservativeReason}`);
  } else {
    out.push(`selected ${result.selected.length}/${total} scenario(s):`);
  }
  for (const s of [...result.selected].sort((a, b) => a.id.localeCompare(b.id))) {
    out.push(`  ${s.id}  ${s.reasons.map(describe).join(", ")}`);
  }
  if (result.unmappedFiles.length) {
    out.push(`  note: changes in ${result.unmappedFiles.join(", ")} map to no covered section`);
  }
  out.push("");
  out.push("an affected run is partial and never reports SHIP — a full run still gates a release");
  return out.join("\n");
}

function describe(r: SelectionReason): string {
  switch (r.kind) {
    case "covers": return `covers ${r.detail}`;
    case "critical": return "critical (always run)";
    case "under-pressure": return "B-series (always run)";
    case "stimulus-changed": return `stimulus changed: ${r.detail}`;
    case "unmapped-change": return `conservative: ${r.detail}`;
    case "no-covers-declared": return "declares no `covers` — cannot be ruled out";
  }
}
