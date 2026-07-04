import { join } from "node:path";
import type { Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef, RunMode } from "./adapters/types.js";
import { exec } from "./util/exec.js";

interface SeededOpts {
  skillDir: string;
  adapter: HarnessAdapter;
  model: ModelRef;
  mode: RunMode;
  cwd: string; // a workspace already prepared for this scenario (fixture + git baseline)
}

export interface SeededOutcome {
  transcript: string; // harness output + appended gate report
  gateFailure: string | null; // non-null => objective gate failed (auto-FAIL, skip judge)
}

const VITEST_TIMEOUT_MS = Number(process.env.SKILL_CHECK_VITEST_TIMEOUT_MS ?? 120_000);

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

  return { transcript: parts.join("\n"), gateFailure };
}

function git(cwd: string, args: string[]) {
  return exec("git", args, { cwd, timeoutMs: 30_000 });
}

function indent(s: string): string {
  return s.split("\n").map((l) => `    ${l}`).join("\n");
}
