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
      judge: { provider: string; model: string }; mode: string; label: string | null }
  | { event: "scenario-started"; ts: string; id: string; title: string }
  | { event: "gate-result"; ts: string; id: string; ok: boolean; detail: string; rep?: number }
  | { event: "judge-verdict"; ts: string; id: string; verdict: Verdict; reason: string; suspect: boolean; rep?: number }
  | { event: "misfire-flag"; ts: string; id: string; reason: string; rep?: number }
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
