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
import { aggregateReps, type RepOutcome } from "./reps.js";

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
  reps?: number; // run each scenario N times (default 1); per-scenario `reps:` overrides
  passThreshold?: number; // pass if pass-rate >= this (default 0.5); per-scenario overrides
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

  // scenario × rep tasks; runPool preserves input order so we can slice per scenario.
  const repCounts = spec.scenarios.map((s) => s.reps ?? opts.reps ?? 1);
  const owners: number[] = [];
  const tasks: Array<() => Promise<RepOutcome>> = [];
  spec.scenarios.forEach((scenario, si) => {
    for (let k = 0; k < repCounts[si]; k++) {
      const rep = k;
      const total = repCounts[si];
      owners.push(si);
      tasks.push(() => runRep(scenario, rep, total, { ...opts, runDir, now, log }));
    }
  });
  const flat = await runPool(tasks, opts.concurrency ?? 1);

  const grouped: RepOutcome[][] = spec.scenarios.map(() => []);
  flat.forEach((outcome, i) => grouped[owners[i]].push(outcome));

  const scenarioResults: ScenarioResult[] = spec.scenarios.map((scenario, si) => {
    const group = grouped[si];
    if (repCounts[si] === 1) {
      // N=1: preserve the judge's real verdict/reason (byte-identical to M3); no reps fields.
      const o = group[0];
      return { id: scenario.id, judge_verdict: o.verdict, judge_reason: o.reason, suspect: o.suspect, override: null, note: "" };
    }
    const threshold = scenario.passThreshold ?? opts.passThreshold ?? 0.5;
    const agg = aggregateReps(group, threshold);
    return {
      id: scenario.id, judge_verdict: agg.verdict, judge_reason: agg.reason, suspect: agg.suspect,
      reps: agg.reps, passes: agg.passes, clean: agg.clean, flakiness: agg.flakiness, override: null, note: "",
    };
  });

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

/** Run ONE rep of a scenario in its own isolated workspace. */
async function runRep(scenario: Scenario, rep: number, repCount: number, ctx: RunOptions & ScenarioCtx): Promise<RepOutcome> {
  const { spec, judge, mode, runDir, now, log } = ctx;
  const repField = repCount > 1 ? { rep } : {};
  if (rep === 0) {
    log(`  ${scenario.id} (${scenario.title})${repCount > 1 ? ` ×${repCount}` : ""} …`);
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
  }

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

    writeFileSync(transcriptPath(runDir, scenario.id, mode, repCount > 1 ? rep : undefined), transcript, "utf8");
    if (scenario.mode === "seeded") {
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "", ...repField });
    }

    let verdict: ScenarioResult["judge_verdict"];
    let reason: string;
    let suspect = false;
    if (gatePrefix) {
      verdict = "FAIL";
      reason = gatePrefix;
    } else {
      const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
      const g = await judgeInWorkspace(ctx.adapter, judge, prompt, dirname(ctx.specPath));
      verdict = g.verdict;
      reason = g.reason;
      suspect = g.suspect;
    }

    log(`  → ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  ⚠ suspect" : ""}`);
    appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    if (suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: now(), id: scenario.id, reason, ...repField });
    }
    return { verdict, reason, suspect };
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
    const misfired = s.clean !== undefined && s.reps !== undefined && s.clean < s.reps ? ` · ${s.reps - s.clean} misfired` : "";
    const repInfo = s.reps ? `  [${s.passes}/${s.clean}${misfired}${s.flakiness ? ` flaky ${s.flakiness.toFixed(2)}` : ""}]` : "";
    lines.push(`  ${mark} ${s.id}${ov}${susp}  ${s.judge_reason}${repInfo}`);
  }
  const ship = g.ship ? "SHIP" : "NOT READY";
  const note = g.note ? ` (${g.note})` : "";
  lines.push(`  GRADE: ${g.letter} (${g.pct}%) — ${g.passed}/${g.total} — ${ship}${note}`);
  return lines.join("\n");
}
