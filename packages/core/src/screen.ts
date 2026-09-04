import { deliveryStatusForObservations, type CriterionVote, type ResultsFile } from "./results.js";
import { collapseVotePanel } from "./vote-panel.js";

export type ScreenClassification = "CEILING" | "FLOOR" | "INFORMATIVE" | "UNKNOWN";
export interface ScreenRate { passes: number; n: number }
export interface ScreenScenario { skill: string; model: string; id: string; control: ScreenRate; treatment: ScreenRate; classification: ScreenClassification }
export interface ScreenCriterion { skill: string; model: string; scenario_id: string; criterion: number; failures: number; n: number; fail_rate: number }
export interface ScreenReport { scenarios: ScreenScenario[]; criteria: ScreenCriterion[] }

function classify(rate: ScreenRate): ScreenClassification {
  if (rate.n === 0) return "UNKNOWN";
  const p = rate.passes / rate.n;
  if (p >= 0.8) return "CEILING";
  if (p <= 0.1) return "FLOOR";
  if (p >= 0.2 && p <= 0.7) return "INFORMATIVE";
  return "UNKNOWN";
}

/** Pure/offline: derive only from v3 retained invocation and vote evidence. */
export function screenResults(results: ResultsFile[]): ScreenReport {
  const rows = new Map<string, { control: ScreenRate; treatment: ScreenRate }>();
  const criteria = new Map<string, { skill: string; model: string; scenario_id: string; criterion: number; failures: number; n: number }>();
  for (const result of results) {
    const observations = result.schema === 3 ? result.subject_invocations! : [];
    for (const scenario of result.scenarios) {
      const rowKey = `${result.skill}\u0000${result.model}\u0000${scenario.id}`;
      const row = rows.get(rowKey) ?? { control: { passes: 0, n: 0 }, treatment: { passes: 0, n: 0 } };
      for (const rep of scenario.rep_judgments ?? []) {
        const repObservations = observations.filter(observation => observation.scenario_id === scenario.id && observation.repetition === rep.repetition);
        if (deliveryStatusForObservations(repObservations) !== "PASS") continue;
        const terminalAttempt = Math.max(...repObservations.map(observation => observation.attempt ?? 0));
        const mechanisms = new Set(repObservations.filter(observation => (observation.attempt ?? 0) === terminalAttempt).map(observation => observation.prompt.mechanism));
        if (mechanisms.size !== 1) continue;
        const rate = mechanisms.has("none") ? row.control : row.treatment;
        let panelVerdict = rep.recorded_verdict;
        if (rep.judgments.length > 0) {
          const clean = rep.judgments.filter(judgment => !judgment.suspect && (judgment.verdict === "PASS" || judgment.verdict === "FAIL"));
          if (clean.length === 0) continue;
          panelVerdict = clean.length === 1 ? clean[0].verdict : collapseVotePanel(rep.judgments).verdict ?? "JUDGE-AMBIGUOUS";
        }
        if (scenario.adjudication?.repetition === rep.repetition) {
          const adjudicated = collapseVotePanel(scenario.adjudication.judgments);
          if (!adjudicated.verdict) continue;
          panelVerdict = adjudicated.verdict;
        }
        const effective = rep.objective?.status === "ERROR" ? "ERROR" : rep.objective?.status === "FAIL" ? "FAIL" : panelVerdict;
        if (effective !== "PASS" && effective !== "FAIL") continue;
        rate.n++;
        if (effective === "PASS") rate.passes++;
        for (const judgment of rep.judgments) {
          if (judgment.suspect || (judgment.verdict !== "PASS" && judgment.verdict !== "FAIL")) continue;
          for (const vote of judgment.criteria ?? []) addCriterion(criteria, result.skill, result.model, scenario.id, vote);
        }
      }
      const adjudicatedRep = scenario.adjudication?.repetition;
      const adjudicationDelivery = result.schema === 3 && adjudicatedRep !== undefined
        ? deliveryStatusForObservations(observations.filter(observation => observation.scenario_id === scenario.id && observation.repetition === adjudicatedRep))
        : "ERROR";
      for (const judgment of adjudicationDelivery === "PASS" ? scenario.adjudication?.judgments.filter(judgment => judgment.ordinal > 1) ?? [] : []) {
        if (judgment.suspect || (judgment.verdict !== "PASS" && judgment.verdict !== "FAIL")) continue;
        for (const vote of judgment.criteria ?? []) addCriterion(criteria, result.skill, result.model, scenario.id, vote);
      }
      rows.set(rowKey, row);
    }
  }
  return {
    scenarios: [...rows.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key, row]) => { const [skill, model, id] = key.split("\u0000"); return { skill, model, id, ...row, classification: classify(row.control) }; }),
    criteria: [...criteria.values()].sort((a,b) => a.scenario_id.localeCompare(b.scenario_id) || a.criterion-b.criterion).map(x => ({ ...x, fail_rate: x.failures/x.n })),
  };
}
function addCriterion(map: Map<string,{skill:string;model:string;scenario_id:string;criterion:number;failures:number;n:number}>, skill: string, model: string, id: string, vote: CriterionVote): void {
  if (vote.verdict === "ERROR") return;
  const key=`${skill}\u0000${model}\u0000${id}:${vote.index}`, row=map.get(key)??{skill,model,scenario_id:id,criterion:vote.index,failures:0,n:0};row.n++;if(vote.verdict==="FAIL")row.failures++;map.set(key,row);
}

export function formatScreen(report: ScreenReport): string {
  const lines=["skill/model/scenario  control  treatment  class"];
  for(const s of report.scenarios)lines.push(`${s.skill}/${s.model}/${s.id}  ${s.control.passes}/${s.control.n}  ${s.treatment.passes}/${s.treatment.n}  ${s.classification}`);
  lines.push("", "skill/model/criterion  failures/n  fail-rate");
  for(const c of report.criteria)lines.push(`${c.skill}/${c.model}/${c.scenario_id}.${c.criterion}  ${c.failures}/${c.n}  ${(c.fail_rate*100).toFixed(1)}%`);
  return lines.join("\n");
}
