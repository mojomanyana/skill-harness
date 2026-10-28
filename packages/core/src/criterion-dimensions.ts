import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import type { CriterionDimension, Scenario, Spec } from "./spec.js";
import { readResults, findTranscriptFiles, judgeRawPath, repIndexOf, type Judgment, type ResultsFile, type ScenarioResult } from "./results.js";
import { buildJudgePrompt, parseStructuredJudgeReply, resolveJudgeReferences, type JudgeReference } from "./grade.js";
import { PERSONA_KEY, RUBRIC_PREFIX, personaDigest, rubricDigest } from "./sources.js";

export type ReportedCriterionDimension = CriterionDimension | "unclassified";
export interface DimensionVoteCounts { pass: number; fail: number; unavailable: number }
export type DimensionGroups = Record<ReportedCriterionDimension, DimensionVoteCounts>;
export interface DimensionRepetition {
  repetition: number;
  status: "available" | "unavailable";
  unavailableReason?: string;
  recordedVerdict: string | null;
  objective: ScenarioResult["objective"] | null;
  judgment?: {
    ordinal: number;
    judge: Judgment["judge"];
    inputArtifact: string;
    inputSha256: string;
    responseArtifact: string;
    responseSha256: string;
    responseBinding: "observed digest; structured record consistency, not a historical byte signature";
    transcriptArtifact: string;
    transcriptSha256: string;
  };
  votes: { index: number; dimension: ReportedCriterionDimension; verdict: "PASS" | "FAIL" | null; reason?: string }[];
}
export interface ScenarioDimensionReport {
  id: string;
  rubricSha256: string | null;
  savedRubricSha256: string | null;
  metadataDeclared: boolean;
  /** False means the displayed current mapping is not associated with any saved votes. */
  mappingApplied: boolean;
  criteria: { index: number; text: string; dimension: ReportedCriterionDimension }[];
  original: Pick<ScenarioResult, "judge_verdict" | "judge_reason" | "suspect" | "override" | "note" | "objective" | "adjudication">;
  expectedRepetitions: number | null;
  unavailableReason?: string;
  repetitions: DimensionRepetition[];
  counts: DimensionGroups;
}
export interface CriterionDimensionReport {
  schema: 1;
  purpose: "author-declared grouping of saved criterion votes; not a new assessment";
  providerCalls: 0;
  resultsChanged: false;
  runDir: string;
  skill: string;
  model: string;
  mode: string;
  personaSha256: string;
  metadataSha256: string;
  metadataBasis: "current author declaration; may be retrospective and was not a judged category";
  coverage: { expectedVotes: number; availableVotes: number; unavailableVotes: number; unknownScenarioSizes: number };
  counts: DimensionGroups;
  scenarios: ScenarioDimensionReport[];
}

const dimensions: ReportedCriterionDimension[] = ["task-correctness", "method-completeness", "mixed", "unclassified"];
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const groups = (): DimensionGroups => Object.fromEntries(dimensions.map(d => [d, { pass: 0, fail: 0, unavailable: 0 }])) as DimensionGroups;

/** Reporting reads only selected, bounded files; an escaping link is missing evidence. */
function artifact(runDir: string, name: string): Buffer {
  if (name !== basename(name) || name === "." || name === "..") throw new Error("artifact path is outside the run");
  const file = resolve(runDir, name);
  const rel = relative(realpathSync(runDir), realpathSync(file));
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(".." + sep)) throw new Error("artifact link is outside the run");
  if (!statSync(file).isFile() || statSync(file).size > 8 * 1024 * 1024) throw new Error("artifact is not a bounded regular file");
  return readFileSync(file);
}
const text = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

