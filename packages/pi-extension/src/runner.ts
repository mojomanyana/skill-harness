import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  loadSpec,
  runSkillModel,
  effectiveVerdicts,
  findTranscriptFiles,
  parseModelRef, withThinking, summarizeRun, runSummaryLines,
  defaultJudge, writtenResultsDigest,
  assertJudgeAllowed,
  type HarnessAdapter,
  type Verdict,
} from "@skill-harness/core";
import { taskEvaluationAdapter } from "./task-evaluation.js";
import { getAdapter } from "@skill-harness/adapters";

export interface ScorecardScenario {
  id: string;
  verdict: Verdict;
  suspect: boolean;
  expected?: string[];
  observed?: string;
}

export interface Scorecard {
  summary: ReturnType<typeof summarizeRun>;
  summaryLines: string[];
  skill: string;
  model: string;
  reps: number;
  coverage: {
    scope: "focused" | "related" | "full";
    label: string;
    runCount: number;
    totalSpecCount: number;
    scenariosRun: string[];
  };
  keepTaskOpen: boolean;
  grade: { pct: number; letter: string; ship: boolean };
  scenarios: ScorecardScenario[];
  failedTranscripts: string[];
  resultsSha256?: string;
}

/**
 * Explicit `arg` wins outright: it must resolve to a dir that itself contains
 * `tests/specification.yaml` (no climbing) — a typo'd skill name fails loudly
 * instead of silently resolving to an ancestor skill. With no `arg`, walk
 * `cwd` upward until a `tests/specification.yaml` is found.
 */
export function resolveSkillDir(cwd: string, arg?: string): string {
  if (arg) {
    const dir = resolve(cwd, arg);
    if (existsSync(join(dir, "tests", "specification.yaml"))) return dir;
    throw new Error(`no tests/specification.yaml found at ${dir}`);
  }
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, "tests", "specification.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`no tests/specification.yaml found from ${cwd} upward`);
}

/** Overlay layout matches the CLI: <specsRoot>/<skill-name>/tests. */
export function resolveSkillLocation(cwd: string, arg?: string, specsRoot?: string): { skillDir: string; specPath: string } {
  if (!specsRoot) {
    const skillDir = resolveSkillDir(cwd, arg);
    return { skillDir, specPath: join(skillDir, "tests", "specification.yaml") };
  }
  let skillDir = resolve(cwd, arg ?? ".");
  while (!existsSync(join(skillDir, "SKILL.md"))) {
    const parent = dirname(skillDir);
    if (arg || parent === skillDir) throw new Error(`no SKILL.md found at ${skillDir}`);
    skillDir = parent;
  }
  const specPath = join(resolve(cwd, specsRoot), basename(skillDir), "tests", "specification.yaml");
  const localSpec = join(skillDir, "tests", "specification.yaml");
  if (existsSync(localSpec)) throw new Error("specification.yaml exists in the skill; --specs must not select a second specification");
  if (!existsSync(specPath)) throw new Error(`no tests/specification.yaml found at ${specPath}`);
  return { skillDir, specPath };
}

// Keep in sync with cli.ts DEFAULT_MODEL. The judge default is NOT duplicated here
// any more — it comes from core's `defaultJudge()`, so this extension and the CLI
// cannot drift into billing different providers for the same missing flag.
const DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";

let evaluationRunning = false;

/** Share one evaluation slot across Pi's tool and slash-command entry points. */
export async function withEvaluationGuard<T>(work: () => Promise<T>): Promise<T> {
  if (evaluationRunning) throw new Error("A skill-harness evaluation is already running in this Pi process. Wait for settlement or cancel it before starting another.");
  evaluationRunning = true;
  try { return await work(); } finally { evaluationRunning = false; }
}

