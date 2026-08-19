import { copyFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { Scenario } from "./spec.js";
import type { ExecutionTraceV1 } from "./capture-trace-types.js";
import type { TrajectoryEventV1 } from "./trajectory-gates.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { exec, type ExecResult } from "./util/exec.js";
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
  /**
   * Trace metadata. Present when the scenario declares `assert.trace`, which
   * routes the subject through the adapter's structured (`--mode json`) path.
   */
  trace?: { scenarioId: string; rep: number };
}

/**
 * Result of one vitest invocation — deliberately `ExecResult`, not a narrower
 * shape of its own.
 *
 * An earlier version declared `code: number`. That narrowing was a lie the
 * compiler happened not to catch (the default's inferred type silently widened
 * it back), and it is unrepresentable in practice: `exec` SIGKILLs on timeout
 * and a signal-killed child closes with `code === null`. Declaring non-null
 * would have made the vitest gate's timeout path — the one an injected double
 * most needs to reproduce — impossible to express in a test.
 */
export type VitestRun = ExecResult;

/**
 * Filename STEM the post-test is copied to at the workspace root; the extension
 * (`.test.ts`) is appended at the copy site, which is the part that decides
 * whether vitest collects it at all.
 *
 * Harness-owned rather than the author's basename, for two reasons: it cannot
 * collide with a fixture file by accident, and a model cannot shadow the check by
 * creating a *file* at the path it guesses we will use — the copy happens after
 * the model is done and overwrites unconditionally. (A *directory* there makes
 * the copy fail; that is handled as an infrastructure error, not a model FAIL.)
 */
const POST_TEST_BASE = "skill-harness.post";

export interface SeededOutcome {
  transcript: string; // harness output + appended gate report + (capped) staged diff
  gateFailure: string | null; // non-null => objective gate failed (skip judge)
  gateError: string | null; // non-null => gate could not be evaluated (infrastructure/spec ERROR, never behavioral FAIL)
  diff: string; // the full staged diff, uncapped — caller persists it as a run artifact
  /** One per turn; empty unless structured execution was requested. */
  traces: ExecutionTraceV1[];
  /** Adapter-neutral workflow/tool events for assert.trajectory. */
  events: TrajectoryEventV1[];
  /** Required native sources that could not be read or normalized. */
  eventErrors: string[];
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
 * Classification is HUNK-AWARE rather than prefix-based, because `+++`/`---` are
 * only headers *outside* a hunk. Filtering on those prefixes anywhere would eat a
 * changed line whose own source text starts with `++` or `--` — `++counter;` at
 * column zero, a removed SQL/Lua `-- comment`, a YAML `---` separator. Those
 * became `+++counter;` and `--- comment` once the diff marker was prepended, were
 * read as headers, and vanished: `diff_excludes` then reported OK for a diff that
 * touched the forbidden symbol. A false PASS on an objective gate is worse than
 * the subjective check it replaced, so the parse follows the format instead of
 * guessing from prefixes.
 */
export function changedLines(diff: string): string {
  const out: string[] = [];
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true; // a hunk header opens the region where +/- mean "changed"
      continue;
    }
    if (line.startsWith("diff --git ")) {
      inHunk = false; // a new file section closes it; its ---/+++ are headers again
      continue;
    }
    if (!inHunk) continue; // index/mode/---/+++ preamble lines
    if (line.startsWith("+") || line.startsWith("-")) out.push(line);
  }
  return out.join("\n");
}

/** Whether a scenario declares any needle gate at all. */
export function hasNeedleGates(scenario: Scenario): boolean {
  return (scenario.assert?.diff_contains?.length ?? 0) > 0 || (scenario.assert?.diff_excludes?.length ?? 0) > 0;
}

