import { describe, expect, it } from "vitest";
import { screenResults } from "../src/screen.js";
import type { ResultsFile } from "../src/results.js";

const h = "b".repeat(64);
const grade = { passed: 0, total: 0, pct: 0, letter: "-", ship: false, note: "" };
const prompt = (occurrences: number, status: "PASS" | "FAIL" = "PASS") => ({
  capture_version: "prompt-provenance-v1" as const, request_index: 0, raw_sha256: h,
  normalized_sha256: h, normalization_rule: "cwd-line-v1" as const, bytes: 10,
  contract_sha256: h, contract_bytes: 5, contract_occurrences: occurrences,
  mechanism: occurrences ? "append-system-prompt" as const : "none" as const, status,
});
const criterion = (verdict: "PASS" | "FAIL") => [{ index: 1, verdict, reason: verdict.toLowerCase() }];
function file(mode: "red" | "force", rows: Array<[string, "PASS" | "FAIL" | "ERROR", number]>): ResultsFile {
  const ids = [...new Set(rows.map(([id]) => id))];
  return {
    schema: 3, skill: "x", harness: "pi", model: "fake:m", judge: { provider: "fake", model: "j" },
    timestamp: "t", label: null, mode, effective_grade: grade,
    subject_invocations: rows.map(([id,, rep]) => ({ scenario_id: id, repetition: rep, prompt: prompt(mode === "red" ? 0 : 1) })),
    scenarios: ids.map(id => { const reps = rows.filter(row => row[0] === id); return { id, judge_verdict: reps[0][1], judge_reason: reps[0][1], suspect: false, override: null, note: "",
      ...(reps.length > 1 ? { reps: reps.length } : {}), objective: { status: "PASS" as const, assertions: [{ kind: "skill_delivered", status: "PASS" as const, detail: "observed" }] },
      rep_judgments: reps.map(([,v,rep]) => ({ repetition: rep, recorded_verdict: v, objective: { status: "PASS" as const, assertions: [{ kind: "skill_delivered", status: "PASS" as const, detail: "observed" }] }, judgments: v === "ERROR" ? [] : [{ ordinal: 1, judge: { provider: "fake", model: "j" }, verdict: v, reason: v, suspect: false, criteria: criterion(v) }] })),
    }; }),
  };
}

describe("offline discriminating-power screen", () => {
  it("classifies CEILING, INFORMATIVE, and UNKNOWN from retained fields alone (breaks if screen trusts legacy aggregates or calls a model)", () => {
    const ceiling = file("red", Array.from({length: 5},(_,i)=>["CEIL","PASS",i] as [string,"PASS",number]));
    const informative = file("red", [["INFO","PASS",0],["INFO","FAIL",1],["INFO","FAIL",2],["INFO","PASS",3],["INFO","FAIL",4]]);
    const unknown = file("red", [["UNK","ERROR",0]]);
    const report = screenResults([ceiling, informative, unknown]);
    expect(report.scenarios.map(x => [x.id,x.classification,x.control])).toEqual([
      ["CEIL","CEILING",{passes:5,n:5}], ["INFO","INFORMATIVE",{passes:2,n:5}], ["UNK","UNKNOWN",{passes:0,n:0}],
    ]);
    expect(report.criteria).toContainEqual({ skill: "x", model: "fake:m", scenario_id: "INFO", criterion: 1, failures: 3, n: 5, fail_rate: 0.6 });
  });

  it("keeps schema-v2 scenarios visible as UNKNOWN (breaks if compatibility silently drops legacy cells)", () => {
    const legacy:any=file("red", [["OLD","PASS",0]]);legacy.schema=2;delete legacy.subject_invocations;delete legacy.scenarios[0].rep_judgments;delete legacy.scenarios[0].objective;
    expect(screenResults([legacy]).scenarios[0]).toMatchObject({id:"OLD",classification:"UNKNOWN",control:{passes:0,n:0}});
  });

  it("requires all terminal provider requests and ignores failed retry attempts (breaks if last observation wins)", () => {
    const r=file("force",[["A1","PASS",0]]);const base=r.subject_invocations![0];
    r.subject_invocations=[{...base,prompt:{...base.prompt,status:"FAIL",contract_occurrences:0,request_index:0}},{...base,prompt:{...base.prompt,request_index:1}}];
    expect(screenResults([r]).scenarios[0].treatment.n).toBe(0);
    r.subject_invocations=[{...base,attempt:0,prompt:{...base.prompt,status:"ERROR",request_index:0}},{...base,attempt:1,prompt:{...base.prompt,request_index:1}}];
    expect(screenResults([r]).scenarios[0].treatment.n).toBe(1);
  });

  it("excludes suspect-only panels from pass rates (breaks if recorded_verdict is trusted over clean votes)", () => {
    const r=file("red",[["S","PASS",0]]);r.scenarios[0].rep_judgments![0].judgments[0].suspect=true;
    expect(screenResults([r]).scenarios[0]).toMatchObject({classification:"UNKNOWN",control:{passes:0,n:0}});
  });

  it("pins FLOOR/INFORMATIVE/UNKNOWN/CEILING boundaries (breaks if classification thresholds drift)", () => {
    const mk = (id:string, passes:number, n:number) => file("red", Array.from({length:n},(_,i)=>[id,i<passes?"PASS":"FAIL",i] as [string,"PASS"|"FAIL",number]));
    expect(screenResults([mk("F",0,5),mk("I20",1,5),mk("I70",7,10),mk("U",3,4),mk("C",4,5)]).scenarios.map(row=>[row.id,row.classification])).toEqual([["C","CEILING"],["F","FLOOR"],["I20","INFORMATIVE"],["I70","INFORMATIVE"],["U","UNKNOWN"]]);
  });

  it("separates rates by observed delivery bytes even when mode contradicts them (breaks if mode labels replace evidence)", () => {
    const r = file("force", [["A1","PASS",0]]);
    expect(screenResults([r]).scenarios[0].treatment).toEqual({ passes: 1, n: 1 });
    r.subject_invocations![0].prompt = { ...r.subject_invocations![0].prompt, mechanism: "none", contract_occurrences: 0, status: "PASS" };
    expect(screenResults([r]).scenarios[0].control).toEqual({ passes: 1, n: 1 });
    const bad:any=file("force", [["A1","PASS",0]]);bad.subject_invocations[0].prompt.contract_occurrences=0;bad.subject_invocations[0].prompt.status="FAIL";
    expect(screenResults([bad]).scenarios[0].treatment).toEqual({passes:0,n:0});
  });
});
