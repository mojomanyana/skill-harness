import { cpSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, isAbsolute, resolve } from "node:path";
import type { Scenario } from "./spec.js";
import { exec } from "./util/exec.js";

// Imported lazily-typed to avoid a circular import with run.ts.
interface SeededOpts {
  specPath: string;
  skillDir: string;
  adapter: { run: (req: any) => Promise<string> };
  model: { provider: string; model: string };
  mode: "red" | "green" | "force";
}

export interface SeededOutcome {
  transcript: string; // harness output + appended gate report
  gateFailure: string | null; // non-null => objective gate failed (auto-FAIL, skip judge)
}

const VITEST_TIMEOUT_MS = Number(process.env.SKILL_CHECK_VITEST_TIMEOUT_MS ?? 120_000);

/**
 * Run a seeded scenario: copy the fixture into a throwaway git repo, let the
 * harness edit it, then evaluate objective gates (vitest pass + staged-diff
 * contains). A failed gate short-circuits to an auto-FAIL.
 */
export async function runSeeded(scenario: Scenario, opts: SeededOpts): Promise<SeededOutcome> {
  if (!scenario.fixture) {
    throw new Error(`seeded scenario ${scenario.id} has no fixture`);
  }
  const specDir = dirname(opts.specPath);
  const fixtureSrc = isAbsolute(scenario.fixture) ? scenario.fixture : resolve(specDir, scenario.fixture);
  if (!existsSync(fixtureSrc)) {
    return { transcript: `[fixture not found: ${fixtureSrc}]`, gateFailure: `fixture missing: ${scenario.fixture}` };
  }

  const repo = mkdtempSync(join(tmpdir(), `sc-seeded-${scenario.id}-`));
  cpSync(fixtureSrc, repo, { recursive: true });

  // Baseline commit so `git diff --cached` later shows only the harness's edits.
  await git(repo, ["init", "-q"]);
  await git(repo, ["add", "-A"]);
  await git(repo, ["-c", "user.email=sc@local", "-c", "user.name=skill-check", "commit", "-q", "-m", "baseline"]);

  // Let the harness work in the repo.
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
  return s
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");
}
