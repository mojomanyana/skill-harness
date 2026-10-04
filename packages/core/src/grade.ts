import type { Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import type { Verdict } from "./score.js";
import { createWorkspace } from "./workspace.js";
import { completeCriterionVotes, type CriterionVote } from "./results.js";

export interface JudgePromptInput {
  skill: string;
  persona: string;
  scenario: Scenario;
  transcript: string;
}

/** The heading runSeeded writes above the staged diff. Gating on this exact string is what keeps the guidance honest — see below. */
export const STAGED_DIFF_HEADING = "=== STAGED DIFF ===";

/**
 * Addendum pointing the judge at the code, added only when the code is actually there.
 *
 * A seeded transcript ends with the staged diff, and without this the judge
 * weighs the model's prose about its work equally with the work itself — which
 * is how six reps that all passed the objective gates split PASS/FAIL purely on
 * whether the model wrote "rejects overdrafts" or "subtracts amount".
 *
 * Gated on the transcript CONTAINING the diff section, not on `scenario.mode`.
 * The first sentence is a factual claim about the transcript, and every seeded
 * transcript saved before this feature existed lacks that section — so keying
 * off the mode would tell the judge its primary evidence is at the end of a
 * transcript that has none, while also telling it the gate lines prove nothing.
 * That is a sweep of FAILs justified by absent evidence, and it would land
 * squarely on `grade`, the command AGENTS.md rule 4 recommends as the *cheap*
 * de-confounding step before re-running. Inline scenarios have no diff either,
 * so their prompt stays byte-identical and every published inline verdict
 * remains comparable.
 */
const SEEDED_DIFF_GUIDANCE = `
This transcript ends with a "=== STAGED DIFF ===" section: the actual code the assistant wrote, as \`git diff --cached\`. It is the primary evidence. Grade what the diff shows the code DOES, not what the assistant's prose claims it does — a confident description of behavior the diff does not implement is a FAIL, and behavior the diff plainly implements passes even if the assistant described it poorly or not at all. The "=== SEEDED GATES ===" lines above it are keyword and test-run checks only; they do not establish that the required behavior exists. If the diff is marked truncated, judge only what you can see and never infer that cut-off code is missing.
`;

/** Build the LLM-judge prompt for one transcript (ported from the old grade.sh). */
export function buildJudgePrompt(input: JudgePromptInput): string {
  const { skill, persona, scenario, transcript } = input;
  const numbered = scenario.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const diffGuidance =
    scenario.mode === "seeded" && transcript.includes(STAGED_DIFF_HEADING) ? SEEDED_DIFF_GUIDANCE : "";
  return `You are grading ONE response from an AI assistant using a "${skill}" skill — ${persona} Judge it ONLY against the checklist below — do not add requirements beyond it.

CHECKLIST (every numbered item must hold for a PASS):
${numbered}

TRANSCRIPT (the assistant is the model under test):
${transcript}
${diffGuidance}
Grade each checklist item PASS or FAIL with a <=12-word justification quoting the transcript. Be skeptical: if an item is not clearly satisfied, mark it FAIL. Reply with exactly one JSON object and nothing else, with one vote per criterion in checklist order:
{"votes":[{"criterion":1,"vote":"PASS"|"FAIL","reason":"..."},...],"verdict":"PASS"|"FAIL","reason":"..."}`;
}

export interface ParsedVerdict {
  verdict: Verdict;
  reason: string;
}

// Both anchor to the start of a line and REQUIRE the colon. Without those anchors the
// reason pattern matched any word containing "reason" — git-ops GLM C1 stored
// "able given no repo present.", a fragment of "Reasonable" in the judge's prose, which
// then read as a FAIL-verdict-with-passing-reason misfire that never happened.
const VERDICT_RE = /^\s*\**\s*VERDICT\**\s*:\s*\**\s*(PASS|FAIL)/gim;
const REASON_RE = /^\s*\**\s*REASON\**\s*:\s*\**\s*(.*)$/gim;

/**
 * Parse a judge's raw output into a verdict + reason.
 *
 * Judges sometimes emit MORE than one verdict block (a first pass, then a restated
 * conclusion). Every block is read, never just the first:
 *   - all blocks agree  → that verdict, with the reason from the LAST block (the
 *     judge's final word) in full
 *   - blocks disagree   → JUDGE-AMBIGUOUS, which counts as a non-pass and carries both
 *     verdicts in the reason so a rejudge can be queued. Silently taking either one
 *     would be inventing a grade the judge did not give.
 * Unparseable → ERROR.
 */
export function parseVerdict(out: string): ParsedVerdict {
  const verdicts = [...out.matchAll(VERDICT_RE)].map((m) => m[1].toUpperCase() as "PASS" | "FAIL");
  if (verdicts.length === 0) {
    return { verdict: "ERROR", reason: "judge produced no parseable verdict" };
  }
  const reasons = [...out.matchAll(REASON_RE)].map((m) => m[1].trim());
  const reason = reasons.length > 0 ? reasons[reasons.length - 1] : "";

  const unique = [...new Set(verdicts)];
  if (unique.length > 1) {
    return {
      verdict: "JUDGE-AMBIGUOUS",
      reason: `judge emitted conflicting verdicts (${verdicts.join(", ")}) — needs rejudge; last reason: ${reason}`,
    };
  }
  return { verdict: unique[0], reason };
}

/**
 * Judge-≠-subject de-confound guard. True when the judge resembles the model
 * under test: same provider AND one model id contains the other (same family).
 * opus-judging-opus inflated scores before — never let the judge sit in the model set.
 */
export function judgeResemblesSubject(judge: ModelRef, subject: ModelRef): boolean {
  if (judge.provider !== subject.provider) return false;
  const a = judge.model;
  const b = subject.model;
  return a === b || a.includes(b) || b.includes(a);
}

export interface GradeResult extends ParsedVerdict {
  /** The final judge reply, retained for callers that predate structured judging. */
  raw: string;
  /** Every attempt in call order; two entries mean the structured retry also ran. */
  rawReplies: string[];
  criteria: CriterionVote[];
  judgeFormat: "json";
  /** One validation-guided retry after an invalid structured reply. Absent on the first attempt. */
  judgeRetries?: 1;
  /** Judge misfire: the overall verdict disagrees with AND(per-item grades). Recorded, never auto-passed; blocks SHIP until re-judged or overridden. */
  suspect: boolean;
}

/** Extract the first complete top-level JSON object, tolerating prose or fences around it. */
function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("no JSON object in judge reply");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return raw.slice(start, i + 1);
  }
  throw new Error("incomplete JSON object in judge reply");
}

