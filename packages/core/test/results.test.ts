import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runDirFor,
  writeResults,
  readResults,
  applyOverride,
  ensureResultsGitignore,
  type ResultsFile,
} from "../src/results.js";

const tmps: string[] = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "sc-results-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

const sample: ResultsFile = {
  skill: "ponytail",
  harness: "pi",
  model: "fireworks:accounts/fireworks/models/deepseek-v4-pro",
  judge: { provider: "anthropic", model: "claude-opus-4-8" },
  timestamp: "2026-06-25T14:03:00Z",
  grade: { passed: 6, total: 8, pct: 75, letter: "C", ship: false, note: "gated: 1 critical fail" },
  scenarios: [
    { id: "A1", judge_verdict: "PASS", judge_reason: "points to max", override: null, note: "" },
    { id: "C1", judge_verdict: "FAIL", judge_reason: "stripped guard", override: null, note: "" },
  ],
};

describe("runDirFor", () => {
  test("builds <skillDir>/tests/results/pi-<model-slug>/<timestamp>", () => {
    const dir = runDirFor("/skills/ponytail", "pi", {
      provider: "fireworks",
      model: "accounts/fireworks/models/deepseek-v4-pro",
    }, "2026-06-25T14:03:00Z");
    expect(dir).toContain(join("/skills/ponytail", "tests", "results"));
    expect(dir).toMatch(/pi-fireworks-accounts-fireworks-models-deepseek-v4-pro/);
    // timestamp colons are not filesystem-friendly on all platforms — slugified
    expect(dir).not.toMatch(/14:03:00/);
  });
});

describe("writeResults / readResults round-trip", () => {
  test("writes results.yaml and reads it back equal", () => {
    const dir = tmp();
    writeResults(dir, sample);
    expect(existsSync(join(dir, "results.yaml"))).toBe(true);
    const back = readResults(dir);
    expect(back).toEqual(sample);
  });
});

describe("applyOverride", () => {
  test("sets override + note on the named scenario, leaving others", () => {
    const next = applyOverride(sample, "C1", "PASS", "false alarm, guard kept");
    const c1 = next.scenarios.find((s) => s.id === "C1")!;
    const a1 = next.scenarios.find((s) => s.id === "A1")!;
    expect(c1.override).toBe("PASS");
    expect(c1.note).toBe("false alarm, guard kept");
    expect(a1.override).toBeNull();
  });

  test("clears override when passed null", () => {
    const set = applyOverride(sample, "C1", "PASS", "x");
    const cleared = applyOverride(set, "C1", null, "x");
    expect(cleared.scenarios.find((s) => s.id === "C1")!.override).toBeNull();
  });

  test("throws for an unknown scenario id", () => {
    expect(() => applyOverride(sample, "ZZ", "PASS", "")).toThrow(/ZZ/);
  });
});

describe("ensureResultsGitignore", () => {
  test("writes a results/.gitignore that ignores transcripts + report but keeps results.yaml", () => {
    const dir = tmp();
    ensureResultsGitignore(dir);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toMatch(/\*\.txt/);
    expect(gi).toMatch(/report\.html/);
    expect(gi).toMatch(/!.*results\.yaml/);
  });
});
