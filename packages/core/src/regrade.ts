import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { buildJudgePrompt, judgeInWorkspace } from "./grade.js";
import { findTranscriptFiles, judgeRawPath, type ScenarioResult } from "./results.js";
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

/**
 * Re-judge a scenario's saved GREEN transcript(s) with `judge` — no harness
 * re-run. Rewrites the judge-raw artifact per rep, emits per-rep judge-verdict
 * (+ misfire-flag) journal events, and returns the aggregated ScenarioResult
 * (override/note empty; the caller merges any prior override + persists).
 */
export async function regradeScenario(opts: RegradeOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, "green");
  if (files.length === 0) {
    throw new Error(`no green transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  }
  const repCount = files.length;
  const outcomes: RepOutcome[] = [];
  for (let i = 0; i < files.length; i++) {
    const rep = repCount > 1 ? i : undefined; // findTranscriptFiles(green) is sorted rep0..repN for reps runs
    const transcript = readFileSync(join(opts.runDir, files[i]), "utf8");
    const prompt = buildJudgePrompt({ skill: opts.spec.skill, persona: opts.spec.judge_persona, scenario: opts.scenario, transcript });
    const g = await judgeInWorkspace(opts.adapter, opts.judge, prompt, opts.specDir);
    writeFileSync(judgeRawPath(opts.runDir, opts.scenario.id, "green", rep), g.raw, "utf8");
    const repField = rep === undefined ? {} : { rep };
    appendJournal(opts.runDir, { event: "judge-verdict", ts: now(), id: opts.scenario.id, verdict: g.verdict, reason: g.reason, suspect: g.suspect, ...repField });
    if (g.suspect) appendJournal(opts.runDir, { event: "misfire-flag", ts: now(), id: opts.scenario.id, reason: g.reason, ...repField });
    outcomes.push({ verdict: g.verdict, reason: g.reason, suspect: g.suspect });
  }
  return outcomesToResult(opts.scenario.id, outcomes, repCount, opts.threshold);
}
