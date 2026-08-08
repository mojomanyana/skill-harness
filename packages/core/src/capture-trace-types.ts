/**
 * Data contracts for the pi-native regression capture program.
 *
 * Types only — no behavior. Phase 0 of
 * `docs/superpowers/plans/2026-08-07-pi-native-regression-capture-program.md`
 * fixes the shapes before any parser, capture UI, or gate evaluator is written,
 * because both shapes get persisted and a persisted shape is expensive to move.
 *
 * Both carry an explicit version. The pi event stream they derive from is not a
 * stable public contract (measured against pi 0.83.0; see
 * `packages/adapters/test/fixtures/pi-json/README.md`), so a reader must be able
 * to tell which pi produced an artifact and refuse one it does not understand
 * rather than silently misreading it.
 */

import type { ModelRef, RunMode } from "./adapters/types.js";

// ---------------------------------------------------------------------------
// Execution trace
// ---------------------------------------------------------------------------

export const EXECUTION_TRACE_VERSION = 2;

/**
 * Tool arguments after sanitization.
 *
 * `unknown` rather than `any`: an assertion evaluator must narrow before
 * comparing, and the safe-DSL operators (equals/contains/matches/…) are the only
 * things allowed to inspect these.
 */
export type SanitizedArgs = Record<string, unknown>;

/**
 * One tool call, correlated across pi's `tool_execution_start` /
 * `tool_execution_end` pair.
 *
 * Correlation is by `toolCallId` and nothing else. Measured: pi executes tool
 * calls batched in one assistant message CONCURRENTLY, and emits their `end`
 * events in completion order, not issue order — three `bash` calls sleeping
 * 6s/1s/3s started SLOW,FAST,MID and ended FAST,MID,SLOW. Any parser that pairs
 * by position is wrong.
 */
export interface TraceToolCall {
  /** pi's `toolCallId`. Unique within a trace; the only sound correlation key. */
  id: string;
  /** Registered tool name, e.g. `read`, `bash`, `Agent`. */
  name: string;
  /** Sanitized call arguments. Secrets and oversized values are redacted. */
  args: SanitizedArgs;
  /** 0-based position in ISSUE order (the order pi emitted `tool_execution_start`). */
  issueIndex: number;
  /** 0-based position in COMPLETION order. Differs from `issueIndex` under parallelism. */
  completionIndex: number;
  /** pi's `isError` on the `tool_execution_end` event. */
  isError: boolean;
  /**
   * Bounded metadata about the result body — never the body itself.
   *
   * Full tool results are not persisted: they routinely contain file contents,
   * command output, and absolute paths (a failing `read` embeds the full path in
   * its error string). A gate that needs to assert on content asserts on the
   * workspace instead.
   */
  result: TraceResultMeta;
}

export interface TraceResultMeta {
  /** Byte length of the serialized result content. */
  bytes: number;
  /** SHA-256 of the serialized result content, so identity is checkable without the body. */
  sha256: string;
  /**
   * The tool's own structured `details`, when it returned any.
   *
   * Measured: a value a tool returns as `details` survives verbatim into
   * `tool_execution_end.result.details`. That is the one stable structured
   * channel an extension can expose deliberately — unlike prose in `content`,
   * which is formatting, not contract. Retained only when it is small and free
   * of redaction hits; absent otherwise.
   */
  details?: Record<string, unknown>;
}

/**
 * A trace of one subject execution — one `pi` invocation.
 *
 * A multi-turn scenario produces ONE TRACE PER TURN, because each `pi` call
 * emits an independent stream containing only that invocation's messages (the
 * conversation carries in the session dir, not in the event stream). This
 * mirrors the loop the adapter already runs.
 */
export interface ExecutionTraceV1 {
  trace_version: typeof EXECUTION_TRACE_VERSION;
  /** `pi --version` at capture time. Null when it could not be determined. */
  pi_version: string | null;
  /** The model under test. */
  subject: ModelRef;
  scenario_id: string;
  mode: RunMode;
  /** 0-based repetition index within a run. */
  rep: number;
  /** 0-based turn index; always 0 for a single-turn scenario. */
  turn: number;

  /**
   * The assistant's final answer text for this invocation.
   *
   * Deliberately the FINAL assistant message only, not every assistant text
   * block. Measured: pi's print mode emits exactly this, and it is what today's
   * adapter hands the judge — concatenating interim text blocks would feed the
   * judge narration ("Let me read that file…") that the current transcript has
   * never contained, changing grades on scenarios nobody edited.
   */
  final_text: string;

  /** Every tool call in this invocation, in issue order. */
  tool_calls: TraceToolCall[];

