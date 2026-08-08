import { createHash } from "node:crypto";
import type { CaptureCaseV1, CaptureClassification, CaptureTarget, SanitizedArgs } from "./capture-trace-types.js";
import { CAPTURE_SCHEMA_VERSION } from "./capture-trace-types.js";

/**
 * Projection and sanitization for `/skill-harness capture` — turning a live pi
 * conversation into a reviewable regression case.
 *
 * Everything here is pure: entries in, plain data out. The pi extension owns the
 * UI and the filesystem; this module owns the rules that decide what a capture
 * is allowed to contain. That split is deliberate — the privacy rules are the
 * part that must be unit-testable without a running agent.
 *
 * Nothing in here calls a model. Checklist drafting is offline by default; any
 * LLM assistance is the extension's business and requires its own confirmation.
 */

// ---------------------------------------------------------------------------
// Session entries
// ---------------------------------------------------------------------------

export interface SessionContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: unknown;
  [k: string]: unknown;
}

export interface SessionMessage {
  role: string;
  content?: SessionContentBlock[];
  toolName?: string;
  isError?: boolean;
  [k: string]: unknown;
}

/**
 * One entry from a pi session file.
 *
 * Entries form a linked list through `parentId`, NOT a flat log: forking and
 * rewinding leave sibling chains in the same file. Anything that reads a session
 * without resolving the branch first will happily mix two alternate histories
 * into one "conversation".
 */
export interface SessionEntry {
  type: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
  message?: SessionMessage;
  [k: string]: unknown;
}

/**
 * The chain of entries ending at `leafId`, in root→leaf order.
 *
 * With no `leafId`, the leaf is the last entry in file order — which is what
 * "the conversation I am currently in" means. Entries with no `id` (the
 * `session` header) are not part of the chain and are dropped.
 *
 * Cycles cannot occur in a well-formed file, but a corrupted one must not hang
 * the agent, so the walk is bounded by the entry count.
 */
export function activeBranch(entries: SessionEntry[], leafId?: string): SessionEntry[] {
  const byId = new Map<string, SessionEntry>();
  for (const e of entries) if (typeof e.id === "string") byId.set(e.id, e);

  let cursor: string | undefined = leafId;
  if (cursor === undefined) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (typeof entries[i].id === "string") {
        cursor = entries[i].id as string;
        break;
      }
    }
  }

  const chain: SessionEntry[] = [];
  const seen = new Set<string>();
  while (cursor !== undefined && cursor !== null && byId.has(cursor) && chain.length <= entries.length) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const entry = byId.get(cursor)!;
    chain.push(entry);
    cursor = entry.parentId ?? undefined;
  }
  return chain.reverse();
}

// ---------------------------------------------------------------------------
// Logical turns
// ---------------------------------------------------------------------------

/** A tool call as it is summarized for review — never the result body. */
export interface ToolCallSummary {
  name: string;
  args: SanitizedArgs;
  isError: boolean;
  /**
   * pi's `toolCallId`, when the entry carried one.
   *
   * Correlation key for the matching result. Parallel tool calls complete out of
   * issue order (measured on pi 0.83.0), so pairing by position is wrong the
   * moment a conversation uses parallelism — which is exactly the kind of
   * conversation worth capturing.
   */
  id?: string;
  /** Byte length of the result content, when the result was present. */
  resultBytes?: number;
  /** SHA-256 of the result content, so identity is checkable without the body. */
  resultSha256?: string;
}

/**
 * One user message and everything the agent did in reply, up to the next user
 * message.
 *
 * This is the selection unit for capture. pi exposes no public API for arbitrary
 * mouse-highlighted transcript text, so turn-level contiguous selection is the
 * supported contract — not a limitation we can quietly widen later.
 */
export interface LogicalTurn {
  index: number;
  user: string;
  /** Assistant text with thinking removed. Evidence for the human, never an oracle. */
  assistantText: string;
  toolCalls: ToolCallSummary[];
  /** Entry ids covered by this turn. Local-only — never written to a committed capture. */
  entryIds: string[];
}

/** Extract visible text from content blocks. Thinking is dropped unconditionally. */
export function visibleText(blocks: SessionContentBlock[] | undefined): string {
  if (!blocks) return "";
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "thinking") continue; // never, at any call site
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    else if (b.type === "image") parts.push("[image omitted]");
  }
  return parts.join("\n").trim();
}

/**
 * Group an already-branch-resolved entry list into logical turns.
 *
 * Entries that are not messages (`model_change`, `thinking_level_change`,
 * compaction markers, custom extension entries) are skipped rather than
 * guessed at: an unknown entry type is not evidence about the conversation.
 * Anything before the first user message is dropped — it belongs to no turn.
 */
