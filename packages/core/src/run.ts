import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import { sourceHashes, PROMPT_NORMALIZATION_SOURCE_KEY, PROMPT_NORMALIZATION_SOURCE_DIGEST } from "./sources.js";
import type { HarnessAdapter, ModelRef, RunMode, PromptProvenance } from "./adapters/types.js";
import { judgeResemblesSubject } from "./grade.js";
import { NONE_ARM, seedArmDefinitions, type Arm } from "./arms.js";
import {
  runDirFor,
  transcriptPath,
  diffPath,
  tracePath,
  trajectoryPath,
  type ObjectiveResult,
  writeResults,
  ensureResultsGitignore,
  scoreContextFor,
  effectiveThreshold,
  isScoredMode,
  type ResultsFile,
  type ScenarioResult,
  type SubjectInvocationObservation,
  deliveryStatusForObservations,
} from "./results.js";
import { appendJournal } from "./journal.js";
import { liftHeadline, type Lift } from "./lift.js";
import { runSeeded } from "./seeded.js";
import { serializeTrace, mergeTraces, traceSha256 } from "./execution-trace.js";
import { evaluateTraceGates } from "./trace-gates.js";
import {
  evaluateTrajectoryGates, serializeTrajectoryEvents,
  type TrajectoryEventV1,
} from "./trajectory-gates.js";
import type { ExecutionTraceV1 } from "./capture-trace-types.js";
import { snapshotPaths, diffSnapshots, createWorkspace, type Workspace, type PathSnapshot } from "./workspace.js";
import { runPool } from "./scheduler.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { judgeOneRep } from "./regrade.js";
import { runDeliveryCanary, canaryFailure, type CanaryResult } from "./canary.js";
import { boundaryCells, stabilityNote, type ScenarioStability } from "./stability.js";
import { aggregateMetrics } from "./comparison.js";
import { providerFailureFromTranscript } from "./provider-failure.js";

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
  /**
   * Take the structured path even when no scenario declares a trace or trajectory
   * assertion. The subject half of `ScenarioMetrics` — tokens, `subject_cost_usd` —
   * is only ever populated from traces, so without this a run records no cost or
   * token data at all, which is why the reference corpus has none.
   */
  structured?: boolean;
  /** The arm this run is measured under. Absent means the control (`none`). */
  arm?: Arm;
  /** Skills root — `seed_skills` paths resolve against it. Defaults to the skill's parent. */
  skillsRoot?: string;
  /** Injectable ambient skill root, for tests. Production reads `~/.pi/agent/skills`. */
  ambientSkillsDir?: string;
}

export interface RunSummary {
  runDir: string;
  results: ResultsFile;
}

/**
 * The pi-daddy arm's delivery proof, by convention: `arms.yaml` points
 * `PI_GRANTS_LEDGER` at exactly this filename inside the run dir (see
 * `../principal-pi-skills/tests/arms.yaml` and CODEX-ARMS-RUNBOOK.md §4.3), so
 * a fixed name here is what makes the count readable without parsing the arm's
 * own `env` map back out.
 */
const LEDGER_FILENAME = "pi-daddy.ledger.jsonl";

/**
 * Count the arm's ledger events after the run, or 0 when the file was never
 * written.
 *
 * This is `--canary`'s lesson applied to the arm: the ledger is the arm's
 * delivery proof, and a delivery claim has to survive a commit. A missing file
 * records `0`, not an absent field — "the extension never wrote a ledger" and
 * "the extension wrote one with nothing in it" are both real, reportable
 * outcomes, and a vacuous arm run must not commit a record indistinguishable
 * from one that actually delegated.
 */
