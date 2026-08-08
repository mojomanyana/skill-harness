import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { cmdGrade } from "../src/cli.js";
import type { HarnessAdapter } from "@skill-harness/core";

/**
 * End-to-end for `grade --auto-rejudge`.
 *
 * Two properties are load-bearing and both are counted, not inspected:
 * without the flag the judge is called for the first wave only, and an
 * unresolved disagreement leaves the run NOT READY.
 */

// min_pass 3 of 4 on purpose. With min_pass == total every passing cell is
// ship-deciding (correctly — at a 100% bar each cell does decide the ship), which
// makes the trigger set useless as a fixture.
const SPEC = `skill: demo
judge_persona: a strict reviewer
ship_bar: { total: 4, min_pass: 3, no_critical_fail: true }
critical: []
scenarios:
  - id: A1
    title: one
    turns: ["x"]
    checklist: ["does the thing"]
  - id: A2
    title: two
    turns: ["y"]
    checklist: ["does the thing"]
  - id: A3
    title: three
    turns: ["z"]
    checklist: ["does the thing"]
  - id: A4
    title: four
    turns: ["w"]
    checklist: ["does the thing"]
`;

/** A clean pass. */
// Item lines are `N. PASS` — the format `detectMisfire`'s ITEM_RE parses.
const CLEAN_PASS = "1. PASS\nVERDICT: PASS\nREASON: fine";
/**
 * A MISFIRE: every item passes but the overall verdict is FAIL. This is the
 * contradiction `detectMisfire` catches, and the state adjudication exists for.
 * `grade` re-judges before adjudicating, so the misfire has to come from the
 * judge's answer — a `suspect` flag in the old results.yaml is overwritten.
 */
const MISFIRE = "1. PASS\nVERDICT: FAIL\nREASON: contradicts itself";

let skillDir: string;
let runDir: string;
let out: string[];
let spies: ReturnType<typeof vi.spyOn>[] = [];

/**
 * A judge that answers based on which scenario's checklist it was handed, and
 * counts every call. Counting is the point: the safety claims in this file are
 * about call counts, not about output.
 */
function judgeSpy(perScenario: Record<string, string[]> = {}) {
  const state = { calls: 0 };
  const queues = Object.fromEntries(Object.entries(perScenario).map(([k, v]) => [k, [...v]]));
  const adapter: HarnessAdapter = {
    name: "fake",
    available: async () => true,
    version: async () => "0.83.0",
    run: async () => "unused",
    judge: async (req) => {
      state.calls++;
      // The prompt embeds the transcript, which names the scenario's turn text.
      const id = ["A1", "A2", "A3", "A4"].find((x) => req.prompt.includes(`scenario-${x}`));
      const q = id ? queues[id] : undefined;
      return (q && q.shift()) ?? CLEAN_PASS;
    },
  };
  return { state, adapter };
}

function writeRun(scenarios: Record<string, unknown>[]) {
  writeFileSync(
    join(runDir, "results.yaml"),
    yaml.dump({
      schema: 2,
      skill: "demo",
      harness: "pi",
      model: "fireworks:x",
      judge: { provider: "claude-code", model: "j1" },
      timestamp: "2026-08-08T00-00-00",
      mode: "green",
      scenarios,
    }),
    "utf8",
  );
  for (const s of scenarios) {
    // The marker lets the fake judge tell which cell it is grading.
    writeFileSync(join(runDir, `${s.id}.green.txt`), `>>> USER:\nscenario-${s.id}\n\n<<< ASSISTANT:\ndone\n`, "utf8");
  }
}

const results = () => yaml.load(readFileSync(join(runDir, "results.yaml"), "utf8")) as Record<string, any>;

beforeEach(() => {
  skillDir = mkdtempSync(join(tmpdir(), "sh-adj-"));
  runDir = join(skillDir, "tests", "results", "tag", "2026-08-08T00-00-00");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n## Do it\n", "utf8");
  out = [];
  spies = [
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void out.push(a.join(" "))),
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void out.push(a.join(" "))),
  ];
});

afterEach(() => {
  for (const s of spies) s.mockRestore();
});

const text = () => out.join("\n");

const cellRow = (id: string, over: Record<string, unknown> = {}) => ({
  id, judge_verdict: "PASS", judge_reason: "ok", suspect: false, override: null, note: "", ...over,
});
/** Four cells; A4 is the one the judge will misfire on. */
const FOUR = ["A1", "A2", "A3", "A4"].map((id) => cellRow(id));
/** Judge script: A4 misfires on the first-wave regrade. */
const A4_MISFIRES = { A4: [MISFIRE] };

describe("no spend without explicit authorization", () => {
  it("makes only first-wave calls without --auto-rejudge", async () => {
    writeRun(FOUR);
    const { state, adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: {}, multi: {} }, adapter);
    // 4 scenarios re-graded = 4 calls. Not one more, even though A4 misfired and
    // would have triggered had adjudication been enabled.
    expect(state.calls).toBe(4);
    expect(text()).not.toMatch(/adjudication/);
  });

  it("spec configuration alone cannot authorize spending", async () => {
    // There is no spec key that turns this on — the only switch is the flag.
    writeRun(FOUR);
    const { state, adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: {}, multi: {} }, adapter);
    expect(state.calls).toBe(4);
    expect(results().scenarios.every((c: any) => c.adjudication === undefined)).toBe(true);
  });
});

