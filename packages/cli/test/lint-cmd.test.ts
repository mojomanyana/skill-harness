import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdLint } from "../src/cli.js";

const tmps: string[] = [];
function args(root: string, target = "all") { return { _: [target], flags: { skills: root }, multi: {} }; }
function mkSkill(root: string, name: string, specYaml: string) {
  const d = join(root, name);
  mkdirSync(join(d, "tests"), { recursive: true });
  writeFileSync(join(d, "SKILL.md"), "---\nname: " + name + "\n---\n", "utf8");
  writeFileSync(join(d, "tests", "specification.yaml"), specYaml, "utf8");
}
const GOOD = (id = "A1") => `skill: d\njudge_persona: j.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: ${id}\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`;
const BAD = `skill: d\njudge_persona: j.\nship_bar: { total: 9, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["h"]\n    checklist: ["ok"]\n`;

beforeEach(() => { process.exitCode = 0; delete process.env.GITHUB_ACTIONS; });
afterEach(() => { process.exitCode = 0; delete process.env.GITHUB_ACTIONS; while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });
function root() { const d = mkdtempSync(join(tmpdir(), "sc-lintcmd-")); tmps.push(d); return d; }

/** Run `fn` with console.log/console.error mocked (captured, not printed) so tests
 * don't spew to the runner's stdout. Always restored, even if `fn` throws/rejects. */
async function captureConsole<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = ((...a: unknown[]) => { logs.push(a.map(String).join(" ")); }) as typeof console.log;
  console.error = ((...a: unknown[]) => { errors.push(a.map(String).join(" ")); }) as typeof console.error;
  try {
    const result = await fn();
    return { result, logs, errors };
  } finally {
    console.log = origLog;
    console.error = origError;
  }
}

describe("cmdLint", () => {
  it("all skills clean → exit 0, summary line reports 0 findings", async () => {
    const r = root(); mkSkill(r, "a", GOOD()); mkSkill(r, "b", GOOD());
    const { logs } = await captureConsole(() => cmdLint(args(r)));
    expect(process.exitCode).toBe(0);
    expect(logs.some((l) => /\d+ skill\(s\), \d+ finding\(s\)/.test(l))).toBe(true);
    expect(logs.some((l) => /2 skill\(s\), 0 finding\(s\)/.test(l))).toBe(true);
  });
  it("a failing skill → exit 1, summary line reports the finding", async () => {
    const r = root(); mkSkill(r, "a", GOOD()); mkSkill(r, "b", BAD);
    const { logs } = await captureConsole(() => cmdLint(args(r)));
    expect(process.exitCode).toBe(1);
    expect(logs.some((l) => /\d+ skill\(s\), \d+ finding\(s\)/.test(l))).toBe(true);
    expect(logs.some((l) => /2 skill\(s\), 1 finding\(s\)/.test(l))).toBe(true);
  });
  it("unknown named skill → exit 1", async () => {
    const r = root(); mkSkill(r, "a", GOOD());
    const { errors } = await captureConsole(() => cmdLint(args(r, "nope")));
    expect(process.exitCode).toBe(1);
    expect(errors.some((l) => /no skill `nope`/.test(l))).toBe(true);
  });
  it("no skills with a spec under root → exit 1, stderr says so (untested branch)", async () => {
    const r = root();
    const d = join(r, "a");
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "SKILL.md"), "---\nname: a\n---\n", "utf8"); // SKILL.md but no tests/specification.yaml
    const { errors } = await captureConsole(() => cmdLint(args(r)));
    expect(process.exitCode).toBe(1);
    expect(errors.some((l) => /no skills with a spec/.test(l))).toBe(true);
  });
  it("emits ::error:: annotations only under GITHUB_ACTIONS", async () => {
    const r = root(); mkSkill(r, "b", BAD);
    process.env.GITHUB_ACTIONS = "true";
    const { logs } = await captureConsole(() => cmdLint(args(r)));
    expect(logs.some((l) => l.startsWith("::error"))).toBe(true);
  });
  it("emits NO ::error:: annotations when GITHUB_ACTIONS is unset", async () => {
    const r = root(); mkSkill(r, "b", BAD);
    delete process.env.GITHUB_ACTIONS;
    const { logs } = await captureConsole(() => cmdLint(args(r)));
    expect(logs.some((l) => l.startsWith("::error"))).toBe(false);
  });
  it("a skill with a malformed committed results.yaml + a skill with a spec finding → no crash, exit 1, both findings surface (no abort-all)", async () => {
    const r = root();
    mkSkill(r, "a", GOOD());
    const resultsDir = join(r, "a", "tests", "results", "pi-fake", "2026-07-01T00-00-00Z");
    mkdirSync(resultsDir, { recursive: true });
    // unparseable results.yaml (merge-conflict markers) — must not abort the whole `lint all` run.
    writeFileSync(join(resultsDir, "results.yaml"), "<<<<<<< HEAD\nfoo: 1\n=======\nfoo: 2\n>>>>>>> branch\n", "utf8");
    mkSkill(r, "b", BAD);
    const { logs } = await captureConsole(() => cmdLint(args(r)));
    expect(process.exitCode).toBe(1);
    expect(logs.some((l) => /consistency/.test(l) && /unreadable or malformed/.test(l))).toBe(true);
    expect(logs.some((l) => /ship_bar/.test(l))).toBe(true);
    expect(logs.some((l) => /2 skill\(s\), 2 finding\(s\)/.test(l))).toBe(true);
  });
});
