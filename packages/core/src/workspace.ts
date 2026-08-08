import { exec } from "./util/exec.js";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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
export const MARKERS = [STAGED_DIR, UNCOMMITTED_DIR];

/**
 * Top-level directories in a fixture that claim to be markers but aren't one.
 *
 * A misspelled marker (`_uncommited/`) used to be copied into the baseline commit as a
 * literal directory: the tree came up clean, the scenario silently measured the opposite
 * of its intent, and nothing reported it. Any top-level `_name/` is therefore treated as
 * a marker claim and must be a real one.
 *
 * The predicate is `_` followed by a LETTER, so `__tests__` and `__pycache__` — ordinary
 * directories a fixture may legitimately contain — are not marker claims, and neither are
 * oddities like `_2fa/` or `_-tmp/`, which no marker could plausibly be mistaken for.
 * Nested `pkg/_staged/` is likewise ordinary content: markers are top-level only.
 *
 * Exported so `lint` can report the same set this module refuses to run. If the two
 * disagreed, lint would hand out a clean bill of health for a fixture the runtime then
 * rejects — which is worse than not checking at all.
 */
export function unknownMarkerDirs(src: string): string[] {
  return readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^_[A-Za-z]/.test(e.name) && !MARKERS.includes(e.name))
    .map((e) => e.name)
    .sort();
}

/**
 * The known marker a misspelling was probably reaching for, or null.
 *
 * Case-insensitive within an edit distance of 2 — enough for `_uncommited` (one
 * dropped `t`), `_Staged` (case) and `_uncommmitted` (doubled letter), while
 * `_fixtures` or `_helpers` correctly suggest nothing rather than a confident
 * wrong guess.
 */
export function suggestMarker(name: string): string | null {
  let best: string | null = null;
  let bestDistance = 3;
  for (const m of MARKERS) {
    const d = editDistance(name.toLowerCase(), m.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = m;
    }
  }
  return best;
}

/** Levenshtein distance, iterative single-row. */
function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

function assertKnownMarkers(src: string): void {
  const suspects = unknownMarkerDirs(src);
  if (suspects.length > 0) {
    throw new Error(
      `fixture ${src}: unknown marker director${suspects.length > 1 ? "ies" : "y"} ` +
        `${suspects.map((s) => `\`${s}/\``).join(", ")} — known markers are ` +
        `${MARKERS.map((m) => `\`${m}/\``).join(" and ")}. Rename it, or move it deeper if it is ordinary content.`
    );
  }
}

/**
 * Paths a *tool* creates during a run, excluded from the workspace repo so they never
 * reach the captured diff.
 *
 * `runSeeded` records what the model did as `git add -A` + `git diff --cached`, which
 * cannot distinguish the model's edits from vitest's cache. Measured in all four
 * `post-diff-remeasure-full` runs of the reference corpus: every diff carried
 * `node_modules/.vite/vitest/<sha>/results.json`, whose contents are test file paths
 * and `"failed":false` booleans. No gate there was affected, but the channel runs both
 * ways — a `diff_contains` needle matching a test filename can pass for free, and a
 * `diff_excludes` needle can false-fail on a path string — and it pads every diff the
 * judge reads.
 */
const TOOL_ARTIFACTS = ["node_modules/", "coverage/", ".vitest/"];

/**
 * Exclude tool artifacts via `.git/info/exclude`, deliberately not a `.gitignore`.
 *
 * `.git/info/exclude` is not a worktree file, so: it cannot contaminate a scenario
 * that is *about* `.gitignore`, the model can neither read nor delete it, a fixture's
 * own `.gitignore` is left byte-identical, and it applies to every git call in the
 * workspace rather than to the ones someone remembered to add a pathspec to.
 */
function excludeToolArtifacts(cwd: string): void {
  const excludeFile = join(cwd, ".git", "info", "exclude");
  const existing = existsSync(excludeFile) ? readFileSync(excludeFile, "utf8") : "";
  const nl = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  appendFileSync(
    excludeFile,
    `${nl}# skill-harness: tool output, never the model's work\n${TOOL_ARTIFACTS.join("\n")}\n`,
    "utf8",
  );
}

/**
 * git init + a baseline commit, so a later `git diff --cached` shows only edits.
 * Pinned to `main`: the host's init.defaultBranch is not ours to depend on, and
 * scenarios say things like "I'm on the main branch".
 */
function gitBaseline(cwd: string): void {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd, timeout: GIT_TIMEOUT_MS });
  // Before the baseline `add -A`, so a fixture that ships a stray node_modules/ does
  // not commit it either.
  excludeToolArtifacts(cwd);
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

/**
 * Paths whose content changed in a workspace, relative to its baseline commit.
 *
 * The ONLY evidence `assert.trace.unchanged_paths` can honestly rest on. A tool
 * trace proves which tool was called with which arguments; it cannot prove what
 * that tool then did to the filesystem, so a path policy has to be checked
 * against the filesystem.
 *
 * Returns null when the workspace has no repo to compare against (`workspace:
 * none`) — the caller must treat that as MISSING EVIDENCE, never as "nothing
 * changed". An empty array means observed-and-nothing-changed; null means we
 * could not look.
 */
export async function observeChangedPaths(cwd: string, kind: WorkspaceKind): Promise<string[] | null> {
  if (kind === "none") return null;
  const add = await exec("git", ["add", "-A"], { cwd, timeoutMs: 30_000 });
  if (add.code !== 0) return null;
  const named = await exec("git", ["diff", "--cached", "--name-only"], { cwd, timeoutMs: 30_000 });
  if (named.code !== 0) return null;
  return named.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}
