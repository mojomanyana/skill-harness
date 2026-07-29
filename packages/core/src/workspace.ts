import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const GIT_TIMEOUT_MS = 30_000;

/** How a scenario's working directory is prepared. */
export type WorkspaceKind = "none" | "empty-git" | { fixture: string };

export interface Workspace {
  cwd: string; // absolute path to the isolated temp dir
  cleanup(): void; // remove the temp dir; idempotent, always safe to call
}

/**
 * A fixture subdirectory copied over the workspace AFTER the baseline commit, so its
 * files land as uncommitted changes. Lets a scenario start from a dirty tree — "I fixed
 * the typo, commit it" needs the fix present but not yet in history. Never committed,
 * and the marker directory itself never appears in the workspace.
 */
const UNCOMMITTED_DIR = "_uncommitted";

/**
 * git init + a baseline commit, so a later `git diff --cached` shows only edits.
 * Pinned to `main`: the host's init.defaultBranch is not ours to depend on, and
 * scenarios say things like "I'm on the main branch".
 */
function gitBaseline(cwd: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd, timeout: GIT_TIMEOUT_MS });
  execFileSync("git", ["add", "-A"], { cwd, timeout: GIT_TIMEOUT_MS });
  execFileSync(
    "git",
    ["-c", "user.email=sh@local", "-c", "user.name=skill-harness", "commit", "-q", "--allow-empty", "-m", "baseline"],
    { cwd, timeout: GIT_TIMEOUT_MS }
  );
}

/**
 * Create an isolated temp-dir working directory for one scenario. `none` is an
 * empty dir (no git); `empty-git` initialises a clean repo; `{ fixture }` copies
 * the fixture (relative paths resolve against `specDir`) then initialises a repo
 * with a baseline commit. A fixture may carry an `_uncommitted/` subdirectory,
 * applied after that commit to start the scenario from a dirty tree. Child
 * processes run here, never in the user's home.
 */
export function createWorkspace(kind: WorkspaceKind, opts: { specDir: string }): Workspace {
  const cwd = mkdtempSync(join(tmpdir(), "sc-ws-"));
  const cleanup = () => rmSync(cwd, { recursive: true, force: true });
  try {
    if (kind === "none") {
      // empty isolated dir; nothing to set up
    } else if (kind === "empty-git") {
      gitBaseline(cwd);
    } else {
      const src = isAbsolute(kind.fixture) ? kind.fixture : resolve(opts.specDir, kind.fixture);
      if (!existsSync(src)) throw new Error(`fixture not found: ${src}`);
      const uncommitted = join(src, UNCOMMITTED_DIR);
      const hasUncommitted = existsSync(uncommitted);
      cpSync(src, cwd, {
        recursive: true,
        filter: (from) => from !== uncommitted, // committed baseline only
      });
      gitBaseline(cwd);
      if (hasUncommitted) cpSync(uncommitted, cwd, { recursive: true });
    }
  } catch (e) {
    cleanup(); // never leak a temp dir on a setup failure
    throw e;
  }
  return { cwd, cleanup };
}
