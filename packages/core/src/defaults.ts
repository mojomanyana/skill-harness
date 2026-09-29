import { parseModelRef, type ModelRef } from "./adapters/types.js";
import { readEnv } from "./util/env.js";

/**
 * The judge used when nothing else says otherwise: a Pi `openai-codex` model,
 * authenticated through the user's ChatGPT subscription rather than a metered API
 * key. Subjects and judges now share the sole supported harness executable: `pi`.
 *
 * A default must not be able to spend money that was not explicitly authorized.
 * Direct API providers remain available only through the metered-judge opt-in.
 */
export const BAKED_DEFAULT_JUDGE = "openai-codex:gpt-5.6-sol";

/**
 * Resolve the default judge: `SKILL_HARNESS_JUDGE` if set, else the baked value.
 * An explicit `--judge` always wins over both — this is only the default.
 *
 * The env layer exists because this harness is built for someone who steers a
 * process rather than typing every flag: judge policy belongs to the repo or the
 * shell, set once. It is also how you opt *into* a different judge deliberately
 * instead of repeating a flag. Read through `readEnv`, so the pre-rename
 * `SKILL_CHECK_JUDGE` keeps working
 * with the usual one-time notice.
 *
 * Resolved per call, not at module load: tests and long-lived processes (the pi
 * extension) must see an env change without a reload.
 */
export function defaultJudge(): string {
  return readEnv("JUDGE") ?? BAKED_DEFAULT_JUDGE;
}

/**
 * Choose a judge for an artifact-only operation when the caller supplied no
 * explicit override. Retained results may name the removed direct Claude
 * adapter; keep those files readable, but execute their next judge call through
 * today's Pi default and let the rewrite record that current judge.
 */
export function recordedJudgeOrDefault(recorded?: ModelRef): {
  judge: ModelRef;
  migratedFrom?: ModelRef;
} {
  if (!recorded) return { judge: parseModelRef(defaultJudge()) };
  if (recorded.provider !== "claude-code") return { judge: recorded };
  return { judge: parseModelRef(defaultJudge()), migratedFrom: recorded };
}
