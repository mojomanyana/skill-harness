import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Verdict } from "./score.js";

/**
 * Machine-facing event stream for one run: one JSON object per line in
 * <runDir>/journal.jsonl. UI, trends, and debugging read ONLY this (never
 * scrape terminal output). `turn` events arrive with per-turn streaming (M4+).
 *
 * A re-grade (`skill-check grade`) appends a second wave of judge-verdict
 * events and a new score event to the same journal — consumers take the LAST
 * score event and the LAST judge-verdict per scenario id.
 */
export type JournalEvent =
  | { event: "run-started"; ts: string; skill: string; harness: string; model: string;
      judge: { provider: string; model: string }; mode: string; label: string | null }
  | { event: "scenario-started"; ts: string; id: string; title: string }
  | { event: "gate-result"; ts: string; id: string; ok: boolean; detail: string }
  | { event: "judge-verdict"; ts: string; id: string; verdict: Verdict; reason: string; suspect: boolean }
  | { event: "misfire-flag"; ts: string; id: string; reason: string }
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
      events.push(JSON.parse(line) as JournalEvent);
    } catch {
      /* tolerate a torn/corrupt line */
    }
  }
  return events;
}