function exactKeys(value: Record<string, unknown>, expected: string[], context: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${context} must contain exactly ${wanted.join(", ")}`);
  }
}

/** Parse and validate the JSON-only contract used for new judge calls. */
export function parseStructuredJudgeReply(raw: string, expectedCriteria: number): ParsedVerdict & { criteria: CriterionVote[] } {
  let value: unknown;
  try {
    value = JSON.parse(extractFirstJsonObject(raw));
  } catch (error) {
    if (error instanceof Error && /JSON object in judge reply/.test(error.message)) throw error;
    throw new Error(`invalid JSON: ${(error as Error).message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("judge reply must be a JSON object");
  const object = value as Record<string, unknown>;
  exactKeys(object, ["votes", "verdict", "reason"], "judge reply");
  if (!Array.isArray(object.votes)) throw new Error("votes must be an array");
  if (object.votes.length !== expectedCriteria) throw new Error(`expected ${expectedCriteria} votes, got ${object.votes.length}`);
  const criteria = object.votes.map((rawVote, offset): CriterionVote => {
    if (!rawVote || typeof rawVote !== "object" || Array.isArray(rawVote)) throw new Error(`vote ${offset + 1} must be an object`);
    const vote = rawVote as Record<string, unknown>;
    exactKeys(vote, ["criterion", "vote", "reason"], `vote ${offset + 1}`);
    if (vote.criterion !== offset + 1) throw new Error(`vote ${offset + 1} must have criterion ${offset + 1}`);
    if (vote.vote !== "PASS" && vote.vote !== "FAIL") throw new Error(`vote ${offset + 1} must be PASS or FAIL`);
    if (typeof vote.reason !== "string") throw new Error(`vote ${offset + 1} reason must be a string`);
    return { index: offset + 1, verdict: vote.vote, reason: vote.reason };
  });
  if (object.verdict !== "PASS" && object.verdict !== "FAIL") throw new Error("verdict must be PASS or FAIL");
  if (typeof object.reason !== "string") throw new Error("reason must be a string");
  return { criteria, verdict: object.verdict, reason: object.reason };
}

/** Preserve one raw reply byte-for-byte, or both retry attempts with explicit boundaries. */
export function formatJudgeRawReplies(replies: string[]): string {
  if (replies.length === 1) return replies[0];
  return replies.map((reply, index) => `=== JUDGE REPLY ${index + 1} ===\n${reply}`).join("\n\n");
}

const ITEM_RE = /^\s*\d+[.)]\s*\**\s*(PASS|FAIL)\b/gim;

