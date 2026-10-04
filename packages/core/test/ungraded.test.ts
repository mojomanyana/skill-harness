import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { outcomesToResult, aggregateReps, type RepOutcome } from "../src/reps.js";
import { score } from "../src/score.js";
import { finalizeResults, readResults, validateResults, type ResultsDraft } from "../src/results.js";
import { parseSpec } from "../src/spec.js";
import { rescoreRun } from "../src/rescore.js";
import { collectReport } from "../src/report.js";
import { formatScorecard } from "../src/run.js";
import { judgeOneRep } from "../src/regrade.js";
import yaml from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";

const dirs: string[] = [];
const tmp = () => { const dir = mkdtempSync(join(tmpdir(), "ungraded-")); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const judge = { provider: "openai-codex", model: "judge" };
const voted = (votes: Array<"PASS" | "FAIL" | "ERROR">, suspect = false): RepOutcome => ({
  verdict: "PASS", reason: "judge claimed PASS", suspect,
  judgment: { ordinal: 1, judge, verdict: "PASS", reason: "judge claimed PASS", suspect,
    criteria: votes.map((verdict, i) => ({ index: i + 1, verdict, reason: verdict })) },
});
const spec = parseSpec(`skill: demo
judge_persona: judge
ship_bar: { total: 1, min_pass: 1 }
critical: []
scenarios:
  - id: A1
    title: demo
    turns: [hello]
    checklist: [first, second]
`, "specification.yaml");
const draft = (scenario = outcomesToResult("A1", [voted(["ERROR", "ERROR"])], 1, 0.5)): ResultsDraft => ({
  skill: "demo", harness: "pi", model: "fake:subject", judge,
  timestamp: "2026-10-02T00:00:00Z", label: null, mode: "force", scenarios: [scenario],
});

describe("incomplete criterion votes are UNGRADED", () => {
  it.each([["ERROR", "ERROR"], ["ERROR", "PASS"], ["PASS", "ERROR"], ["ERROR", "FAIL"]] as const)("does not credit %s/%s as a passing rep", (a, b) => {
    const result = outcomesToResult("A1", [voted([a, b])], 1, 0.5);
    expect(result).toMatchObject({ judge_verdict: "UNGRADED", suspect: false, ungraded_reps: 1 });
    expect(result.rep_judgments?.[0].recorded_verdict).toBe("UNGRADED");
    expect(result.rep_judgments?.[0].judgments[0].verdict).toBe("PASS"); // raw proposal remains evidence
  });
  it("keeps all-PASS votes graded", () => {
    const result = outcomesToResult("A1", [voted(["PASS", "PASS"])], 1, 0.5);
    expect(result.judge_verdict).toBe("PASS");
    expect(result).not.toHaveProperty("ungraded_reps");
  });
  it("keeps UNGRADED in the denominator, including suspect missing-vote replies", () => {
    const outcomes = [voted(["PASS", "PASS"]), voted(["PASS", "PASS"]), voted(["ERROR", "PASS"], true)];
    expect(aggregateReps(outcomes, 0.5)).toMatchObject({ verdict: "PASS", passes: 2, clean: 3, suspect: false });
    expect(outcomesToResult("A1", outcomes, 3, 1)).toMatchObject({ judge_verdict: "UNGRADED", passes: 2, clean: 3, ungraded_reps: 1 });
  });
  it("never turns an all-ungraded set into PASS at threshold zero", () => {
    expect(aggregateReps([voted(["ERROR", "ERROR"])], 0).verdict).toBe("UNGRADED");
  });
  it("retains objective FAIL and infrastructure ERROR precedence", () => {
    const objective = { status: "FAIL" as const, assertions: [] };
    expect(outcomesToResult("A1", [{ ...voted(["ERROR", "PASS"]), verdict: "FAIL", objective }], 1, 0.5).judge_verdict).toBe("FAIL");
    expect(outcomesToResult("A1", [{ ...voted(["ERROR", "PASS"]), verdict: "ERROR" }], 1, 0.5).judge_verdict).toBe("ERROR");
  });
  it("uses FAIL ship-bar allowances, while critical and B-series still gate", () => {
    const bar = { shipBar: { total: 2, min_pass: 1, no_critical_fail: true }, critical: [] as string[] };
    const verdicts = [{ id: "A1", verdict: "PASS" as const }, { id: "A2", verdict: "UNGRADED" as any }];
    expect(score(verdicts, bar)).toMatchObject({ total: 2, passed: 1, pct: 50, ship: true, ungradedCount: 1 });
    expect(score(verdicts, { ...bar, critical: ["A2"] }).ship).toBe(false);
    expect(score([verdicts[0], { ...verdicts[1], id: "B1" }], bar).ship).toBe(false);
  });
  it("after one judge retry records UNGRADED but preserves the final raw proposal", async () => {
    const runDir = tmp(); let calls = 0;
    const outcome = await judgeOneRep({ runDir, spec, scenario: spec.scenarios[0], transcript: "hello",
      adapter: { name: "pi", available: async () => true, run: async () => "", judge: async () => { calls++; return "1. PASS — first\nVERDICT: PASS\nREASON: incomplete"; } },
      judge, specDir: runDir, mode: "force", rep: undefined, now: () => "now" });
    expect(calls).toBe(2);
    expect(outcome).toMatchObject({ verdict: "UNGRADED", suspect: false, judgment: { verdict: "PASS", judgeRetries: 1 } });
    expect(readFileSync(join(runDir, "A1.force.judge.txt"), "utf8")).toContain("VERDICT: PASS");
  });
  it("round-trips additive UNGRADED evidence in both result schemas", () => {
    const outcome = voted(["ERROR", "PASS"]);
    const objective = { status: "PASS" as const, assertions: [{ kind: "skill_delivered", status: "PASS" as const, detail: "observed" }] };
    const h = "a".repeat(64);
    for (const schema of [2, 3] as const) {
      const scenario = outcomesToResult("A1", [{ ...outcome, objective }], 1, 0.5);
      scenario.criterion_count = 2;
      const results = finalizeResults({ ...draft(scenario), schema, ...(schema === 3 ? { subject_invocations: [{ scenario_id: "A1", repetition: 0, prompt: {
        capture_version: "prompt-provenance-v1" as const, request_index: 0, raw_sha256: h, normalized_sha256: h,
        normalization_rule: "cwd-line-v1" as const, bytes: 1, contract_sha256: h, contract_bytes: 1,
        contract_occurrences: 1, mechanism: "append-system-prompt" as const, status: "PASS" as const,
      } }] } : {}) }, { shipBar: spec.ship_bar, critical: [] });
      const validator = new Ajv2020({ allErrors: true, strict: true }).compile(JSON.parse(readFileSync(`schemas/results-v${schema}.schema.json`, "utf8")));
      expect(validator(results), JSON.stringify(validator.errors)).toBe(true);
      expect(validateResults(results).scenarios[0]).toMatchObject({ judge_verdict: "UNGRADED", ungraded_reps: 1 });
    }
  });
  it("surfaces the ungraded count in the terminal scorecard", () => {
    const results = finalizeResults(draft(), { shipBar: spec.ship_bar, critical: [] });
    const text = formatScorecard({ runDir: "unused", results });
    expect(text).toContain("UNGRADED");
    expect(text).toContain("1 ungraded rep");
    expect(results.effective_grade).toMatchObject({ passed: 0, total: 1, ship: false });
  });
  it("rescores retained missing-vote PASS records offline without changing raw evidence", () => {
    const root = tmp(), runDir = join(root, "tests", "results", "pi-fake", "2026-10-02");
    mkdirSync(runDir, { recursive: true }); writeFileSync(join(root, "tests", "specification.yaml"), yaml.dump(spec));
    const old = { ...draft(), schema: 2, effective_grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
      scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "old", suspect: false, override: null, note: "",
        rep_judgments: [{ repetition: 0, recorded_verdict: "PASS", judgments: [voted(["ERROR", "PASS"]).judgment] }] }] };
    writeFileSync(join(runDir, "results.yaml"), yaml.dump(old));
    const raw = "VERDICT: PASS\nREASON: old"; writeFileSync(join(runDir, "A1.force.judge.txt"), raw);
    const report = collectReport(root);
    expect(report.columns[0].cells.A1.judge_verdict).toBe("UNGRADED");
    expect(report.columns[0].cells.A1).toHaveProperty("ungraded_reps", 1);
    const rescored = rescoreRun({ runDir, spec });
    expect(rescored.results.scenarios[0].judge_verdict).toBe("UNGRADED");
    expect(rescored.changes).toMatchObject([{ id: "A1", from: "PASS", to: "UNGRADED" }]);
    expect(readResults(runDir).effective_grade).toMatchObject({ passed: 0, total: 1, ship: false });
    expect(readFileSync(join(runDir, "A1.force.judge.txt"), "utf8")).toBe(raw);
  });
});