  /**
   * Workspace paths whose content changed during the invocation, relative to the
   * workspace root. Evidence for `unchanged_paths` assertions. Bounded to the
   * isolated workspace: writes outside it are not observable and never claimed.
   *
   * **Tri-state, and the third state is the point.** `null` means the workspace
   * was never observed — there was none, or the snapshot could not be taken.
   * `[]` means observed, and nothing changed. Collapsing the two made a safety
   * gate report green from evidence that does not exist: a run whose observation
   * failed recorded `objective: ERROR` honestly, and `regate` then read the saved
   * `[]` and re-graded it to PASS, re-stamping the source hash so `lint` called
   * the result current.
   *
   * Version 2 exists for exactly this widening: a v1 reader must decline a v2
   * trace rather than read `null` as empty.
   */
  changed_paths: string[] | null;

  /**
   * Reported token cost of this invocation, when pi provided it.
   *
   * pi's `usage.cost` carries real per-message costs. Recorded for spend
   * disclosure, never for grading.
   */
  cost_usd: number | null;

  /** SHA-256 over the deterministic serialization of this trace, minus this field. */
  trace_sha256?: string;
}

// ---------------------------------------------------------------------------
// Capture case
// ---------------------------------------------------------------------------

export const CAPTURE_SCHEMA_VERSION = 1;

/** Why a conversation was captured. */
export type CaptureClassification = "failure" | "good_example";

/** Where a capture is in the human review pipeline. */
export type CapturePromotionStatus = "pending" | "promoted" | "rejected";

/** What the human confirmed as responsible for the behavior. */
export interface CaptureTarget {
  kind: "skill" | "subagent";
  /** Path relative to the skills root or repo root — never absolute. */
  path: string;
  /** SHA-256 of the target's content at capture time, so drift is detectable. */
  content_sha256: string;
}

/**
 * Provenance for a capture.
 *
 * Hashed, not absolute: an absolute session path identifies a machine and a
 * user, and the capture file is meant to be committed. The hash is enough to
 * recognize the same session again locally, which is all provenance needs to do.
 */
export interface CaptureProvenance {
  session_sha256: string;
  /** Indices of the selected turn range within the active branch, inclusive. */
  turn_range: { start: number; end: number };
  subject?: ModelRef;
  git_commit?: string;
  /** True when the working tree was dirty at capture time. */
  git_dirty?: boolean;
}

/**
 * A reviewed conversation awaiting promotion into a scenario.
 *
 * Lives under `<skill>/tests/captures/`, NOT in `specification.yaml`. A pending
 * capture is not a test: putting it in the spec would drag it into ship-bar
 * totals, staleness, lift, and stability, and the alternative — a `draft: true`
 * flag every runner, scorer and linter has to honor — is a state that only has
 * to be forgotten once to either corrupt a grade or silently drop a real
 * scenario from a release run.
 */
export interface CaptureCaseV1 {
  capture_schema: typeof CAPTURE_SCHEMA_VERSION;
  id: string;
  created: string;
  classification: CaptureClassification;

  /** Sanitized user turns only. Assistant prose is evidence, never an oracle. */
  turns: string[];

  /** Human-written, in their own words. Required — a capture with no expectation is not reviewable. */
  expected_behavior: string;

  /** Editable draft checklist. Offline-derived by default; LLM drafting is opt-in and costs tokens. */
  checklist: string[];

  target: CaptureTarget;
  provenance: CaptureProvenance;

  status: CapturePromotionStatus;
  /** Set once promoted: the scenario id appended to `specification.yaml`. */
  scenario_id?: string;

  /**
   * `covers` refs for this pending case, so `coverage` can park it against the
   * instructions it is about before anyone promotes it.
   *
   * Derived from `target` — the author has already been made to choose which
   * instructions are responsible, and asking again in different words would be
   * asking the same question twice. File granularity, not `#section`: the target
   * choice attributes a file, and inventing a section would be a guess the
   * session cannot support.
   *
   * Written relative to the SPEC dir (`<skill>/tests`), matching how a scenario's
   * own `covers` resolve. `coverage` read this field from the start; nothing ever
   * wrote it, so every pending case parked against nothing and the feature was
   * inert.
   */
  covers?: string[];
}

/**
 * Local-only evidence sidecar for a capture.
 *
 * Written to `<skill>/tests/captures/.local/` and git-ignored by default. It may
 * hold a sanitized assistant excerpt and tool-call summaries to help a human
 * review the capture, and must NEVER hold hidden thinking, complete tool-result
 * bodies, or the effective system prompt.
 *
 * pi's stream carries thinking in `message_end`, `turn_end` AND `agent_end`, so
 * dropping it is an explicit filter at every one of those, not a side effect of
 * reading the convenient field.
 */
export interface CaptureEvidenceV1 {
  capture_id: string;
  /** Sanitized, truncated excerpt of the assistant text of every selected turn, joined. */
  assistant_excerpt: string;
  /** Tool name, error state and redacted arguments — no bodies. */
  tool_calls: Array<Pick<TraceToolCall, "name" | "isError"> & { args: SanitizedArgs }>;
}
