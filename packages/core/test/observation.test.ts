import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import {
  parseCriterionVotes, completeCriterionVotes,
  recomputeRecordedPanels,
  validateResults, writeResults, readResults,
  type ResultsFile,
} from "../src/results.js";

const h = "a".repeat(64);
const prompt = {
  capture_version: "prompt-provenance-v1" as const,
  request_index: 0,
  raw_sha256: h,
  normalized_sha256: h,
  normalization_rule: "cwd-line-v1" as const,
  bytes: 10,
  contract_sha256: h,
  contract_bytes: 5,
  contract_occurrences: 1,
  mechanism: "append-system-prompt" as const,
  status: "PASS" as const,
};
const vote = {
  ordinal: 1,
  judge: { provider: "fake", model: "judge" },
  verdict: "PASS" as const,
  reason: "ok",
  suspect: false,
  criteria: [
    { index: 1, verdict: "PASS" as const, reason: "did it" },
    { index: 2, verdict: "PASS" as const, reason: "also did it" },
  ],
};
function result(): ResultsFile {
  return {
    schema: 3, skill: "x", harness: "pi", model: "fake:m",
    judge: { provider: "fake", model: "judge" }, timestamp: "t", label: null, mode: "force",
    effective_grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
    subject_invocations: [{ scenario_id: "A1", repetition: 0, prompt: structuredClone(prompt) }],
    scenarios: [{ id: "A1", criterion_count: 2, judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "", objective: { status: "PASS", assertions: [{ kind: "skill_delivered", status: "PASS", detail: "one request" }] }, rep_judgments: [{ repetition: 0, judgments: [structuredClone(vote)], recorded_verdict: "PASS", objective: { status: "PASS", assertions: [{ kind: "skill_delivered", status: "PASS", detail: "one request" }] } }] }],
  };
}

