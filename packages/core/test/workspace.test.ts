import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
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

  test("fixture `_staged/`: applied after the baseline and added to the index", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "validate.ts"), "export const ok = 1;\n", "utf8");
    mkdirSync(join(src, "_staged"), { recursive: true });
    writeFileSync(join(src, "_staged", "validate.ts"), "export const ok = 2;\n", "utf8");

    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);

    // staged, not committed: shows in --cached, and HEAD still has the original
    expect(git(ws.cwd, "diff", "--cached", "--name-only").trim()).toBe("validate.ts");
    expect(git(ws.cwd, "show", "HEAD:validate.ts")).toBe("export const ok = 1;\n");
    expect(git(ws.cwd, "status", "--porcelain").trim()).toBe("M  validate.ts");
    expect(existsSync(join(ws.cwd, "_staged"))).toBe(false);
  });

  test("fixture `_staged/`: stages brand-new files too", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "README.md"), "docs\n", "utf8");
    mkdirSync(join(src, "_staged"), { recursive: true });
    writeFileSync(join(src, "_staged", "added.ts"), "export const x = 1;\n", "utf8");

    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "status", "--porcelain").trim()).toBe("A  added.ts");
  });

  test("fixture: `_staged/` and `_uncommitted/` compose in one workspace", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "a.txt"), "1\n", "utf8");
    writeFileSync(join(src, "b.txt"), "1\n", "utf8");
    mkdirSync(join(src, "_staged"), { recursive: true });
    writeFileSync(join(src, "_staged", "a.txt"), "2\n", "utf8");
    mkdirSync(join(src, "_uncommitted"), { recursive: true });
    writeFileSync(join(src, "_uncommitted", "b.txt"), "2\n", "utf8");

    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    const status = git(ws.cwd, "status", "--porcelain");
    expect(status).toContain("M  a.txt"); // staged
    expect(status).toContain(" M b.txt"); // unstaged
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