export function projectTurns(entries: SessionEntry[], homeDir?: string): LogicalTurn[] {
  const turns: LogicalTurn[] = [];
  let current: LogicalTurn | null = null;

  for (const entry of entries) {
    if (entry.type !== "message" || !entry.message) continue;
    const msg = entry.message;
    const id = typeof entry.id === "string" ? entry.id : "";

    if (msg.role === "user") {
      current = {
        index: turns.length,
        user: visibleText(msg.content),
        assistantText: "",
        toolCalls: [],
        entryIds: id ? [id] : [],
      };
      turns.push(current);
      continue;
    }
    if (!current) continue; // pre-conversation noise belongs to no turn

    if (id) current.entryIds.push(id);

    if (msg.role === "assistant") {
      const text = visibleText(msg.content);
      if (text) current.assistantText = current.assistantText ? `${current.assistantText}\n${text}` : text;
      for (const b of msg.content ?? []) {
        if (b.type !== "toolCall") continue;
        current.toolCalls.push({
          name: typeof b.name === "string" ? b.name : "(unknown)",
          // Without `homeDir` this scrubbed secrets but left absolute home paths
          // intact — and these args are what the evidence sidecar records.
          args: redactArgs(b.arguments, homeDir),
          isError: false,
          ...(typeof b.id === "string" ? { id: b.id } : {}),
        });
      }
      continue;
    }

    if (msg.role === "toolResult") {
      // Attach the outcome to the matching call. Result BODIES are never kept —
      // they routinely carry file contents, command output and absolute paths.
      const body = JSON.stringify(msg.content ?? []);
      const callId = typeof msg.toolCallId === "string" ? msg.toolCallId : undefined;
      // By id when pi gave us one; otherwise the FIRST still-unmatched call of
      // that name, since results arrive in order for a sequential conversation.
      const target = callId
        ? current.toolCalls.find((c) => c.id === callId)
        : current.toolCalls.find((c) => c.name === msg.toolName && c.resultBytes === undefined);
      if (target) {
        target.isError = msg.isError === true;
        target.resultBytes = Buffer.byteLength(body, "utf8");
        target.resultSha256 = sha256(body);
      }
    }
  }
  return turns;
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/** Values longer than this are truncated rather than persisted whole. */
export const MAX_VALUE_CHARS = 2000;

const REDACTED = "[redacted]";

/** Argument/field names whose VALUE is always dropped, whatever it looks like. */
const SECRET_KEY = /^(.*[-_])?(password|passwd|secret|token|api[-_]?key|apikey|auth|authorization|credential|private[-_]?key|access[-_]?key|session[-_]?key)([-_].*)?$/i;

/** Value-shaped secrets, caught even under an innocuous key name. */
const SECRET_VALUE: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
];

/**
 * Redact secrets and machine paths from a free-text string.
 *
 * Home directories are replaced because a capture is meant to be committed, and
 * `/home/<name>/…` identifies a person as surely as a token identifies an
 * account. `homeDir` is a parameter rather than a read of `process.env.HOME` so
 * the behavior is testable and does not differ between a developer's machine
 * and CI.
 */
export function redactText(input: string, homeDir?: string): string {
  let out = input;
  for (const re of SECRET_VALUE) out = out.replace(re, REDACTED);
  if (homeDir && homeDir.length > 1) {
    out = out.split(homeDir).join("~");
  }
  return out;
}

/** Truncate with an explicit marker — silent truncation reads as complete evidence. */
export function truncate(input: string, max = MAX_VALUE_CHARS): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}… [truncated ${input.length - max} chars]`;
}

/**
 * Sanitize tool-call arguments: drop secret-named values, redact secret-shaped
 * ones, truncate the oversized, and refuse to recurse without bound.
 */
export function redactArgs(args: unknown, homeDir?: string, depth = 0): SanitizedArgs {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return {};
  const out: SanitizedArgs = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactValue(value, homeDir, depth);
  }
  return out;
}

function redactValue(value: unknown, homeDir: string | undefined, depth: number): unknown {
  if (typeof value === "string") return truncate(redactText(value, homeDir));
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 3) return "[nested]"; // bounded: a deep object is not review evidence
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, homeDir, depth + 1));
  if (typeof value === "object") return redactArgs(value, homeDir, depth + 1);
  return String(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Building a capture case
// ---------------------------------------------------------------------------

/** Stable, sortable, collision-resistant enough for a per-skill directory. */
export function captureId(seed: string, existing: readonly string[] = []): string {
  const taken = new Set(existing);
  const base = `CAP-${sha256(seed).slice(0, 6).toUpperCase()}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface BuildCaptureOptions {
  turns: LogicalTurn[];
  /** Inclusive selected range over `turns`. */
  range: { start: number; end: number };
  classification: CaptureClassification;
  expectedBehavior: string;
  checklist: string[];
  target: CaptureTarget;
  sessionPath: string;
  created: string;
  subject?: { provider: string; model: string };
  gitCommit?: string;
  gitDirty?: boolean;
  homeDir?: string;
  existingIds?: readonly string[];
}