describe("results-v3 retained observations", () => {
  it("missing delivery status fails validation (breaks if v3 observations become optional)", () => {
    const r: any = result(); delete r.subject_invocations[0].prompt.status;
    expect(() => validateResults(r)).toThrow(/status|delivery/i);
  });

  it("requires per-repetition delivery objectives (breaks if aggregate evidence can mask one repetition)", () => {
    const missing:any=result(); delete missing.scenarios[0].rep_judgments[0].objective;
    expect(() => validateResults(missing)).toThrow(/per-repetition objective missing/);
    const weaker:any=result(); weaker.subject_invocations[0].prompt.contract_occurrences=0; weaker.subject_invocations[0].prompt.status="NOT-MEASURED"; weaker.scenarios[0].objective.status="NOT-MEASURED"; weaker.scenarios[0].objective.assertions[0].status="NOT-MEASURED";
    expect(() => validateResults(weaker)).toThrow(/per-repetition skill_delivered/);
    const divergent:any=result(); divergent.scenarios[0].objective.status="FAIL";
    expect(() => validateResults(divergent)).toThrow(/scenario objective diverges/);
  });

  it("rejects a top-level PASS that contradicts retained repetition verdicts", () => {
    const r = result();
    const panel = r.scenarios[0].rep_judgments![0]; panel.judgments[0].verdict = "FAIL"; panel.judgments[0].criteria = panel.judgments[0].criteria!.map(vote => ({ ...vote, verdict: "FAIL" as const })); panel.recorded_verdict = "FAIL";
    expect(() => validateResults(r)).toThrow(/scenario verdict.*repetition|aggregate/i);
  });

  it("rejects a behavioral PASS with no retained clean judgment", () => {
    const r = result(); r.scenarios[0].rep_judgments![0].judgments = [];
    expect(() => validateResults(r)).toThrow(/unsupported.*judgment|clean.*judgment/i);
  });

  it("rejects a truncated criterion array using the retained expected count", () => {
    const r = result(); r.scenarios[0].rep_judgments![0].judgments[0].criteria!.pop();
    expect(() => validateResults(r)).toThrow(/criterion.*complete|indexes/i);
  });

  it("rejects adjudication state/verdict that contradicts recomputed clean votes", () => {
    const r = result();
    r.scenarios[0].adjudication = { repetition: 0, trigger: "ship_deciding", state: "unresolved", judgments: [vote, { ...structuredClone(vote), ordinal: 2 }] };
    expect(() => validateResults(r)).toThrow(/adjudication.*state|recomputed/i);
  });

  it("criterion votes round-trip and recorded panel verdict is recomputed (breaks if votes drop or panel validation is removed)", () => {
    const r = result();
    const dir = mkdtempSync(join(tmpdir(), "results-v3-roundtrip-"));
    try {
      const { effective_grade: _grade, ...draft } = r;
      writeResults(dir, draft, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: [] });
      const reread = readResults(dir);
      expect(reread.subject_invocations).toEqual(r.subject_invocations);
      expect(reread.scenarios[0].rep_judgments).toEqual(r.scenarios[0].rep_judgments);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    expect(validateResults(structuredClone(r))).toEqual(r);
    expect(recomputeRecordedPanels(r)).toEqual([{ scenario_id: "A1", repetition: 0, verdict: "PASS" }]);
    const bad: any = structuredClone(r); bad.scenarios[0].rep_judgments[0].recorded_verdict = "FAIL";
    expect(() => validateResults(bad)).toThrow(/recomputed|diverge/i);
  });

  it("accepts green progressive disclosure only after eventual exactly-once delivery (breaks if leading absence or total absence is misclassified)", () => {
    const r = result();
    const first = r.subject_invocations![0];
    first.prompt.mechanism = "pi-skill"; first.prompt.contract_occurrences = 0; first.prompt.status = "NOT-MEASURED";
    r.subject_invocations!.push({ ...structuredClone(first), prompt: { ...first.prompt, request_index: 1, contract_occurrences: 1, status: "PASS" } });
    expect(() => validateResults(r)).not.toThrow();
    r.subject_invocations![0].prompt.contract_occurrences = 1; r.subject_invocations![0].prompt.status = "PASS";
    r.subject_invocations![1].prompt.contract_occurrences = 0; r.subject_invocations![1].prompt.status = "NOT-MEASURED";
    expect(() => validateResults(r)).toThrow(/skill_delivered/);
  });

  it("selects the terminal retry independently per repetition (breaks if scenario-wide max attempt discards a sibling rep)", () => {
    const r = result(); r.scenarios[0].reps = 2;
    const rep0 = r.subject_invocations![0]; rep0.attempt = 0; rep0.prompt.status = "ERROR";
    r.subject_invocations!.push({ ...structuredClone(rep0), attempt: 1, prompt: { ...rep0.prompt, status: "PASS" } });
    r.subject_invocations!.push({ ...structuredClone(rep0), repetition: 1, attempt: 0, prompt: { ...rep0.prompt, status: "PASS" } });
    r.scenarios[0].rep_judgments = [r.scenarios[0].rep_judgments![0], { ...structuredClone(r.scenarios[0].rep_judgments![0]), repetition: 1 }];
    expect(() => validateResults(r)).not.toThrow();
  });

  it("rejects duplicate/missing repetition panels (breaks if panel-array length substitutes for repetition identity)", () => {
    const r = result(); r.scenarios[0].reps = 2;
    r.subject_invocations!.push({ ...structuredClone(r.subject_invocations![0]), repetition: 1 });
    r.scenarios[0].rep_judgments = [structuredClone(r.scenarios[0].rep_judgments![0]), structuredClone(r.scenarios[0].rep_judgments![0])];
    expect(() => validateResults(r)).toThrow(/duplicate|missing|range/);
  });

  it("recomputes a split plus tie-break from all retained members (breaks if a panel trusts its stored aggregate)", () => {
    const r = result();
    const panel = r.scenarios[0].rep_judgments![0];
    panel.judgments = [vote, { ...vote, ordinal: 2, verdict: "FAIL", criteria: [{ index: 1, verdict: "FAIL", reason: "missing" }, { index: 2, verdict: "PASS", reason: "ok" }] }, { ...vote, ordinal: 3 }];
    panel.recorded_verdict = "PASS";
    expect(() => validateResults(r)).not.toThrow();
    panel.recorded_verdict = "FAIL";
    expect(() => validateResults(r)).toThrow(/diverge/);
  });

  it("parses every numbered criterion without changing overall verdict parsing (breaks if criterion retention parser is removed)", () => {
    expect(parseCriterionVotes("1. PASS did it\n2) FAIL missing evidence\nVERDICT: FAIL\nREASON: item 2")).toEqual([
      { index: 1, verdict: "PASS", reason: "did it" },
      { index: 2, verdict: "FAIL", reason: "missing evidence" },
    ]);
  });

  it("retains an ERROR for every omitted numbered criterion (breaks if incomplete judge output becomes missing data)", () => {
    expect(completeCriterionVotes([{ index: 1, verdict: "PASS", reason: "ok" }], 2)).toEqual([
      { index: 1, verdict: "PASS", reason: "ok" },
      { index: 2, verdict: "ERROR", reason: "judge emitted no parseable vote for this criterion" },
    ]);
  });

  it("schema-v2 remains readable byte-for-byte after the bump (breaks if compatibility dispatch rewrites legacy evidence)", () => {
    const v2: any = result(); v2.schema = 2; delete v2.subject_invocations; delete v2.scenarios[0].rep_judgments; delete v2.scenarios[0].objective;
    const dir = mkdtempSync(join(tmpdir(), "results-v2-compat-"));
    try {
      const file = join(dir, "results.yaml"), bytes = yaml.dump(v2);
      writeFileSync(file, bytes, "utf8");
      expect(readResults(dir).schema).toBe(2);
      expect(readFileSync(file, "utf8")).toBe(bytes);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
