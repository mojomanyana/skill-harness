import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, renameSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dirSha256, scenarioDigest, sourceHashes, currentHashFor } from "../src/sources.js";
import type { Scenario } from "../src/spec.js";

const tmps: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-src-"));
  tmps.push(d);
  return d;
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: "A1", title: "t", critical: false, mode: "inline",
  turns: ["go"], checklist: ["does the thing"],
  workspace: "none", remote: false, ...over,
});

describe("dirSha256", () => {
  /** Build a tree from a {relPath: contents} map. */
  function tree(spec: Record<string, string>): string {
    const d = tmp();
    for (const [rel, body] of Object.entries(spec)) {
      const abs = join(d, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, body, "utf8");
    }
    return d;
  }

  it("is identical for identical trees and differs on any content change", () => {
    const a = tree({ "a.ts": "1", "nested/b.ts": "2" });
    const b = tree({ "a.ts": "1", "nested/b.ts": "2" });
    expect(dirSha256(a)).toBe(dirSha256(b));

    const c = tree({ "a.ts": "1", "nested/b.ts": "3" });
    expect(dirSha256(c)).not.toBe(dirSha256(a));
  });

  it("notices a renamed file even when contents are unchanged", () => {
    // Paths are hashed alongside contents: `ranges.ts` → `intervals.ts` changes
    // what the scenario opens, so it must not digest identically.
    const d = tree({ "ranges.ts": "same" });
    const before = dirSha256(d);
    renameSync(join(d, "ranges.ts"), join(d, "intervals.ts"));
    expect(dirSha256(d)).not.toBe(before);
  });

  it("notices an added file, including in a new sub-tree", () => {
    const d = tree({ "a.ts": "1" });
    const before = dirSha256(d);
    mkdirSync(join(d, "deep"), { recursive: true });
    writeFileSync(join(d, "deep", "new.ts"), "x", "utf8");
    expect(dirSha256(d)).not.toBe(before);
  });

  it("is order-stable regardless of creation order", () => {
    // readdir order is filesystem-dependent; without sorting, identical trees
    // would digest differently across machines and CI would cry staleness.
    const a = tmp();
    writeFileSync(join(a, "z.ts"), "z", "utf8");
    writeFileSync(join(a, "a.ts"), "a", "utf8");
    const b = tmp();
    writeFileSync(join(b, "a.ts"), "a", "utf8");
    writeFileSync(join(b, "z.ts"), "z", "utf8");
    expect(dirSha256(a)).toBe(dirSha256(b));
  });

  it("includes marker directories — they change the starting git state", () => {
    const plain = tree({ "a.ts": "1" });
    const staged = tree({ "a.ts": "1", "_staged/b.ts": "2" });
    expect(dirSha256(staged)).not.toBe(dirSha256(plain));
  });

  it("returns null for a missing directory", () => {
    expect(dirSha256(join(tmpdir(), "sc-does-not-exist-xyz"))).toBeNull();
  });

  it("skips symlinks rather than following them out of the fixture", () => {
    const d = tmp();
    writeFileSync(join(d, "a.ts"), "1", "utf8");
    const before = dirSha256(d);
    const outside = tmp();
    writeFileSync(join(outside, "secret.ts"), "elsewhere", "utf8");
    symlinkSync(join(outside, "secret.ts"), join(d, "link.ts"));
    expect(dirSha256(d)).toBe(before);
  });
});

describe("scenarioDigest", () => {
  it("changes when the checklist changes", () => {
    expect(scenarioDigest(scenario())).not.toBe(scenarioDigest(scenario({ checklist: ["something else"] })));
  });

  it("changes when turns, title, criticality or gates change", () => {
    const base = scenarioDigest(scenario());
    expect(scenarioDigest(scenario({ turns: ["different"] }))).not.toBe(base);
    expect(scenarioDigest(scenario({ title: "renamed" }))).not.toBe(base);
    expect(scenarioDigest(scenario({ critical: true }))).not.toBe(base);
    expect(scenarioDigest(scenario({ mode: "seeded", assert: { vitest: true } }))).not.toBe(base);
    expect(scenarioDigest(scenario({ mode: "seeded", assert: { diff_excludes: ["x"] } }))).not.toBe(base);
    expect(scenarioDigest(scenario({ mode: "seeded", assert: { post_test: "p.test.ts" } }))).not.toBe(base);
  });

  it("is stable for an identical scenario", () => {
    expect(scenarioDigest(scenario())).toBe(scenarioDigest(scenario()));
  });
});

describe("sourceHashes / currentHashFor round-trip", () => {
  function skillWithFixture() {
    const skillDir = tmp();
    writeFileSync(join(skillDir, "SKILL.md"), "# skill\n", "utf8");
    const specDir = join(skillDir, "tests");
    mkdirSync(join(specDir, "fixtures", "A1"), { recursive: true });
    writeFileSync(join(specDir, "fixtures", "A1", "a.ts"), "1\n", "utf8");
    return { skillDir, specDir };
  }

  const seeded = scenario({ mode: "seeded", fixture: "fixtures/A1", workspace: { fixture: "fixtures/A1" } });

  it("every recorded key resolves to the same hash while nothing changes", () => {
    const { skillDir, specDir } = skillWithFixture();
    const ctx = { skillDir, specDir, scenarios: [seeded] };
    const recorded = sourceHashes(ctx);
    expect(Object.keys(recorded).sort()).toEqual(["SKILL.md", "fixture:fixtures/A1", "scenario:A1"]);
    for (const [key, value] of Object.entries(recorded)) {
      expect(currentHashFor(key, ctx)).toBe(value);
    }
  });

  it("a removed scenario resolves to undefined — not comparable, so lint stays quiet", () => {
    const { skillDir, specDir } = skillWithFixture();
    expect(currentHashFor("scenario:GONE", { skillDir, specDir, scenarios: [seeded] })).toBeUndefined();
  });

  it("a deleted fixture resolves to null — a real 'no longer exists' finding", () => {
    const { skillDir, specDir } = skillWithFixture();
    rmSync(join(specDir, "fixtures", "A1"), { recursive: true, force: true });
    expect(currentHashFor("fixture:fixtures/A1", { skillDir, specDir, scenarios: [seeded] })).toBeNull();
  });

  it("two scenarios sharing one fixture record it once", () => {
    const { skillDir, specDir } = skillWithFixture();
    const b = scenario({ id: "A2", mode: "seeded", fixture: "fixtures/A1", workspace: { fixture: "fixtures/A1" } });
    const recorded = sourceHashes({ skillDir, specDir, scenarios: [seeded, b] });
    expect(Object.keys(recorded).filter((k) => k.startsWith("fixture:"))).toEqual(["fixture:fixtures/A1"]);
    expect(recorded["scenario:A1"]).toBeDefined();
    expect(recorded["scenario:A2"]).toBeDefined();
  });
});
