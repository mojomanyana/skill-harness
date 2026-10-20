import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import {
  loadSpec,
  runSkillModel,
  effectiveVerdicts,
  findTranscriptFiles,
  parseModelRef,
  defaultJudge,
  assertJudgeAllowed,
  type HarnessAdapter,
  type Verdict,
} from "@skill-harness/core";
import { getAdapter } from "@skill-harness/adapters";

export interface Scorecard {
  skill: string;
  model: string;
  grade: { pct: number; letter: string; ship: boolean };
  scenarios: { id: string; verdict: Verdict; suspect: boolean }[];
  failedTranscripts: string[];
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
  reps?: number;
  mode?: "red" | "green" | "force";
  /** Green only: one instructed loading/quote check; autonomous selection remains untested. */
  canary?: boolean;
  adapter?: HarnessAdapter;
  judge?: string;
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
  const modelToken = opts.model ?? DEFAULT_MODEL;
  const model = parseModelRef(modelToken);
  const judge = parseModelRef(opts.judge ?? defaultJudge());
  assertJudgeAllowed(judge, {
    source: opts.judge ? "the judge argument" : "the default judge (SKILL_HARNESS_JUDGE or the baked value)",
  });
  const adapter = opts.adapter ?? getAdapter("pi");
  const mode = opts.mode ?? "green";
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
  const failedTranscripts = verdicts
    .filter((v) => v.verdict !== "PASS")
    .flatMap((v) => findTranscriptFiles(summary.runDir, v.id, summary.results.mode)
      .map((f) => join(summary.runDir, f)));
  return {
    skill: summary.results.skill, model: summary.results.model,
    grade: { pct: g.pct, letter: g.letter, ship: g.ship },
    scenarios: verdicts.map((v) => ({ id: v.id, verdict: v.verdict, suspect: v.suspect ?? false })),
    failedTranscripts,
  };
  });
}
