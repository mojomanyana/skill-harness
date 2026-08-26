import type { ModelRef } from "./adapters/types.js";
import { envFlag } from "./util/env.js";
import { BAKED_DEFAULT_JUDGE } from "./defaults.js";

/**
 * Judge providers that cannot bill a per-token API.
 *
 * `claude-code` shells out to the `claude` CLI, authenticated with the user's
 * Claude subscription (OAuth). `openai-codex` stays in Pi and authenticates with
 * the user's ChatGPT subscription (OAuth). `ollama`/`lmstudio`/`llamacpp`/`local`
 * are local runtimes. Everything else — including direct `openai` — is assumed
 * to charge.
 *
 * An **allow-list**, deliberately, not a deny-list of known-paid providers: a
 * provider nobody has classified yet should be treated as able to bill, because
 * being wrong in that direction produces a surprise invoice while being wrong in
 * this direction produces one extra flag.
 */
const FREE_JUDGE_PROVIDERS = new Set(["claude-code", "openai-codex", "ollama", "lmstudio", "llamacpp", "local"]);

/** Whether judging with this ref can charge a per-token API. */
export function isMeteredJudge(judge: ModelRef): boolean {
  return !FREE_JUDGE_PROVIDERS.has(judge.provider);
}

/** Whether the user has explicitly accepted metered judging for this repo/shell. */
export function allowMeteredJudge(): boolean {
  return envFlag("ALLOW_METERED_JUDGE");
}

export interface JudgeAllowOpts {
  /**
   * Where the judge came from, in the user's own vocabulary — `--judge`,
   * `SKILL_HARNESS_JUDGE`, `the run's recorded judge`. A refusal has to say which
   * knob to turn, and for a regrade the answer is not the one the user expects:
   * nobody typed anything, the run's own `results.yaml` supplied it.
   */
  source: string;
  /** Per-invocation opt-in (`--allow-metered-judge`); the env var is read here. */
  allowMetered?: boolean;
}

/**
 * Refuse to judge through a metered API unless the user explicitly asked for it.
 *
 * Why a hard refusal and not a warning: judging is the only cost in this tool that
 * happens *without* a decision. The subject model is chosen per run and is the point
 * of the exercise; the judge is a default, and a default that bills is a bug — it
 * already billed a corpus once. A warning scrolls past inside a run's progress
 * output, and by then the money is spent.
 *
 * Three paths could reach a metered API, and only one of them involves typing a
 * flag: `--judge anthropic:…`; a `SKILL_HARNESS_JUDGE` set (or mistyped) to a
 * metered provider; and `grade`, which re-judges with the judge the run *recorded* —
 * so a run whose `results.yaml` names a metered judge bills on every later regrade,
 * with no flag involved at all.
 *
 * That third path is latent rather than live in the corpus this was built against:
 * checked 2026-08-05, all ~140 committed `results.yaml` in `principal-pi-skills`
 * record `provider: claude-code`, because its owner always passed the subscription
 * judge explicitly. The old default was reachable, not taken. Worth stating
 * precisely — "your whole archive bills on regrade" would have been a scarier claim
 * than the evidence supports.
 *
 * Deliberately not applied to the subject model: paying to run the model under test
 * is what a run *is*.
 */
export function assertJudgeAllowed(judge: ModelRef, opts: JudgeAllowOpts): void {
  if (!isMeteredJudge(judge)) return;
  if (opts.allowMetered || allowMeteredJudge()) return;

  const token = `${judge.provider}:${judge.model}`;
  throw new Error(
    `refusing to judge with ${token}: \`${judge.provider}\` bills a per-token API key, and it came from ${opts.source}.\n` +
      `  Judging is meant to cost nothing you did not ask for.\n` +
      `  • judge on your Claude subscription instead:  --judge ${BAKED_DEFAULT_JUDGE}\n` +
      `  • allow the metered API for this command:     --allow-metered-judge\n` +
      `  • allow it for this repo or shell:            export SKILL_HARNESS_ALLOW_METERED_JUDGE=1`,
  );
}
