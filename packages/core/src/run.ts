import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import { sourceHashes } from "./sources.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { judgeResemblesSubject } from "./grade.js";
import {
  runDirFor,
  transcriptPath,
  diffPath,
  tracePath,
  type ObjectiveResult,
  writeResults,
  ensureResultsGitignore,
  scoreContextFor,
  isScoredMode,
  type ResultsFile,
  type ScenarioResult,
} from "./results.js";
import { appendJournal } from "./journal.js";
import { liftHeadline, type Lift } from "./lift.js";
import { runSeeded } from "./seeded.js";
import { serializeTrace, mergeTraces, traceSha256 } from "./execution-trace.js";
import { evaluateTraceGates } from "./trace-gates.js";
import type { ExecutionTraceV1 } from "./capture-trace-types.js";
import { observeChangedPaths, createWorkspace, type Workspace } from "./workspace.js";
import { runPool } from "./scheduler.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { judgeOneRep } from "./regrade.js";
import { runDeliveryCanary, canaryFailure, type CanaryResult } from "./canary.js";
import { boundaryCells, stabilityNote, type ScenarioStability } from "./stability.js";

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
  /**
   * Green mode only: spend ONE probe up front proving the skill reaches the model,
   * and abort the run if it doesn't (see canary.ts). Off by default — it costs a
   * rep, and the deterministic half of this failure class (a skill dir that isn't
   * there) is already refused by the adapter for free.
   */
  canary?: boolean;
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

  // Which harness CLI delivered the skill, asked once per run and recorded with the
  // numbers. A pi upgrade (0.80.x → 0.83.0) silently changed what green mode
  // measures, and the incident was invisible in the artifacts because nothing wrote
  // this down. Never fatal: `null` means the adapter couldn't say.
  const harnessCliVersion = (await adapter.version?.()) ?? null;

  appendJournal(runDir, {
    event: "run-started", ts: now(),
    skill: spec.skill, harness: adapter.name, model: opts.modelToken,
    harness_cli_version: harnessCliVersion,
    judge: { provider: judge.provider, model: judge.model },
    mode, label: opts.label ?? null,
  });

  // The canary spends one probe before the wave, so a run that isn't measuring the
  // skill dies for the price of a rep instead of producing a plausible scorecard.
  // Green only: red delivers nothing by design, and force delivers through the
  // system prompt, which needs no probe.
  let canaryStatus: "pass" | null = null;
  if (opts.canary && mode !== "green") {
    // Ignoring a flag silently is a small version of the bug this whole feature is
    // about. Say it, and say why it isn't needed.
    log(`  --canary ignored in mode=${mode} — ${mode === "force" ? "the system prompt delivers the skill unconditionally" : "a baseline delivers no skill by design"}`);
  }
  if (opts.canary && mode === "green") {
    const probeCwd = createWorkspace("none", { specDir: dirname(opts.specPath) });
    let canary: CanaryResult;
    try {
      canary = await runDeliveryCanary({
        adapter, model, skillDir, skillName: spec.skill, cwd: probeCwd.cwd,
      });
    } finally {
      probeCwd.cleanup();
    }
    appendJournal(runDir, {
      event: "delivery-canary", ts: now(),
      status: canary.status, anchor: canary.anchor, detail: canary.detail,
    });
    if (canary.status === "fail") throw new Error(canaryFailure(spec.skill, canary, harnessCliVersion));
    if (canary.status === "skipped") log(`  ⚠ delivery canary skipped — ${canary.detail}`);
    else {
      canaryStatus = "pass";
      log(`  ✓ delivery canary — the model quoted its skill instructions back (\`${canary.anchor}\`)`);
    }
  }

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

  const ctx = scoreContextFor({ mode, partial }, spec);
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: adapter.name,
    harness_cli_version: harnessCliVersion ?? undefined,
    delivery_canary: canaryStatus ?? undefined,
    model: opts.modelToken,
    judge: { provider: judge.provider, model: judge.model },
    timestamp,
    label: opts.label ?? null,
    mode,
    ...(partial ? { partial: true } : {}),
    // Only the scenarios this run actually measured: a --only run must not claim
    // coverage of scenarios it skipped.
    source_hashes: sourceHashes({ skillDir, specDir: dirname(opts.specPath), scenarios, judgePersona: spec.judge_persona }),
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
    let traces: ExecutionTraceV1[] = [];
    let unobservablePaths = false;
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
            trace: scenario.traceAssert ? { scenarioId: scenario.id, rep } : undefined,
          });
          transcript = r.transcript;
          gatePrefix = r.gateFailure;
          stagedDiff = r.diff; // a retry replaces the aborted attempt's diff, as it should
          traces = r.traces;
        } else {
          const req = {
            skillDir: ctx.skillDir, model: ctx.model, mode, turns: scenario.turns, cwd: ws.cwd,
            // resolved like fixtures: relative to the spec's dir
            systemPromptFile: scenario.systemPromptFile
              ? resolve(dirname(ctx.specPath), scenario.systemPromptFile)
              : undefined,
            // Absolute before it reaches a child process running in a neutral cwd.
            extensions: scenario.extensions?.map((e) => resolve(dirname(ctx.specPath), e)),
          };
          if (scenario.traceAssert) {
            // Missing required evidence is ERROR, never a silent fallback to the
            // unstructured path: a gate with nothing to read must not look like a
            // gate that passed.
            if (!ctx.adapter.runStructured) {
              throw new Error(
                `scenario \`${scenario.id}\` declares \`assert.trace\`, but the \`${ctx.adapter.name}\` adapter` +
                  ` cannot produce execution traces — the gate would have no evidence to read.`,
              );
            }
            const structured = await ctx.adapter.runStructured({ ...req, scenarioId: scenario.id, rep });
            transcript = structured.transcript;
            traces = structured.traces;
          } else {
            transcript = await ctx.adapter.run(req);
          }
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

    // Filesystem evidence for `unchanged_paths`, observed AFTER the model ran.
    //
    // It cannot come through `RunReq`: the request is built before the run, and
    // what changed only exists afterwards. That plumbing existed and no caller
    // ever set it, so `changed_paths` was always `[]` and every
    // `unchanged_paths` assertion passed vacuously — a safety gate reporting
    // green while the model rewrote the workspace.
    // Only when the scenario actually asserts on paths. A scenario using only
    // `require_calls` / `forbid_calls` needs no filesystem evidence, so a
    // workspace it cannot observe is not an error for it.
    if (scenario.traceAssert?.unchanged_paths?.length && traces.length > 0 && ws) {
      const changed = await observeChangedPaths(ws.cwd, scenario.workspace);
      if (changed === null) {
        // `workspace: none` has no repo to compare against. Missing evidence is
        // ERROR, never a pass — spec.ts refuses this combination up front, so
        // reaching here means the workspace could not be read.
        unobservablePaths = true;
      } else {
        traces = traces.map((t) => {
          const withPaths = { ...t, changed_paths: [...changed].sort() };
          return { ...withPaths, trace_sha256: traceSha256(withPaths) };
        });
      }
    }

    // Objective evidence is persisted for every rep, pass or fail — a failing gate
    // is exactly when someone wants to read what the model actually did.
    let objective: ObjectiveResult | undefined;
    if (scenario.traceAssert) {
      if (traces.length > 0) {
        writeFileSync(
          tracePath(runDir, scenario.id, mode, repSuffix),
          traces.map(serializeTrace).join(""),
          "utf8",
        );
      }
      const merged = mergeTraces(traces);
      if (unobservablePaths) {
        gatePrefix = "objective: workspace changes could not be observed — `unchanged_paths` has no evidence to check";
        objective = { status: "ERROR", assertions: [] };
      } else if (merged === null) {
        // Declared a gate, produced no trace: that is broken infrastructure, and
        // grading it either way would be inventing a result.
        gatePrefix = "objective: no execution trace was produced — cannot evaluate assert.trace";
        objective = { status: "ERROR", assertions: [] };
      } else {
        const gate = evaluateTraceGates(scenario.traceAssert, merged);
        objective = {
          status: gate.status,
          trace_version: merged.trace_version,
          trace_sha256: merged.trace_sha256,
          assertions: gate.assertions,
        };
        if (gate.status === "FAIL") {
          // Set the same gatePrefix the seeded gates use, so a trace failure
          // short-circuits the judge through the path that already exists.
          gatePrefix = `objective: ${gate.assertions.filter((x) => x.status === "FAIL").map((x) => x.detail).join("; ")}`;
        }
      }
      appendJournal(runDir, {
        event: "objective-result", ts: now(), id: scenario.id,
        ok: objective.status === "PASS", detail: gatePrefix ?? "", ...repField,
      });
    }

    let verdict: ScenarioResult["judge_verdict"];
    let reason: string;
    let suspect = false;
    if (objective?.status === "ERROR") {
      verdict = "ERROR";
      reason = gatePrefix ?? "objective evidence missing";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (noResponse) {
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
    return { verdict, reason, suspect, objective };
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
 *
 * `stability` is the run-over-run half of the same argument, and it is derived from
 * history rather than from this run: a cell that flipped its verdict between the last
 * two runs of this skill × model × mode is worth less than the ✓ beside it suggests,
 * and this run's own `flaky 0.00` cannot say so — it only ever looked at one run. Pass
 * the cells for THIS tag and mode; anything else would report another model's history
 * under this model's scorecard.
 */
export function formatScorecard(summary: RunSummary, lift?: Lift, stability?: ScenarioStability[]): string {
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
  // Lift is a statement about a skill-delivered run (green or force). On a red run
  // the caller may still have a lift in hand (a scored run exists in the same tag),
  // but printing it under a baseline scorecard reads as if the baseline itself
  // gained something.
  if (lift && isScoredMode(results.mode)) {
    lines.push(`  LIFT:  ${liftHeadline(lift)}  (vs red baseline ${lift.redTimestamp})`);
  } else if (isScoredMode(results.mode)) {
    // The grade alone can't answer "does this skill do anything?", so say how.
    lines.push(`  LIFT:  no red baseline — run with --mode red to measure what the skill adds`);
  }
  // Said on the scorecard, not just in the docs: the one thing that can invalidate
  // a green number is invisible in the number. `harness_cli_version` is recorded
  // beside the verdicts so a reader can tell which pi produced them.
  if (results.mode === "green" && !results.delivery_canary) {
    lines.push(
      `  NOTE:  green delivery is harness-version-dependent` +
        (results.harness_cli_version ? ` (${results.harness} ${results.harness_cli_version})` : "") +
        ` — on pi ≥ 0.83.0 \`--skill\` only discloses the description and the body loads on demand.` +
        ` Use --mode force for delivery that cannot silently degrade, or --canary to prove it per run.`,
    );
  }
  // Boundary cells last, because they qualify the verdicts above: a ✓ on a cell that
  // flipped between the last two runs is one draw, whatever its rep count said.
  const ran = new Set(results.scenarios.map((s) => s.id));
  for (const s of boundaryCells(stability ?? []).filter((c) => ran.has(c.id))) {
    lines.push(`  ⇄ ${stabilityNote(s)}`);
  }
  return lines.join("\n");
}
