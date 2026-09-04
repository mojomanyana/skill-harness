import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Verdict } from "./score.js";

/**
 * Machine-facing event stream for one run: one JSON object per line in
 * <runDir>/journal.jsonl. UI, trends, and debugging read ONLY this (never
 * scrape terminal output). `turn` events arrive with per-turn streaming (M4+).
 *
 * A re-grade (`skill-harness grade`) appends a second wave of judge-verdict
 * events and a new score event to the same journal — for a single-rep run
 * (or a re-grade of one), consumers take the LAST score event and the LAST
 * judge-verdict per scenario id.
 *
 * That "last per id" rule does NOT apply to a `--reps N>1` run: it emits N
 * `judge-verdict`/`misfire-flag` events per scenario id, one per rep
 * (identified by the `rep` field), and no aggregate event. These per-rep
 * events are not an aggregate — results.yaml holds the authoritative
 * aggregated verdict/pass-rate for the scenario; taking the last per id
 * would yield an arbitrary rep's verdict, not the aggregated one.
 */
export type JournalEvent =
  | { event: "run-started"; ts: string; skill: string; harness: string; model: string;
      /** The harness CLI's own version (`pi --version`), or null when it could not be asked. */
      harness_cli_version?: string | null;
      judge: { provider: string; model: string }; mode: string; label: string | null }
  /**
   * The pre-flight delivery probe (green mode, `--canary`): did the model quote a
   * body-only heading of its own skill back? `fail` aborts the run, so a journal
   * carrying a failed canary is the record of a wave that was NOT spent.
   */
  | { event: "delivery-canary"; ts: string; status: "pass" | "fail" | "skipped"; anchor: string | null; detail: string }
  | { event: "scenario-started"; ts: string; id: string; title: string }
  | { event: "gate-result"; ts: string; id: string; ok: boolean; detail: string; rep?: number }
  /** Trace-gate outcome. Separate from `gate-result`, which is the seeded diff/vitest gates. */
  | { event: "objective-result"; ts: string; id: string; ok: boolean; detail: string; rep?: number }
  /** One adjudication pass: which cells were re-judged, what it cost in CALLS, what stayed unresolved. */
  | { event: "adjudication"; ts: string; triggered: string[]; judge_calls: number; unresolved: string[] }
  | { event: "judge-verdict"; ts: string; id: string; verdict: Verdict; reason: string; suspect: boolean; rep?: number }
  | { event: "misfire-flag"; ts: string; id: string; reason: string; rep?: number }
  // `reason` distinguishes the two events that take this retry: a blank assistant
  // turn, and an adapter that threw. They are the same remedy but not the same
  // incident, and the journal is where that is recoverable after the fact.
  | { event: "empty-response-retry"; ts: string; id: string; attempt: number; reason?: string; rep?: number }
  | { event: "rescore"; ts: string; changed: string[]; passed: number; total: number; pct: number; ship: boolean }
  /**
   * A regate: needle gates re-evaluated against the saved staged diffs. `judge_calls`
   * is on the record because regate may spend only on the reps whose
   * gate verdict flipped — a claim the journal should be able to settle. `skipped`
   * names scenarios it could not regate (vitest/post_test, or missing diff artifacts).
   */
  | { event: "regate"; ts: string; scenarios: string[]; changed: string[]; judge_calls: number; skipped?: string[] }
  | { event: "score"; ts: string; passed: number; total: number; pct: number;
      letter: string; ship: boolean; note: string }
  | { event: "override"; ts: string; id: string; override: Verdict | null; note: string };

export function journalPath(runDir: string): string {
  return join(runDir, "journal.jsonl");
}

export function appendJournal(runDir: string, e: JournalEvent): void {
  mkdirSync(runDir, { recursive: true });
  appendFileSync(journalPath(runDir), JSON.stringify(e) + "\n", "utf8");
}

/** Read all events; missing file → []. Corrupt lines are skipped, never fatal. */
export function readJournal(runDir: string): JournalEvent[] {
  const p = journalPath(runDir);
  if (!existsSync(p)) return [];
  const events: JournalEvent[] = [];
  for (const line of readFileSync(p, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line) as unknown;
      if (ev && typeof ev === "object" && typeof (ev as { event?: unknown }).event === "string") {
        events.push(ev as JournalEvent);
      }
      // else: valid JSON but not a journal event — skip
    } catch {
      /* tolerate a torn/corrupt line */
    }
  }
  return events;
}
