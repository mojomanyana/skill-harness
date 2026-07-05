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

describe("cmdLint", () => {
  it("all skills clean → exit 0", async () => {
    const r = root(); mkSkill(r, "a", GOOD()); mkSkill(r, "b", GOOD());
    await cmdLint(args(r));
    expect(process.exitCode).toBe(0);
  });
  it("a failing skill → exit 1", async () => {
    const r = root(); mkSkill(r, "a", GOOD()); mkSkill(r, "b", BAD);
    await cmdLint(args(r));
    expect(process.exitCode).toBe(1);
  });
  it("unknown named skill → exit 1", async () => {
    const r = root(); mkSkill(r, "a", GOOD());
    await cmdLint(args(r, "nope"));
    expect(process.exitCode).toBe(1);
  });
  it("emits ::error:: annotations only under GITHUB_ACTIONS", async () => {
    const r = root(); mkSkill(r, "b", BAD);
    const lines: string[] = [];
    const spy = (m: any) => lines.push(String(m));
    const orig = console.log; console.log = spy as any;
    try {
      process.env.GITHUB_ACTIONS = "true";
      await cmdLint(args(r));
    } finally { console.log = orig; }
    expect(lines.some((l) => l.startsWith("::error"))).toBe(true);
  });
});
