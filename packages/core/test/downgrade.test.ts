import { describe, test, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newestRecordedVersion, assertNotDowngraded, downgradeWarning, compareVersions } from "../src/downgrade.js";
import { HARNESS_VERSION } from "../src/version.js";

/** A results tree with one run per given harness_version. */
function tree(versions: Array<string | undefined>): string {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-dg-"));
  const root = join(skillDir, "tests", "results");
  versions.forEach((v, i) => {
    const runDir = join(root, `pi-fake${i}`, `2026-08-0${i + 1}T00-00-00Z`);
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, "results.yaml"),
      `schema: 2\n${v ? `harness_version: ${v}\n` : ""}skill: demo\nharness: pi\nmodel: m\n` +
        `judge: {provider: claude-code, model: opus}\ntimestamp: 't'\nlabel: null\nmode: green\n` +
        `effective_grade: {passed: 1, total: 1, pct: 100, letter: A, ship: true, note: ''}\nscenarios: []\n`,
      "utf8",
    );
  });
  return skillDir;
}

describe("compareVersions", () => {
  test("orders by numeric component, not lexically", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0); // the lexical trap
    expect(compareVersions("0.3.2", "0.3.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  // A prerelease is not worth ordering precisely, but it must not crash or compare as
  // newer than the release it precedes.
  test("a prerelease suffix is ignored rather than mis-ordered", () => {
    expect(compareVersions("0.4.0-rc.1", "0.4.0")).toBe(0);
  });
});

describe("newestRecordedVersion", () => {
  test("is the highest harness_version anywhere in the tree", () => {
    expect(newestRecordedVersion(tree(["0.3.2", "0.4.0", "0.3.9"]))).toBe("0.4.0");
  });

  test("runs with no version recorded are simply not evidence", () => {
    expect(newestRecordedVersion(tree([undefined, undefined]))).toBeNull();
    expect(newestRecordedVersion(tree([undefined, "0.4.0"]))).toBe("0.4.0");
  });

  test("a tree with no results at all is null, not an error", () => {
    expect(newestRecordedVersion(mkdtempSync(join(tmpdir(), "sh-empty-")))).toBeNull();
  });
});

describe("the downgrade tripwire", () => {
  // The measured near-miss: a stale global 0.1.0 would have spent ~102 rep-executions
  // grading WITHOUT showing the judge the diff — the exact defect being re-measured —
  // and every number would have looked plausible.
  test("run refuses when the tree holds records from a newer harness", () => {
    expect(() => assertNotDowngraded(tree(["9.9.9"]), "run")).toThrow(/9\.9\.9/);
    expect(() => assertNotDowngraded(tree(["9.9.9"]), "run")).toThrow(/refusing|not comparable/i);
  });

  test("the refusal names the version to upgrade to, and how", () => {
    let msg = "";
    try { assertNotDowngraded(tree(["9.9.9"]), "run"); } catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain(HARNESS_VERSION); // what you are running
    expect(msg).toContain("9.9.9"); // what the records were made by
    expect(msg).toMatch(/npx|install|upgrade/i); // what to do
  });

  test("an equal or older tree passes silently — the common case", () => {
    expect(() => assertNotDowngraded(tree([HARNESS_VERSION]), "run")).not.toThrow();
    expect(() => assertNotDowngraded(tree(["0.0.1"]), "run")).not.toThrow();
    expect(() => assertNotDowngraded(tree([undefined]), "run")).not.toThrow();
  });

  // grade and lint warn instead of refusing: both are cheap, both are how someone
  // diagnoses the situation, and neither writes a fresh measurement that could later
  // be mistaken for one made by the newer tool.
  test("grade and lint get a warning, not a refusal", () => {
    expect(() => assertNotDowngraded(tree(["9.9.9"]), "grade")).not.toThrow();
    const w = downgradeWarning(tree(["9.9.9"]));
    expect(w).toContain("9.9.9");
    expect(w).toMatch(/older/i);
  });

  test("no warning when nothing is newer", () => {
    expect(downgradeWarning(tree(["0.0.1"]))).toBeNull();
    expect(downgradeWarning(tree([undefined]))).toBeNull();
  });
});
