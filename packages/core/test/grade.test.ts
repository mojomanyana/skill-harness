import { existsSync } from "node:fs";
import { describe, test, expect } from "vitest";
import { buildJudgePrompt, parseVerdict, judgeResemblesSubject, gradeTranscript, judgeInWorkspace, detectMisfire } from "../src/grade.js";
import type { Scenario } from "../src/spec.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

const scenario: Scenario = {
  id: "A1",
  title: "hand-rolled max",
  critical: true,
  mode: "inline",
  turns: ["Review this"],
  checklist: ["points to the builtin max", "says to delete the loop"],
};

describe("buildJudgePrompt", () => {
  test("includes persona, numbered checklist, transcript, and verdict instructions", () => {
    const p = buildJudgePrompt({
      skill: "ponytail",
      persona: "a simplicity sidekick that cuts bloat",
      scenario,
      transcript: "USER: ...\nASSISTANT: use max() and delete the loop",
    });
    expect(p).toContain("ponytail");
    expect(p).toContain("a simplicity sidekick that cuts bloat");
    expect(p).toContain("1. points to the builtin max");
    expect(p).toContain("2. says to delete the loop");
    expect(p).toContain("use max() and delete the loop");
    expect(p).toMatch(/VERDICT:\s*PASS/);
    expect(p).toMatch(/REASON:/);
  });
});

describe("parseVerdict", () => {
  test("parses PASS verdict and reason", () => {
    const out = "1. PASS ...\n2. PASS ...\nVERDICT: PASS\nREASON: points to max, deletes loop";
    const r = parseVerdict(out);
    expect(r.verdict).toBe("PASS");
    expect(r.reason).toBe("points to max, deletes loop");
  });

  test("parses FAIL verdict case-insensitively", () => {
    const out = "verdict: fail\nreason: kept the loop";
    const r = parseVerdict(out);
    expect(r.verdict).toBe("FAIL");
    expect(r.reason).toBe("kept the loop");
  });

  test("returns ERROR when no parseable verdict", () => {
    const r = parseVerdict("the model rambled with no verdict line");
    expect(r.verdict).toBe("ERROR");
    expect(r.reason).toMatch(/no parseable verdict/i);
  });

  test("tolerates leading whitespace and markdown around VERDICT", () => {
    const out = "  **VERDICT:** PASS\n  REASON:  all good  ";
    const r = parseVerdict(out);
    expect(r.verdict).toBe("PASS");
    expect(r.reason).toBe("all good");
  });
});

describe("judgeResemblesSubject", () => {
  test("flags identical provider+model", () => {
    expect(
      judgeResemblesSubject(
        { provider: "fireworks", model: "accounts/fireworks/models/deepseek-v4-pro" },
        { provider: "fireworks", model: "accounts/fireworks/models/deepseek-v4-pro" }
      )
    ).toBe(true);
  });

  test("flags when one model id is a substring of the other (same family)", () => {
    expect(
      judgeResemblesSubject(
        { provider: "anthropic", model: "claude-opus-4-8" },
        { provider: "anthropic", model: "claude-opus-4-8-20990101" }
      )
    ).toBe(true);
  });

  test("does not flag distinct models", () => {
    expect(
      judgeResemblesSubject(
        { provider: "anthropic", model: "claude-opus-4-8" },
        { provider: "fireworks", model: "accounts/fireworks/models/deepseek-v4-pro" }
      )
    ).toBe(false);
  });
});

function fakeJudge(raw: string): HarnessAdapter {
  return { name: "pi", available: async () => true, run: async () => "", judge: async () => raw };
}
const judgeRef = { provider: "claude-code", model: "opus" };

describe("gradeTranscript misfire tripwire → structured suspect flag", () => {
  test("FAIL verdict with zero failed items is suspect, reason stays clean", async () => {
    const r = await gradeTranscript(
      fakeJudge("1. PASS — greets\n2. PASS — polite\nVERDICT: FAIL\nREASON: overall weak"),
      judgeRef, "prompt", "/tmp"
    );
    expect(r.verdict).toBe("FAIL");
    expect(r.suspect).toBe(true);
    expect(r.reason).toBe("overall weak"); // no [suspect misfire…] prefix anymore
  });

  test("FAIL with a genuinely failed item is not suspect", async () => {
    const r = await gradeTranscript(
      fakeJudge("1. FAIL — rude\nVERDICT: FAIL\nREASON: no greeting"),
      judgeRef, "prompt", "/tmp"
    );
    expect(r.suspect).toBe(false);
  });

  test("PASS is never suspect", async () => {
    const r = await gradeTranscript(
      fakeJudge("1. PASS — ok\nVERDICT: PASS\nREASON: fine"),
      judgeRef, "prompt", "/tmp"
    );
    expect(r.suspect).toBe(false);
  });
});

describe("detectMisfire (per-item vs verdict)", () => {
  const items = (lines: string[], verdictLine: string) => [...lines, verdictLine].join("\n");

  test("agreeing PASS (all items PASS, verdict PASS) is not suspect", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. PASS — ok"], "VERDICT: PASS"), "PASS")).toBe(false);
  });

  test("agreeing FAIL (an item FAILs, verdict FAIL) is not suspect", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. FAIL — nope"], "VERDICT: FAIL"), "FAIL")).toBe(false);
  });

  test("false-fail: all items PASS but verdict FAIL → suspect (the observed class)", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. PASS — ok"], "VERDICT: FAIL"), "FAIL")).toBe(true);
  });

  test("false-pass: an item FAILs but verdict PASS → suspect", () => {
    expect(detectMisfire(items(["1. PASS — ok", "2. FAIL — nope"], "VERDICT: PASS"), "PASS")).toBe(true);
  });

  test("unparseable items → fail-open (not suspect)", () => {
    expect(detectMisfire("the judge rambled\nVERDICT: FAIL", "FAIL")).toBe(false);
  });

  test("ERROR verdict is never suspect, even with parsed all-pass items", () => {
    expect(detectMisfire(items(["1. PASS — ok"], "garbage"), "ERROR")).toBe(false);
  });

  test("tolerates ) and lowercase: '1) pass' counts as an item", () => {
    expect(detectMisfire(items(["1) pass — ok", "2) pass — ok"], "VERDICT: FAIL"), "FAIL")).toBe(true);
  });
});

describe("judgeInWorkspace", () => {
  test("judges in a fresh throwaway dir and cleans it up afterward", async () => {
    let seenCwd = "";
    const adapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async () => "",
      judge: async ({ cwd }) => {
        seenCwd = cwd;
        return "VERDICT: PASS\nREASON: fine";
      },
    };
    const r = await judgeInWorkspace(adapter, judgeRef, "prompt", "/tmp");
    expect(r.verdict).toBe("PASS");
    expect(seenCwd).not.toBe("/tmp");
    expect(seenCwd.length).toBeGreaterThan(0);
    expect(existsSync(seenCwd)).toBe(false); // cleaned up after grading
  });
});
