import { describe, it, expect, afterEach } from "vitest";
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
function run(skillDir: string, ts: string, verdict: "PASS" | "FAIL", override: "PASS" | "FAIL" | null = null) {
  const runDir = join(skillDir, "tests", "results", "pi-fake", ts.replace(/[:.]/g, "-"));
  mkdirSync(runDir, { recursive: true });
  writeResults(runDir, {
    skill: "demo", harness: "pi", model: "fireworks:fake",
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
});
