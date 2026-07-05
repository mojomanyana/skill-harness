import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { buildJudgePrompt, judgeInWorkspace } from "./grade.js";
import { findTranscriptFiles, judgeRawPath, repIndexOf, type ScenarioResult } from "./results.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { appendJournal } from "./journal.js";

export interface RegradeOptions {
  runDir: string;
  spec: Spec;
  scenario: Scenario;
  adapter: HarnessAdapter;
  judge: ModelRef;
  specDir: string; // fixtures/neutral cwd base for the judge workspace
  threshold: number;
  now?: () => string;
}

/** Judge one saved transcript: writes the judge-raw artifact, emits a `judge-verdict` journal event (plus `misfire-flag` when the verdict is suspect), and returns the outcome. */
export async function judgeOneRep(opts: {
  runDir: string; spec: Spec; scenario: Scenario; transcript: string;
  adapter: HarnessAdapter; judge: ModelRef; specDir: string;
  mode: string; rep: number | undefined; now: () => string;
}): Promise<RepOutcome> {
  const { runDir, spec, scenario, transcript, adapter, judge, specDir, mode, rep, now } = opts;
  const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
  const g = await judgeInWorkspace(adapter, judge, prompt, specDir);
  writeFileSync(judgeRawPath(runDir, scenario.id, mode, rep), g.raw, "utf8");
  const repField = rep === undefined ? {} : { rep };
  appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: g.verdict, reason: g.reason, suspect: g.suspect, ...repField });
  if (g.suspect) appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: g.reason, ...repField });
  return { verdict: g.verdict, reason: g.reason, suspect: g.suspect };
}

/**
 * Re-judge a scenario's saved GREEN transcript(s) with `judge` — no harness
 * re-run. Rewrites the judge-raw artifact per rep, emits per-rep judge-verdict
 * (+ misfire-flag) journal events, and returns the aggregated ScenarioResult
 * (override/note empty; the caller merges any prior override + persists).
 */
export async function regradeScenario(opts: RegradeOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, "green");
  if (files.length === 0) throw new Error(`no green transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  const repCount = files.length;
  const outcomes: RepOutcome[] = [];
  for (const file of files) {
    const rep = repIndexOf(file) ?? undefined;
    const transcript = readFileSync(join(opts.runDir, file), "utf8");
    outcomes.push(await judgeOneRep({
      runDir: opts.runDir, spec: opts.spec, scenario: opts.scenario, transcript,
      adapter: opts.adapter, judge: opts.judge, specDir: opts.specDir, mode: "green", rep, now,
    }));
  }
  return outcomesToResult(opts.scenario.id, outcomes, repCount, opts.threshold);
}
