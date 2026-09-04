import type { ResultsFile } from "./results.js";
import type { Verdict } from "./score.js";

export interface JudgeAgreementCell {
  scenario: string;
  status: "agree" | "disagree" | "error";
  judges: string[];
  verdicts: Verdict[];
  detail: string;
}

export interface JudgeAgreementReport {
  cells: JudgeAgreementCell[];
  agree: number;
  disagree: number;
  error: number;
  comparable: number;
  rate: number | null;
}

/** Pure/offline projection of judgments already persisted in results.yaml. */
export function judgeAgreement(results: ResultsFile): JudgeAgreementReport {
  const cells = results.scenarios.map((scenario): JudgeAgreementCell => {
    const judgments = scenario.judge_history ?? scenario.adjudication?.judgments ?? [];
    const distinct = new Map<string, typeof judgments[number]>();
    for (const judgment of judgments) {
      const key = `${judgment.judge.provider}:${judgment.judge.model}`;
      distinct.delete(key); // insertion order now reflects each judge's latest persisted vote
      distinct.set(key, judgment);
    }
    const pair = [...distinct.entries()].slice(-2);
    if (pair.length < 2 || pair.some(([, judgment]) => judgment.suspect || judgment.verdict === "ERROR" || judgment.verdict === "NOT-MEASURED" || judgment.verdict === "JUDGE-AMBIGUOUS")) {
      return {
        scenario: scenario.id, status: "error", judges: pair.map(([judge]) => judge),
        verdicts: pair.map(([, judgment]) => judgment.verdict),
        detail: pair.length < 2 ? "fewer than two distinct persisted judges" : "one or more judgments is not a clean vote",
      };
    }
    const status = pair[0][1].verdict === pair[1][1].verdict ? "agree" : "disagree";
    return {
      scenario: scenario.id, status, judges: pair.map(([judge]) => judge),
      verdicts: pair.map(([, judgment]) => judgment.verdict), detail: `${pair[0][1].verdict} vs ${pair[1][1].verdict}`,
    };
  });
  const agree = cells.filter((cell) => cell.status === "agree").length;
  const disagree = cells.filter((cell) => cell.status === "disagree").length;
  const error = cells.filter((cell) => cell.status === "error").length;
  const comparable = agree + disagree;
  return { cells, agree, disagree, error, comparable, rate: comparable ? agree / comparable : null };
}