export async function runViaExtension(opts: {
  skillDir: string;
  specPath?: string;
  model?: string;
  thinking?: string;
  judgeThinking?: string;
  reps?: number;
  mode?: "red" | "green" | "force";
  /** Green only: one instructed loading/quote check; autonomous selection remains untested. */
  canary?: boolean;
  adapter?: HarnessAdapter;
  judge?: string;
  /** Active Pi session provider:model used when model/judge are omitted. */
  sessionModel?: string;
  coverageScope?: "focused" | "related" | "full";
  /**
   * Run only these scenario ids.
   *
   * A partial run: `runSkillModel` marks the results `partial`, and a partial run
   * can never report SHIP. That is the point — after promoting one captured case
   * you want to see just that scenario, without the result reading like a
   * release-blessing wave.
   */
  only?: string[];
  now?: () => string;
  timestamp: string;
  log: (msg: string) => void;
}): Promise<Scorecard> {
  return withEvaluationGuard(async () => {
  const specPath = opts.specPath ?? join(opts.skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const modelToken = opts.model ?? opts.sessionModel ?? DEFAULT_MODEL;
  const model = withThinking(parseModelRef(modelToken), opts.thinking);
  const judgeToken = opts.judge ?? opts.sessionModel ?? defaultJudge();
  const judge = withThinking(parseModelRef(judgeToken), opts.judgeThinking);
  assertJudgeAllowed(judge, {
    source: opts.judge
      ? "the judge argument"
      : opts.sessionModel
        ? "the active Pi session model"
        : "the default judge (SKILL_HARNESS_JUDGE or the baked value)",
    allowMetered: !opts.judge && Boolean(opts.sessionModel),
  });
  const adapter = taskEvaluationAdapter(opts.adapter ?? getAdapter("pi"));
  const mode = opts.mode ?? "green";
  const reps = opts.reps ?? 1;
  const summary = await runSkillModel({
    spec, skillDir: opts.skillDir, specPath, adapter, model, modelToken, judge, mode,
    testsDir: dirname(specPath),
    recordSourceRoots: resolve(dirname(specPath)) !== resolve(opts.skillDir, "tests"),
    timestamp: opts.timestamp, now: opts.now, reps: opts.reps, canary: opts.canary,
    only: opts.only,
    onProgress: opts.log,
  });
  const g = summary.results.effective_grade;
  const verdicts = effectiveVerdicts(summary.results.scenarios);
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  const resultById = new Map(summary.results.scenarios.map((s) => [s.id, s]));
  const scenarios: ScorecardScenario[] = verdicts.map((v) => {
    const specScenario = specById.get(v.id);
    const rawScenario = resultById.get(v.id);
    const repDetail = rawScenario?.rep_judgments
      ?.flatMap((panel) => panel.judgments ?? [])
      .filter((j) => j.verdict !== "PASS")
      .map((j) => j.reason?.trim())
      .filter((r): r is string => Boolean(r));
    const uniqueDetail = repDetail ? [...new Set(repDetail)].slice(0, 2).join("; ") : "";
    const baseReason = rawScenario?.judge_reason?.trim() || rawScenario?.note?.trim() || "";
    const observed = v.verdict !== "PASS"
      ? ([baseReason, uniqueDetail && !baseReason.includes(uniqueDetail) ? uniqueDetail : ""].filter(Boolean).join(" — ") || `Verdict ${v.verdict}`)
      : undefined;
    return {
      id: v.id,
      verdict: v.verdict,
      suspect: v.suspect ?? false,
      ...(v.verdict !== "PASS" && specScenario?.checklist?.length ? { expected: specScenario.checklist } : {}),
      ...(observed ? { observed } : {}),
    };
  });
  const failedTranscripts = verdicts
    .filter((v) => v.verdict !== "PASS")
    .flatMap((v) => findTranscriptFiles(summary.runDir, v.id, summary.results.mode)
      .map((f) => join(summary.runDir, f)));
  const totalSpecCount = spec.scenarios.length;
  const runCount = scenarios.length;
  const inferredScope: "focused" | "related" | "full" =
    opts.coverageScope ?? (opts.only?.length && runCount < totalSpecCount ? "focused" : "full");
  const label =
    inferredScope === "focused"
      ? `focused coverage (${runCount}/${totalSpecCount} scenarios)`
      : inferredScope === "related"
        ? `related-role coverage (${runCount}/${totalSpecCount} scenarios)`
        : `full coverage (${runCount}/${totalSpecCount} scenarios)`;
  const keepTaskOpen = scenarios.some((s) => s.verdict !== "PASS");
  return {
    skill: summary.results.skill, model: summary.results.model,
    reps,
    coverage: {
      scope: inferredScope,
      label,
      runCount,
      totalSpecCount,
      scenariosRun: scenarios.map((s) => s.id),
    },
    keepTaskOpen,
    summary: summarizeRun(summary.results), summaryLines: runSummaryLines(summary.results),
    grade: { pct: g.pct, letter: g.letter, ship: g.ship },
    scenarios,
    failedTranscripts, resultsSha256: writtenResultsDigest(summary.results),
  };
  });
}
