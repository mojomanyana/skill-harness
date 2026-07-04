import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJournal, readJournal, journalPath, type JournalEvent } from "../src/journal.js";

const tmps: string[] = [];
function tmp() {
  const d = mkdtempSync(join(tmpdir(), "sc-journal-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("journal append/read round-trip", () => {
  test("appends one JSON line per event and reads them back in order", () => {
    const dir = tmp();
    const e1: JournalEvent = { event: "scenario-started", ts: "t1", id: "A1", title: "hello" };
    const e2: JournalEvent = { event: "judge-verdict", ts: "t2", id: "A1", verdict: "PASS", reason: "ok", suspect: false };
    appendJournal(dir, e1);
    appendJournal(dir, e2);
    expect(readJournal(dir)).toEqual([e1, e2]);
  });

  test("missing journal → empty list", () => {
    expect(readJournal(tmp())).toEqual([]);
  });

  test("skips corrupt lines instead of throwing", () => {
    const dir = tmp();
    appendJournal(dir, { event: "scenario-started", ts: "t", id: "A1", title: "x" });
    appendFileSync(journalPath(dir), "not json\n", "utf8");
    appendJournal(dir, { event: "misfire-flag", ts: "t", id: "A1", reason: "r" });
    expect(readJournal(dir)).toHaveLength(2);
  });

  test("readJournal skips a syntactically-valid line that isn't a journal event", () => {
    const dir = tmp();
    appendJournal(dir, { event: "scenario-started", ts: "t", id: "A1", title: "x" });
    appendFileSync(journalPath(dir), JSON.stringify({ not: "an event" }) + "\n", "utf8");
    appendFileSync(journalPath(dir), "42\n", "utf8"); // valid JSON, not an object
    appendJournal(dir, { event: "misfire-flag", ts: "t", id: "A1", reason: "r" });
    const events = readJournal(dir);
    expect(events).toHaveLength(2); // only the two real events
    expect(events.map((e) => e.event)).toEqual(["scenario-started", "misfire-flag"]);
  });

  test("creates the run dir if needed", () => {
    const dir = join(tmp(), "does", "not", "exist");
    appendJournal(dir, { event: "scenario-started", ts: "t", id: "A1", title: "x" });
    expect(readJournal(dir)).toHaveLength(1);
  });
});
