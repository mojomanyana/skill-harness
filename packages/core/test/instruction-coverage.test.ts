import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSections, slugify, sectionAtLine, parseCoversRef, computeCoverage } from "../src/instruction-coverage.js";
import { parseSpec } from "../src/spec.js";
import type { Scenario } from "../src/spec.js";

// --------------------------------------------------------------- headings

describe("parseSections — ATX", () => {
  it("extracts headings with line ranges", () => {
    const md = ["# Title", "intro", "## First", "a", "b", "## Second", "c"].join("\n");
    const s = parseSections(md);
    expect(s.map((x) => [x.slug, x.depth, x.startLine, x.endLine])).toEqual([
      ["title", 1, 1, 2],
      ["first", 2, 3, 5],
      ["second", 2, 6, 7],
    ]);
  });

  it("handles closing hashes and deep levels", () => {
    const s = parseSections("### Deep One ###\n");
    expect(s[0]).toMatchObject({ slug: "deep-one", depth: 3, title: "Deep One" });
  });

  it("ignores a hash with no space — not a heading", () => {
    expect(parseSections("#nothing\n")).toEqual([]);
  });
});

describe("parseSections — Setext", () => {
  it("reads = as h1 and - as h2", () => {
    const md = ["Big Title", "=========", "text", "Sub Title", "---------", "more"].join("\n");
    const s = parseSections(md);
    expect(s.map((x) => [x.slug, x.depth])).toEqual([["big-title", 1], ["sub-title", 2]]);
  });

  it("does not treat a horizontal rule as a heading", () => {
    // A `---` after a blank line is a rule, not an underline.
    expect(parseSections("text\n\n---\n\nmore\n").map((s) => s.slug)).toEqual([]);
  });
});

