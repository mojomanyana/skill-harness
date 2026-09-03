import { describe, expect, it } from "vitest";
import { judgeAgreement } from "../src/judge-agreement.js";
import type { ResultsFile, ScenarioResult } from "../src/results.js";

const judgment = (provider: string, verdict: "PASS" | "FAIL", suspect = false) => ({
  ordinal: 1, judge: { provider, model: "model" }, verdict, reason: "because", suspect,
});
const scenario = (id: string, judgments?: ReturnType<typeof judgment>[]): ScenarioResult => ({
  id, judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "",
  ...(judgments ? { adjudication: { state: "confirmed", trigger: "ship_deciding", judgments, verdict: "PASS" } as const } : {}),
});
const results = (scenarios: ScenarioResult[]) => ({ scenarios }) as ResultsFile;

describe("offline judge agreement", () => {
  it("reports agree, disagree, and unavailable cells without calling a judge", () => {
    const report = judgeAgreement(results([
      scenario("A1", [judgment("openai-codex", "PASS"), judgment("claude-code", "PASS")]),
      scenario("A2", [judgment("openai-codex", "PASS"), judgment("claude-code", "FAIL")]),
      scenario("A3"),
    ]));
    expect(report.cells.map((cell) => cell.status)).toEqual(["agree", "disagree", "error"]);
    expect(report).toMatchObject({ agree: 1, disagree: 1, error: 1, comparable: 2, rate: 0.5 });
  });

  it("fails closed on suspect votes and repeated votes from only one judge", () => {
    expect(judgeAgreement(results([scenario("A1", [judgment("one", "PASS"), judgment("two", "PASS", true)])])).cells[0].status).toBe("error");
    expect(judgeAgreement(results([scenario("A1", [judgment("one", "PASS"), judgment("one", "FAIL")])])).cells[0].status).toBe("error");
  });

  it("uses each judge's latest persisted vote", () => {
    const cell = scenario("A1");
    cell.judge_history = [judgment("one", "PASS"), judgment("two", "PASS"), judgment("one", "FAIL")];
    expect(judgeAgreement(results([cell])).cells[0]).toMatchObject({ status: "disagree", verdicts: ["PASS", "FAIL"] });
  });
});
