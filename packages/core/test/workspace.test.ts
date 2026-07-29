import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const tmps: string[] = [];
function fixtureDir(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-ws-fixture-"));
  tmps.push(d);
  return d;
}
afterEach(() => {
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("createWorkspace", () => {
  test("none: fresh empty dir, no git", () => {
    const ws = createWorkspace("none", { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(ws.cwd)).toBe(true);
    expect(existsSync(join(ws.cwd, ".git"))).toBe(false);
  });

  test("empty-git: dir with an initialised git repo", () => {
    const ws = createWorkspace("empty-git", { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, ".git"))).toBe(true);
  });

  test("fixture: copies fixture files and initialises git", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "hello.txt"), "hi", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, "hello.txt"))).toBe(true);
    expect(existsSync(join(ws.cwd, ".git"))).toBe(true);
  });

  test("fixture: resolves a relative path against specDir", () => {
    const base = fixtureDir();
    mkdirSync(join(base, "fixtures", "f1"), { recursive: true });
    writeFileSync(join(base, "fixtures", "f1", "a.txt"), "x", "utf8");
    const ws = createWorkspace({ fixture: "fixtures/f1" }, { specDir: base });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, "a.txt"))).toBe(true);
  });

  test("baseline commit is on main, whatever the host's init.defaultBranch is", () => {
    const ws = createWorkspace("empty-git", { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "branch", "--show-current").trim()).toBe("main");
  });

  test("fixture: the baseline commit leaves a clean tree", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "hello.txt"), "hi", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "status", "--porcelain").trim()).toBe("");
  });

  test("fixture `_uncommitted/`: applied after the baseline, so the tree starts dirty", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "README.md"), "Teh project\n", "utf8");
    mkdirSync(join(src, "_uncommitted"), { recursive: true });
    writeFileSync(join(src, "_uncommitted", "README.md"), "The project\n", "utf8");

    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);

    // the fix is present in the tree but NOT in history: an uncommitted modification
    expect(git(ws.cwd, "status", "--porcelain")).toContain("README.md");
    expect(git(ws.cwd, "show", "HEAD:README.md")).toBe("Teh project\n");
    expect(git(ws.cwd, "diff", "--", "README.md")).toContain("+The project");
    // the marker dir itself never lands in the workspace or the baseline
    expect(existsSync(join(ws.cwd, "_uncommitted"))).toBe(false);
    expect(git(ws.cwd, "ls-files")).not.toContain("_uncommitted");
  });

  test("fixture `_uncommitted/`: adds brand-new untracked files too", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "README.md"), "docs\n", "utf8");
    mkdirSync(join(src, "_uncommitted", "src"), { recursive: true });
    writeFileSync(join(src, "_uncommitted", "src", "payments.ts"), "export const pay = 1;\n", "utf8");

    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, "src", "payments.ts"))).toBe(true);
    // -uall: plain --porcelain collapses a wholly-untracked dir to "?? src/"
    expect(git(ws.cwd, "status", "--porcelain", "-uall")).toContain("src/payments.ts");
    expect(git(ws.cwd, "ls-files")).not.toContain("payments.ts");
  });

  test("fixture with only `_uncommitted/`: baseline is empty, changes stay uncommitted", () => {
    const src = fixtureDir();
    mkdirSync(join(src, "_uncommitted"), { recursive: true });
    writeFileSync(join(src, "_uncommitted", "note.txt"), "x\n", "utf8");

    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "ls-files").trim()).toBe("");
    expect(git(ws.cwd, "status", "--porcelain")).toContain("note.txt");
  });

  test("cleanup removes the dir and is safe to call twice", () => {
    const ws = createWorkspace("none", { specDir: "/nonexistent" });
    ws.cleanup();
    expect(existsSync(ws.cwd)).toBe(false);
    expect(() => ws.cleanup()).not.toThrow();
  });

  test("missing fixture throws and leaves no temp dir", () => {
    expect(() => createWorkspace({ fixture: "/nope/does-not-exist" }, { specDir: "/nonexistent" }))
      .toThrow(/fixture not found/);
  });
});
