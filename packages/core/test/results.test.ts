import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  runDirFor,
  writeResults,
  readResults,
  applyOverride,
  ensureResultsGitignore,
  preserveTranscript,
  finalizeResults,
  migrateResults,
  effectiveVerdicts,
  type ResultsDraft,
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

const draft: ResultsDraft = {
  skill: "ponytail",
  harness: "pi",
  model: "fireworks:accounts/fireworks/models/deepseek-v4-pro",
  judge: { provider: "anthropic", model: "claude-opus-4-8" },
  timestamp: "2026-06-25T14:03:00Z",
  label: "round-1",
  mode: "green",
  scenarios: [
    { id: "A1", judge_verdict: "PASS", judge_reason: "points to max", suspect: false, override: null, note: "" },
    { id: "C1", judge_verdict: "FAIL", judge_reason: "stripped guard", suspect: false, override: null, note: "" },
  ],
};
const ctx = { shipBar: { total: 2, min_pass: 2, no_critical_fail: true }, critical: ["C1"] };
const sample = finalizeResults(draft, ctx);

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
  test("writes results.yaml (computing effective_grade) and reads it back equal", () => {
    const dir = tmp();
    const written = writeResults(dir, draft, ctx);
    expect(existsSync(join(dir, "results.yaml"))).toBe(true);
    expect(readResults(dir)).toEqual(written);
    expect(written.effective_grade.passed).toBe(1);
  });

  test("readResults migrates a schema-1 file in memory", () => {
    const dir = tmp();
    const v1 = { skill: "x", harness: "pi", model: "m", judge: { provider: "p", model: "j" },
      timestamp: "t", grade: { passed: 0, total: 0, pct: 0, letter: "F", ship: false, note: "" }, scenarios: [] };
    writeFileSync(join(dir, "results.yaml"), yaml.dump(v1), "utf8");
    const r = readResults(dir);
    expect(r.schema).toBe(2);
    expect(r.effective_grade.letter).toBe("F");
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
    expect(() => applyOverride(sample, "ZZ", "PASS", "some note")).toThrow(/ZZ/);
  });
});

describe("applyOverride requires a note", () => {
  test("throws when setting an override with an empty note", () => {
    expect(() => applyOverride(sample, "C1", "PASS", "")).toThrow(/requires a note/);
    expect(() => applyOverride(sample, "C1", "PASS", "   ")).toThrow(/requires a note/);
  });

  test("clearing an override needs no note", () => {
    const set = applyOverride(sample, "C1", "PASS", "why");
    expect(() => applyOverride(set, "C1", null, "")).not.toThrow();
  });
});