function observedJudgment(runDir: string, results: ResultsFile, spec: Spec, scenario: Scenario, references: JudgeReference[], repetition: number, judgment: Judgment): NonNullable<DimensionRepetition["judgment"]> {
  if (judgment.ordinal !== 1 || judgment.suspect || judgment.judgeFormat !== "json" || !judgment.input ||
      !["PASS", "FAIL"].includes(judgment.verdict) || !judgment.judge?.provider || !judgment.judge?.model) throw new Error("judgment is suspect, incomplete or unsupported");
  const input = judgment.input;
  if (!/^[a-f0-9]{64}$/.test(input.sha256) || input.artifact !== `judge-input.${input.sha256}.txt`) throw new Error("judge input has no valid content binding");
  const inputBytes = artifact(runDir, input.artifact);
  if (digest(inputBytes) !== input.sha256) throw new Error("bound judge input was changed");
  const saved = JSON.parse(text(inputBytes));
  if (saved.schema !== 1 || saved.judge?.provider !== judgment.judge.provider || saved.judge?.model !== judgment.judge.model ||
      !Array.isArray(saved.prompts) || saved.prompts.length !== (judgment.judgeRetries === 1 ? 2 : 1) || saved.prompts.some((p: unknown) => typeof p !== "string")) throw new Error("judge input identity is inconsistent");
  const transcripts = findTranscriptFiles(runDir, scenario.id, results.mode).filter(file => (repIndexOf(file) ?? 0) === repetition);
  if (transcripts.length !== 1) throw new Error("subject transcript identity is missing or ambiguous");
  const transcriptBytes = artifact(runDir, transcripts[0]);
  const transcript = text(transcriptBytes);
  const expected = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript,
    execution: saved.execution ?? undefined, references });
  if (saved.prompts[0] !== expected) throw new Error("bound judge prompt does not match this rubric and transcript");
  const responseArtifact = basename(judgeRawPath(runDir, scenario.id, results.mode, repIndexOf(transcripts[0]) ?? undefined));
  const responseBytes = artifact(runDir, responseArtifact);
  const raw = text(responseBytes);
  let final = raw;
  if (judgment.judgeRetries === 1) {
    const marker = "\n\n=== JUDGE REPLY 2 ===\n";
    if (!raw.startsWith("=== JUDGE REPLY 1 ===\n") || raw.split(marker).length !== 2) throw new Error("retry response boundaries are ambiguous");
    const [first, second] = raw.slice("=== JUDGE REPLY 1 ===\n".length).split(marker);
    let validationError: string | undefined;
    try { parseStructuredJudgeReply(first, scenario.checklist.length); } catch (error) { validationError = (error as Error).message; }
    if (validationError === undefined || saved.prompts[1] !== `${expected}\n\nYour reply was not valid: ${JSON.stringify(validationError)}; reply with only the JSON object.`) throw new Error("retry prompt is not the bound validation retry");
    final = second;
  }
  const parsed = parseStructuredJudgeReply(final, scenario.checklist.length);
  if (parsed.verdict !== judgment.verdict || parsed.reason !== judgment.reason ||
      JSON.stringify(parsed.criteria) !== JSON.stringify(judgment.criteria) ||
      (parsed.verdict === "PASS") !== parsed.criteria.every(vote => vote.verdict === "PASS")) throw new Error("saved criterion votes do not match a consistent raw judgment");
  return { ordinal: judgment.ordinal, judge: judgment.judge, inputArtifact: input.artifact, inputSha256: input.sha256,
    responseArtifact, responseSha256: digest(responseBytes), responseBinding: "observed digest; structured record consistency, not a historical byte signature",
    transcriptArtifact: transcripts[0], transcriptSha256: digest(transcriptBytes) };
}

