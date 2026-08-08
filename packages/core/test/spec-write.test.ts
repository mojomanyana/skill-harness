import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendScenario,
  renderScenarioBlock,
  specSha256,
  ConcurrentSpecModification,
  DuplicateScenarioId,
} from "../src/spec-write.js";
import { loadSpec } from "../src/spec.js";

const BASE = `skill: demo
judge_persona: a strict reviewer
ship_bar:
  total: 2
  min_pass: 1
  no_critical_fail: true
critical:
  - A1

# A hand-written comment the author cares about.
scenarios:
  - id: A1
    title: does the thing
    turns:
      - "do the thing"
    checklist:
      - does the thing
`;

let dir: string;
let specPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sh-specwrite-"));
  specPath = join(dir, "specification.yaml");
  writeFileSync(specPath, BASE, "utf8");
});

const scenario = (id: string) => ({
  id,
  title: "captured case",
  turns: ["reproduce it"],
  checklist: ["explains the root cause"],
});

describe("appendScenario", () => {
  it("appends a scenario the loader accepts", () => {
    const res = appendScenario({ specPath, scenario: scenario("B1") });
    expect(res.id).toBe("B1");
    const spec = loadSpec(specPath);
    expect(spec.scenarios.map((s) => s.id)).toEqual(["A1", "B1"]);
  });

  it("preserves the original bytes, comments included", () => {
    appendScenario({ specPath, scenario: scenario("B1") });
    const after = readFileSync(specPath, "utf8");
    expect(after.startsWith(BASE)).toBe(true);
    expect(after).toContain("# A hand-written comment the author cares about.");
  });

  it("rejects a duplicate id without touching the file", () => {
    const before = readFileSync(specPath, "utf8");
    expect(() => appendScenario({ specPath, scenario: scenario("A1") })).toThrow(DuplicateScenarioId);
    expect(readFileSync(specPath, "utf8")).toBe(before);
  });

  it("refuses when the spec moved since the caller read it", () => {
    const stale = specSha256(readFileSync(specPath, "utf8"));
    writeFileSync(specPath, BASE + "\n# someone else edited this\n", "utf8");
    expect(() => appendScenario({ specPath, scenario: scenario("B1"), baseSha256: stale })).toThrow(
      ConcurrentSpecModification,
    );
  });

  it("accepts a matching baseSha256 and returns the new one", () => {
    const sha = specSha256(readFileSync(specPath, "utf8"));
    const res = appendScenario({ specPath, scenario: scenario("B1"), baseSha256: sha });
    expect(res.sha256).toBe(specSha256(readFileSync(specPath, "utf8")));
    expect(res.sha256).not.toBe(sha);
  });

  it("leaves the file valid when the appended block would break it", () => {
    const before = readFileSync(specPath, "utf8");
    // No checklist — the spec loader rejects it, so the merged text must be refused.
    expect(() => appendScenario({ specPath, scenario: { id: "B1", title: "t", turns: ["x"] } })).toThrow();
    expect(readFileSync(specPath, "utf8")).toBe(before);
    expect(() => loadSpec(specPath)).not.toThrow();
  });

  it("rejects a scenario with no usable id", () => {
    expect(() => appendScenario({ specPath, scenario: { title: "t" } })).toThrow(/non-empty string `id`/);
    expect(() => appendScenario({ specPath, scenario: { id: "   ", title: "t" } })).toThrow(/non-empty string `id`/);
  });

  it("leaves no temp files behind", () => {
    appendScenario({ specPath, scenario: scenario("B1") });
    expect(readdirSync(dir).filter((f) => f.includes("specwrite"))).toEqual([]);
  });
});

describe("renderScenarioBlock", () => {
  it("escapes text that would otherwise break the YAML", () => {
    const block = renderScenarioBlock({
      id: "B1",
      title: 'a "quoted" title: with a colon',
      turns: ["- leading dash", "line one\nline two"],
      checklist: ["ends with a colon:"],
    });
    const merged = BASE + block;
    writeFileSync(specPath, merged, "utf8");
    const spec = loadSpec(specPath);
    const added = spec.scenarios.find((s) => s.id === "B1")!;
    expect(added.title).toBe('a "quoted" title: with a colon');
    expect(added.turns).toEqual(["- leading dash", "line one\nline two"]);
  });

  it("round-trips through append for realistic captured prose", () => {
    appendScenario({
      specPath,
      scenario: {
        id: "B1",
        title: "captured: auth failure",
        turns: ["Why is auth failing?\n\nIt returns 401.", "  indented follow-up  "],
        checklist: ["names the expired token", "does not print the secret: value"],
      },
    });
    const added = loadSpec(specPath).scenarios.find((s) => s.id === "B1")!;
    expect(added.turns[0]).toContain("It returns 401.");
    expect(added.checklist).toContain("does not print the secret: value");
  });
});