describe("parseSections — fenced code", () => {
  it("ignores headings inside a fence", () => {
    const md = ["## Real", "```bash", "# not a heading", "## also not", "```", "## Also Real"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toEqual(["real", "also-real"]);
  });

  it("ignores tilde fences too", () => {
    const md = ["## Real", "~~~", "# nope", "~~~"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toEqual(["real"]);
  });

  it("keeps line ranges correct across a fence", () => {
    // A miscounted fence shifts every later range and would mis-map git hunks to
    // the wrong section — silently selecting the wrong tests.
    const md = ["## One", "```", "# fake", "```", "## Two", "x"].join("\n");
    const s = parseSections(md);
    expect(s[0]).toMatchObject({ slug: "one", startLine: 1, endLine: 4 });
    expect(s[1]).toMatchObject({ slug: "two", startLine: 5, endLine: 6 });
  });
});

describe("slug disambiguation", () => {
  it("suffixes duplicates rather than collapsing them", () => {
    const md = ["## Notes", "a", "## Notes", "b", "## Notes", "c"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toEqual(["notes", "notes-1", "notes-2"]);
  });

  it("slugifies like GitHub", () => {
    expect(slugify("Core Principle")).toBe("core-principle");
    expect(slugify("`code` and *emphasis*")).toBe("code-and-emphasis");
    expect(slugify("What's the deal?")).toBe("whats-the-deal");
    expect(slugify("Multi   space")).toBe("multi-space");
  });

  it("skips a heading that slugifies to nothing", () => {
    expect(parseSections("## ???\n").map((s) => s.slug)).toEqual([]);
  });
});

describe("sectionAtLine", () => {
  const sections = parseSections(["# A", "x", "## B", "y", "z"].join("\n"));
  it("maps a line to its section", () => {
    expect(sectionAtLine(sections, 1)?.slug).toBe("a");
    expect(sectionAtLine(sections, 2)?.slug).toBe("a");
    expect(sectionAtLine(sections, 4)?.slug).toBe("b");
  });
  it("returns nothing for a line past the end", () => {
    expect(sectionAtLine(sections, 99)).toBeUndefined();
  });
});

describe("parseCoversRef", () => {
  it.each([
    ["SKILL.md#core-principle", "SKILL.md", "core-principle"],
    ["../../agents/plan.md#scope", "../../agents/plan.md", "scope"],
  ])("parses %s", (raw, file, slug) => {
    expect(parseCoversRef(raw)).toMatchObject({ file, slug });
  });

  it.each(["SKILL.md", "SKILL.md#"])("treats %s as a whole-file reference", (raw) => {
    const ref = parseCoversRef(raw);
    expect(ref.file).toBe("SKILL.md");
    expect(ref.slug).toBeUndefined();
  });
});

// --------------------------------------------------------------- coverage

let dir: string;

const SKILL_MD = ["# Demo", "intro", "## Core Principle", "a", "## Edge Cases", "b", "## Untested Bit", "c"].join("\n");

function scenario(id: string, covers?: string[]): Scenario {
  return {
    id, title: id, critical: false, mode: "inline", turns: ["x"], checklist: ["y"],
    workspace: "none", remote: false, ...(covers ? { covers } : {}),
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sh-cov-"));
  writeFileSync(join(dir, "SKILL.md"), SKILL_MD, "utf8");
});

describe("computeCoverage", () => {
  it("reports covered and uncovered sections", () => {
    const r = computeCoverage({
      specDir: dir,
      baseFiles: ["SKILL.md"],
      scenarios: [scenario("A1", ["SKILL.md#core-principle"]), scenario("A2", ["SKILL.md#edge-cases"])],
    });
    expect(r.covered.map((c) => c.section.slug)).toEqual(["core-principle", "edge-cases"]);
    expect(r.uncovered.map((c) => c.section.slug)).toEqual(["demo", "untested-bit"]);
  });

  it("lists every scenario declaring a section", () => {
    const r = computeCoverage({
      specDir: dir,
      baseFiles: ["SKILL.md"],
      scenarios: [scenario("A1", ["SKILL.md#core-principle"]), scenario("A2", ["SKILL.md#core-principle"])],
    });
    expect(r.covered[0].scenarios).toEqual(["A1", "A2"]);
  });

  it("treats a whole-file reference as covering every section", () => {
    const r = computeCoverage({ specDir: dir, baseFiles: ["SKILL.md"], scenarios: [scenario("A1", ["SKILL.md"])] });
    expect(r.uncovered).toEqual([]);
    expect(r.pct).toBe(100);
  });

  it("reports a renamed heading as broken, with a suggestion", () => {
    const r = computeCoverage({ specDir: dir, baseFiles: ["SKILL.md"], scenarios: [scenario("A1", ["SKILL.md#core-principles"])] });
    expect(r.broken).toHaveLength(1);
    expect(r.broken[0]).toMatchObject({ scenarioId: "A1", reason: "section-missing" });
    expect(r.broken[0].didYouMean).toContain("core-principle");
  });

  it("reports a missing file as broken", () => {
    const r = computeCoverage({ specDir: dir, scenarios: [scenario("A1", ["nope.md#x"])] });
    expect(r.broken[0]).toMatchObject({ reason: "file-missing" });
  });

  it("never silently drops a broken reference", () => {
    // Silently dropping reads as "not covered" and sends the author to write a
    // test that already exists.
    const r = computeCoverage({ specDir: dir, baseFiles: ["SKILL.md"], scenarios: [scenario("A1", ["SKILL.md#gone"])] });
    expect(r.broken).toHaveLength(1);
    expect(r.covered).toEqual([]);
  });

  it("lists scenarios that declare no covers", () => {
    const r = computeCoverage({ specDir: dir, baseFiles: ["SKILL.md"], scenarios: [scenario("A1"), scenario("A2", ["SKILL.md#core-principle"])] });
    expect(r.unmapped).toEqual(["A1"]);
  });

  it("parks a pending capture against a section without counting it as covered", () => {
    const r = computeCoverage({
      specDir: dir,
      baseFiles: ["SKILL.md"],
      scenarios: [],
      pendingCaptures: [{ id: "CAP-001", covers: ["SKILL.md#untested-bit"] }],
    });
    const section = r.sections.find((s) => s.section.slug === "untested-bit")!;
    expect(section.pendingCaptures).toEqual(["CAP-001"]);
    // A pending capture is not a test yet, so it must not count as coverage.
    expect(section.scenarios).toEqual([]);
    expect(r.covered).toEqual([]);
  });

  it("covers a section in a second file", () => {
    mkdirSync(join(dir, "agents"), { recursive: true });
    writeFileSync(join(dir, "agents", "plan.md"), "## Scope Control\nx\n", "utf8");
    const r = computeCoverage({ specDir: dir, baseFiles: ["SKILL.md"], scenarios: [scenario("A1", ["agents/plan.md#scope-control"])] });
    expect(r.covered.map((c) => `${c.file}#${c.section.slug}`)).toEqual(["agents/plan.md#scope-control"]);
  });

  it("reports 0% rather than dividing by zero on an empty set", () => {
    expect(computeCoverage({ specDir: dir, scenarios: [] }).pct).toBe(0);
  });
});

// --------------------------------------------------------------- spec field

describe("covers in the spec", () => {
  const spec = (body: string) => `skill: demo
judge_persona: p
ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }
critical: []
scenarios:
  - id: A1
    title: t
    turns: ["x"]
    checklist: ["y"]
${body}
`;

  it("parses a list", () => {
    const s = parseSpec(spec(`    covers:\n      - "SKILL.md#core-principle"`), "s.yaml");
    expect(s.scenarios[0].covers).toEqual(["SKILL.md#core-principle"]);
  });

  it("is undefined when absent", () => {
    expect(parseSpec(spec(""), "s.yaml").scenarios[0].covers).toBeUndefined();
  });

  it.each([
    ["an empty list", `    covers: []`],
    ["a non-list", `    covers: "SKILL.md"`],
    ["an empty entry", `    covers:\n      - ""`],
  ])("rejects %s", (_l, body) => {
    expect(() => parseSpec(spec(body), "s.yaml")).toThrow();
  });
});

describe("YAML frontmatter", () => {
  it("is not mistaken for a Setext heading", () => {
    // Every SKILL.md opens with frontmatter, and its closing `---` makes the line
    // above look exactly like a Setext h2 underline. Found by running `coverage`
    // against a real skill, which reported a phantom section named after the
    // skill's own `description:` line.
    const md = ["---", "name: demo", "description: Use when testing things.", "---", "", "## Real Section", "x"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toEqual(["real-section"]);
  });

  it("keeps line numbers absolute so hunks still map", () => {
    const md = ["---", "name: demo", "---", "## First", "a"].join("\n");
    expect(parseSections(md)[0]).toMatchObject({ slug: "first", startLine: 4, endLine: 5 });
  });

  it("does not treat a mid-document --- as a frontmatter delimiter", () => {
    // Only a `---` on line 1 opens frontmatter. Here `text\n---` is a Setext h2
    // per CommonMark — which is what GitHub renders, and matching GitHub is what
    // makes an anchor guessable — so `text` is a real section, and crucially
    // `## Two` after it is still found rather than swallowed.
    const md = ["## One", "text", "---", "## Two", "x"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toEqual(["one", "text", "two"]);
  });

  it("keeps a blank line before --- as a horizontal rule", () => {
    const md = ["## One", "text", "", "---", "", "## Two"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toEqual(["one", "two"]);
  });

  it("does not lose the document when frontmatter is unterminated", () => {
    const md = ["---", "name: demo", "## Still Parsed", "x"].join("\n");
    expect(parseSections(md).map((s) => s.slug)).toContain("still-parsed");
  });
});
