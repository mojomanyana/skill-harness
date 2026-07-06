import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, renderTemplateSpec, type HarnessAdapter } from "@skill-harness/core";
import { cmdSuggest } from "../src/cli.js";

const GOOD_JSON = JSON.stringify({
  judge_persona: "a fair reviewer.",
  ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
  proposed_critical: ["A1"],
  scenarios: [{ id: "A1", title: "says hi", turns: ["Say hi."], checklist: ["greets the user"] }],
});

/** An adapter whose judge returns queued replies in order. */
function fakeAdapter(replies: string[]): HarnessAdapter {
  let i = 0;
  return {
    name: "pi",
    available: async () => true,
    run: async () => "",
    judge: async () => replies[Math.min(i++, replies.length - 1)],
  };
}

const tmps: string[] = [];
function tmpRoot() { const d = mkdtempSync(join(tmpdir(), "sh-suggest-")); tmps.push(d); return d; }
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

function skillRoot(name = "greeter") {
  const root = tmpRoot();
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "SKILL.md"), "# Greeter\nsay hi", "utf8");
  return { root, specPath: join(root, name, "tests", "specification.yaml") };
}
function args(root: string, name: string, extra: Record<string, string | true> = {}) {
  return { _: [name], flags: { skills: root, ...extra }, multi: {} };
}

describe("cmdSuggest", () => {
  test("happy path writes a valid drafted spec", async () => {
    const { root, specPath } = skillRoot();
    await cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]));
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    expect(spec.scenarios[0].id).toBe("A1");
    expect(spec.critical).toEqual([]); // proposed critical stays a comment
  });

  test("invalid JSON then valid JSON succeeds on retry", async () => {
    const { root, specPath } = skillRoot();
    await cmdSuggest(args(root, "greeter"), fakeAdapter(["not json at all", GOOD_JSON]));
    expect(existsSync(specPath)).toBe(true);
  });

  test("invalid twice writes nothing and throws", async () => {
    const { root, specPath } = skillRoot();
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter(["nope", "still nope"]))).rejects.toThrow(/could not get a valid spec/);
    expect(existsSync(specPath)).toBe(false);
  });

  test("overwrites a sentinel-bearing template without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, renderTemplateSpec("greeter"), "utf8");
    await cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]));
    expect(readFileSync(specPath, "utf8")).toMatch(/# proposed critical/);
  });

  test("refuses a sentinel-less (hand-edited) spec without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "skill: greeter\njudge_persona: mine\nship_bar: {total: 1, min_pass: 1}\ncritical: []\nscenarios:\n  - id: A1\n    title: t\n    turns: [\"hi\"]\n    checklist: [\"greets\"]\n", "utf8");
    const before = readFileSync(specPath, "utf8");
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]))).rejects.toThrow(/--force/);
    expect(readFileSync(specPath, "utf8")).toBe(before);
  });

  test("--force overwrites a hand-edited spec", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "skill: greeter\njudge_persona: mine\nship_bar: {total: 1, min_pass: 1}\ncritical: []\nscenarios:\n  - id: Z9\n    title: t\n    turns: [\"hi\"]\n    checklist: [\"greets\"]\n", "utf8");
    await cmdSuggest(args(root, "greeter", { force: true }), fakeAdapter([GOOD_JSON]));
    expect(parseSpec(readFileSync(specPath, "utf8"), specPath).scenarios[0].id).toBe("A1");
  });

  test("refuses a sentinel-bearing but hand-edited template without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    // Template kept its sentinel comment, but the user hand-edited the body.
    writeFileSync(specPath, renderTemplateSpec("greeter") + '\n  - id: B1\n    title: mine\n    turns: ["x"]\n    checklist: ["y"]\n', "utf8");
    const before = readFileSync(specPath, "utf8");
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]))).rejects.toThrow(/--force/);
    expect(readFileSync(specPath, "utf8")).toBe(before); // edits preserved
  });

  test("fails fast on a hard adapter error (no retry)", async () => {
    const { root } = skillRoot();
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter(["[judge error: claude exited 127] not found"]))).rejects.toThrow(/--model/);
  });

  test("retries a transient empty response, then succeeds", async () => {
    const { root, specPath } = skillRoot();
    await cmdSuggest(args(root, "greeter"), fakeAdapter(["", GOOD_JSON]));
    expect(existsSync(specPath)).toBe(true);
  });

  test("two empty responses write nothing and throw", async () => {
    const { root, specPath } = skillRoot();
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter(["", ""]))).rejects.toThrow(/no output|could not get a valid spec/);
    expect(existsSync(specPath)).toBe(false);
  });

  test("errors when SKILL.md is missing", async () => {
    const root = tmpRoot();
    mkdirSync(join(root, "greeter"), { recursive: true }); // no SKILL.md
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]))).rejects.toThrow(/SKILL\.md/);
  });
});