describe("--auto-rejudge discloses before it spends", () => {
  it("prints the exact maximum additional call count first", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    // Only A4 triggers (contradictory), and with no tie-break judge that is one call.
    expect(text()).toMatch(/1 cell\(s\) triggered — up to 1 additional judge call\(s\)/);
    expect(text()).toMatch(/A4: contradictory/);
  });

  it("doubles the ceiling when a tie-break judge is configured", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade(
      { _: [runDir], flags: { "auto-rejudge": true, "tie-break-judge": "claude-code:j3" }, multi: {} },
      adapter,
    );
    expect(text()).toMatch(/up to 2 additional judge call\(s\)/);
  });

  it("quotes counts, never dollars", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    expect(out.filter((l) => l.includes("adjudication")).join("\n")).not.toMatch(/\$/);
  });

  it("says so plainly when nothing triggers, and spends nothing extra", async () => {
    writeRun(FOUR);
    const { state, adapter } = judgeSpy({}); // every cell a clean pass
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    expect(text()).toMatch(/no cell triggered/);
    expect(state.calls).toBe(4); // first wave only
  });

  it("warns when no tie-break judge is configured", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    expect(text()).toMatch(/no tie-break judge/);
  });
});

describe("unresolved disagreement blocks SHIP", () => {
  it("stays unresolved and NOT READY when only one clean vote exists", async () => {
    // A4's first-wave judgment misfired, so it is not a clean vote. One fresh
    // clean vote cannot confirm anything, and with no tie-break judge that is
    // where it stops.
    writeRun(FOUR);
    const { state, adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);

    const a4 = results().scenarios.find((c: any) => c.id === "A4");
    expect(a4.adjudication.state).toBe("unresolved");
    expect(a4.suspect).toBe(true);
    expect(text()).toMatch(/NOT READY/);
    expect(state.calls).toBe(5); // 4 first wave + 1
  });

  it("records every judgment even when unresolved", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    const a4 = results().scenarios.find((c: any) => c.id === "A4");
    expect(a4.adjudication.judgments).toHaveLength(2);
    expect(a4.adjudication.judgments[0].ordinal).toBe(1);
    expect(a4.adjudication.judgments[0].suspect).toBe(true); // the misfire, kept
  });

  it("resolves when a tie-break judge yields two clean agreeing votes", async () => {
    writeRun(FOUR);
    const { state, adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade(
      { _: [runDir], flags: { "auto-rejudge": true, "tie-break-judge": "claude-code:j3" }, multi: {} },
      adapter,
    );
    const a4 = results().scenarios.find((c: any) => c.id === "A4");
    expect(a4.adjudication.state).toBe("confirmed");
    expect(a4.suspect).toBe(false);
    expect(state.calls).toBe(6); // 4 first wave + 2. Exact, not "about".
  });
});

describe("results compatibility", () => {
  it("adds no `adjudication` field to a cell that did not trigger", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    // Absent must mean "historical single judge", never "judges agreed".
    for (const id of ["A1", "A2", "A3"]) {
      expect(results().scenarios.find((c: any) => c.id === id).adjudication).toBeUndefined();
    }
  });

  it("reads a legacy result that has no adjudication field at all", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy({});
    await expect(cmdGrade({ _: [runDir], flags: {}, multi: {} }, adapter)).resolves.toBeUndefined();
  });

  it("preserves a human override through adjudication", async () => {
    // A judge panel does not outvote the author — overrides are the durable
    // semantic authority.
    writeRun([...FOUR.slice(0, 3), cellRow("A4", { override: "PASS", note: "checked by hand" })]);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await cmdGrade({ _: [runDir], flags: { "auto-rejudge": true }, multi: {} }, adapter);
    const a4 = results().scenarios.find((c: any) => c.id === "A4");
    expect(a4.override).toBe("PASS");
    expect(a4.note).toBe("checked by hand");
  });
});

describe("judge policy applies to every judge", () => {
  it("refuses a metered secondary judge", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await expect(
      cmdGrade(
        { _: [runDir], flags: { "auto-rejudge": true, "secondary-judge": "anthropic:claude-opus-4-8" }, multi: {} },
        adapter,
      ),
    ).rejects.toThrow(/metered|allow-metered-judge/i);
  });

  it("refuses a metered tie-break judge", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await expect(
      cmdGrade(
        { _: [runDir], flags: { "auto-rejudge": true, "tie-break-judge": "anthropic:claude-opus-4-8" }, multi: {} },
        adapter,
      ),
    ).rejects.toThrow(/metered|allow-metered-judge/i);
  });

  it("allows a metered secondary judge with the explicit opt-in", async () => {
    writeRun(FOUR);
    const { adapter } = judgeSpy(A4_MISFIRES);
    await expect(
      cmdGrade(
        {
          _: [runDir],
          flags: { "auto-rejudge": true, "secondary-judge": "anthropic:claude-opus-4-8", "allow-metered-judge": true },
          multi: {},
        },
        adapter,
      ),
    ).resolves.toBeUndefined();
  });
});
