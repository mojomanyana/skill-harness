import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { collectTrends, writeResults } from "../src/index.js";

const tmps: string[] = [];
function skill() {
  const d = mkdtempSync(join(tmpdir(), "sc-trends-"));
  tmps.push(d);
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "tests", "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\ncritical: [A1]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
  return d;
}
function run(
  skillDir: string, ts: string, verdict: "PASS" | "FAIL", override: "PASS" | "FAIL" | null = null,
  opts: { tag?: string; model?: string } = {}
) {
  const tag = opts.tag ?? "pi-fake";
  const model = opts.model ?? "fireworks:fake";
  const runDir = join(skillDir, "tests", "results", tag, ts.replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  writeResults(runDir, {
    skill: "demo", harness: "pi", model,
    judge: { provider: "claude-code", model: "opus" }, timestamp: ts, label: `run-${ts}`, mode: "green",
    scenarios: [{ id: "A1", judge_verdict: verdict, judge_reason: "", suspect: false, override, note: "" }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

describe("collectTrends", () => {
  it("returns runs per model chronologically (newest last), override-aware cells", () => {
    const d = skill();
    run(d, "2026-07-01T00:00:00Z", "FAIL", "PASS"); // override flips to PASS
    run(d, "2026-07-02T00:00:00Z", "PASS");
    const t = collectTrends(d);
    expect(t.models).toHaveLength(1);
    const m = t.models[0];
    expect(m.runs.map((r) => r.timestamp)).toEqual(["2026-07-01T00:00:00Z", "2026-07-02T00:00:00Z"]);
    expect(m.runs[0].cells.A1.verdict).toBe("PASS"); // override-aware
    expect(m.truncated).toBe(false);
  });

  it("keeps only the most recent `limit` runs and flags truncated", () => {
    const d = skill();
    for (let i = 1; i <= 5; i++) run(d, `2026-07-0${i}T00:00:00Z`, "PASS");
    const t = collectTrends(d, 3);
    expect(t.models[0].runs).toHaveLength(3);
    expect(t.models[0].runs[0].timestamp).toBe("2026-07-03T00:00:00Z"); // oldest kept
    expect(t.models[0].truncated).toBe(true);
  });

  it("empty results root → no models", () => {
    expect(collectTrends(skill()).models).toEqual([]);
  });

  it("migrates a schema-1 run", () => {
    const d = skill();
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, "results.yaml"), yaml.dump({
      skill: "demo", harness: "pi", model: "m", judge: { provider: "p", model: "j" },
      timestamp: "2026-07-01T00:00:00Z",
      grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "", override: null, note: "" }],
    }), "utf8");
    const t = collectTrends(d);
    expect(t.models[0].runs[0].cells.A1.verdict).toBe("PASS");
    expect(t.models[0].runs[0].label).toBeNull(); // schema-1 → label null after migration
  });

  it("skips a run with a malformed results.yaml instead of throwing, warns, and counts it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const d = skill();
      run(d, "2026-07-01T00:00:00Z", "PASS"); // one valid run
      const badDir = join(d, "tests", "results", "pi-fake", "2026-07-02T00-00-00Z");
      mkdirSync(badDir, { recursive: true });
      writeFileSync(join(badDir, "results.yaml"), "", "utf8"); // empty/malformed — readResults throws
      let t: ReturnType<typeof collectTrends>;
      expect(() => { t = collectTrends(d); }).not.toThrow();
      expect(t.models).toHaveLength(1);
      expect(t.models[0].runs).toHaveLength(1); // the corrupt run is skipped, not surfaced
      expect(t.models[0].runs[0].timestamp).toBe("2026-07-01T00:00:00Z");
      expect(t.models[0].skipped).toBe(1); // the parse failure is counted
      expect(warn).toHaveBeenCalledTimes(1); // and logged, not silent
      expect(warn.mock.calls[0][0]).toMatch(/skipping unreadable run/);
    } finally {
      warn.mockRestore();
    }
  });

  it("groups runs into one model per tag, sorted by tag, with round-tripped model/tag/grade", () => {
    const d = skill();
    run(d, "2026-07-01T00:00:00Z", "PASS", null, { tag: "pi-zebra", model: "fireworks:zeta" });
    run(d, "2026-07-01T00:00:00Z", "FAIL", null, { tag: "pi-alpha", model: "anthropic:claude" });
    const t = collectTrends(d);
    expect(t.models).toHaveLength(2);
    expect(t.models.map((m) => m.tag)).toEqual(["pi-alpha", "pi-zebra"]); // tags sorted
    expect(t.models[0].model).toBe("anthropic:claude");
    expect(t.models[0].runs[0].grade.pct).toBe(0); // FAIL, 0/1
    expect(t.models[1].model).toBe("fireworks:zeta");
    expect(t.models[1].runs[0].grade.pct).toBe(100); // PASS, 1/1
  });

  it("flags a suspect cell and omits a cell absent from a run's scenarios", () => {
    const d = mkdtempSync(join(tmpdir(), "sc-trends-"));
    tmps.push(d);
    mkdirSync(join(d, "tests"), { recursive: true });
    writeFileSync(join(d, "tests", "specification.yaml"),
      `skill: demo\njudge_persona: a judge.\nship_bar: { total: 2, min_pass: 1 }\ncritical: [A1]\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n  - id: B1\n    title: t2\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeResults(runDir, {
      skill: "demo", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" }, timestamp: "2026-07-01T00:00:00Z", label: "r1", mode: "green",
      // B1 is absent from this run's scenarios entirely (e.g. added to the spec later).
      scenarios: [{ id: "A1", judge_verdict: "PASS" as const, judge_reason: "", suspect: true, override: null, note: "" }],
    }, { shipBar: { total: 2, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
    const t = collectTrends(d);
    expect(t.models[0].runs[0].cells.A1.suspect).toBe(true);
    expect(t.models[0].runs[0].cells.B1).toBeUndefined();
  });

  it("an override resolves a suspect misfire — cell matches the canonical effectiveVerdicts rule", () => {
    const d = skill();
    const runDir = join(d, "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(runDir, { recursive: true });
    writeResults(runDir, {
      skill: "demo", harness: "pi", model: "fireworks:fake",
      judge: { provider: "claude-code", model: "opus" }, timestamp: "2026-07-01T00:00:00Z", label: "r1", mode: "green",
      scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "", suspect: true, override: "PASS", note: "author call" }],
    }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });
    const t = collectTrends(d);
    const cell = t.models[0].runs[0].cells.A1;
    expect(cell.verdict).toBe("PASS"); // override wins
    expect(cell.suspect).toBe(false); // override resolves the misfire — must match effectiveVerdicts
  });
});
