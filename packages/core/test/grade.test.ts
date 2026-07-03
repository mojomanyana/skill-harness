import { describe, test, expect } from "vitest";
import { buildJudgePrompt, parseVerdict, judgeResemblesSubject } from "../src/grade.js";
import type { Scenario } from "../src/spec.js";

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