/**
 * Judge-misfire detector: parse the judge's per-checklist-item grades and assert
 * the overall verdict equals AND(items). A mismatch in EITHER direction — verdict
 * PASS with a FAILed item (false-pass), or verdict FAIL with every item PASSing
 * (the observed ~2% false-fail class) — is a misfire. Fail-open: if no item lines
 * parse, or the verdict is ERROR, return false (never block a run on a parse miss).
 */
export function detectMisfire(raw: string, verdict: Verdict): boolean {
  if (verdict === "ERROR") return false;
  // Conflicting verdicts are suspect by construction — there is no consistent grade.
  if (verdict === "JUDGE-AMBIGUOUS") return true;
  const items = [...raw.matchAll(ITEM_RE)].map((m) => m[1].toUpperCase() === "PASS");
  if (items.length === 0) {
    // No item lines to cross-check, so fall back to the verdict-vs-reason shape: a FAIL
    // whose reason says everything passed is the misfire class from REVIEW-FINDINGS
    // finding 2. Deliberately narrow — an earlier version of this tripwire fired on
    // terse genuine FAILs, so it requires an explicitly total claim ("all items ...
    // pass", "every item ... satisfied") and no negation anywhere in the reason.
    if (verdict === "FAIL") {
      const reason = (raw.match(REASON_LINE_RE)?.[1] ?? "").trim();
      const totalPass = /\b(all|every)\b[^.]*\b(pass(es|ed)?|satisf(y|ies|ied)|hold(s)?|met)\b/i.test(reason);
      const negated = /\b(not|no|n't|fails?|failed|missing|except|but|however)\b/i.test(reason);
      return totalPass && !negated;
    }
    return false; // fail-open
  }
  const andItems = items.every((ok) => ok);
  const verdictBool = verdict === "PASS";
  return verdictBool !== andItems;
}

// Non-global twin of REASON_RE: matchAll needs /g, a single .match() must not have it.
const REASON_LINE_RE = /^\s*\**\s*REASON\**\s*:\s*\**\s*(.*)$/im;

/** Drive the judge for one transcript and parse the JSON-only result. */
export async function gradeTranscript(
  adapter: HarnessAdapter,
  judge: ModelRef,
  prompt: string,
  cwd: string,
  expectedCriteria: number,
): Promise<GradeResult> {
  const rawReplies: string[] = [];
  let validationError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = attempt === 0 ? "" : `\n\nYour reply was not valid: ${JSON.stringify(validationError)}; reply with only the JSON object.`;
    const raw = await adapter.judge({ model: judge, prompt: prompt + retry, cwd });
    rawReplies.push(raw);

    // Pi adapter failures are infrastructure errors, not malformed model votes.
    if (/^\[judge error:/i.test(raw.trim())) {
      const snippet = raw.trim().replace(/\s+/g, " ").slice(0, 160);
      return {
        verdict: "ERROR", reason: `judge unparseable: ${snippet}`, suspect: false,
        raw, rawReplies, criteria: completeCriterionVotes([], expectedCriteria), judgeFormat: "json",
        ...(attempt === 1 ? { judgeRetries: 1 as const } : {}),
      };
    }

    try {
      const parsed = parseStructuredJudgeReply(raw, expectedCriteria);
      const suspect = parsed.verdict === "FAIL"
        ? parsed.criteria.every(vote => vote.verdict === "PASS")
        : parsed.criteria.some(vote => vote.verdict === "FAIL");
      return {
        ...parsed, raw, rawReplies, suspect, judgeFormat: "json",
        ...(attempt === 1 ? { judgeRetries: 1 as const } : {}),
      };
    } catch (error) {
      validationError = (error as Error).message;
    }
  }

  const raw = rawReplies[rawReplies.length - 1];
  return {
    verdict: "UNGRADED",
    reason: `judge structured reply invalid after retry: ${validationError}`,
    suspect: false,
    raw,
    rawReplies,
    criteria: completeCriterionVotes([], expectedCriteria),
    judgeFormat: "json",
    judgeRetries: 1,
  };
}

/**
 * Grade a transcript in a fresh, isolated, throwaway workspace — never the
 * subject's scenario dir — so the judge can't ingest repo context the subject
 * left behind (matters for provider CLIs that read cwd, including Pi).
 */
export async function judgeInWorkspace(
  adapter: HarnessAdapter,
  judge: ModelRef,
  prompt: string,
  specDir: string,
  expectedCriteria: number,
): Promise<GradeResult> {
  const ws = createWorkspace("none", { specDir });
  try {
    return await gradeTranscript(adapter, judge, prompt, ws.cwd, expectedCriteria);
  } finally {
    ws.cleanup();
  }
}