describe("preserveTranscript", () => {
  test("appends a gitignore negation for the scenario transcript, idempotently", () => {
    const root = tmp();
    const runDir = join(root, "pi-fake", "2026-07-03T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "C1.green.txt"), "transcript", "utf8");
    preserveTranscript(root, runDir, "C1");
    preserveTranscript(root, runDir, "C1"); // twice — must not duplicate
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    const line = "!pi-fake/2026-07-03T00-00-00Z/C1.green.txt";
    expect(gi.split("\n").filter((l) => l === line)).toHaveLength(1);
  });

  test("no transcript file → no-op", () => {
    const root = tmp();
    const runDir = join(root, "pi-fake", "ts");
    mkdirSync(runDir, { recursive: true });
    expect(() => preserveTranscript(root, runDir, "ZZ")).not.toThrow();
  });
});

describe("ensureResultsGitignore migration", () => {
  test("rewrites a stale body but keeps preservation lines", () => {
    const root = tmp();
    writeFileSync(join(root, ".gitignore"), "old body\n!results.yaml\n!pi-fake/ts/C1.green.txt\n", "utf8");
    ensureResultsGitignore(root);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^# skill-check:/); // managed header restored
    expect(gi).toContain("!pi-fake/ts/C1.green.txt"); // preservation kept
    expect(gi).not.toContain("old body");
  });

  test("is a no-op when the managed body is current", () => {
    const root = tmp();
    ensureResultsGitignore(root);
    const before = readFileSync(join(root, ".gitignore"), "utf8");
    ensureResultsGitignore(root);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toBe(before);
  });
});

describe("finalizeResults", () => {
  test("computes effective_grade from judge verdicts when no overrides", () => {
    const r = finalizeResults(draft, ctx);
    expect(r.schema).toBe(2);
    expect(r.effective_grade.passed).toBe(1);
    expect(r.effective_grade.ship).toBe(false); // C1 critical FAIL gates
    expect(r.effective_grade.note).toMatch(/critical/);
  });

  test("an override flips the effective grade — stale grades impossible", () => {
    const overridden = applyOverride(sample, "C1", "PASS", "false alarm, guard kept");
    const r = finalizeResults(overridden, ctx);
    expect(r.effective_grade.passed).toBe(2);
    expect(r.effective_grade.ship).toBe(true);
  });

  test("null context (red/force runs) → not-scored placeholder", () => {
    const r = finalizeResults({ ...draft, mode: "red" }, null);
    expect(r.effective_grade.letter).toBe("-");
    expect(r.effective_grade.note).toBe("mode=red (not scored)");
  });
});

describe("effectiveVerdicts", () => {
  test("override wins over judge verdict", () => {
    const vs = effectiveVerdicts(applyOverride(sample, "C1", "PASS", "why").scenarios);
    expect(vs).toEqual([
      { id: "A1", verdict: "PASS", suspect: false },
      { id: "C1", verdict: "PASS", suspect: false },
    ]);
  });
});

describe("schema-1 migration", () => {
  const v1yaml = `
skill: ponytail
harness: pi
model: fireworks:accounts/fireworks/models/deepseek-v4-pro
judge: { provider: anthropic, model: claude-opus-4-8 }
timestamp: 2026-06-25T14:03:00Z
grade: { passed: 1, total: 2, pct: 50, letter: F, ship: false, note: "gated: 1 critical fail" }
scenarios:
  - { id: A1, judge_verdict: PASS, judge_reason: points to max, override: null, note: "" }
  - { id: C1, judge_verdict: FAIL, judge_reason: "[suspect misfire: no failed item in judge output] stripped guard", override: null, note: "" }
`;

  test("migrates a v1 doc: grade→effective_grade, suspect lifted from reason prefix", () => {
    const r = migrateResults(yaml.load(v1yaml));
    expect(r.schema).toBe(2);
    expect(r.label).toBeNull();
    expect(r.mode).toBe("green");
    expect(r.effective_grade.pct).toBe(50);
    const c1 = r.scenarios.find((s) => s.id === "C1")!;
    expect(c1.suspect).toBe(true);
    expect(c1.judge_reason).toBe("stripped guard");
    expect(r.scenarios.find((s) => s.id === "A1")!.suspect).toBe(false);
  });

  test("infers mode from a v1 not-scored note", () => {
    const doc = yaml.load(v1yaml) as Record<string, unknown>;
    (doc.grade as Record<string, unknown>).note = "mode=red (not scored)";
    expect(migrateResults(doc).mode).toBe("red");
  });

  test("passes schema-2 docs through untouched", () => {
    expect(migrateResults(sample)).toEqual(sample);
  });

  test("throws a targeted error for undefined input", () => {
    expect(() => migrateResults(undefined)).toThrow(/empty or invalid/);
  });

  test("throws a targeted error for an empty-string (empty YAML) doc", () => {
    expect(() => migrateResults(yaml.load(""))).toThrow(/empty or invalid/);
  });

  test("a v1 scenario missing judge_reason migrates instead of throwing", () => {
    const doc = yaml.load(v1yaml) as Record<string, unknown>;
    const scenarios = doc.scenarios as Array<Record<string, unknown>>;
    delete scenarios[1].judge_reason;
    const r = migrateResults(doc);
    const c1 = r.scenarios.find((s) => s.id === "C1")!;
    expect(c1.judge_reason).toBe("");
    expect(c1.suspect).toBe(false);
  });
});

describe("effectiveVerdicts + finalizeResults with suspect", () => {
  test("effectiveVerdicts marks suspect only when unresolved (no override)", () => {
    const scenarios = [
      { id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "" },
      { id: "A2", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: null, note: "" },
      { id: "A3", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: "PASS", note: "resolved" },
    ] as const;
    const vs = effectiveVerdicts(scenarios as any);
    expect(vs.find((v) => v.id === "A2")!.suspect).toBe(true);
    expect(vs.find((v) => v.id === "A3")!.suspect).toBeFalsy(); // override resolves it
    expect(vs.find((v) => v.id === "A3")!.verdict).toBe("PASS");
  });

  test("an unresolved suspect blocks ship; an override resolves it", () => {
    const susDraft = {
      ...draft,
      scenarios: [
        { id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "" },
        { id: "C1", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: null, note: "" },
      ],
    };
    expect(finalizeResults(susDraft, ctx).effective_grade.ship).toBe(false);
    const resolved = applyOverride(finalizeResults(susDraft, ctx), "C1", "PASS", "looked, judge misfired");
    expect(finalizeResults(resolved, ctx).effective_grade.ship).toBe(true);
  });
});

describe("ensureResultsGitignore", () => {
  test("writes a results/.gitignore that ignores transcripts + report but keeps results.yaml", () => {
    const dir = tmp();
    ensureResultsGitignore(dir);
    const gi = readFileSync(join(dir, ".gitignore"), "utf8");
    expect(gi).toMatch(/\*\.txt/);
    expect(gi).toMatch(/\*\.jsonl/);
    expect(gi).toMatch(/report\.html/);
    expect(gi).toMatch(/!.*results\.yaml/);
  });
});