/** Free retrospective reporting. No inference from prose, regrading, averaging or verdict changes. */
export function reportCriterionDimensions(runDir: string, spec: Spec, specDir: string, results: ResultsFile = readResults(runDir)): CriterionDimensionReport {
  const persona = personaDigest(spec.judge_persona);
  const report: CriterionDimensionReport = {
    schema: 1, purpose: "author-declared grouping of saved criterion votes; not a new assessment", providerCalls: 0, resultsChanged: false,
    runDir: resolve(runDir), skill: results.skill, model: results.model, mode: results.mode, personaSha256: persona,
    metadataSha256: "", metadataBasis: "current author declaration; may be retrospective and was not a judged category",
    coverage: { expectedVotes: 0, availableVotes: 0, unavailableVotes: 0, unknownScenarioSizes: 0 }, counts: groups(), scenarios: [],
  };
  for (const row of results.scenarios) {
    const scenario = spec.scenarios.find(s => s.id === row.id);
    let currentRubric: string | null = null;
    let references: JudgeReference[] = [];
    try { if (scenario) { references = resolveJudgeReferences(scenario, specDir); currentRubric = rubricDigest(scenario, specDir, references); } } catch { /* Unreadable references cannot establish rubric identity. */ }
    const mappingValid = !scenario?.criterionDimensions || scenario.criterionDimensions.length === scenario.checklist.length && scenario.criterionDimensions.every(d => dimensions.includes(d) && d !== ("unclassified" as string));
    const criteria = (scenario?.checklist ?? []).map((text, i) => ({ index: i + 1, text, dimension: mappingValid ? scenario?.criterionDimensions?.[i] ?? "unclassified" as const : "unclassified" as const }));
    const { judge_verdict, judge_reason, suspect, override, note, objective, adjudication } = row;
    const count = row.reps ?? 1;
    const item: ScenarioDimensionReport = { id: row.id, rubricSha256: currentRubric, savedRubricSha256: results.source_hashes?.[RUBRIC_PREFIX + row.id] ?? null,
      metadataDeclared: scenario?.criterionDimensions !== undefined, mappingApplied: false, criteria, original: { judge_verdict, judge_reason, suspect, override, note, objective, adjudication },
      expectedRepetitions: Number.isSafeInteger(count) && count > 0 ? count : null, repetitions: [], counts: groups() };
    report.scenarios.push(item);
    let unavailable: string | undefined;
    if (!scenario || !criteria.length || item.expectedRepetitions === null) {
      item.unavailableReason = "scenario or repetition size is unavailable"; report.coverage.unknownScenarioSizes++; continue;
    }
    if (!mappingValid || results.skill !== spec.skill || !currentRubric || item.savedRubricSha256 !== currentRubric || results.source_hashes?.[PERSONA_KEY] !== persona) {
      item.unavailableReason = !mappingValid ? "invalid author-declared criterion dimensions" : "rubric or persona identity is missing or stale";
      // The current checklist cannot establish the number or categories of historical votes.
      report.coverage.unknownScenarioSizes++; continue;
    }
    item.mappingApplied = true;
    if (row.suspect) unavailable = "scenario judgment is suspect";
    else if (row.adjudication) unavailable = "multi-judge adjudication is not supported by this report";
    else if (!Array.isArray(row.rep_judgments) || row.rep_judgments.length !== count ||
        new Set(row.rep_judgments.map(p => p?.repetition)).size !== count || row.rep_judgments.some(p => !p || !Number.isInteger(p.repetition) || p.repetition < 0 || p.repetition >= count)) unavailable = "saved repetition panels are missing or ambiguous";
    for (let repetition = 0; repetition < count; repetition++) {
      const panel = Array.isArray(row.rep_judgments) ? row.rep_judgments.find(p => p?.repetition === repetition) : undefined;
      const rep: DimensionRepetition = { repetition, status: "unavailable", recordedVerdict: panel?.recorded_verdict ?? null, objective: panel?.objective ?? null,
        votes: criteria.map(c => ({ index: c.index, dimension: c.dimension, verdict: null })) };
      item.repetitions.push(rep);
      try {
        if (unavailable) throw new Error(unavailable);
        if (panel?.judgments?.length !== 1) throw new Error("exactly one saved judgment is required; missing or multi-judge evidence is unavailable");
        rep.judgment = observedJudgment(runDir, results, spec, scenario, references, repetition, panel.judgments[0]);
        rep.votes = panel.judgments[0].criteria!.map(v => ({ index: v.index, dimension: criteria[v.index - 1].dimension, verdict: v.verdict as "PASS" | "FAIL", reason: v.reason }));
        rep.status = "available";
      } catch (error) { rep.unavailableReason = (error as Error).message; }
      for (const vote of rep.votes) {
        const key = vote.verdict === "PASS" ? "pass" : vote.verdict === "FAIL" ? "fail" : "unavailable";
        item.counts[vote.dimension][key]++; report.counts[vote.dimension][key]++;
        report.coverage.expectedVotes++;
        if (vote.verdict === null) report.coverage.unavailableVotes++; else report.coverage.availableVotes++;
      }
    }
  }
  report.metadataSha256 = digest(JSON.stringify({ skill: spec.skill, personaSha256: persona, scenarios: report.scenarios.map(s => ({ id: s.id, rubricSha256: s.rubricSha256, metadataDeclared: s.metadataDeclared, criteria: s.criteria })) }));
  return report;
}