function countLedgerEvents(runDir: string): number {
  let text: string;
  try {
    text = readFileSync(join(runDir, LEDGER_FILENAME), "utf8");
  } catch {
    return 0;
  }
  return text.split("\n").filter((line) => line.trim().length > 0).length;
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

  const arm = opts.arm ?? NONE_ARM;
  const runDir = runDirFor(skillDir, adapter.name, model, timestamp, arm.name);
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
  let canaryStatus: "pass" | "skipped" | null = null;
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
    if (canary.status === "skipped") {
      // Recorded, not just logged: `journal.jsonl` is gitignored, and the claim
      // "this run's delivery was verified" has to survive a commit — including
      // when it is the claim that it wasn't.
      canaryStatus = "skipped";
      log(`  ⚠ delivery canary skipped — ${canary.detail}`);
    }
    else {
      canaryStatus = "pass";
      log(`  ✓ delivery canary — the model quoted its skill instructions back (\`${canary.anchor}\`)`);
    }
  }

  // scenario × rep tasks; runPool preserves input order so we can slice per scenario.
  const repCounts = scenarios.map((s) => s.reps ?? opts.reps ?? 1);
  const owners: number[] = [];
  const tasks: Array<() => Promise<RepOutcome>> = [];
  const armDefinitions = { count: 0 };
  scenarios.forEach((scenario, si) => {
    for (let k = 0; k < repCounts[si]; k++) {
      const rep = k;
      const total = repCounts[si];
      owners.push(si);
      tasks.push(() => runRep(scenario, rep, total, { ...opts, runDir, now, log, armDefinitions }));
    }
  });
  const flat = await runPool(tasks, opts.concurrency ?? 1);

  const subjectInvocations = flat.flatMap(outcome => outcome.subject_invocations ?? []);
  const grouped: RepOutcome[][] = scenarios.map(() => []);
  flat.forEach((outcome, i) => grouped[owners[i]].push(outcome));

  const scenarioResults: ScenarioResult[] = scenarios.map((scenario, si) => {
    const threshold = scenario.critical
      ? effectiveThreshold(undefined, scenario)
      : scenario.passThreshold ?? opts.passThreshold ?? 0.5;
    const result = outcomesToResult(scenario.id, grouped[si], repCounts[si], threshold);
    if (adapter.observesPrompts) result.criterion_count = scenario.checklist.length;
    if (adapter.observesPrompts && !result.rep_judgments) {
      result.rep_judgments = grouped[si].map((outcome, repetition) => ({ repetition, judgments: [], recorded_verdict: outcome.verdict, ...(outcome.objective ? { objective: outcome.objective } : {}) }));
    }
    return result;
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
    source_hashes: {
      ...sourceHashes({ skillDir, specDir: dirname(opts.specPath), scenarios, judgePersona: spec.judge_persona }),
      ...(adapter.observesPrompts ? { [PROMPT_NORMALIZATION_SOURCE_KEY]: PROMPT_NORMALIZATION_SOURCE_DIGEST } : {}),
    },
    scenarios: scenarioResults,
    ...(adapter.observesPrompts ? { schema: 3 as const, subject_invocations: subjectInvocations } : {}),
    ...(arm.name === NONE_ARM.name ? {} : {
      arm: {
        name: arm.name,
        extensions: arm.extensions,
        definitions: armDefinitions.count,
        ledger_events: countLedgerEvents(runDir),
        // The DECLARED env, `<run-dir>` left unsubstituted. It is the condition
        // being measured (grant, max depth), so leaving it out made two runs at
        // different settings byte-identical here and inside the same `+<arm>`
        // tag — `stability` then reads the verdict difference between two
        // conditions as one lineage flipping. The substituted form would be the
        // opposite error: it embeds this run's temp path, so re-running the SAME
        // condition would record two different-looking arms.
        env: arm.env,
      },
    }),
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
  /**
   * Shared mutable slot for the arm's seeded-definitions count. Seeding happens
   * per-workspace, inside `runRep` (so a retry's fresh workspace is re-seeded),
   * but the count is recorded once on the run-level results draft — the arm and
   * `skillsRoot` are constant for the whole run, so every rep computes the same
   * number and the last one to run wins.
   */
  armDefinitions: { count: number };
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
  const startedAt = performance.now();
  const { spec, judge, mode, runDir, now, log } = ctx;
  const repField = repCount > 1 ? { rep } : {};
  const arm = ctx.arm ?? NONE_ARM;
  const skillsRoot = ctx.skillsRoot ?? dirname(ctx.skillDir);
  // Arm paths are per-run/per-workspace values. Plain split/join avoids treating
  // temp-path characters as regex syntax.
  const armEnvFor = (workspace: string): Record<string, string> | undefined => Object.keys(arm.env).length
    ? Object.fromEntries(Object.entries(arm.env).map(([k, v]) => [k, v
        .split("<run-dir>").join(runDir)
        .split("<workspace>").join(workspace)]))
    : undefined;
  if (rep === 0) {
    log(`  ${scenario.id} (${scenario.title})${repCount > 1 ? ` ×${repCount}` : ""} …`);
    appendJournal(runDir, { event: "scenario-started", ts: now(), id: scenario.id, title: scenario.title });
  }

  let ws: Workspace | null = null;
  let transcript = "";
  let gatePrefix: string | null = null;
  let infrastructureFailure: string | null = null;
  // Null until a seeded rep actually reaches its gates: a workspace-setup failure
  // produces no diff, and writing an empty artifact there would misreport "the
  // model changed nothing" for a rep that never ran.
  let stagedDiff: string | null = null;
  const subjectInvocations: SubjectInvocationObservation[] = [];
  try {
    try {
      ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
    } catch (e) {
      // A setup failure means the scenario never executed. It blocks release as
      // infrastructure ERROR; it is not evidence of subject behavior.
      gatePrefix = e instanceof Error ? e.message : String(e);
      infrastructureFailure = gatePrefix;
      transcript = `[workspace setup failed] ${gatePrefix}`;
    }
    let noResponse = false;
    let traces: ExecutionTraceV1[] = [];
    let events: TrajectoryEventV1[] = [];
    let eventErrors: string[] = [];
    let unobservablePaths = false;
    // The pre-run state, captured AFTER `createWorkspace` has applied the
    // fixture's `_staged/` and `_uncommitted/` trees. Those land after the
    // baseline commit, so a fixture that ships a deliberately dirty tree was
    // being reported as changes the model made — a fabricated FAIL, written into
    // a committed results.yaml, naming files the model never touched.
    let before: PathSnapshot | null = ws ? snapshotPaths(ws.cwd, scenario.workspace) : null;
    if (ws) {
      // Seed the arm's definitions into THIS workspace before the subject runs.
      // Control (`none`) short-circuits inside `seedArmDefinitions` with no
      // filesystem side effects at all.
      ctx.armDefinitions.count = seedArmDefinitions(arm, skillsRoot, ws.cwd, { ambientSkillsDir: ctx.ambientSkillsDir });
    }
    // Set when the adapter itself threw. Rep-scoped rather than loop-scoped: the
    // evidence blocks below have to know this rep never ran.
    let adapterFailure: string | null = null;
    if (ws) {
      // Decided ONCE, before any attempt, and for both the seeded and non-seeded
      // branches — these are spec/adapter facts, not per-attempt outcomes, and
      // deciding them here is what lets the execution below be wrapped in a catch
      // that must not swallow a configuration error.
      //
      // `needsStructuredEvidence` is a gate with nothing to read if the adapter
      // cannot produce traces: ERROR, never a silent fallback to the unstructured
      // path, because a gate that could not be evaluated must not look like one
      // that passed. A bare `--structured` request with no gate depending on it
      // degrades to the plain path instead — on BOTH branches. The seeded branch
      // used to pass `trace: {...}` unconditionally and let `runSeeded` throw
      // ``scenario `X` declares `assert.trace`…`` at a scenario that declares no
      // such thing.
      const needsStructuredEvidence = Boolean(scenario.traceAssert || scenario.trajectoryAssert);
      if (needsStructuredEvidence && !ctx.adapter.runStructured) {
        throw new Error(
          `scenario \`${scenario.id}\` declares structured objective assertions, but the \`${ctx.adapter.name}\` adapter` +
            ` cannot produce execution traces/events — the gate would have no evidence to read.`,
        );
      }
      const useStructured = (Boolean(ctx.structured) || needsStructuredEvidence) && Boolean(ctx.adapter.runStructured);

      // A blank assistant turn is a harness timeout, not model behavior: retry ONCE in a
      // fresh workspace (the first attempt may have half-mutated a seeded repo), and if
      // it happens again the verdict is ERROR — never a judged FAIL on an empty reply.
      // An adapter that THREW is the same class of event and takes the same retry.
      for (let attempt = 0; attempt < 2; attempt++) {
        const observe = (prompt: PromptProvenance) => subjectInvocations.push({ scenario_id: scenario.id, repetition: rep, attempt, prompt });
        if (attempt > 0) {
          const why = adapterFailure ? `adapter failed (${adapterFailure})` : "empty response";
          appendJournal(runDir, { event: "empty-response-retry", ts: now(), id: scenario.id, attempt, reason: why, ...repField });
          log(`  ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${why} — retrying once`);
          ws.cleanup();
          ws = createWorkspace(scenario.workspace, { specDir: dirname(ctx.specPath), remote: scenario.remote });
          // A fresh workspace needs a fresh baseline, or the retry's diff would
          // be taken against a directory that no longer exists.
          before = snapshotPaths(ws.cwd, scenario.workspace);
          // And a fresh workspace has nothing to spawn until it, too, is seeded —
          // a retry that skipped this would silently run the arm with no
          // definitions at all.
          ctx.armDefinitions.count = seedArmDefinitions(arm, skillsRoot, ws.cwd, { ambientSkillsDir: ctx.ambientSkillsDir });
        }
        // Cleared per attempt, never carried over. A provider failure always
        // leaves a blank assistant turn, so attempt 0's reason used to survive a
        // retry that then succeeded: the rep was recorded ERROR citing an outage
        // while the persisted transcript was attempt 1's clean one — the record
        // and the artifact disagreeing, and a recovered measurement thrown away.
        infrastructureFailure = null;
        adapterFailure = null;
        try {
          if (scenario.mode === "seeded") {
            const r = await runSeeded(scenario, {
              skillDir: ctx.skillDir, adapter: ctx.adapter, model: ctx.model, mode, cwd: ws.cwd,
              specDir: dirname(ctx.specPath), // assert.post_test resolves like a fixture
              // `ctx.structured` (a bare `--structured` request, with no gate depending
              // on it) must route through the structured path here too, exactly as it
              // does for the non-seeded branch below — without it, `--structured` on a
              // `mode: seeded` scenario silently called the adapter's plain `run()` and
              // recorded zero subject tokens/cost, which is the one thing the flag exists
              // to capture. `useStructured` (not the raw request) so an adapter with no
              // `runStructured` degrades here exactly as it does below.
              trace: useStructured ? { scenarioId: scenario.id, rep } : undefined,
              // `runSeeded` merges these with `scenario.extensions` itself when it
              // builds the RunReq — the arm's extensions and env (with `<run-dir>`
              // already substituted) both must reach pi.
              armExtensions: arm.extensions,
              ...(armEnvFor(ws.cwd) ? { armEnv: armEnvFor(ws.cwd) } : {}),
              ...(ctx.adapter.observesPrompts ? { onPromptObservation: observe } : {}),
            });
            transcript = r.transcript;
            gatePrefix = r.gateFailure;
            infrastructureFailure = r.gateError;
            stagedDiff = r.diff; // a retry replaces the aborted attempt's diff, as it should
            traces = r.traces;
            events = r.events;
            eventErrors = r.eventErrors;
          } else {
            const req = {
              skillDir: ctx.skillDir, model: ctx.model, mode, turns: scenario.turns, cwd: ws.cwd,
              // resolved like fixtures: relative to the spec's dir
              systemPromptFile: scenario.systemPromptFile
                ? resolve(dirname(ctx.specPath), scenario.systemPromptFile)
                : undefined,
              // Absolute before it reaches a child process running in a neutral cwd.
              // The arm's extensions are added alongside whatever the scenario
              // itself declares — both must reach pi.
              extensions: [
                ...(scenario.extensions?.map((e) => resolve(dirname(ctx.specPath), e)) ?? []),
                ...arm.extensions,
              ],
              eventSources: scenario.eventSources,
              ...(armEnvFor(ws.cwd) ? { armEnv: armEnvFor(ws.cwd) } : {}),
              ...(ctx.adapter.observesPrompts ? { onPromptObservation: observe } : {}),
            };
            if (useStructured) {
              const structured = await ctx.adapter.runStructured!({ ...req, scenarioId: scenario.id, rep });
              transcript = structured.transcript;
              traces = structured.traces;
              events = structured.events ?? [];
              eventErrors = structured.eventErrors ?? [];
              if (structured.providerFailure) infrastructureFailure = `provider failure — ${structured.providerFailure}`;
            } else {
              transcript = await ctx.adapter.run(req);
            }
          }
        } catch (e) {
          // An adapter that THREW is one rep's infrastructure failure, not the
          // wave's. `runPool` is fail-fast and `runRep` had only a `finally`, so
          // a single pi crash or `PI_TIMEOUT_MS` timeout unwound the whole run:
          // no results.yaml written and every already-graded scenario's verdict
          // lost. `--structured` made that reachable for EVERY scenario, because
          // `runStructured` throws on a stream with no terminal events where the
          // text path merely recorded `[pi exited N]` and carried on.
          //
          // Configuration errors do not arrive here: the two that used to be
          // thrown from inside this block (adapter cannot produce traces for a
          // gated scenario) are decided above, before the loop.
          adapterFailure = e instanceof Error ? e.message : String(e);
          transcript = `[adapter failure] ${adapterFailure}`;
          // Nothing partial from the failed attempt may be read as evidence: an
          // empty trace list satisfies a `forbid_calls` gate, and a stale diff
          // from a previous attempt would be attributed to this one.
          gatePrefix = null;
          stagedDiff = null;
          traces = [];
          events = [];
          eventErrors = [];
        }

        // A provider outage is infrastructure, never a model verdict. Checked on
        // every path: the text path carries the marker in the transcript, the
        // structured path sets `providerFailure` above and exits 0 while doing it.
        if (!infrastructureFailure) {
          const provider = providerFailureFromTranscript(transcript);
          if (provider) infrastructureFailure = `provider failure — ${provider}`;
        }
        noResponse = hasEmptyAssistantTurn(transcript);
        if (!noResponse && !adapterFailure) break;
      }
      // Survived the retry: ERROR for this rep, inside a run that still completes
      // and still writes every other scenario's verdict.
      if (adapterFailure && !infrastructureFailure) {
        infrastructureFailure = `adapter failure — ${adapterFailure}`;
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
      const changed = diffSnapshots(before, snapshotPaths(ws.cwd, scenario.workspace));
      if (changed === null) {
        // Missing evidence is ERROR, never a pass — spec.ts refuses the
        // `workspace: none` combination up front, so reaching here means the
        // workspace could not be read.
        unobservablePaths = true;
      } else {
        traces = traces.map((t) => {
          const withPaths = { ...t, changed_paths: changed };
          return { ...withPaths, trace_sha256: traceSha256(withPaths) };
        });
      }
    }

    // Delivery is an objective gate on every Pi subject invocation. It is derived
    // from captured provider payload bytes, never from mode/argv supplied by a caller.
    let deliveryObjective: ObjectiveResult | undefined;
    if (ctx.adapter.observesPrompts) {
      const statuses = subjectInvocations.map(observation => observation.prompt.status);
      const status: ObjectiveResult["status"] = deliveryStatusForObservations(subjectInvocations);
      deliveryObjective = { status, assertions: [{ kind: "skill_delivered", status, detail: statuses.length === 0 ? "no model-visible prompt observation was retained" : `${statuses.length} provider request(s): ${statuses.join(", ")}` }] };
      if (status !== "PASS") gatePrefix = `objective: skill_delivered ${status.toLowerCase()} — ${deliveryObjective.assertions[0].detail}`;
    }

    // Objective evidence is persisted for every rep, pass or fail — a failing gate
    // is exactly when someone wants to read what the model actually did.
    // `!adapterFailure`: a rep whose adapter threw never ran, so there is nothing
    // to evaluate. Evaluating anyway reports "no execution trace was produced",
    // which is the symptom — it names the missing artifact instead of the crash or
    // timeout that caused it, and it is that text, not the real reason, that would
    // reach the results record. The verdict is ERROR either way.
    let objective: ObjectiveResult | undefined = deliveryObjective;
    if ((scenario.traceAssert || scenario.trajectoryAssert) && !adapterFailure) {
      const assertionResults: ObjectiveResult["assertions"] = [];
      let status: ObjectiveResult["status"] = "PASS";
      let traceMeta: Pick<ObjectiveResult, "trace_version" | "trace_sha256"> = {};
      let trajectoryMeta: Pick<ObjectiveResult, "trajectory_version" | "events_sha256"> = {};

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
          status = "ERROR";
          assertionResults.push({ kind: "unchanged_path", status: "ERROR", detail: "workspace changes could not be observed" });
        } else if (merged === null) {
          status = "ERROR";
          assertionResults.push({ kind: "trace_evidence", status: "ERROR", detail: "no execution trace was produced" });
        } else {
          const gate = evaluateTraceGates(scenario.traceAssert, merged);
          status = gate.status;
          assertionResults.push(...gate.assertions);
          traceMeta = { trace_version: merged.trace_version, trace_sha256: merged.trace_sha256 };
        }
      }

      if (scenario.trajectoryAssert) {
        if (events.length > 0) {
          writeFileSync(
            trajectoryPath(runDir, scenario.id, mode, repSuffix),
            serializeTrajectoryEvents(events),
            "utf8",
          );
        }
        if (eventErrors.length > 0) {
          status = "ERROR";
          assertionResults.push(...eventErrors.map((detail) => ({ kind: "trajectory_evidence", status: "ERROR" as const, detail })));
        } else if (events.length === 0) {
          status = "ERROR";
          assertionResults.push({ kind: "trajectory_evidence", status: "ERROR", detail: "no normalized workflow events were produced" });
        } else {
          const gate = evaluateTrajectoryGates(scenario.trajectoryAssert, events);
          if (gate.status === "ERROR" || (gate.status === "FAIL" && status === "PASS")) status = gate.status;
          assertionResults.push(...gate.assertions);
          trajectoryMeta = { trajectory_version: gate.event_version, events_sha256: gate.events_sha256 };
        }
      }

      if (deliveryObjective) {
        if (deliveryObjective.status === "ERROR" || (deliveryObjective.status === "NOT-MEASURED" && status !== "ERROR") || (deliveryObjective.status === "FAIL" && status === "PASS")) status = deliveryObjective.status;
        assertionResults.unshift(...deliveryObjective.assertions);
      }
      objective = { status, ...traceMeta, ...trajectoryMeta, assertions: assertionResults };
      if (status !== "PASS") {
        const details = assertionResults.filter((result) => result.status === status).map((result) => result.detail);
        gatePrefix = `objective: ${details.join("; ") || "structured evidence could not be evaluated"}`;
      }
      appendJournal(runDir, {
        event: "objective-result", ts: now(), id: scenario.id,
        ok: objective.status === "PASS", detail: gatePrefix ?? "", ...repField,
      });
    }

    let verdict: ScenarioResult["judge_verdict"];
    let reason: string;
    let suspect = false;
    let judgment: RepOutcome["judgment"];
    let judgeCalls = 0;
    if (objective?.status === "ERROR") {
      verdict = "ERROR";
      reason = gatePrefix ?? "objective evidence missing";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (objective?.status === "NOT-MEASURED") {
      verdict = "NOT-MEASURED";
      reason = gatePrefix ?? "skill delivery was not established";
      appendJournal(runDir, { event: "judge-verdict", ts: now(), id: scenario.id, verdict, reason, suspect, ...repField });
    } else if (infrastructureFailure) {
      verdict = "ERROR";
      reason = infrastructureFailure;
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
      verdict = o.verdict; reason = o.reason; suspect = o.suspect; judgment = o.judgment; // judgeOneRep already journaled (verdict + misfire)
      judgeCalls = 1;
    }
    log(`  → ${scenario.id}${repCount > 1 ? `#${rep}` : ""} ${verdict}${reason ? `: ${reason}` : ""}${suspect ? "  ⚠ suspect" : ""}`);
    const subject = mergeTraces(traces)?.metrics;
    return {
      verdict, reason, suspect, objective, judgment, subject_invocations: subjectInvocations,
      metrics: {
        wall_time_ms: Math.max(0, Math.round(performance.now() - startedAt)),
        judge_calls: judgeCalls,
        judge_rejudge_calls: 0,
        ...(subject ? { subject } : {}),
      },
    };
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
    const v = s.override ?? (s.objective?.status === "ERROR" ? "ERROR" : s.objective?.status === "NOT-MEASURED" ? "NOT-MEASURED" : s.objective?.status === "FAIL" ? "FAIL" : s.judge_verdict);
    const mark = v === "PASS" ? "✓" : v === "FAIL" ? "✗" : v === "NOT-MEASURED" ? "∅" : "?";
    const ov = s.override ? " (override)" : "";
    const susp = s.suspect ? " ⚠suspect" : "";
    const misfired = s.clean !== undefined && s.reps !== undefined && s.clean < s.reps ? ` · ${s.reps - s.clean} misfired` : "";
    const repInfo = s.reps ? `  [${s.passes}/${s.clean}${misfired}${s.flakiness ? ` flaky ${s.flakiness.toFixed(2)}` : ""}]` : "";
    lines.push(`  ${mark} ${s.id}${ov}${susp}  ${s.judge_reason}${repInfo}`);
  }
  const ship = g.ship ? "SHIP" : "NOT READY";
  const note = g.note ? ` (${g.note})` : "";
  lines.push(`  GRADE: ${g.letter} (${g.pct}%) — ${g.passed}/${g.total} — ${ship}${note}`);
  const metrics = aggregateMetrics(results.scenarios);
  if (metrics.total_reps > 0) {
    const tokens = metrics.input_tokens === null
      ? "subject tokens unavailable"
      : `subject tokens ${metrics.input_tokens} in / ${metrics.output_tokens ?? 0} out / ${metrics.cache_read_tokens ?? 0} cache-read`;
    const tools = metrics.tool_calls === null ? "tool calls unavailable" : `${metrics.tool_calls} tool call(s), ${metrics.delegated_children ?? 0} delegated, max concurrency ${metrics.max_concurrency ?? 0}`;
    const cost = metrics.cost_source === "subscription"
      ? " · subscription ($0 marginal cost recorded)"
      : metrics.cost_source === "unreported"
        ? metrics.input_tokens !== null && metrics.input_tokens > 0
          ? " · WARNING: subject tokens were used but subject cost was not reported"
          : " · subject cost unavailable"
        : metrics.input_tokens !== null && metrics.input_tokens > 0 && metrics.subject_cost_usd === 0
          ? " · WARNING: subject tokens were used but the provider reported $0 cost"
          : metrics.subject_cost_usd === null
            ? " · subject cost unavailable"
            : ` · $${metrics.subject_cost_usd.toFixed(6)} provider-reported`;
    lines.push(`  COST:   ${tokens} (${metrics.subject_metrics_reps}/${metrics.total_reps} reps reported)${cost} · ${metrics.judge_calls} judge + ${metrics.judge_rejudge_calls} re-judge call(s) · ${metrics.wall_time_ms}ms · ${tools}`);
  }
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
  // `skipped` counts as unproven here, not as proven: the probe was asked for and
  // could not answer, which leaves delivery exactly as unverified as never asking.
  if (results.mode === "green" && results.delivery_canary !== "pass") {
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
