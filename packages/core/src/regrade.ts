import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { buildJudgePrompt, judgeInWorkspace } from "./grade.js";
import {
  findTranscriptFiles, judgeRawPath, repIndexOf, readResults, writeResults, effectiveThreshold,
  type ScenarioResult, type ResultsFile,
} from "./results.js";
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

export interface RegradeRunOptions {
  runDir: string;
  spec: Spec;
  adapter: HarnessAdapter;
  judge: ModelRef;
  specDir: string; // fixtures/neutral cwd base for the judge workspace
  now?: () => string;
}

/**
 * Re-judge every green-transcript scenario in a run dir with `judge` — no
 * harness re-run. Targets are the run's RECORDED scenarios (falling back to
 * the spec for a run with no prior results.yaml), so re-grading rewrites the
 * whole results.yaml consistently with what the run actually recorded. Each
 * target must still exist in the spec (for its checklist) AND have a green
 * transcript on disk; anything missing fails fast before spending any judge
 * calls. Preserves each prior scenario's override/note, rewrites
 * results.yaml, emits the `score` journal event, and returns the new
 * ResultsFile. Shared by `cmdGrade` and the pi-extension's `judge` command.
 */
export async function regradeRun(opts: RegradeRunOptions): Promise<ResultsFile> {
  const { runDir, spec, adapter, judge, specDir } = opts;
  const now = opts.now ?? (() => new Date().toISOString());

  const prev = existsSync(join(runDir, "results.yaml")) ? readResults(runDir) : null;
  const overrides = new Map((prev?.scenarios ?? []).map((s) => [s.id, { override: s.override, note: s.note }]));
  const mode = prev?.mode ?? "green";

  // Re-grading rewrites the WHOLE results.yaml, so re-judge exactly the
  // scenarios the run recorded (falling back to the spec for a run with no
  // prior results). The guard and the loop iterate the SAME `targets` set, so
  // they can't diverge: each target must still exist in the spec (for its
  // checklist) AND have a transcript on disk — only overridden transcripts
  // survive a commit (audit-trail design). Anything missing would silently drop
  // a recorded verdict or shrink the grade denominator. Fail fast, before
  // spending any judge calls.
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  const targets = (prev?.scenarios ?? spec.scenarios).map((s) => s.id);

  const missing = targets.filter((id) => !specById.has(id) || findTranscriptFiles(runDir, id, "green").length === 0);
  if (missing.length === targets.length) {
    throw new Error(`no green transcripts in ${runDir} — nothing to re-grade`);
  }
  if (missing.length > 0) {
    throw new Error(
      `cannot re-grade ${missing.join(", ")} in ${runDir} (transcript missing or scenario no longer in the spec) — re-run instead of grading`
    );
  }

  const scenarioResults: ScenarioResult[] = [];
  for (const id of targets) {
    const scenario = specById.get(id)!; // guaranteed present by the guard above
    const prevScenario = prev?.scenarios.find((s) => s.id === id);
    const threshold = effectiveThreshold(prevScenario, scenario);
    const rr = await regradeScenario({
      runDir, spec, scenario, adapter, judge, specDir, threshold, now,
    });
    const carry = overrides.get(id);
    scenarioResults.push({ ...rr, override: carry?.override ?? null, note: carry?.note ?? "" });
  }

  const ctx = mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: prev?.harness ?? "pi",
    model: prev?.model ?? "unknown",
    judge: { provider: judge.provider, model: judge.model },
    timestamp: prev?.timestamp ?? now(),
    label: prev?.label ?? null,
    mode,
    scenarios: scenarioResults,
  }, ctx);
  const g = results.effective_grade;
  if (ctx) {
    appendJournal(runDir, {
      event: "score", ts: now(),
      passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note,
    });
  }
  return results;
}
