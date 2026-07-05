import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  loadSpec,
  runSkillModel,
  effectiveVerdicts,
  findTranscriptFiles,
  parseModelRef,
  type HarnessAdapter,
} from "@skill-check/core";
import { getAdapter } from "@skill-check/adapters";

export interface Scorecard {
  skill: string;
  model: string;
  grade: { pct: number; letter: string; ship: boolean };
  scenarios: { id: string; verdict: "PASS" | "FAIL" | "ERROR"; suspect: boolean }[];
  failedTranscripts: string[];
}

/** Explicit dir wins; else walk `cwd` upward until a `tests/specification.yaml` is found. */
export function resolveSkillDir(cwd: string, arg?: string): string {
  const start = arg ? resolve(cwd, arg) : cwd;
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "tests", "specification.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`no tests/specification.yaml found from ${start} upward`);
}

// Keep in sync with cli.ts DEFAULT_MODEL / DEFAULT_JUDGE (cli.ts:15-16).
const DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";
const DEFAULT_JUDGE = "anthropic:claude-opus-4-8";

export async function runViaExtension(opts: {
  skillDir: string;
  model?: string;
  reps?: number;
  mode?: "red" | "green" | "force";
  adapter?: HarnessAdapter;
  judge?: string;
  now?: () => string;
  timestamp: string;
  log: (msg: string) => void;
}): Promise<Scorecard> {
  const specPath = join(opts.skillDir, "tests", "specification.yaml");
  const spec = loadSpec(specPath);
  const modelToken = opts.model ?? DEFAULT_MODEL;
  const model = parseModelRef(modelToken);
  const judge = parseModelRef(opts.judge ?? DEFAULT_JUDGE);
  const adapter = opts.adapter ?? getAdapter("pi");
  const mode = opts.mode ?? "green";
  const summary = await runSkillModel({
    spec, skillDir: opts.skillDir, specPath, adapter, model, modelToken, judge, mode,
    timestamp: opts.timestamp, now: opts.now, reps: opts.reps, onProgress: opts.log,
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
}
