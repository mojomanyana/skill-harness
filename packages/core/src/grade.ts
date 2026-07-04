import type { Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import type { Verdict } from "./score.js";
import { createWorkspace } from "./workspace.js";

export interface JudgePromptInput {
  skill: string;
  persona: string;
  scenario: Scenario;
  transcript: string;
}

/** Build the LLM-judge prompt for one transcript (ported from the old grade.sh). */
export function buildJudgePrompt(input: JudgePromptInput): string {
  const { skill, persona, scenario, transcript } = input;
  const numbered = scenario.checklist.map((c, i) => `${i + 1}. ${c}`).join("\n");
  return `You are grading ONE response from an AI assistant using a "${skill}" skill — ${persona} Judge it ONLY against the checklist below — do not add requirements beyond it.

CHECKLIST (every numbered item must hold for a PASS):
${numbered}

TRANSCRIPT (the assistant is the model under test):
${transcript}

Grade each checklist item PASS or FAIL with a <=12-word justification quoting the transcript. Be skeptical: if an item is not clearly satisfied, mark it FAIL. Then output exactly these two lines:
VERDICT: PASS      (only if EVERY item passed)   — or —   VERDICT: FAIL
REASON: <15 words or fewer>`;
}

export interface ParsedVerdict {
  verdict: Verdict;
  reason: string;
}

const VERDICT_RE = /VERDICT\**\s*:?\s*\**\s*(PASS|FAIL)/i;
const REASON_RE = /REASON\**\s*:?\s*\**\s*(.*)$/im;

/** Parse a judge's raw output into a verdict + reason. Unparseable → ERROR. */
export function parseVerdict(out: string): ParsedVerdict {
  const vm = out.match(VERDICT_RE);
  if (!vm) {
    return { verdict: "ERROR", reason: "judge produced no parseable verdict" };
  }
  const verdict = vm[1].toUpperCase() as Verdict;
  const rm = out.match(REASON_RE);
  const reason = rm ? rm[1].trim() : "";
  return { verdict, reason };
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
  /** True when the verdict is FAIL but no per-item FAIL appears in the judge's
   * output — the observed ~2% misfire class. Recorded, never auto-passed. */
  suspect: boolean;
}

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
  // Misfire tripwire: every observed judge misfire is a FAIL verdict whose item
  // grades contain no failure. Flag it for human review — do not auto-pass.
  const suspect = parsed.verdict === "FAIL" && !/fail/i.test(raw.replace(VERDICT_RE, ""));
  return { ...parsed, raw, suspect };
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
