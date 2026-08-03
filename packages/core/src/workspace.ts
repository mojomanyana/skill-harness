import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
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
 * Fixture subdirectories copied over the workspace AFTER the baseline commit, so their
 * files land as pending changes rather than history. Lets a scenario start from a dirty
 * tree — "I fixed the typo, commit it" needs the fix present but not yet committed, and
 * "commit my staged changes" needs a populated index. `_staged/` contents are added to
 * the index, `_uncommitted/` contents are left unstaged; a fixture may use either or
 * both. Neither marker directory ever appears in the workspace.
 */
const UNCOMMITTED_DIR = "_uncommitted";
const STAGED_DIR = "_staged";
const MARKERS = [STAGED_DIR, UNCOMMITTED_DIR];

/**
 * A misspelled marker (`_uncommited/`) used to be copied into the baseline commit as a
 * literal directory: the tree came up clean, the scenario silently measured the opposite
 * of its intent, and nothing reported it. Any top-level `_name/` is therefore treated as
 * a marker claim and must be a real one.
 *
 * Only a SINGLE leading underscore counts, so `__tests__` and `__pycache__` — ordinary
 * directories a fixture may legitimately contain — are not marker claims. Nested
 * `pkg/_staged/` is likewise ordinary content: markers are top-level only.
 */
function assertKnownMarkers(src: string): void {
  const suspects = readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^_[A-Za-z]/.test(e.name) && !MARKERS.includes(e.name))
    .map((e) => e.name);
  if (suspects.length > 0) {
    throw new Error(
      `fixture ${src}: unknown marker director${suspects.length > 1 ? "ies" : "y"} ` +
        `${suspects.map((s) => `\`${s}/\``).join(", ")} — known markers are ` +
        `${MARKERS.map((m) => `\`${m}/\``).join(" and ")}. Rename it, or move it deeper if it is ordinary content.`
    );
  }
}

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
 * Wire a bare repo in its own temp dir as `origin` and push the baseline, so `main`
 * tracks `origin/main` and the baseline commit genuinely exists upstream.
 *
 * Without this, a git fixture has no remote — and a model reasonably reads a missing
 * upstream as "solo throwaway repo", which is how git-ops A4 passes or fails depending
 * on the run. A real remote makes "shared work" a fact of the fixture rather than a
 * claim in the prompt, and needs no network.
 */
function addLocalRemote(cwd: string): string {
  const bare = mkdtempSync(join(tmpdir(), "sc-remote-")) + ".git";
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare], { timeout: GIT_TIMEOUT_MS });
  execFileSync("git", ["remote", "add", "origin", bare], { cwd, timeout: GIT_TIMEOUT_MS });
  execFileSync("git", ["push", "-q", "-u", "origin", "main"], { cwd, timeout: GIT_TIMEOUT_MS });
  return bare;
}

/**
 * Create an isolated temp-dir working directory for one scenario. `none` is an
 * empty dir (no git); `empty-git` initialises a clean repo; `{ fixture }` copies
 * the fixture (relative paths resolve against `specDir`) then initialises a repo
 * with a baseline commit. A fixture may carry top-level `_staged/` and
 * `_uncommitted/` subdirectories, applied after that commit to start the scenario
 * from a dirty tree. `opts.remote` additionally wires a local bare `origin`.
 * Child processes run here, never in the user's home.
 */
export function createWorkspace(kind: WorkspaceKind, opts: { specDir: string; remote?: boolean }): Workspace {
  const cwd = mkdtempSync(join(tmpdir(), "sc-ws-"));
  let bare: string | null = null;
  const cleanup = () => {
    rmSync(cwd, { recursive: true, force: true });
    if (bare) rmSync(bare, { recursive: true, force: true }); // the remote is ours too
  };
  try {
    if (kind === "none") {
      // empty isolated dir; nothing to set up
    } else if (kind === "empty-git") {
      gitBaseline(cwd);
      if (opts.remote) bare = addLocalRemote(cwd);
    } else {
      const src = isAbsolute(kind.fixture) ? kind.fixture : resolve(opts.specDir, kind.fixture);
      if (!existsSync(src)) throw new Error(`fixture not found: ${src}`);
      assertKnownMarkers(src);
      const pending = [STAGED_DIR, UNCOMMITTED_DIR].map((d) => join(src, d));
      cpSync(src, cwd, {
        recursive: true,
        filter: (from) => !pending.includes(from), // committed baseline only
      });
      gitBaseline(cwd);
      // Before the pending changes land, so the remote holds the baseline only.
      if (opts.remote) bare = addLocalRemote(cwd);
      const [staged, uncommitted] = pending;
      if (existsSync(staged)) {
        cpSync(staged, cwd, { recursive: true });
        execFileSync("git", ["add", "-A"], { cwd, timeout: GIT_TIMEOUT_MS });
      }
      if (existsSync(uncommitted)) cpSync(uncommitted, cwd, { recursive: true });
    }
  } catch (e) {
    cleanup(); // never leak a temp dir on a setup failure
    throw e;
  }
  return { cwd, cleanup };
}
