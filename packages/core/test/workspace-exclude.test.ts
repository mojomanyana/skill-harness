import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";

/** A fixture dir with one committed file. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "sh-fx-"));
  writeFileSync(join(dir, "app.ts"), "export const x = 1;\n", "utf8");
  return dir;
}

function stagedDiff(cwd: string): string {
  execFileSync("git", ["add", "-A"], { cwd });
  return execFileSync("git", ["diff", "--cached"], { cwd, encoding: "utf8" });
}

/**
 * `runSeeded` captures what the model did with `git add -A` + `git diff --cached`.
 * Anything a *tool* dropped in the workspace lands in that diff too, and in all four
 * `post-diff-remeasure-full` runs of the reference corpus that meant vitest's cache:
 *
 *   diff --git a/node_modules/.vite/vitest/<sha>/results.json ...
 *   +{"version":"4.1.10","results":[[":account.test.ts",{"duration":2.3,"failed":false}]]}
 *
 * No gate in that corpus was affected, but the channel runs both ways — the cached
 * JSON carries test *file paths* and `"failed":false` booleans, so a `diff_contains`
 * needle matching a test filename can pass for free, and a `diff_excludes` needle can
 * false-fail on a path string. It also pads every diff the judge reads.
 */
describe("workspace git excludes tooling droppings from the captured diff", () => {
  test("a vitest cache written during the run does not reach the staged diff", () => {
    const ws = createWorkspace({ fixture: fixture() }, { specDir: "/" });
    try {
      // What `npx vitest run` leaves behind inside the workspace.
      mkdirSync(join(ws.cwd, "node_modules", ".vite", "vitest", "abc123"), { recursive: true });
      writeFileSync(
        join(ws.cwd, "node_modules", ".vite", "vitest", "abc123", "results.json"),
        '{"version":"4.1.10","results":[[":account.test.ts",{"duration":2.3,"failed":false}]]}',
        "utf8",
      );
      writeFileSync(join(ws.cwd, "app.ts"), "export const x = 2;\n", "utf8");

      const diff = stagedDiff(ws.cwd);
      expect(diff).toContain("app.ts"); // the model's real edit still shows
      expect(diff).not.toContain("node_modules");
      expect(diff).not.toContain("results.json");
    } finally {
      ws.cleanup();
    }
  });

  test("coverage output is excluded too", () => {
    const ws = createWorkspace({ fixture: fixture() }, { specDir: "/" });
    try {
      mkdirSync(join(ws.cwd, "coverage"), { recursive: true });
      writeFileSync(join(ws.cwd, "coverage", "lcov.info"), "TN:\nSF:app.ts\n", "utf8");
      expect(stagedDiff(ws.cwd)).not.toContain("coverage/");
    } finally {
      ws.cleanup();
    }
  });

  // `.git/info/exclude` rather than a `.gitignore` file or pathspec juggling: it is
  // not a worktree file, so it cannot contaminate a scenario that is *about*
  // `.gitignore`, the model cannot read or delete it, and it applies to every git
  // call in the workspace rather than to the ones someone remembered to annotate.
  test("the exclusion is invisible to the model — no worktree file, nothing to stage", () => {
    const ws = createWorkspace({ fixture: fixture() }, { specDir: "/" });
    try {
      expect(existsSync(join(ws.cwd, ".gitignore"))).toBe(false);
      expect(readFileSync(join(ws.cwd, ".git", "info", "exclude"), "utf8")).toContain("node_modules/");
      expect(execFileSync("git", ["status", "--short"], { cwd: ws.cwd, encoding: "utf8" }).trim()).toBe("");
    } finally {
      ws.cleanup();
    }
  });

  // A fixture that ships its own .gitignore keeps it, verbatim: the exclusion lives
  // somewhere else entirely, so it cannot collide with fixture content.
  test("a fixture's own .gitignore is untouched", () => {
    const src = fixture();
    writeFileSync(join(src, ".gitignore"), "dist/\n", "utf8");
    const ws = createWorkspace({ fixture: src }, { specDir: "/" });
    try {
      expect(readFileSync(join(ws.cwd, ".gitignore"), "utf8")).toBe("dist/\n");
    } finally {
      ws.cleanup();
    }
  });

  test("an empty-git workspace gets the same treatment", () => {
    const ws = createWorkspace("empty-git", { specDir: "/" });
    try {
      mkdirSync(join(ws.cwd, "node_modules"), { recursive: true });
      writeFileSync(join(ws.cwd, "node_modules", "junk.json"), "{}", "utf8");
      expect(stagedDiff(ws.cwd)).not.toContain("node_modules");
    } finally {
      ws.cleanup();
    }
  });

  // `none` has no repo at all, so there is nothing to write into and nothing to break.
  test("a non-git workspace is left alone", () => {
    const ws = createWorkspace("none", { specDir: "/" });
    try {
      expect(existsSync(join(ws.cwd, ".git"))).toBe(false);
    } finally {
      ws.cleanup();
    }
  });
});
