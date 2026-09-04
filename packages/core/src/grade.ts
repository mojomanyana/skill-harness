import type { Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import type { Verdict } from "./score.js";
import { createWorkspace } from "./workspace.js";
import { parseCriterionVotes, type CriterionVote } from "./results.js";

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
Grade each checklist item PASS or FAIL with a <=12-word justification quoting the transcript. Be skeptical: if an item is not clearly satisfied, mark it FAIL. Then output exactly these two lines:
VERDICT: PASS      (only if EVERY item passed)   — or —   VERDICT: FAIL
REASON: <15 words or fewer>`;
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
  raw: string;
  criteria: CriterionVote[];
  /** Judge misfire: the overall verdict disagrees with AND(per-item grades). Recorded, never auto-passed; blocks SHIP until re-judged or overridden. */
  suspect: boolean;
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

/** Drive the judge for one transcript and parse the result. */
export async function gradeTranscript(
  adapter: HarnessAdapter,
  judge: ModelRef,
  prompt: string,
  cwd: string
): Promise<GradeResult> {
  const raw = await adapter.judge({ model: judge, prompt, cwd });
  const parsed = parseVerdict(raw);
  // On a parse failure, surface what the judge actually emitted (e.g. a provider
  // error) rather than a generic message — otherwise the cause is invisible.
  if (parsed.verdict === "ERROR") {
    const snippet = raw.trim().replace(/\s+/g, " ").slice(0, 160);
    if (snippet) parsed.reason = `judge unparseable: ${snippet}`;
  }
  const suspect = detectMisfire(raw, parsed.verdict);
  return { ...parsed, raw, suspect, criteria: parseCriterionVotes(raw) };
}

/**
 * Grade a transcript in a fresh, isolated, throwaway workspace — never the
 * subject's scenario dir — so the judge can't ingest repo context the subject
 * left behind (matters for CLI judges that read cwd, e.g. claude-code).
 */
export async function judgeInWorkspace(
  adapter: HarnessAdapter,
  judge: ModelRef,
  prompt: string,
  specDir: string
): Promise<GradeResult> {
  const ws = createWorkspace("none", { specDir });
  try {
    return await gradeTranscript(adapter, judge, prompt, ws.cwd);
  } finally {
    ws.cleanup();
  }
}
