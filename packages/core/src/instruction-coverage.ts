import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import type { Scenario } from "./spec.js";

/**
 * Which instructions have a test pointing at them.
 *
 * The unit is a Markdown heading section, because that is the unit skill authors
 * already write in — no new syntax to learn, and no annotation step that gets
 * skipped. The cost is that renaming a heading breaks a reference; that is
 * reported as a broken reference rather than silently dropped, which is the only
 * honest option (a silently-dropped reference reads as "not covered" and sends
 * the author to write a test that already exists).
 *
 * **This measures declared linkage, not proof.** A section with a scenario
 * pointing at it has *a test somebody associated with it* — not a guarantee the
 * behavior is tested, still less tested well. Every surface here says "declared"
 * for that reason. Overselling this number would make it worse than absent: an
 * author who believes 100% coverage means 100% tested will stop looking.
 */

export interface Section {
  /** GitHub-style slug, disambiguated on collision (`name`, `name-1`, …). */
  slug: string;
  /** Heading text as written. */
  title: string;
  /** Heading depth: 1 for `#`, 2 for `##`. Setext `===`/`---` map to 1/2. */
  depth: number;
  /** 1-based line of the heading itself. */
  startLine: number;
  /** 1-based last line of the section, inclusive — the line before the next heading. */
  endLine: number;
}

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const ATX = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const SETEXT_H1 = /^\s{0,3}=+\s*$/;
const SETEXT_H2 = /^\s{0,3}-+\s*$/;

/**
 * GitHub-style anchor slug: lowercase, drop punctuation, spaces to hyphens.
 *
 * Matching GitHub matters because the reference an author writes
 * (`SKILL.md#core-principle`) is the anchor they would use in a link, so it is
 * the one they will guess.
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Extract heading sections from Markdown.
 *
 * Fenced code blocks are skipped: a shell comment (`# rebuild the bundle`) inside
 * an example is not a section, and treating it as one both invents coverage
 * targets and shifts every subsequent section's line range — which would then
 * mis-map git hunks to the wrong section, silently selecting the wrong tests.
 */
export function parseSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const found: Omit<Section, "endLine">[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;

  // Skip YAML frontmatter. Every SKILL.md opens with it, and its closing `---`
  // makes the line above look exactly like a Setext h2 underline — so without
  // this, every skill gains a phantom section named after its own `description:`
  // line, and it lands at the top where it is most likely to be "covered" by a
  // careless whole-file reference.
  const start = frontmatterEnd(lines);

  const push = (title: string, depth: number, startLine: number) => {
    const base = slugify(title);
    if (base === "") return; // an empty heading is not addressable
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    found.push({ slug: n === 0 ? base : `${base}-${n}`, title, depth, startLine });
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const atx = ATX.exec(line);
    if (atx) {
      push(atx[2], atx[1].length, i + 1);
      continue;
    }
    // Setext: the UNDERLINE marks the heading, whose text is the line above.
    const prev = i > start ? lines[i - 1] : "";
    if (prev.trim() !== "" && !ATX.test(prev)) {
      if (SETEXT_H1.test(line)) push(prev.trim(), 1, i);
      else if (SETEXT_H2.test(line) && /[^-\s]/.test(prev)) push(prev.trim(), 2, i);
    }
  }

  return found.map((s, i) => ({
    ...s,
    endLine: i + 1 < found.length ? found[i + 1].startLine - 1 : lines.length,
  }));
}

/**
 * Index of the first line after YAML frontmatter, or 0 when there is none.
 *
 * Only a `---` on line 1 opens frontmatter — a `---` further down is a horizontal
 * rule, and treating it as a delimiter would swallow the document.
 */
function frontmatterEnd(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0; // unterminated: treat the whole file as content rather than losing it
}

/** Section containing a 1-based line, or undefined for content before the first heading. */
export function sectionAtLine(sections: Section[], line: number): Section | undefined {
  return sections.find((s) => line >= s.startLine && line <= s.endLine);
}

// ---------------------------------------------------------------------------
// covers references
// ---------------------------------------------------------------------------

export interface CoversRef {
  /** Raw reference as written in the spec. */
  raw: string;
  /** Path portion, relative to the spec dir. */
  file: string;
  /** Slug portion; undefined when the reference names a whole file. */
  slug?: string;
}

/** Parse `SKILL.md#core-principle` / `../../agents/plan.md` into its parts. */
export function parseCoversRef(raw: string): CoversRef {
  const hash = raw.indexOf("#");
  if (hash < 0) return { raw, file: raw.trim() };
  return { raw, file: raw.slice(0, hash).trim(), slug: raw.slice(hash + 1).trim() || undefined };
}

export interface SectionCoverage {
  file: string;
  section: Section;
  /** Scenario ids that declare a reference to this section. */
  scenarios: string[];
  /** Capture ids parked against this section but not yet promoted. */
  pendingCaptures: string[];
}

export interface BrokenRef {
  scenarioId: string;
  raw: string;
  reason: "file-missing" | "section-missing";
  /** Nearest slugs in that file, to make a rename obvious. */
  didYouMean: string[];
}

export interface CoverageReport {
  /** Every section of every referenced instruction file, covered or not. */
  sections: SectionCoverage[];
  covered: SectionCoverage[];
  uncovered: SectionCoverage[];
  broken: BrokenRef[];
  /** Scenarios that declare no `covers` at all. */
  unmapped: string[];
  pct: number;
}

