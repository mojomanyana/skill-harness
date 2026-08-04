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
}

export interface SeededOutcome {
  transcript: string; // harness output + appended gate report + (capped) staged diff
  gateFailure: string | null; // non-null => objective gate failed (auto-FAIL, skip judge)
  diff: string; // the full staged diff, uncapped — caller persists it as a run artifact
}

const VITEST_TIMEOUT_MS = envNum("VITEST_TIMEOUT_MS", 120_000);

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

  const wantDiff = scenario.assert?.diff_contains ?? [];
  for (const needle of wantDiff) {
    const ok = diff.includes(needle);
    parts.push(`  diff_contains ${JSON.stringify(needle)}: ${ok ? "OK" : "MISSING"}`);
    if (!ok && !gateFailure) gateFailure = `staged diff missing ${JSON.stringify(needle)}`;
  }

  if (scenario.assert?.vitest) {
    const v = await exec("npx", ["vitest", "run"], { cwd: repo, timeoutMs: VITEST_TIMEOUT_MS });
    const passed = v.code === 0;
    parts.push(`  vitest run: ${passed ? "PASS" : `FAIL (exit ${v.code})`}`);
    parts.push(indent(v.stdout.trim() || v.stderr.trim()));
    if (!passed && !gateFailure) gateFailure = `vitest failed (exit ${v.code})`;
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
