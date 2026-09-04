import { describe, expect, it } from "vitest";
import { appendQualificationAccountingEvent, createQualificationAccountingLedger, validateQualificationAccountingLedger } from "../src/qualification-store.js";
import { aggregateQualificationCell, collapseQualificationJudgePanel } from "../src/qualification-panels.js";
import type { QualificationJudgePanelMember, QualificationJudgePanelResult } from "../src/qualification-panels.js";

const member = (ordinal: number, verdict: "PASS" | "FAIL" | "ERROR", suspect = false): QualificationJudgePanelMember => ({
  invocation_id: `judge-${ordinal}`,
  ordinal,
  judge: { provider: "fake", model: "fake-sol" },
  verdict,
  reason: verdict,
  suspect,
  artifact: verdict === "ERROR" ? null : { sha256: String(ordinal).repeat(64), bytes: ordinal },
  terminal_receipt_sha256: String(ordinal + 3).repeat(64),
});

function panel(id: string, repetition: number, members: QualificationJudgePanelMember[], critical = false): QualificationJudgePanelResult {
  return collapseQualificationJudgePanel({ panel_id: id, scenario_id: "A1", subject_arm: "luna", repetition, critical, members });
}

function account(ids: string[]) {
  let ledger = createQualificationAccountingLedger();
  for (const [index, invocation_id] of ids.entries()) {
    ledger = appendQualificationAccountingEvent(ledger, { invocation_id, role: "judge", call_class: "judge", counts_as_measurement: true, launched_at: `2026-09-0${index + 1}T00:00:00.000Z` });
  }
  return ledger;
}

describe("qualification judge panels", () => {
  it("records agreement and exact independently claimed calls", () => {
    const result = panel("A1-r0", 0, [member(1, "PASS"), member(2, "PASS")]);
    expect(result).toMatchObject({ state: "confirmed", verdict: "PASS", judge_calls: 2, clean_votes: 2, disagreement: { initial_split: false, minority_rate: 0 } });
    expect(validateQualificationAccountingLedger(account(["judge-1", "judge-2"])).counts.judge).toBe(2);
  });

  it("records a split and accounts for the conditional tie-break exactly once", () => {
    const result = panel("A1-r0", 0, [member(1, "PASS"), member(2, "FAIL"), member(3, "FAIL")]);
    expect(result).toMatchObject({ state: "tie_broken", verdict: "FAIL", judge_calls: 3, disagreement: { initial_split: true, minority_rate: 1 / 3 } });
    expect(validateQualificationAccountingLedger(account(["judge-1", "judge-2", "judge-3"])).counts.judge).toBe(3);
    expect(() => panel("A1-r0", 0, [member(1, "PASS"), member(2, "PASS"), member(3, "FAIL")])).toThrow(/third member.*clean initial split/i);
  });

  it("records a judge error as a non-vote", () => {
    const result = panel("A1-r0", 0, [member(1, "PASS"), member(2, "ERROR")]);
    expect(result).toMatchObject({ state: "unresolved", judge_calls: 2, clean_votes: 1 });
    expect(result).not.toHaveProperty("verdict");
  });

  it("promotes disagreement rates into the recorded cell output", () => {
    const panels = [
      panel("A1-r0", 0, [member(1, "PASS"), member(2, "PASS")]),
      panel("A1-r1", 1, [member(1, "PASS"), member(2, "FAIL"), member(3, "FAIL")]),
      panel("A1-r2", 2, [member(1, "FAIL"), member(2, "FAIL")]),
    ];
    const cell = aggregateQualificationCell({ cell_id: "A1:luna", scenario_id: "A1", subject_arm: "luna", critical: false, pass_threshold: 2, panels });
    expect(cell.disagreement).toEqual({ judge_calls: 7, clean_votes: 7, split_artifacts: 1, artifacts_with_two_clean_initial_votes: 3, unresolved_artifacts: 0, judge_split_rate: 1 / 3 });
  });

  it("records a settled Critical failure without halting a read-only board", () => {
    const panels = [
      panel("A1-r0", 0, [member(1, "PASS"), member(2, "PASS")], true),
      panel("A1-r1", 1, [member(1, "PASS"), member(2, "PASS")], true),
      panel("A1-r2", 2, [member(1, "FAIL"), member(2, "FAIL")], true),
    ];
    const cell = aggregateQualificationCell({ cell_id: "A1:luna", scenario_id: "A1", subject_arm: "luna", critical: true, pass_threshold: 2, panels });
    expect(cell).toMatchObject({ verdict: "FAIL", pass_threshold: 3, critical_failure: true, acceptance: "fail", collection: "continue" });
  });
});