export interface CoverageOptions {
  /** Dir that `covers` paths resolve against — the spec's own directory. */
  specDir: string;
  scenarios: Scenario[];
  /** Instruction files to report on even if nothing references them. */
  baseFiles?: string[];
  /** capture id → covers refs, for parking a pending case against a section. */
  pendingCaptures?: { id: string; covers: string[] }[];
}

/**
 * Build the coverage report.
 *
 * Free and offline — it reads Markdown and the spec, nothing else. That is
 * deliberate: a coverage command that spends tokens would be run once.
 */
export function computeCoverage(opts: CoverageOptions): CoverageReport {
  const fileSections = new Map<string, Section[]>();
  const readSections = (file: string): Section[] | null => {
    if (fileSections.has(file)) return fileSections.get(file)!;
    const abs = isAbsolute(file) ? file : resolve(opts.specDir, file);
    if (!existsSync(abs)) return null;
    const sections = parseSections(readFileSync(abs, "utf8"));
    fileSections.set(file, sections);
    return sections;
  };

  for (const f of opts.baseFiles ?? []) readSections(f);

  const bySection = new Map<string, SectionCoverage>();
  const key = (file: string, slug: string) => `${file}#${slug}`;
  const ensure = (file: string, section: Section): SectionCoverage => {
    const k = key(file, section.slug);
    let entry = bySection.get(k);
    if (!entry) {
      entry = { file, section, scenarios: [], pendingCaptures: [] };
      bySection.set(k, entry);
    }
    return entry;
  };

  // Seed every section of every known file, so "uncovered" is a real list rather
  // than only what someone happened to reference.
  for (const [file, sections] of fileSections) for (const s of sections) ensure(file, s);

  const broken: BrokenRef[] = [];
  const unmapped: string[] = [];

  const attach = (id: string, refs: string[], into: "scenarios" | "pendingCaptures") => {
    for (const raw of refs) {
      const ref = parseCoversRef(raw);
      const sections = readSections(ref.file);
      if (sections === null) {
        broken.push({ scenarioId: id, raw, reason: "file-missing", didYouMean: [] });
        continue;
      }
      for (const s of sections) ensure(ref.file, s);
      if (ref.slug === undefined) {
        // A whole-file reference covers every section in it.
        for (const s of sections) ensure(ref.file, s)[into].push(id);
        continue;
      }
      const match = sections.find((s) => s.slug === ref.slug);
      if (!match) {
        broken.push({
          scenarioId: id,
          raw,
          reason: "section-missing",
          didYouMean: nearest(ref.slug, sections.map((s) => s.slug)),
        });
        continue;
      }
      ensure(ref.file, match)[into].push(id);
    }
  };

  for (const s of opts.scenarios) {
    if (!s.covers || s.covers.length === 0) {
      unmapped.push(s.id);
      continue;
    }
    attach(s.id, s.covers, "scenarios");
  }
  for (const c of opts.pendingCaptures ?? []) attach(c.id, c.covers, "pendingCaptures");

  const sections = [...bySection.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.section.startLine - b.section.startLine,
  );
  const covered = sections.filter((s) => s.scenarios.length > 0);
  const uncovered = sections.filter((s) => s.scenarios.length === 0);

  return {
    sections,
    covered,
    uncovered,
    broken,
    unmapped,
    pct: sections.length === 0 ? 0 : Math.round((covered.length / sections.length) * 100),
  };
}

/**
 * Closest existing slugs, so a broken reference names the likely rename.
 *
 * A renamed heading is the common cause of a broken reference, and
 * "section-missing: core-principle" without a suggestion sends the author
 * hunting through a file they just edited.
 */
function nearest(target: string, candidates: string[], limit = 3): string[] {
  return candidates
    .map((c) => ({ c, d: distance(target, c) }))
    .filter(({ c, d }) => d <= Math.max(3, Math.floor(c.length / 2)))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ c }) => c);
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** Render the report for a terminal. `declared` wording is deliberate throughout. */
export function formatCoverage(report: CoverageReport, skill: string): string {
  const out: string[] = [];
  out.push(`${skill}: ${report.covered.length}/${report.sections.length} sections have a declared test (${report.pct}%)`);
  out.push("");
  if (report.uncovered.length) {
    out.push("  no test declares coverage of:");
    for (const s of report.uncovered) out.push(`    ${s.file}#${s.section.slug}  (${s.section.title})`);
    out.push("");
  }
  if (report.broken.length) {
    out.push("  broken references:");
    for (const b of report.broken) {
      const hint = b.didYouMean.length ? ` — did you mean ${b.didYouMean.map((s) => `#${s}`).join(", ")}?` : "";
      out.push(`    ${b.scenarioId}: ${b.raw} (${b.reason})${hint}`);
    }
    out.push("");
  }
  if (report.unmapped.length) {
    out.push(`  scenarios with no \`covers\`: ${report.unmapped.join(", ")}`);
    out.push("");
  }
  out.push("  `covers` records a declared link, not proof the behaviour is tested.");
  return out.join("\n");
}

/** Path of `file` relative to `specDir`, normalized for comparison with `covers`. */
export function relativeToSpec(specDir: string, file: string): string {
  return relative(specDir, isAbsolute(file) ? file : resolve(dirname(specDir), file)).split("\\").join("/");
}
