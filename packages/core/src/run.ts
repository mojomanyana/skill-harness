import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { buildJudgePrompt, judgeInWorkspace, judgeResemblesSubject } from "./grade.js";
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
import { createWorkspace, type Workspace } from "./workspace.js";
import { runPool } from "./scheduler.js";

export interface RunOptions {
  spec: Spec;
  skillDir: string;
  specPath: string; // abs path to specification.yaml (seeded fixtures resolve against its dir)
  adapter: HarnessAdapter;
  model: ModelRef;
  modelToken: string; // original provider:model token (for results.yaml)
  judge: ModelRef;
  mode: RunMode;
  timestamp: string; // ISO, injected (Date.now is unavailable in some contexts)
  label?: string | null; // recorded in results.yaml (schema 2)
  onProgress?: (msg: string) => void;
  now?: () => string; // ISO clock for journal events (injectable — some hosts restrict wall-clock calls)
  concurrency?: number; // scenarios in flight at once; default 1 (sequential)
}

export interface RunSummary {
  runDir: string;
  results: ResultsFile;
}

/** Run one skill against one model: run scenarios, grade, score, persist. */
export async function runSkillModel(opts: RunOptions): Promise<RunSummary> {
  const { spec, skillDir, adapter, model, judge, mode, timestamp } = opts;
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

  const tasks = spec.scenarios.map(
    (scenario) => () => runScenario(scenario, { ...opts, runDir, now, log })
  );
  const scenarioResults = await runPool(tasks, opts.concurrency ?? 1);

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

interface ScenarioCtx {
  runDir: string;
  now: () => string;
  log: (msg: string) => void;
}

/** Run one scenario end-to-end in its own isolated workspace. */
async function runScenario(scenario: Scenario, ctx: RunOptions & ScenarioCtx): Promise<ScenarioResult> {
  const { spec, judge, mode, runDir, now, log } = ctx;
  log(`  ${scenario.id} (${scenario.title}) …`);
  appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });

  let ws: Workspace | null = null;
  let transcript = "";
  let gatePrefix: string | null = null;
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath) });
    } catch (e) {
      // A setup failure (e.g. missing fixture) is an objective FAIL, not an infra abort.
      gatePrefix = e instanceof Error ? e.message : String(e);
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    if (ws) {
      if (scenario.mode === "seeded") {
        const r = await runSeeded(scenario, {
          skillDir: ctx.skillDir, adapter: ctx.adapter, model: ctx.model, mode, cwd: ws.cwd,
        });
        transcript = r.transcript;
        gatePrefix = r.gateFailure;
      } else {
        transcript = await ctx.adapter.run({
          skillDir: ctx.skillDir, model: ctx.model, mode, turns: scenario.turns, cwd: ws.cwd,
        });
      }
    }

    writeFileSync(transcriptPath(runDir, scenario.id, mode), transcript, "utf8");
    if (scenario.mode === "seeded") {
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "" });
    }

    let judge_verdict: ScenarioResult["judge_verdict"];
    let judge_reason: string;
    let suspect = false;
    if (gatePrefix) {
      judge_verdict = "FAIL";
      judge_reason = gatePrefix;
    } else {
      const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
      const g = await judgeInWorkspace(ctx.adapter, judge, prompt, dirname(ctx.specPath));
      judge_verdict = g.verdict;
      judge_reason = g.reason;
      suspect = g.suspect;
    }

    log(`  → ${scenario.id} ${judge_verdict}${judge_reason ? `: ${judge_reason}` : ""}${suspect ? "  ⚠ suspect misfire" : ""}`);
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict: judge_verdict, reason: judge_reason, suspect });
    if (suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason: judge_reason });
    }
    return { id: scenario.id, judge_verdict, judge_reason, suspect, override: null, note: "" };
  } finally {
    ws?.cleanup();
  }
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
