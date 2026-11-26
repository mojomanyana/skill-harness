import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseModelRef, type ModelRef } from "./adapters/types.js";
import { allowMeteredJudge, isMeteredJudge } from "./judge-policy.js";
import { readEnv } from "./util/env.js";

function selectPreferredCandidate(candidates: readonly string[]): string | undefined {
  if (candidates.length === 0) return undefined;
  // When metered judging is not explicitly opted in, prefer a non-metered candidate
  // (such as openai-codex OAuth or a local runtime) if the fallback chain includes one.
  if (!allowMeteredJudge()) {
    for (const candidate of candidates) {
      try {
        if (!isMeteredJudge(parseModelRef(candidate))) return candidate;
      } catch {
        /* skip unparseable candidate */
      }
    }
  }
  return candidates[0];
}

function ecosystemFastCandidates(): string[] {
  const candidates: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const clean = raw.trim();
    if (!clean || clean === "session" || candidates.includes(clean)) return;
    candidates.push(clean);
  };
  const envFast = process.env.PI_ECO_MODEL_FAST?.trim();
  if (envFast) {
    for (const part of envFast.split(",")) push(part);
  }
  try {
    const dir = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
    const file = join(dir, "ecosystem.json");
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        models?: { fast?: unknown };
        modelFallbacks?: { fast?: unknown };
      };
      push(parsed?.models?.fast);
      if (Array.isArray(parsed?.modelFallbacks?.fast)) {
        for (const item of parsed.modelFallbacks.fast) push(item);
      }
    }
  } catch {
    /* ignore invalid ecosystem.json when computing fallback candidates */
  }
  return candidates;
}

function ecosystemFastModel(): string | undefined {
  return selectPreferredCandidate(ecosystemFastCandidates());
}

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
  return readEnv("JUDGE") ?? readEnv("JUDGE_FAST") ?? ecosystemFastModel() ?? BAKED_DEFAULT_JUDGE;
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
