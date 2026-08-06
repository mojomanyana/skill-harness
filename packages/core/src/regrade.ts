import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { buildJudgePrompt, judgeInWorkspace } from "./grade.js";
import {
  findTranscriptFiles, judgeRawPath, repIndexOf, readResults, writeResults, effectiveThreshold,
  scoreContextFor,
  type ScenarioResult, type ResultsFile,
} from "./results.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { appendJournal } from "./journal.js";
import { rubricDigest, personaDigest, RUBRIC_PREFIX, PERSONA_KEY } from "./sources.js";

/**
 * Carry a run's recorded hashes forward, refreshing only the `rubric:` keys this
 * re-grade actually judged under (plus the persona, which applies to all of them).
 *
 * Everything else is preserved deliberately: the transcripts were produced by the old
 * stimulus, so a stimulus hash must stay stale until someone re-runs. `--suspect-only`
 * is why this takes an id list rather than refreshing every rubric key — a re-grade
 * that touched two scenarios must not certify the rubric of the twelve it skipped.
 *
 * No hashes recorded (a pre-`source_hashes` run) stays that way: inventing hashes for
 * a run that never recorded any would claim a coverage it does not have.
 */
export function refreshRubricHashes(
  recorded: Record<string, string> | undefined,
  spec: Spec,
  judgedIds: string[],
): Record<string, string> | undefined {
  if (!recorded) return undefined;
  const next = { ...recorded };
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  for (const id of judgedIds) {
    const s = specById.get(id);
    // Only refresh a key the run already carried: adding one for a scenario whose
    // rubric was never hashed would fabricate coverage.
    if (s && RUBRIC_PREFIX + id in next) next[RUBRIC_PREFIX + id] = rubricDigest(s);
  }
  if (PERSONA_KEY in next) next[PERSONA_KEY] = personaDigest(spec.judge_persona);
  return next;
}

export interface RegradeOptions {
  runDir: string;
  spec: Spec;
  scenario: Scenario;
  adapter: HarnessAdapter;
  judge: ModelRef;
  specDir: string; // fixtures/neutral cwd base for the judge workspace
  threshold: number;
  /**
   * Which mode's saved transcripts to re-judge — the run's own mode, since
   * transcript filenames are `<id>.<mode>[.rep<k>].txt`.
   *
   * Defaults to `green` for callers that predate force being a scored mode. A
   * force-mode run whose transcripts were looked up as green found none and failed
   * with "nothing to re-grade", which is how ten scorable runs stayed ungraded.
   */
  mode?: string;
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
 * Re-judge a scenario's saved transcript(s) for the run's mode with `judge` — no
 * harness re-run. Rewrites the judge-raw artifact per rep, emits per-rep
 * judge-verdict (+ misfire-flag) journal events, and returns the aggregated
 * ScenarioResult (override/note empty; the caller merges any prior override +
 * persists).
 */
export async function regradeScenario(opts: RegradeOptions): Promise<ScenarioResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const mode = opts.mode ?? "green";
  const files = findTranscriptFiles(opts.runDir, opts.scenario.id, mode);
  if (files.length === 0) throw new Error(`no ${mode} transcripts for ${opts.scenario.id} in ${opts.runDir}`);
  const repCount = files.length;
  const outcomes: RepOutcome[] = [];
  for (const file of files) {
    const rep = repIndexOf(file) ?? undefined;
    const transcript = readFileSync(join(opts.runDir, file), "utf8");
    outcomes.push(await judgeOneRep({
      runDir: opts.runDir, spec: opts.spec, scenario: opts.scenario, transcript,
      adapter: opts.adapter, judge: opts.judge, specDir: opts.specDir, mode, rep, now,
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
  /**
   * Re-judge ONLY scenarios whose stored verdict is untrustworthy — suspect (misfire) or
   * JUDGE-AMBIGUOUS. Everything else is carried verbatim: their transcripts were judged
   * cleanly, so spending judge calls on them buys nothing.
   */
  onlySuspect?: boolean;
}

/**
 * Re-judge every scenario in a run dir that has a transcript for the run's own
 * mode, with `judge` — no harness re-run. Targets are the run's RECORDED scenarios
 * (falling back to the spec for a run with no prior results.yaml), so re-grading
 * rewrites the whole results.yaml consistently with what the run actually recorded.
 * Each target must still exist in the spec (for its checklist) AND have a
 * transcript on disk for that mode; anything missing fails fast before spending
 * any judge calls. Preserves each prior scenario's override/note, rewrites
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
  const recorded = prev?.scenarios ?? spec.scenarios.map((s) => ({ id: s.id } as ScenarioResult));
  let targets = recorded.map((s) => s.id);
  if (opts.onlySuspect) {
    if (!prev) throw new Error(`--suspect-only needs a prior results.yaml in ${runDir}`);
    targets = prev.scenarios
      .filter((s) => s.suspect || s.judge_verdict === "JUDGE-AMBIGUOUS")
      .map((s) => s.id);
    if (targets.length === 0) {
      // Nothing untrustworthy — a no-op, not an error. Return the file as-is.
      return prev;
    }
  }

  const missing = targets.filter((id) => !specById.has(id) || findTranscriptFiles(runDir, id, mode).length === 0);
  if (missing.length === targets.length) {
    throw new Error(`no ${mode} transcripts in ${runDir} — nothing to re-grade`);
  }
  if (missing.length > 0) {
    throw new Error(
      `cannot re-grade ${missing.join(", ")} in ${runDir} (transcript missing or scenario no longer in the spec) — re-run instead of grading`
    );
  }

  const targetSet = new Set(targets);
  const scenarioResults: ScenarioResult[] = [];
  for (const rec of recorded) {
    const id = rec.id;
    if (!targetSet.has(id)) {
      scenarioResults.push(rec); // clean verdict, carried verbatim (onlySuspect)
      continue;
    }
    const scenario = specById.get(id)!; // guaranteed present by the guard above
    const prevScenario = prev?.scenarios.find((s) => s.id === id);
    const threshold = effectiveThreshold(prevScenario, scenario);
    const rr = await regradeScenario({
      runDir, spec, scenario, adapter, judge, specDir, threshold, mode, now,
    });
    const carry = overrides.get(id);
    scenarioResults.push({ ...rr, override: carry?.override ?? null, note: carry?.note ?? "" });
  }

  const ctx = scoreContextFor({ mode, partial: prev?.partial }, spec);
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: prev?.harness ?? "pi",
    // The harness CLI that produced these transcripts, carried verbatim: a re-grade
    // re-asks the judge, it does not re-deliver the skill, so stamping today's pi
    // here would credit the old transcripts to a version that never ran them.
    harness_cli_version: prev?.harness_cli_version,
    delivery_canary: prev?.delivery_canary,
    model: prev?.model ?? "unknown",
    judge: { provider: judge.provider, model: judge.model },
    timestamp: prev?.timestamp ?? now(),
    label: prev?.label ?? null,
    mode,
    // A re-grade judges the SAVED transcripts, which were produced by the OLD text —
    // the recorded **stimulus** hashes stay, keeping an honestly-stale run honestly
    // stale. The rubric hashes are a different matter: this re-grade applied the
    // CURRENT checklist and persona to those transcripts, so "the verdicts reflect
    // today's rubric" is now a true statement about the record, and the hashes should
    // say so. Doctrine narrowed 0.4.0, from "recorded hashes stay" to "recorded
    // *stimulus* hashes stay" — see refreshRubricHashes.
    partial: prev?.partial,
    source_hashes: refreshRubricHashes(prev?.source_hashes, spec, targets),
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
