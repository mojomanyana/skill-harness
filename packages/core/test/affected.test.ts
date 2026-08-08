import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDiffHunks, parseDiffFiles, selectAffected, formatAffected } from "../src/affected.js";
import type { Scenario } from "../src/spec.js";

let root: string;

const SKILL_MD = [
  "# Demo",          // 1
  "intro",           // 2
  "## Core Principle", // 3
  "a",               // 4
  "b",               // 5
  "## Edge Cases",   // 6
  "c",               // 7
  "d",               // 8
].join("\n");

function scenario(id: string, over: Partial<Scenario> = {}): Scenario {
  return {
    id, title: id, critical: false, mode: "inline", turns: ["x"], checklist: ["y"],
    workspace: "none", remote: false, ...over,
  };
}

function diffFor(file: string, start: number, count: number): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${start},${count} +${start},${count} @@`,
    "+changed",
  ].join("\n");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sh-aff-"));
  writeFileSync(join(root, "SKILL.md"), SKILL_MD, "utf8");
});

const opts = (scenarios: Scenario[], diff: string) => ({ scenarios, specDir: root, diff, repoRoot: root });
const ids = (r: { selected: { id: string }[] }) => r.selected.map((s) => s.id).sort();

// --------------------------------------------------------------- diff parsing

describe("parseDiffHunks", () => {
  it("reads the new-file line range", () => {
    expect(parseDiffHunks(diffFor("SKILL.md", 4, 2))).toEqual([{ file: "SKILL.md", start: 4, count: 2 }]);
  });

  it("treats a hunk with no count as one line", () => {
    const d = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -3 +3 @@", "+y"].join("\n");
    expect(parseDiffHunks(d)).toEqual([{ file: "x", start: 3, count: 1 }]);
  });

  it("ignores a deleted file's /dev/null target", () => {
    const d = ["diff --git a/x b/x", "--- a/x", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-y"].join("\n");
    expect(parseDiffHunks(d)).toEqual([]);
  });

  it("collects touched files including renames", () => {
    const d = "diff --git a/old.md b/new.md\nsimilarity index 90%\n";
    expect(parseDiffFiles(d).sort()).toEqual(["new.md", "old.md"]);
  });
});

// --------------------------------------------------------------- mapping

describe("selectAffected — covers mapping", () => {
  it("selects the scenario covering the changed section", () => {
    const r = selectAffected(opts(
      [scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("A2", { covers: ["SKILL.md#edge-cases"] })],
      diffFor("SKILL.md", 4, 1), // line 4 is inside Core Principle
    ));
    expect(ids(r)).toEqual(["A1"]);
  });

  it("selects the other scenario for a change in the other section", () => {
    const r = selectAffected(opts(
      [scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("A2", { covers: ["SKILL.md#edge-cases"] })],
      diffFor("SKILL.md", 7, 1), // line 7 is inside Edge Cases
    ));
    expect(ids(r)).toEqual(["A2"]);
  });

  it("selects both when a hunk spans two sections", () => {
    const r = selectAffected(opts(
      [scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("A2", { covers: ["SKILL.md#edge-cases"] })],
      diffFor("SKILL.md", 5, 3), // lines 5,6,7 cross the boundary
    ));
    expect(ids(r)).toEqual(["A1", "A2"]);
  });

  it("selects nothing extra for a change in an unreferenced file", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["SKILL.md#core-principle"] })], diffFor("src/app.ts", 1, 1)));
    expect(ids(r)).toEqual([]);
  });

  it("gives every selected scenario an explainable reason", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["SKILL.md#core-principle"] })], diffFor("SKILL.md", 4, 1)));
    expect(r.selected[0].reasons[0]).toMatchObject({ kind: "covers", detail: "SKILL.md#core-principle" });
  });
});

describe("selectAffected — the ship gates always run", () => {
  it("always includes critical scenarios, whatever the diff said", () => {
    const r = selectAffected(opts(
      [scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("C9", { critical: true, covers: ["SKILL.md#edge-cases"] })],
      diffFor("SKILL.md", 4, 1),
    ));
    expect(ids(r)).toEqual(["A1", "C9"]);
    expect(r.selected.find((s) => s.id === "C9")!.reasons).toContainEqual({ kind: "critical" });
  });

  it("always includes B-series scenarios", () => {
    const r = selectAffected(opts(
      [scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("B2", { covers: ["SKILL.md#edge-cases"] })],
      diffFor("SKILL.md", 4, 1),
    ));
    expect(ids(r)).toEqual(["A1", "B2"]);
    expect(r.selected.find((s) => s.id === "B2")!.reasons).toContainEqual({ kind: "under-pressure" });
  });

  it("includes them even when the diff is empty", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("B1", { covers: ["SKILL.md#edge-cases"] })], ""));
    expect(ids(r)).toEqual(["B1"]);
  });
});

describe("selectAffected — changed stimulus", () => {
  it("selects a scenario whose fixture tree changed", () => {
    const s = scenario("S1", { mode: "seeded", fixture: "fixtures/S1", covers: ["SKILL.md#edge-cases"] });
    const r = selectAffected(opts([s], diffFor("fixtures/S1/src/a.ts", 1, 1)));
    expect(ids(r)).toEqual(["S1"]);
    expect(r.selected[0].reasons).toContainEqual({ kind: "stimulus-changed", detail: "fixtures/S1" });
  });

  it("selects a scenario whose post-test changed", () => {
    const s = scenario("S1", { mode: "seeded", fixture: "fixtures/S1", assert: { post_test: "post/S1.test.ts" }, covers: ["SKILL.md#edge-cases"] });
    const r = selectAffected(opts([s], diffFor("post/S1.test.ts", 1, 1)));
    expect(ids(r)).toEqual(["S1"]);
  });

  it("selects a scenario whose extension changed", () => {
    const s = scenario("R1", { extensions: ["ext/sub.ts"], covers: ["SKILL.md#edge-cases"] });
    const r = selectAffected(opts([s], diffFor("ext/sub.ts", 1, 1)));
    expect(ids(r)).toEqual(["R1"]);
    expect(r.selected[0].reasons).toContainEqual({ kind: "stimulus-changed", detail: "ext/sub.ts" });
  });

  it("selects a scenario whose agent file changed", () => {
    const s = scenario("D1", { systemPromptFile: "agents/plan.md", covers: ["SKILL.md#edge-cases"] });
    const r = selectAffected(opts([s], diffFor("agents/plan.md", 1, 1)));
    expect(ids(r)).toEqual(["D1"]);
  });
});

describe("selectAffected — conservative fallbacks", () => {
  it("selects a scenario that declares no covers at all", () => {
    // Nothing to consult, so it cannot be ruled out. Being wrong here means
    // shipping a regression; being over-inclusive only costs tokens.
    const r = selectAffected(opts([scenario("A1"), scenario("A2", { covers: ["SKILL.md#core-principle"] })], diffFor("src/x.ts", 1, 1)));
    expect(ids(r)).toEqual(["A1"]);
    expect(r.selected[0].reasons).toContainEqual({ kind: "no-covers-declared" });
  });

  it("selects everything when a referenced instruction file is gone", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["renamed.md#x"] }), scenario("A2", { covers: ["SKILL.md#core-principle"] })], diffFor("renamed.md", 1, 1)));
    expect(r.conservative).toBe(true);
    expect(ids(r)).toEqual(["A1", "A2"]);
    expect(r.conservativeReason).toMatch(/renamed or deleted/);
  });

  it("selects everything on a wholesale rewrite", () => {
    // Every line looks changed, so the sections that "match" are an artefact of
    // the rewrite's shape rather than evidence about behaviour.
    const r = selectAffected(opts(
      [scenario("A1", { covers: ["SKILL.md#core-principle"] }), scenario("A2", { covers: ["SKILL.md#edge-cases"] })],
      diffFor("SKILL.md", 1, 500),
    ));
    expect(r.conservative).toBe(true);
    expect(ids(r)).toEqual(["A1", "A2"]);
    expect(r.conservativeReason).toMatch(/too large to map/);
  });

  it("notes a change that maps to no covered section", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["SKILL.md#core-principle"] })], diffFor("SKILL.md", 7, 1)));
    expect(r.unmappedFiles).toEqual(["SKILL.md"]);
  });
});

describe("formatAffected", () => {
  it("always says the run is partial and cannot ship", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["SKILL.md#core-principle"] })], diffFor("SKILL.md", 4, 1)));
    const text = formatAffected(r, 1);
    expect(text).toContain("never reports SHIP");
    expect(text).toContain("A1");
  });

  it("names the conservative reason instead of a count", () => {
    const r = selectAffected(opts([scenario("A1", { covers: ["gone.md#x"] })], diffFor("gone.md", 1, 1)));
    expect(formatAffected(r, 1)).toMatch(/selecting ALL/);
  });
});
