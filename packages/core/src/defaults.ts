import { readEnv } from "./util/env.js";

/**
 * The judge used when nothing else says otherwise: Opus through the **`claude-code`
 * provider**, which authenticates with the user's Claude subscription (OAuth via
 * `claude -p`) rather than a metered API key.
 *
 * The model is deliberately the strongest available — judging is the one place
 * where a weak model silently corrupts every number in a scorecard. The *provider*
 * is what changed in 0.3.3: the default was `anthropic:claude-opus-4-8`, a metered
 * API, and it billed a corpus once by accident because nothing in the tool surface
 * distinguishes "the flag I forgot" from "the flag I meant". A default must not be
 * able to spend money that was not asked for. The metered path is still one flag
 * away (`--judge anthropic:claude-opus-4-8`) for anyone who wants it — an API key
 * scales past a subscription's rate limits, which matters for a large `--reps` run.
 */
export const BAKED_DEFAULT_JUDGE = "claude-code:claude-opus-4-8";

/**
 * Resolve the default judge: `SKILL_HARNESS_JUDGE` if set, else the baked value.
 * An explicit `--judge` always wins over both — this is only the default.
 *
 * The env layer exists because this harness is built for someone who steers a
 * process rather than typing every flag: judge policy belongs to the repo or the
 * shell, set once. It is also how you opt *into* the metered API deliberately
 * (`SKILL_HARNESS_JUDGE=anthropic:claude-opus-4-8`) instead of by forgetting a
 * flag. Read through `readEnv`, so the pre-rename `SKILL_CHECK_JUDGE` keeps working
 * with the usual one-time notice.
 *
 * Resolved per call, not at module load: tests and long-lived processes (the pi
 * extension) must see an env change without a reload.
 */
export function defaultJudge(): string {
  return readEnv("JUDGE") ?? BAKED_DEFAULT_JUDGE;
}