/**
 * Evaluate `diff_contains` / `diff_excludes` against a staged diff: the trailer lines
 * to report, and the first failure (null when every needle is satisfied).
 *
 * A **pure function of the diff**, which is what makes `regate` possible — the saved
 * `.diff.txt` artifact holds everything these gates need, so correcting a needle never
 * requires re-running the model. Shared with `regate` deliberately: two copies of this
 * loop would let a regated verdict disagree with what a fresh run would have produced,
 * which is the same drift the fixture-marker check refuses between lint and runtime.
 *
 * Both gates read the CHANGED lines only, never context — see `changedLines`.
 */
export function evaluateNeedleGates(scenario: Scenario, diff: string): { lines: string[]; failure: string | null } {
  const changed = changedLines(diff);
  const lines: string[] = [];
  let failure: string | null = null;

  for (const needle of scenario.assert?.diff_contains ?? []) {
    const ok = changed.includes(needle);
    lines.push(`  diff_contains ${JSON.stringify(needle)}: ${ok ? "OK" : "MISSING"}`);
    if (!ok && !failure) failure = `staged diff missing ${JSON.stringify(needle)}`;
  }

  // Scope discipline, stated as a fact about the diff rather than inferred from
  // whether the model remembered to say "I left lastIndex alone".
  for (const needle of scenario.assert?.diff_excludes ?? []) {
    const ok = !changed.includes(needle);
    lines.push(`  diff_excludes ${JSON.stringify(needle)}: ${ok ? "OK" : "PRESENT"}`);
    if (!ok && !failure) failure = `staged diff touches forbidden ${JSON.stringify(needle)}`;
  }
  return { lines, failure };
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

  // Accumulate whole lines until the next one would exceed the budget. `used`
  // counts the separators actually emitted by join() — n lines carry n-1 of
  // them — so the omitted figure in the marker is exact rather than one byte
  // short. This file's whole thesis is telling the judge accurately what it was
  // not shown, so an off-by-one here is a small lie in the wrong place.
  const kept: string[] = [];
  let used = 0;
  for (const line of diff.split("\n")) {
    const cost = Buffer.byteLength(line, "utf8") + (kept.length > 0 ? 1 : 0);
    if (used + cost > maxBytes) break;
    kept.push(line);
    used += cost;
  }

  // A single line longer than the whole budget (a minified bundle, a lockfile,
  // a generated blob) would otherwise keep nothing at all and hand the judge a
  // marker with zero code under it. Show a byte-safe prefix instead: some
  // evidence beats none, and the marker still says what was cut.
  if (kept.length === 0) {
    const head = Buffer.from(diff, "utf8").subarray(0, maxBytes).toString("utf8");
    // toString() on a boundary-split multibyte sequence yields U+FFFD; drop a
    // trailing one rather than show the judge a corrupted character.
    const clean = head.endsWith("�") ? head.slice(0, -1) : head;
    kept.push(clean);
    used = Buffer.byteLength(clean, "utf8");
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
 * the repo, then evaluate the objective gates it declares — `diff_contains`,
 * `diff_excludes`, `vitest` and `post_test`. Every gate that is configured runs;
 * the FIRST failure is what `gateFailure` reports, and a non-null `gateFailure`
 * makes the scenario an auto-FAIL that never reaches the judge.
 *
 * Returns the full staged diff alongside the transcript: the caller persists it
 * as a run artifact, and a size-capped copy is appended to the transcript under
 * `=== STAGED DIFF ===` so the judge grades the code rather than the model's
 * description of it. Workspace creation (fixture copy + git baseline) and
 * teardown are the caller's responsibility (run.ts).
 */
export async function runSeeded(scenario: Scenario, opts: SeededOpts): Promise<SeededOutcome> {
  const repo = opts.cwd;

  const req = {
    skillDir: opts.skillDir,
    model: opts.model,
    mode: opts.mode,
    turns: scenario.turns,
    cwd: repo,
    // Resolved against the spec dir, exactly like fixtures and post-tests.
    extensions: scenario.extensions?.map((e) => resolve(opts.specDir, e)),
    eventSources: scenario.eventSources,
  };
  // A trace-gated seeded scenario runs through the structured path so the tool
  // calls are recorded; everything downstream (gates, diff, transcript) is
  // identical, because the rebuilt transcript is what print mode would have
  // emitted anyway.
  let traces: ExecutionTraceV1[] = [];
  let events: TrajectoryEventV1[] = [];
  let eventErrors: string[] = [];
  let harnessOut: string;
  if (opts.trace) {
    if (!opts.adapter.runStructured) {
      throw new Error(
        `scenario \`${opts.trace.scenarioId}\` declares \`assert.trace\`, but the \`${opts.adapter.name}\` adapter` +
          ` cannot produce execution traces — the gate would have no evidence to read.`,
      );
    }
    const structured = await opts.adapter.runStructured({
      ...req,
      scenarioId: opts.trace.scenarioId,
      rep: opts.trace.rep,
    });
    harnessOut = structured.transcript;
    traces = structured.traces;
    events = structured.events ?? [];
    eventErrors = structured.eventErrors ?? [];
  } else {
    harnessOut = await opts.adapter.run(req);
  }

  const parts: string[] = [harnessOut, "", "=== SEEDED GATES ==="];
  let gateFailure: string | null = null;
  let gateError: string | null = null;
  const runVitest: NonNullable<SeededOpts["runVitest"]> =
    opts.runVitest ??
    ((args, cwd) => exec("npx", ["vitest", "run", ...args], { cwd, timeoutMs: VITEST_TIMEOUT_MS }));

  // `exec` never throws on a non-zero exit and, on timeout, SIGKILLs the child and
  // resolves with whatever stdout accumulated (code === null). Ignoring that here
  // let a truncated or failed capture flow into every downstream consumer as
  // evidence: diff_contains FAILs blamed on the model, diff_excludes silently
  // passing, the transcript asserting "the model left no staged changes", and a
  // partial diff persisted as the "complete" artifact — under the cap, so the
  // truncation marker never fires. A capture we cannot trust is infrastructure,
  // and must say so instead of being graded.
  const add = await git(repo, ["add", "-A"]);
  const show = await git(repo, ["diff", "--cached"]);
  const diff = show.stdout;
  const gitFailure = [add, show].find((r) => r.code !== 0);
  if (gitFailure) {
    const why = gitFailure.code === null ? "timed out and was killed" : `exited ${gitFailure.code}`;
    const msg =
      `staged diff could not be captured — git ${why} — infrastructure, not model behavior` +
      (gitFailure.stderr.trim() ? `: ${gitFailure.stderr.trim().split("\n")[0]}` : "");
    parts.push(`  staged diff: ERROR (${msg})`);
    gateFailure = msg;
    gateError = msg;
    return finish(parts, gateFailure, gateError, diff, traces, events, eventErrors);
  }

  // BOTH needle gates read the changed lines only, never context. A unified diff
  // carries three lines of context per hunk, so an untouched symbol near the edit
  // site appears verbatim in the diff text — and matching that means neither gate
  // is answering the question it was asked.
  //
  // The positive gate is the one this was measured on. `build` A4 asserts
  // diff_contains ["divide", "ok"], and its fixture's baseline already contains
  // both — `ok` in `{ ok: true; value: T }`, `divide` inside `divideByZero` — so
  // any edit near those lines satisfied the gate whether or not the model wrote
  // either token. Every published A4 result recorded that as an objective pass.
  // Read against changed lines it means what the checklist means: the model
  // returned a Result.
  const needles = evaluateNeedleGates(scenario, diff);
  parts.push(...needles.lines);
  if (needles.failure && !gateFailure) gateFailure = needles.failure;

  if (scenario.assert?.vitest) {
    const v = await runVitest([], repo);
    // code === null means exec SIGKILLed it at the timeout. That is infrastructure,
    // not a failing test, and must not be reported as the model's fault.
    const killed = v.code === null;
    const passed = v.code === 0;
    parts.push(
      killed
        ? `  vitest run: ERROR (timed out after ${VITEST_TIMEOUT_MS}ms — infrastructure, not model behavior)`
        : `  vitest run: ${passed ? "PASS" : `FAIL (exit ${v.code})`}`
    );
    parts.push(indent(bothStreams(v)));
    if (!passed) {
      const problem = killed
        ? `vitest timed out after ${VITEST_TIMEOUT_MS}ms — infrastructure, not model behavior`
        : `vitest failed (exit ${v.code})`;
      if (!gateFailure) gateFailure = problem;
      if (killed) gateError = problem;
    }
  }

  const postTest = scenario.assert?.post_test;
  if (postTest) {
    const src = isAbsolute(postTest) ? postTest : resolve(opts.specDir, postTest);
    // statSync().isFile(), not existsSync: a DIRECTORY "exists", and copyFileSync
    // then throws EISDIR. That rejection escapes runSeeded, and runRep guards only
    // workspace setup — so it reaches runSkillModel, writeResults never runs, and a
    // paid multi-scenario run loses every scenario already completed. One spec typo
    // (`post_test: post` for `post/A1.test.ts`) must cost a scenario, not a run.
    if (!isReadableFile(src)) {
      // Not model behavior. It still fails the scenario — a silently skipped gate is
      // worse than a loud one — but the message says whose fault it is so nobody
      // reads it as "the model broke the test".
      const msg = `post_test is not a readable file: ${postTest} — spec error, not model behavior`;
      parts.push(`  post_test: ERROR (${msg})`);
      if (!gateFailure) gateFailure = msg;
      gateError = msg;
    } else {
      // `.test` is part of the name we build, never taken from the source: extname()
      // of "A2.test.ts" is ".ts", so appending only that produced
      // "skill-harness.post.ts" — a file vitest does not collect as a test at all,
      // which would have made the gate silently vacuous.
      const dest = join(repo, `${POST_TEST_BASE}.test${extname(src) || ".ts"}`);
      try {
        copyFileSync(src, dest);
      } catch (e) {
        // Permissions, a race, a full disk. Same reasoning as the branch above:
        // degrade this scenario, never take the whole run down with it.
        const msg =
          `post_test could not be copied into the workspace ` +
          `(${e instanceof Error ? e.message : String(e)}) — infrastructure, not model behavior`;
        parts.push(`  post_test: ERROR (${msg})`);
        if (!gateFailure) gateFailure = msg;
        gateError = msg;
        return finish(parts, gateFailure, gateError, diff, traces, events, eventErrors);
      }
      const v = await runVitest([POST_TEST_BASE], repo);
      const out = `${v.stdout}\n${v.stderr}`;

      // This gate must never pass without positive evidence that assertions ran.
      // Absence-of-failure is not enough: a `.skip`/`.todo` left in the file exits
      // ZERO and prints "Tests  1 skipped", so keying off the exit code reported
      // PASS for a hidden gate that executed nothing — the exact vacuous-gate
      // shape post_test exists to prevent, and one nobody would ever notice
      // because a passing gate produces output no one reads.
      const tally = vitestTally(out);
      // Anchored to line start: the unanchored form also matched this string
      // appearing anywhere in test output or a model-authored console.log, which
      // would flip a genuine pass into a phantom "fixture is broken". The exact
      // wording is vitest's ("No test files found, exiting with code 1", verified
      // against 2.1.9) — recheck it when the vitest major changes.
      const notCollected = /^\s*No test files found/im.test(out);
      const killed = v.code === null;

      let problem: string | null = null;
      let problemIsError = false;
      if (killed) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} timed out after ${VITEST_TIMEOUT_MS}ms — infrastructure, not model behavior`;
      } else if (notCollected) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} was never collected by vitest — spec/fixture error, not model behavior`;
      } else if (tally === null) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} produced no parseable vitest summary (exit ${v.code}) — cannot confirm it ran`;
      } else if (v.code !== 0 || tally.failed > 0) {
        // A real failure is checked BEFORE the vacuity conditions below: a run
        // where everything failed also has zero passes, and reporting that as
        // "ran no assertions" would point the author at their spec instead of at
        // the model's code, which is the actual news.
        problem = `post_test ${JSON.stringify(postTest)} failed (exit ${v.code})`;
      } else if (tally.skipped > 0 || tally.todo > 0) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} has ${tally.skipped + tally.todo} skipped/todo test(s) — a hidden gate must actually run; spec error, not model behavior`;
      } else if (tally.passed === 0) {
        problemIsError = true;
        problem = `post_test ${JSON.stringify(postTest)} ran no assertions — spec error, not model behavior`;
      }

      parts.push(
        problem === null
          ? `  post_test ${JSON.stringify(postTest)}: PASS (${tally!.passed} assertion-bearing test(s))`
          : `  post_test ${JSON.stringify(postTest)}: ${problemIsError ? "ERROR" : "FAIL"} (${problem})`
      );
      parts.push(indent(bothStreams(v)));
      if (problem && !gateFailure) gateFailure = problem;
      if (problem && problemIsError) gateError = problem;
    }
  }

  return finish(parts, gateFailure, gateError, diff, traces, events, eventErrors);
}