describe("createWorkspace — fixture marker validation", () => {
  // A misspelled marker used to be copied into the baseline commit as a literal
  // directory: the tree came up clean, the scenario silently measured the opposite of
  // its intent, and nothing said a word. Unknown markers are now a hard error.
  test("a typo'd marker fails the run instead of folding into the baseline", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "README.md"), "docs\n", "utf8");
    mkdirSync(join(src, "_uncommited"), { recursive: true }); // one 'm'
    writeFileSync(join(src, "_uncommited", "README.md"), "fixed\n", "utf8");

    expect(() => createWorkspace({ fixture: src }, { specDir: "/nonexistent" }))
      .toThrow(/_uncommited/);
  });

  test("the error names the fixture and the known markers", () => {
    const src = fixtureDir();
    mkdirSync(join(src, "_stage"), { recursive: true });
    let msg = "";
    try {
      createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain(src);
    expect(msg).toContain("_staged");
    expect(msg).toContain("_uncommitted");
  });

  test("no temp dir is leaked when a marker is rejected", () => {
    const src = fixtureDir();
    mkdirSync(join(src, "_bogus"), { recursive: true });

    // This assertion counts `sc-ws-*` dirs in the temp root, but vitest runs test
    // FILES in parallel processes and golden-run/seeded also call createWorkspace,
    // which mkdtemps `sc-ws-` into the SAME shared system temp. A concurrent
    // create/remove between the two readdirSync calls failed this spuriously
    // (~1 run in 8). os.tmpdir() re-reads TMPDIR on every call, so pointing it at
    // a private dir makes the count observe only this test's own activity.
    const isolated = mkdtempSync(join(tmpdir(), "sc-leakcheck-"));
    tmps.push(isolated);
    const prevTmpdir = process.env.TMPDIR;
    process.env.TMPDIR = isolated;
    try {
      const before = readdirSync(isolated).filter((d) => d.startsWith("sc-ws-")).length;
      expect(() => createWorkspace({ fixture: src }, { specDir: "/nonexistent" })).toThrow();
      const after = readdirSync(isolated).filter((d) => d.startsWith("sc-ws-")).length;
      expect(after).toBe(before);
    } finally {
      if (prevTmpdir === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = prevTmpdir;
    }
  });

  test("double-underscore dirs are NOT markers — __tests__ copies normally", () => {
    const src = fixtureDir();
    mkdirSync(join(src, "__tests__"), { recursive: true });
    writeFileSync(join(src, "__tests__", "a.test.ts"), "test('x',()=>{})\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(existsSync(join(ws.cwd, "__tests__", "a.test.ts"))).toBe(true);
    expect(git(ws.cwd, "ls-files")).toContain("__tests__/a.test.ts");
  });

  test("a nested _staged/ deeper in the tree is left alone", () => {
    const src = fixtureDir();
    mkdirSync(join(src, "pkg", "_staged"), { recursive: true });
    writeFileSync(join(src, "pkg", "_staged", "keep.txt"), "x\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "ls-files")).toContain("pkg/_staged/keep.txt");
  });
});

describe("createWorkspace — local remote (env.remote)", () => {
  // A4 fails ~2 of 3 runs because its fixture has no remote: the model reads a missing
  // upstream as "solo throwaway" and commits to main. A bare repo wired as origin makes
  // "shared work" true instead of asserted, with zero network dependency.
  test("wires a bare origin with an upstream-tracking main", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "README.md"), "docs\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent", remote: true });
    tmps.push(ws.cwd);

    expect(git(ws.cwd, "remote").trim()).toBe("origin");
    expect(git(ws.cwd, "rev-parse", "--abbrev-ref", "main@{upstream}").trim()).toBe("origin/main");
    // the baseline is actually ON the remote, so "diverged upstream" is constructible
    expect(git(ws.cwd, "rev-parse", "HEAD").trim()).toBe(git(ws.cwd, "rev-parse", "origin/main").trim());
  });

  test("push and fetch work offline against the bare origin", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "a.txt"), "1\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent", remote: true });
    tmps.push(ws.cwd);

    writeFileSync(join(ws.cwd, "a.txt"), "2\n", "utf8");
    git(ws.cwd, "-c", "user.email=t@local", "-c", "user.name=t", "commit", "-aqm", "second");
    git(ws.cwd, "push", "-q", "origin", "main");
    expect(git(ws.cwd, "rev-parse", "origin/main").trim()).toBe(git(ws.cwd, "rev-parse", "HEAD").trim());
    expect(() => git(ws.cwd, "fetch", "-q", "origin")).not.toThrow();
  });

  test("pending changes still land after the remote is wired", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "README.md"), "Teh\n", "utf8");
    mkdirSync(join(src, "_uncommitted"), { recursive: true });
    writeFileSync(join(src, "_uncommitted", "README.md"), "The\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent", remote: true });
    tmps.push(ws.cwd);

    expect(git(ws.cwd, "status", "--porcelain")).toContain("README.md");
    expect(git(ws.cwd, "remote").trim()).toBe("origin");
    // the uncommitted edit is NOT on the remote
    expect(git(ws.cwd, "show", "origin/main:README.md")).toBe("Teh\n");
  });

  test("empty-git also supports a remote", () => {
    const ws = createWorkspace("empty-git", { specDir: "/nonexistent", remote: true });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "remote").trim()).toBe("origin");
  });

  test("cleanup removes the bare origin too, not just the workspace", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "a.txt"), "1\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent", remote: true });
    const originPath = git(ws.cwd, "remote", "get-url", "origin").trim();
    expect(existsSync(originPath)).toBe(true);
    ws.cleanup();
    expect(existsSync(ws.cwd)).toBe(false);
    expect(existsSync(originPath)).toBe(false);
  });

  test("no remote by default — existing behaviour unchanged", () => {
    const src = fixtureDir();
    writeFileSync(join(src, "a.txt"), "1\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/nonexistent" });
    tmps.push(ws.cwd);
    expect(git(ws.cwd, "remote").trim()).toBe("");
  });
});
