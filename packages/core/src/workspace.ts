import { exec } from "./util/exec.js";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, type Dirent } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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
 *
 * `.pi/skills/` is the same class from a different writer: `seedArmDefinitions` copies
 * an arm's definitions there for pi-daddy to spawn, and that happens in the same
 * workspace `runSeeded` later runs `git add -A` + `git diff --cached` against.
 * Without this exclusion those seeded `.md` files land in the diff as
 * harness-injected `+` lines — a `diff_contains` needle can match text the model
 * never wrote (a false objective PASS), the judge is shown the seeded definitions
 * as if they were the model's edit, and `.pi/skills/*` reads as a model change for
 * `unchanged_paths`.
 *
 * `.pi/skills/` and NOT `.pi/`: only that one directory is harness-written. `.pi/`
 * at large is content the model can legitimately be asked to author, and excluding
 * all of it would make that work invisible to every gate — including for the
 * control arm, which seeds nothing.
 */
const TOOL_ARTIFACTS = ["node_modules/", "coverage/", ".vitest/", ".pi/skills/"];

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
 * A content snapshot of every file in a workspace: relative path → sha256.
 *
 * Taken immediately before the model runs, and compared after. Three reasons it
 * is a content walk rather than the obvious `git diff`:
 *
 * 1. **`git add -A` honours `.gitignore`.** The canonical assertion this feature
 *    exists for is `unchanged_paths: [".env"]`, and `.env` is the canonical
 *    gitignored file. Overwriting it produced an empty diff, which read as
 *    "observed, nothing changed" — a safety gate reporting green on precisely
 *    the file class that motivated it. It also covers `TOOL_ARTIFACTS`, which
 *    the harness itself writes into `.git/info/exclude`.
 * 2. **The baseline commit is not the pre-run state.** `createWorkspace` applies
 *    a fixture's `_staged/` and `_uncommitted/` trees AFTER `gitBaseline`, so
 *    those files are already dirty before the model does anything. Diffing
 *    against the baseline blamed the model for the fixture's own contents.
 * 3. **The harness writes to the workspace too** — `runSeeded` copies the
 *    post-test in. A snapshot taken after setup contains it, so it cancels out
 *    instead of being attributed to the model.
 */
export type PathSnapshot = Map<string, string>;

/** Never the model's work, and never worth hashing — matched on the entry NAME, at any depth. */
const SNAPSHOT_SKIP = new Set([".git", "node_modules", "coverage", ".vitest"]);

/**
 * Skipped by RELATIVE PATH, not by name: `.pi/skills/` is where an arm's seeded
 * definitions land, and only that directory is the harness's writing.
 *
 * Scoped to `skills/` rather than all of `.pi/` on purpose. `.pi/` is also a
 * perfectly ordinary thing for the model to be asked to write — a skill that
 * authors pi agent definitions does exactly that, and the corpus keeps a `.pi/`
 * at its own root — so skipping the whole directory would hide that work from
 * `unchanged_paths` (a vacuous pass) as well as from `diff_contains` (a false
 * FAIL), for the control arm too, which seeds nothing at all.
 */
const SNAPSHOT_SKIP_RELS = new Set([".pi/skills"]);

/** Snapshot a workspace, or null when there is no workspace to look at. */
export function snapshotPaths(cwd: string | undefined, kind: WorkspaceKind): PathSnapshot | null {
  if (kind === "none" || !cwd || !existsSync(cwd)) return null;
  const out: PathSnapshot = new Map();
  const walk = (dir: string, prefix: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // an unreadable subtree is not evidence about the model
    }
    for (const e of entries) {
      if (SNAPSHOT_SKIP.has(e.name)) continue;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (SNAPSHOT_SKIP_RELS.has(rel)) continue;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        walk(abs, rel);
      } else if (e.isFile()) {
        try {
          out.set(rel, createHash("sha256").update(readFileSync(abs)).digest("hex"));
        } catch {
          out.set(rel, "<unreadable>");
        }
      }
    }
  };
  walk(cwd, "");
  return out;
}

/**
 * Paths whose content changed between two snapshots — added, removed, modified.
 *
 * The ONLY evidence `assert.trace.unchanged_paths` can honestly rest on. A tool
 * trace proves which tool was called with which arguments; it cannot prove what
 * that tool then did to the filesystem, so a path policy has to be checked
 * against the filesystem.
 *
 * Returns null when either snapshot is missing — the caller must treat that as
 * MISSING EVIDENCE, never as "nothing changed". An empty array means
 * observed-and-nothing-changed; null means we could not look.
 */
export function diffSnapshots(before: PathSnapshot | null, after: PathSnapshot | null): string[] | null {
  if (!before || !after) return null;
  const changed = new Set<string>();
  for (const [path, hash] of after) if (before.get(path) !== hash) changed.add(path);
  for (const path of before.keys()) if (!after.has(path)) changed.add(path);
  return [...changed].sort();
}
