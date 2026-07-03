import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { buildJudgePrompt, gradeTranscript, judgeResemblesSubject } from "./grade.js";
import {
  runDirFor,
  transcriptPath,
  writeResults,
  ensureResultsGitignore,
  type ResultsFile,
  type ScenarioResult,
} from "./results.js";
import { appendJournal } from "./journal.js";
import { runSeeded } from "./seeded.js";

export interface RunOptions {
  spec: Spec;
  skillDir: string;
  specPath: string; // abs path to specification.yaml (seeded fixtures resolve against its dir)
  adapter: HarnessAdapter;
  model: ModelRef;
  modelToken: string; // original provider:model token (for results.yaml)
  judge: ModelRef;
  mode: RunMode;
  cwd: string; // neutral cwd for the harness
  timestamp: string; // ISO, injected (Date.now is unavailable in some contexts)
  label?: string | null; // recorded in results.yaml (schema 2)
  onProgress?: (msg: string) => void;
  now?: () => string; // ISO clock for journal events (injectable — some hosts restrict wall-clock calls)
}

export interface RunSummary {
  runDir: string;
  results: ResultsFile;
}

/** Run one skill against one model: run scenarios, grade, score, persist. */
export async function runSkillModel(opts: RunOptions): Promise<RunSummary> {
  const { spec, skillDir, adapter, model, judge, mode, cwd, timestamp } = opts;
  const log = opts.onProgress ?? (() => {});
  const now = opts.now ?? (() => new Date().toISOString());

  if (judgeResemblesSubject(judge, model)) {
    log(
      `  ⚠ judge (${judge.provider}:${judge.model}) resembles the model under test ` +
        `(${model.provider}:${model.model}) — verdicts may be inflated. Use a distinct judge.`
    );
  }

  const runDir = runDirFor(skillDir, adapter.name, model, timestamp);
  mkdirSync(runDir, { recursive: true });
  ensureResultsGitignore(dirname(dirname(runDir))); // .../tests/results/.gitignore

  appendJournal(runDir, {
    event: "run-started", ts: now(),
    skill: spec.skill, harness: adapter.name, model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    mode, label: opts.label ?? null,
  });

  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of spec.scenarios) {
    log(`  ${scenario.id} (${scenario.title}) …`);
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
    const { transcript, gatePrefix } = await produceTranscript(scenario, opts);
    writeFileSync(transcriptPath(runDir, scenario.id, mode), transcript, "utf8");
    if (scenario.mode === "seeded") {
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "" });
    }

    let judge_verdict: ScenarioResult["judge_verdict"];
    let judge_reason: string;
    let suspect = false;

    if (gatePrefix) {
      // objective seeded gate failed → automatic FAIL, skip the judge
      judge_verdict = "FAIL";
      judge_reason = gatePrefix;
    } else {
      const prompt = buildJudgePrompt({
        skill: spec.skill,
        persona: spec.judge_persona,
        scenario,
        transcript,
      });
      const g = await gradeTranscript(adapter, judge, prompt, cwd);
      judge_verdict = g.verdict;
      judge_reason = g.reason;
      suspect = g.suspect;
    }

    log(`    → ${judge_verdict}${judge_reason ? `: ${judge_reason}` : ""}${suspect ? "  ⚠ suspect misfire" : ""}`);
    scenarioResults.push({ id: scenario.id, judge_verdict, judge_reason, suspect, override: null, note: "" });
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: judge_verdict, reason: judge_reason, suspect });
    if (suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: judge_reason });
    }
  }

  const ctx = mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: adapter.name,
    model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    timestamp,
    label: opts.label ?? null,
    mode,
    scenarios: scenarioResults,
  }, ctx);
  if (ctx) {
    const g = results.effective_grade;
    appendJournal(runDir, { event: "score", ts: now(), passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note });
  }
  return { runDir, results };
}

/** Produce a transcript for one scenario. Seeded scenarios run their gates first. */
async function produceTranscript(
  scenario: Scenario,
  opts: RunOptions
): Promise<{ transcript: string; gatePrefix: string | null }> {
  if (scenario.mode === "seeded") {
    const r = await runSeeded(scenario, opts);
    return { transcript: r.transcript, gatePrefix: r.gateFailure };
  }
  const transcript = await opts.adapter.run({
    skillDir: opts.skillDir,
    model: opts.model,
    mode: opts.mode,
    turns: scenario.turns,
    cwd: opts.cwd,
  });
  return { transcript, gatePrefix: null };
}

/** A compact terminal scorecard for one run. */
export function formatScorecard(summary: RunSummary): string {
  const { results } = summary;
  const g = results.effective_grade;
  const lines: string[] = [];
  lines.push(`── ${results.skill} · ${results.harness} · ${results.model} ──`);
  for (const s of results.scenarios) {
    const v = s.override ?? s.judge_verdict;
    const mark = v === "PASS" ? "✓" : v === "FAIL" ? "✗" : "?";
    const ov = s.override ? " (override)" : "";
    const susp = s.suspect ? " ⚠suspect" : "";
    lines.push(`  ${mark} ${s.id}${ov}${susp}  ${s.judge_reason}`);
  }
  const ship = g.ship ? "SHIP" : "NOT READY";
  const note = g.note ? ` (${g.note})` : "";
  lines.push(`  GRADE: ${g.letter} (${g.pct}%) — ${g.passed}/${g.total} — ${ship}${note}`);
  return lines.join("\n");
}