function git(cwd: string, args: string[]) {
  return exec("git", args, { cwd, timeoutMs: 30_000 });
}

function indent(s: string): string {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}

/** True only for a regular file we can stat. Never throws — a directory, a dangling symlink or EACCES all read as "not usable". */
function isReadableFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Both streams, labelled.
 *
 * The previous `stdout.trim() || stderr.trim()` dropped stderr entirely whenever
 * stdout was non-empty — which it always is once vitest prints its banner. That
 * discarded exactly the diagnostics worth keeping, including exec's own
 * `[skill-harness] killed after …ms timeout` notice, leaving a transcript that
 * showed partial test output and an unexplained failure.
 */
function bothStreams(v: VitestRun): string {
  const o = v.stdout.trim();
  const e = v.stderr.trim();
  if (o && e) return `${o}\n[stderr]\n${e}`;
  return o || e;
}

/** Append the staged diff and return the outcome. Every exit path goes through here, so the judge always sees the same sections in the same order. */
function finish(
  parts: string[], gateFailure: string | null, gateError: string | null, diff: string,
  traces: ExecutionTraceV1[] = [], events: TrajectoryEventV1[] = [], eventErrors: string[] = [],
): SeededOutcome {
  // The code itself, last — the gates above only prove that keywords appeared.
  // Without this section a seeded checklist item about what the code *does* is
  // graded from the model's own description of its work.
  parts.push("", "=== STAGED DIFF ===");
  parts.push(diff.trim() === "" ? "  (empty — the model left no staged changes)" : capDiff(diff));
  return { transcript: parts.join("\n"), gateFailure, gateError, diff, traces, events, eventErrors };
}

export interface VitestTally {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
}

/**
 * Parse vitest's `Tests  N passed | M skipped (T)` summary line.
 *
 * Used to require positive evidence that a hidden `post_test` actually executed
 * assertions, rather than trusting a zero exit code — which vitest also returns
 * when every test in the file is skipped. Returns null when no summary line is
 * present, which the caller treats as "cannot confirm it ran" rather than as a
 * pass.
 */
export function vitestTally(out: string): VitestTally | null {
  const line = /^\s*Tests\s+(.+)$/m.exec(out);
  if (!line) return null;
  const read = (word: string): number => {
    const m = new RegExp(`(\\d+)\\s+${word}`).exec(line[1]);
    return m ? Number(m[1]) : 0;
  };
  return { passed: read("passed"), failed: read("failed"), skipped: read("skipped"), todo: read("todo") };
}