/**
 * Assemble a reviewed capture case.
 *
 * Only the USER turns are carried into the case: they are the stimulus, and they
 * are the only part that can be replayed. The assistant's historical prose is
 * evidence for the human writing the expectation, never an exact-output oracle —
 * so it lives in the git-ignored local sidecar, not here.
 *
 * The session path is hashed rather than stored: an absolute path names a
 * machine and a user, and a hash is enough to recognize the same session again.
 */
export function buildCaptureCase(opts: BuildCaptureOptions): CaptureCaseV1 {
  const { start, end } = opts.range;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= opts.turns.length) {
    throw new Error(`invalid capture range ${start}..${end} over ${opts.turns.length} turn(s)`);
  }
  if (opts.expectedBehavior.trim() === "") {
    throw new Error("a capture needs a written expected behavior — it is what makes the case reviewable");
  }
  const checklist = opts.checklist.map((c) => c.trim()).filter(Boolean);
  if (checklist.length === 0) {
    throw new Error("a capture needs at least one checklist item");
  }

  const selected = opts.turns.slice(start, end + 1);
  const turns = selected.map((t) => truncate(redactText(t.user, opts.homeDir)));

  const id = captureId(`${opts.sessionPath}:${start}:${end}:${opts.created}`, opts.existingIds ?? []);

  return {
    capture_schema: CAPTURE_SCHEMA_VERSION,
    id,
    created: opts.created,
    classification: opts.classification,
    turns,
    expected_behavior: truncate(redactText(opts.expectedBehavior, opts.homeDir)),
    checklist: checklist.map((c) => truncate(redactText(c, opts.homeDir), 300)),
    target: opts.target,
    provenance: {
      session_sha256: sha256(opts.sessionPath),
      turn_range: { start, end },
      ...(opts.subject ? { subject: opts.subject } : {}),
      ...(opts.gitCommit ? { git_commit: opts.gitCommit } : {}),
      ...(opts.gitDirty === undefined ? {} : { git_dirty: opts.gitDirty }),
    },
    status: "pending",
  };
}

/**
 * Project a reviewed capture into a scenario object for `appendScenario`.
 *
 * Deliberately minimal: id, title, turns, checklist. No `critical`, no gates, no
 * fixture. Promotion is the moment a human takes responsibility for a test, and
 * a capture cannot know whether the behavior it saw is ship-blocking — guessing
 * `critical: true` here would let a captured one-off silently gate a release.
 */
export function captureToScenario(capture: CaptureCaseV1, scenarioId: string, title: string): Record<string, unknown> {
  return {
    id: scenarioId,
    title,
    turns: capture.turns,
    checklist: capture.checklist,
  };
}

/**
 * Draft an orchestration assertion from subagent calls seen in the captured range.
 *
 * Returns null when the range contains none, so the capture UI can skip the
 * question entirely rather than offering an empty form.
 *
 * Deliberately proposes only `agent` and `count` — never `task_contains`. The
 * task text that happened to be sent is not the task text that is *required*;
 * turning one observed handoff into a required substring would manufacture a
 * brittle assertion the author never reasoned about. Required context is a
 * judgement, so the UI asks.
 */
export function draftSubagentAssertion(
  turns: LogicalTurn[],
  toolNames: readonly string[] = ["Agent", "subagent", "task"],
): { tool: string; agent: string; count: { min: number } } | null {
  const names = new Set(toolNames.map((n) => n.toLowerCase()));
  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      if (!names.has(call.name.toLowerCase())) continue;
      const invocations = subagentInvocationsOf(call.args);
      if (invocations.length === 0) continue;
      return { tool: call.name, agent: invocations[0], count: { min: 1 } };
    }
  }
  return null;
}

/** Agent names visible in a call's arguments, across the known shapes. */
function subagentInvocationsOf(args: SanitizedArgs): string[] {
  const nameOf = (v: unknown): string | null => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.agent === "string") return o.agent;
    if (typeof o.name === "string") return o.name;
    return null;
  };
  for (const key of ["tasks", "chain"] as const) {
    const list = args[key];
    if (Array.isArray(list)) return list.map(nameOf).filter((x): x is string => x !== null);
  }
  const single = nameOf(args);
  return single ? [single] : [];
}

/**
 * Offline first-draft checklist from the human's expectation.
 *
 * Splits on sentence and bullet boundaries. This is a typing shortcut for the
 * editor step, not an understanding of the text — the UI always opens the result
 * for correction, and the plan makes LLM drafting a separate, paid, opt-in path.
 */
export function draftChecklist(expectedBehavior: string): string[] {
  return expectedBehavior
    .split(/\n\s*[-*]\s+|\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/^[-*]\s+/, "").replace(/\s+/g, " ").trim().replace(/[.]$/, ""))
    .filter((s) => s.length > 3);
}
