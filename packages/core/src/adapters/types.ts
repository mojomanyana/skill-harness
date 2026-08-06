export type RunMode = "red" | "green" | "force";

/** A provider+model pair, e.g. { provider: "fireworks", model: "accounts/.../deepseek-v4-pro" }. */
export interface ModelRef {
  provider: string;
  model: string;
}

/** Parse a `provider:model` token (model may contain further colons/slashes). */
export function parseModelRef(token: string): ModelRef {
  const i = token.indexOf(":");
  if (i < 0) {
    throw new Error(`model must be \`provider:model\` (got \`${token}\`)`);
  }
  const provider = token.slice(0, i).trim();
  const model = token.slice(i + 1).trim();
  if (!provider || !model) {
    throw new Error(`model must be \`provider:model\` (got \`${token}\`)`);
  }
  return { provider, model };
}

/** Stable, filesystem-safe slug for a model ref (used in run-dir names). */
export function modelSlug(ref: ModelRef): string {
  return `${ref.provider}-${ref.model}`.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface RunReq {
  skillDir: string; // abs path to the skill (for --skill / reading SKILL.md)
  model: ModelRef; // provider + model id
  mode: RunMode;
  turns: string[]; // 1 = single-turn; N = multi-turn (carry conversation)
  cwd: string; // neutral dir to run in (avoid repo context bleed)
  /**
   * Abs path to a markdown file to use AS the system prompt, instead of activating
   * skillDir as a skill. Used to test a subagent definition (agents/<name>.md) in the
   * single-shot shape it actually runs in; overrides `mode`'s skill flags.
   */
  systemPromptFile?: string;
}

/** A judge request: single prompt, no skills, no session. */
export interface JudgeReq {
  model: ModelRef;
  prompt: string;
  cwd: string;
}

export interface HarnessAdapter {
  name: string;
  available(): Promise<boolean>; // is the CLI on PATH?
  run(req: RunReq): Promise<string>; // returns the full transcript text
  judge(req: JudgeReq): Promise<string>; // returns the judge's raw output
  /**
   * The harness CLI's own version, recorded in `results.yaml` as
   * `harness_cli_version`. Null when it cannot be determined — a version this
   * adapter had to guess at is worse than none, because the whole point of the
   * field is to identify which CLI produced a transcript.
   *
   * Optional so a test double or a future adapter need not implement it; callers
   * treat a missing method exactly like a null answer.
   */
  version?(): Promise<string | null>;
}
