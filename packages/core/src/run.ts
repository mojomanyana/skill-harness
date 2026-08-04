import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { judgeResemblesSubject } from "./grade.js";
import {
  runDirFor,
  transcriptPath,
  diffPath,
  writeResults,
  ensureResultsGitignore,
  type ResultsFile,
  type ScenarioResult,
} from "./results.js";
import { appendJournal } from "./journal.js";
import { liftHeadline, type Lift } from "./lift.js";
import { runSeeded } from "./seeded.js";
import { createWorkspace, type Workspace } from "./workspace.js";
import { runPool } from "./scheduler.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { judgeOneRep } from "./regrade.js";

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
  /**
   * Run only these scenario ids — the iteration tool (re-testing 2 D-scenarios must not
   * cost an 18-scenario run). The result is marked `partial: true` and is NEVER
   * ship-graded: a subset passing says nothing about the ship bar.
   */
  only?: string[];
}

export interface RunSummary {
  runDir: string;
  results: ResultsFile;
}

/** sha256 of a file, or null when it doesn't exist — missing sources are lint's problem, not run's. */
function sha256(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Hash every source file this run measures: SKILL.md + each distinct
 * system_prompt_file (agents/<name>.md). Recorded in results.yaml so lint can prove
 * a published result still describes the current text.
 */
function sourceHashes(skillDir: string, specPath: string, scenarios: Scenario[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  const skillMd = sha256(resolve(skillDir, "SKILL.md"));
  if (skillMd) hashes["SKILL.md"] = skillMd;
  for (const s of scenarios) {
    if (s.systemPromptFile && !(s.systemPromptFile in hashes)) {
      const h = sha256(resolve(dirname(specPath), s.systemPromptFile));
      if (h) hashes[s.systemPromptFile] = h;
    }
  }
  return hashes;
}

/** Run one skill against one model: run scenarios, grade, score, persist. */
export async function runSkillModel(opts: RunOptions): Promise<RunSummary> {
  const { spec, skillDir, adapter, model, judge, mode, timestamp } = opts;
  const log = opts.onProgress ?? (() => {});
  const now = opts.now ?? (() => new Date().toISOString());

  // --only: validate against the spec BEFORE spending anything — a typo'd id must not
  // silently run zero scenarios and report success.
  let scenarios = spec.scenarios;
  const partial = Boolean(opts.only && opts.only.length > 0);
  if (partial) {
    const known = new Set(spec.scenarios.map((s) => s.id));
    const unknown = opts.only!.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(
        `--only names unknown scenario id(s) ${unknown.join(", ")} — spec has: ${[...known].join(", ")}`
      );
    }
    const wanted = new Set(opts.only);
    scenarios = spec.scenarios.filter((s) => wanted.has(s.id));
    log(`  --only ${opts.only!.join(",")} — partial run, will not be ship-graded`);
  }

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
  const repCounts = scenarios.map((s) => s.reps ?? opts.reps ?? 1);
  const owners: number[] = [];
  const tasks: Array<() => Promise<RepOutcome>> = [];
  scenarios.forEach((scenario, si) => {
    for (let k = 0; k < repCounts[si]; k++) {
      const rep = k;
      const total = repCounts[si];
      owners.push(si);
      tasks.push(() => runRep(scenario, rep, total, { ...opts, runDir, now, log }));
    }
  });
  const flat = await runPool(tasks, opts.concurrency ?? 1);

  const grouped: RepOutcome[][] = scenarios.map(() => []);
  flat.forEach((outcome, i) => grouped[owners[i]].push(outcome));

  const scenarioResults: ScenarioResult[] = scenarios.map((scenario, si) => {
    const threshold = scenario.passThreshold ?? opts.passThreshold ?? 0.5;
    return outcomesToResult(scenario.id, grouped[si], repCounts[si], threshold);
  });

  const ctx = mode === "green" && !partial ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: adapter.name,
    model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    timestamp,
    label: opts.label ?? null,
    mode,
    ...(partial ? { partial: true } : {}),
    source_hashes: sourceHashes(skillDir, opts.specPath, scenarios),
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

/**
 * True when any assistant turn in a transcript is blank — the shape a harness timeout
 * leaves behind. Such a transcript must never reach the judge: grading an empty reply
 * produces a confident FAIL about behavior that never happened (round 9 lost two
 * scenarios this way). Sections are delimited by the adapters' shared transcript
 * convention (">>> USER"/"<<< ASSISTANT:"); seeded gate output ("=== SEEDED GATES ===")
 * ends the last assistant section.
 */
export function hasEmptyAssistantTurn(transcript: string): boolean {
  const sections = transcript.split(/^<<< ASSISTANT:\s*$/m).slice(1);
  if (sections.length === 0) return false;
  return sections.some((sec) => {
    const body = sec.split(/^(?:>>> |=== SEEDED GATES ===|\[pi exited )/m)[0];
    return body.trim() === "";
  });
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
  // Null until a seeded rep actually reaches its gates: a workspace-setup failure
  // produces no diff, and writing an empty artifact there would misreport "the
  // model changed nothing" for a rep that never ran.
  let stagedDiff: string | null = null;
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
    } catch (e) {
      // A setup failure (e.g. missing fixture) is an objective FAIL, not an infra abort.
      gatePrefix = e instanceof Error ? e.message : String(e);
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    let noResponse = false;
    if (ws) {
      // A blank assistant turn is a harness timeout, not model behavior: retry ONCE in a
      // fresh workspace (the first attempt may have half-mutated a seeded repo), and if
      // it happens again the verdict is ERROR — never a judged FAIL on an empty reply.
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          appendJournal(runDir, { event: "empty-response-retry", ts: now(), id: scenario.id, attempt, ...repField });
          log(`  ${scenario.id}${repCount > 1 ? `#${rep}` : ""} empty response — retrying once`);
          ws.cleanup();
          ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
        }
        if (scenario.mode === "seeded") {
          const r = await runSeeded(scenario, {
            skillDir: ctx.skillDir, adapter: ctx.adapter, model: ctx.model, mode, cwd: ws.cwd,
            specDir: dirname(ctx.specPath), // assert.post_test resolves like a fixture
          });
          transcript = r.transcript;
          gatePrefix = r.gateFailure;
          stagedDiff = r.diff; // a retry replaces the aborted attempt's diff, as it should
        } else {
          transcript = await ctx.adapter.run({
            skillDir: ctx.skillDir, model: ctx.model, mode, turns: scenario.turns, cwd: ws.cwd,
            // resolved like fixtures: relative to the spec's dir
            systemPromptFile: scenario.systemPromptFile
              ? resolve(dirname(ctx.specPath), scenario.systemPromptFile)
              : undefined,
          });
        }
        noResponse = hasEmptyAssistantTurn(transcript);
        if (!noResponse) break;
      }
    }

    const repSuffix = repCount > 1 ? rep : undefined;
    writeFileSync(transcriptPath(runDir, scenario.id, mode, repSuffix), transcript, "utf8");
    if (scenario.mode === "seeded") {
      // The workspace is torn down in the `finally` below, so this is the only
      // chance to keep what the model actually wrote. Persisted uncapped (the
      // transcript's copy is capped for the judge) and for every rep, pass or
      // fail — a gate failure is exactly when you want to read the diff.
      if (stagedDiff !== null) {
        writeFileSync(diffPath(runDir, scenario.id, mode, repSuffix), stagedDiff, "utf8");
      }
      appendJournal(runDir, { event: "gate-result", ts: now(), id: scenario.id, ok: !gatePrefix, detail: gatePrefix ?? "", ...repField });
    }

    let verdict: ScenarioResult["judge_verdict"];
    let reason: string;
    let suspect = false;
    if (noResponse) {
      verdict = "ERROR";
      reason = "model produced no response after a retry (harness timeout?) — infra, not skill behavior";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (gatePrefix) {
      verdict = "FAIL";
      reason = gatePrefix;
      // gate failures don't invoke the judge, but still record a judge-verdict event (as before)
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else {
      const o = await judgeOneRep({
        runDir, spec, scenario, transcript, adapter: ctx.adapter, judge,
        specDir: dirname(ctx.specPath), mode, rep: repCount > 1 ? rep : undefined, now,
      });
      verdict = o.verdict; reason = o.reason; suspect = o.suspect; // judgeOneRep already journaled (verdict + misfire)
    }
    log(`  → ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  ⚠ suspect" : ""}`);
    return { verdict, reason, suspect };
  } finally {
    ws?.cleanup();
  }
}

/** A compact terminal scorecard for one run. */
/**
 * The human-facing scorecard for one run.
 *
 * `lift` is the red-vs-green comparison for this model when a red baseline
 * exists. Passing it for a green run turns the scorecard from "the skill scored
 * B" into "the skill *did* this much" — without a baseline the grade alone can't
 * distinguish a skill that works from a model that never needed it.
 */
export function formatScorecard(summary: RunSummary, lift?: Lift): string {
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
  // Lift is a statement about a green run. On a red run the caller may still have
  // a lift in hand (a green run exists in the same tag), but printing it under a
  // baseline scorecard reads as if the baseline itself gained something.
  if (lift && results.mode === "green") {
    lines.push(`  LIFT:  ${liftHeadline(lift)}  (vs red baseline ${lift.redTimestamp})`);
  } else if (results.mode === "green") {
    // The grade alone can't answer "does this skill do anything?", so say how.
    lines.push(`  LIFT:  no red baseline — run with --mode red to measure what the skill adds`);
  }
  return lines.join("\n");
}
