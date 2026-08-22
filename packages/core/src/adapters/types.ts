import type { ExecutionTraceV1 } from "../capture-trace-types.js";
import type { TrajectoryEventSource } from "../spec.js";
import type { TrajectoryEventV1 } from "../trajectory-gates.js";

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
  /**
   * Trace metadata, used only by `runStructured`.
   *
   * Optional because `run()` never needs them and every existing caller and test
   * double predates them. A trace with no scenario id is still valid evidence —
   * it just cannot be filed against a scenario. The ADAPTER supplies the
   * fallback (see `pi.ts`); `parseTrace` requires a `scenarioId` and has no
   * default, so a second `runStructured` author must pass one rather than
   * assuming the parser fills it in.
   */
  scenarioId?: string;
  rep?: number;
  /**
   * Absolute paths of pi extensions to load, already resolved by the caller.
   *
   * When present the adapter loads EXACTLY these and disables discovery, so an
   * extension the developer happens to have installed cannot join the test.
   */
  extensions?: string[];
  /** Workspace-local native ledgers to normalize after the subject finishes. */
  eventSources?: TrajectoryEventSource[];
}

/** A judge request: single prompt, no skills, no session. */
export interface JudgeReq {
  model: ModelRef;
  prompt: string;
  cwd: string;
}

/** A structured run: the transcript the judge sees, plus the evidence gates read. */
export interface StructuredRun {
  transcript: string;
  /** One trace per turn — each `pi` invocation emits an independent event stream. */
  traces: ExecutionTraceV1[];
  /** Adapter-neutral workflow/tool events. Additive; absent on older adapters. */
  events?: TrajectoryEventV1[];
  /** Native sources that were required but missing/malformed. Never treated as an empty success. */
  eventErrors?: string[];
  /**
   * Set when pi failed provider-side (auth, transport) rather than the model
   * answering badly. `run.ts` turns this into ERROR — never a model verdict.
   */
  providerFailure?: string;
}

export interface HarnessAdapter {
  name: string;
  available(): Promise<boolean>; // is the CLI on PATH?
  run(req: RunReq): Promise<string>; // returns the full transcript text
  /**
   * Run and additionally return structured execution evidence.
   *
   * Optional, and used ONLY by scenarios that declare trace assertions. Two
   * reasons it is not the default path. Test doubles and any future adapter must
   * keep working without implementing it; and switching every existing scenario
   * onto a different execution mode would be a behavior epoch — the transcript
   * is reconstructed rather than read from stdout, and even a proven-equivalent
   * reconstruction should not be applied to a whole published corpus silently.
   */
  runStructured?(req: RunReq): Promise<StructuredRun>;
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
