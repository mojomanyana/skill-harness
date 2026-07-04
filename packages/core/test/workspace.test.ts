import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";

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
