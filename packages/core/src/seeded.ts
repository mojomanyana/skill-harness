import { copyFileSync, existsSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { exec } from "./util/exec.js";
import { envNum } from "./util/env.js";

interface SeededOpts {
  skillDir: string;
  adapter: HarnessAdapter;
  model: ModelRef;
  mode: RunMode;
  cwd: string; // a workspace already prepared for this scenario (fixture + git baseline)
  specDir: string; // dir of specification.yaml — assert.post_test resolves against it, like fixtures
  /**
   * How the vitest gates shell out. Defaults to the real `npx vitest run`.
   *
   * A seam, not a mock: a workspace is a bare temp dir, so a test that exercised
   * the real runner would resolve vitest off the network and be slow and flaky.
   * Injecting it lets the gate LOGIC — pass, fail, nothing-collected — be tested
   * deterministically.
   */
  runVitest?: (args: string[], cwd: string) => Promise<VitestRun>;
}

export interface VitestRun {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Filename the post-test is copied to, at the workspace root.
 *
 * Harness-owned rather than the author's basename, for two reasons: it cannot
 * collide with a fixture file by accident, and a model cannot shadow the check
 * by creating a file at the path it guesses we will use — the copy happens after
 * the model is done and overwrites unconditionally.
 */
const POST_TEST_BASE = "skill-harness.post";

export interface SeededOutcome {
  transcript: string; // harness output + appended gate report + (capped) staged diff
  gateFailure: string | null; // non-null => objective gate failed (auto-FAIL, skip judge)
  diff: string; // the full staged diff, uncapped — caller persists it as a run artifact
}

const VITEST_TIMEOUT_MS = envNum("VITEST_TIMEOUT_MS", 120_000);

/**
 * The added/removed lines of a unified diff — what the model actually *changed*,
 * with context lines and file headers dropped.
 *
 * This is the difference between "the diff mentions `lastIndex`" and "the model
 * touched `lastIndex`". A unified diff carries three lines of context around every
 * hunk, so an untouched function sitting near the edit site appears in the diff
 * verbatim. `build` A2 is exactly that shape — its checklist notes that `lastIndex`
 * "sits two lines from the edit site" — so a naive substring test against the whole
 * diff would fail the scenario for every model that fixed the right thing, which is
 * worse than the prose-dependent item it replaces.
 *
 * `+++`/`---` file headers are excluded too: a path containing the needle would
 * otherwise trip the gate on every hunk of that file.
 */
export function changedLines(diff: string): string {
  return diff
    .split("\n")
    .filter((l) => (l.startsWith("+") || l.startsWith("-")) && !l.startsWith("+++") && !l.startsWith("---"))
    .join("\n");
}

/**
 * Byte cap on the diff copy embedded in the judged transcript. The judge prompt
 * is a single request, so an unbounded diff (a fixture-wide refactor, a
 * regenerated lockfile) could overflow the context window and turn a gradeable
 * run into a judge ERROR. The artifact on disk is never capped — only the copy
 * the judge reads.
 */
const DIFF_MAX_BYTES = envNum("DIFF_MAX_BYTES", 64_000);

/**
 * Cut a diff to a byte budget on a line boundary, appending an explicit marker
 * naming how much was dropped.
 *
 * The marker is not decoration: a silently truncated diff would let the judge
 * grade "the function is missing" when it was merely cut off, which is the exact
 * class of false-FAIL this whole change exists to remove. Truncation is reported
 * as a fact about the transcript, and the untruncated diff is always on disk.
 */
export function capDiff(diff: string, maxBytes: number = DIFF_MAX_BYTES): string {
  const total = Buffer.byteLength(diff, "utf8");
  if (total <= maxBytes) return diff;

  // Accumulate whole lines until the next one would exceed the budget.
  const kept: string[] = [];
  let used = 0;
  for (const line of diff.split("\n")) {
    const cost = Buffer.byteLength(line, "utf8") + 1; // +1 for the newline
    if (used + cost > maxBytes) break;
    kept.push(line);
    used += cost;
  }
  const omitted = total - used;
  return (
    kept.join("\n") +
    `\n[… diff truncated: ${omitted} of ${total} bytes omitted (cap ${maxBytes}). ` +
    `The complete diff is saved beside this transcript as this scenario's .diff.txt artifact. ` +
    `Do not treat anything below the cut as absent — it was not shown to you. …]`
  );
}

/**
 * Run a seeded scenario inside a caller-prepared workspace: let the harness edit
 * the repo, then evaluate objective gates (staged-diff contains + optional vitest
 * pass). A failed gate short-circuits to an auto-FAIL. Workspace creation (fixture
 * copy + git baseline) and teardown are the caller's responsibility (run.ts).
 */
export async function runSeeded(scenario: Scenario, opts: SeededOpts): Promise<SeededOutcome> {
  const repo = opts.cwd;

  const harnessOut = await opts.adapter.run({
    skillDir: opts.skillDir,
    model: opts.model,
    mode: opts.mode,
    turns: scenario.turns,
    cwd: repo,
  });

  await git(repo, ["add", "-A"]);
  const diff = (await git(repo, ["diff", "--cached"])).stdout;

  const parts: string[] = [harnessOut, "", "=== SEEDED GATES ==="];
  let gateFailure: string | null = null;
  const runVitest =
    opts.runVitest ??
    ((args: string[], cwd: string) => exec("npx", ["vitest", "run", ...args], { cwd, timeoutMs: VITEST_TIMEOUT_MS }));

  const wantDiff = scenario.assert?.diff_contains ?? [];
  for (const needle of wantDiff) {
    const ok = diff.includes(needle);
    parts.push(`  diff_contains ${JSON.stringify(needle)}: ${ok ? "OK" : "MISSING"}`);
    if (!ok && !gateFailure) gateFailure = `staged diff missing ${JSON.stringify(needle)}`;
  }

  // Scope discipline, stated as a fact about the diff rather than inferred from
  // whether the model remembered to say "I left lastIndex alone". Matched against
  // CHANGED lines only — see changedLines(): context lines mention code the model
  // never touched, and a negative needle must not fire on those.
  const excludes = scenario.assert?.diff_excludes ?? [];
  if (excludes.length > 0) {
    const changed = changedLines(diff);
    for (const needle of excludes) {
      const ok = !changed.includes(needle);
      parts.push(`  diff_excludes ${JSON.stringify(needle)}: ${ok ? "OK" : "PRESENT"}`);
      if (!ok && !gateFailure) gateFailure = `staged diff touches forbidden ${JSON.stringify(needle)}`;
    }
  }

  if (scenario.assert?.vitest) {
    const v = await runVitest([], repo);
    const passed = v.code === 0;
    parts.push(`  vitest run: ${passed ? "PASS" : `FAIL (exit ${v.code})`}`);
    parts.push(indent(v.stdout.trim() || v.stderr.trim()));
    if (!passed && !gateFailure) gateFailure = `vitest failed (exit ${v.code})`;
  }

  const postTest = scenario.assert?.post_test;
  if (postTest) {
    const src = isAbsolute(postTest) ? postTest : resolve(opts.specDir, postTest);
    if (!existsSync(src)) {
      // A missing post-test is a spec bug, not model behavior. It still fails the
      // scenario (a silently skipped gate is worse than a loud one), but the message
      // has to say whose fault it is so nobody reads it as "the model broke the test".
      const msg = `post_test file not found: ${postTest} — spec error, not model behavior`;
      parts.push(`  post_test: ERROR (${msg})`);
      if (!gateFailure) gateFailure = msg;
    } else {
      // `.test` is part of the name we build, never taken from the source: extname()
      // of "A2.test.ts" is ".ts", so appending only that produced
      // "skill-harness.post.ts" — a file vitest does not collect as a test at all,
      // which would have made the gate silently vacuous.
      const dest = join(repo, `${POST_TEST_BASE}.test${extname(src) || ".ts"}`);
      copyFileSync(src, dest);
      const v = await runVitest([POST_TEST_BASE], repo);
      const out = v.stdout + v.stderr;
      // Vitest exits non-zero when it finds nothing to run, which would otherwise
      // read as "the model's code failed the hidden test" when in fact the test was
      // never executed — the fixture's `include` patterns didn't cover the root.
      const notCollected = /No test files found/i.test(out);
      const passed = v.code === 0 && !notCollected;
      parts.push(
        notCollected
          ? `  post_test: ERROR (${postTest} was copied in but vitest collected no tests — check the fixture's include patterns)`
          : `  post_test ${JSON.stringify(postTest)}: ${passed ? "PASS" : `FAIL (exit ${v.code})`}`
      );
      parts.push(indent(v.stdout.trim() || v.stderr.trim()));
      if (!passed && !gateFailure) {
        gateFailure = notCollected
          ? `post_test ${JSON.stringify(postTest)} was never collected by vitest — spec/fixture error, not model behavior`
          : `post_test ${JSON.stringify(postTest)} failed (exit ${v.code})`;
      }
    }
  }

  // The code itself, last — the gates above only prove that keywords appeared.
  // Without this section a seeded checklist item about what the code *does* is
  // graded from the model's own description of its work.
  parts.push("", "=== STAGED DIFF ===");
  parts.push(
    diff.trim() === ""
      ? "  (empty — the model left no staged changes)"
      : capDiff(diff)
  );

  return { transcript: parts.join("\n"), gateFailure, diff };
}

function git(cwd: string, args: string[]) {
  return exec("git", args, { cwd, timeoutMs: 30_000 });
}

function indent(s: string): string {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}
