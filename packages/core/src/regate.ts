import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Spec, Scenario } from "./spec.js";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";
import { parseVerdict, detectMisfire } from "./grade.js";
import { evaluateNeedleGates, hasNeedleGates } from "./seeded.js";
import { judgeOneRep } from "./regrade.js";
import {
  readResults, writeResults, diffPath, transcriptPath, judgeRawPath, repIndexOf,
  findDiffFiles, effectiveThreshold, scoreContextFor,
  type ResultsFile, type ScenarioResult,
} from "./results.js";
import { outcomesToResult, type RepOutcome } from "./reps.js";
import { appendJournal } from "./journal.js";
import { gatesDigest, GATES_PREFIX } from "./sources.js";
import type { Verdict } from "./score.js";

export interface RegateOptions {
  runDir: string;
  spec: Spec;
  specDir: string;
  adapter: HarnessAdapter;
  judge: ModelRef;
  now?: () => string;
}

export interface RegateChange {
  id: string;
  from: Verdict;
  to: Verdict;
  /** What the corrected needles say about this scenario now. */
  gate: "pass" | "fail";
  /** Whether re-deciding it required a judge call (only a gate-FAIL → gate-pass flip does). */
  judged: boolean;
}

export interface RegateResult {
  results: ResultsFile;
  changes: RegateChange[];
  /** Judge calls actually made, for the cost line the CLI prints. */
  judgeCalls: number;
}

/** Marker in a saved transcript that a needle gate reported a failure. */
const GATE_FAILED_RE = /: (MISSING|PRESENT)$/m;

const TRAILER = "=== SEEDED GATES ===";
const DIFF_HEADER = "=== STAGED DIFF ===";

/**
 * Rebuild a transcript with a fresh gates trailer, preserving the model's turns and
 * the embedded diff exactly.
 *
 * The trailer is harness-generated annotation appended *after* the model's output, so
 * regenerating it corrects our own note rather than falsifying a transcript. The old
 * file is still kept beside the new one (`.pre-regate.txt`) so the audit trail never
 * depends on the reader accepting that distinction.
 */
function rewriteTranscript(path: string, gateLines: string[]): void {
  const original = readFileSync(path, "utf8");
  const trailerAt = original.indexOf(TRAILER);
  if (trailerAt === -1) return; // no trailer to correct (non-seeded shape); leave it alone

  const diffAt = original.indexOf(DIFF_HEADER);
  const head = original.slice(0, trailerAt);
  const tail = diffAt === -1 ? "" : original.slice(diffAt);
  renameSync(path, path.replace(/\.txt$/, ".pre-regate.txt"));
  writeFileSync(path, `${head}${TRAILER}\n${gateLines.join("\n")}\n\n${tail}`, "utf8");
}

/** Recover a rep's judge verdict from its saved judge-raw artifact — free, and exact. */
function verdictFromSavedJudgement(runDir: string, id: string, mode: string, rep: number | undefined): RepOutcome | null {
  const path = judgeRawPath(runDir, id, mode, rep);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const parsed = parseVerdict(raw);
  return { verdict: parsed.verdict, reason: parsed.reason, suspect: detectMisfire(raw, parsed.verdict) };
}

/**
 * Re-evaluate needle gates against a run's **saved staged diffs** and re-decide the
 * verdicts they determined — without re-running the model.
 *
 * `diff_contains` / `diff_excludes` are pure functions of the diff, and since
 * `f6a5f6c` every seeded rep persists its diff as a run artifact. So the defect class
 * "the gate was wrong, the behavior wasn't" — hit three times in the reference corpus
 * (a context needle, a baseline-satisfied needle, a filename needle) — no longer costs
 * a re-run. Measured on the C2 needle fix: **9 judge calls instead of 81
 * rep-executions across three models.**
 *
 * Per rep, exactly one of four things happens:
 *
 * | old gate | new gate | outcome | cost |
 * |---|---|---|---|
 * | fail | fail | FAIL, with the corrected reason | free |
 * | pass | fail | FAIL — the gate is objective and it says no | free |
 * | pass | pass | the rep's saved judgement, re-parsed from its judge-raw artifact | free |
 * | fail | pass | judged now: the judge never saw this rep, because the gate blocked it | 1 judge call |
 *
 * That third row is what keeps this cheap without guessing: a rep the judge already
 * saw has its verdict on disk, so regate re-reads it rather than re-asking.
 *
 * **Limits, deliberately hard failures rather than partial work:** `assert.vitest` and
 * `assert.post_test` need the workspace and cannot be re-evaluated from any artifact,
 * so a scenario carrying either is not regatable. Diffs and judge-raw files are
 * gitignored, so this works for whoever holds the run dirs — the repo owner, or CI that
 * just ran — which is exactly the situation it is needed in.
 */
export async function regateRun(opts: RegateOptions): Promise<RegateResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const prev = readResults(opts.runDir);
  // The run's own mode names its artifacts (`<id>.<mode>[.rep<k>].diff.txt`). Read
  // from the record rather than assumed green: force runs are scored measurements
  // too, and looking for green artifacts under a force run finds nothing at all.
  const mode = prev.mode;
  const specById = new Map(opts.spec.scenarios.map((s) => [s.id, s]));

  // Why a scenario cannot be regated, collected rather than thrown one at a time: a
  // mixed spec (needles here, vitest there) should regate what it can, and only a run
  // with nothing regatable is an error worth refusing.
  const blocked: string[] = [];
  const targets: Scenario[] = [];
  for (const rec of prev.scenarios) {
    const s = specById.get(rec.id);
    if (!s || !hasNeedleGates(s)) continue; // nothing for regate to re-decide
    if (s.assert?.vitest || s.assert?.post_test) {
      blocked.push(
        `${s.id}: declares ${s.assert.vitest ? "assert.vitest" : "assert.post_test"}, which needs the workspace — ` +
          `no saved artifact can stand in for it, so this scenario needs a re-run`,
      );
      continue;
    }
    if (findDiffFiles(opts.runDir, s.id, mode).length === 0) {
      blocked.push(`${s.id}: no staged-diff artifact on disk (\`.diff.txt\` is gitignored — regate needs the run dir that produced it)`);
      continue;
    }
    targets.push(s);
  }

  if (targets.length === 0) {
    throw new Error(
      `nothing to regate in ${opts.runDir}` +
        (blocked.length > 0 ? `:\n  ${blocked.join("\n  ")}` : " — no scenario declares diff_contains/diff_excludes"),
    );
  }

  const changes: RegateChange[] = [];
  let judgeCalls = 0;
  const scenarios: ScenarioResult[] = [];

  for (const rec of prev.scenarios) {
    const scenario = targets.find((s) => s.id === rec.id);
    if (!scenario) {
      scenarios.push(rec); // untouched: not regatable, or no gates
      continue;
    }

    const diffFiles = findDiffFiles(opts.runDir, scenario.id, mode);
    const outcomes: RepOutcome[] = [];
    // Per scenario, not run-wide: with several regated scenarios, a global counter
    // would report every change as "re-judged" because some other scenario was.
    let judgedHere = 0;
    let gateFailedHere = false;
    for (const file of diffFiles) {
      const rep = repIndexOf(file) ?? undefined;
      const diff = readFileSync(join(opts.runDir, file), "utf8");
      const gate = evaluateNeedleGates(scenario, diff);

      const tPath = transcriptPath(opts.runDir, scenario.id, mode, rep);
      const before = existsSync(tPath) ? readFileSync(tPath, "utf8") : "";
      const oldGateFailed = GATE_FAILED_RE.test(before.slice(before.indexOf(TRAILER)));

      // The trailer is regenerated whatever the outcome: leaving a stale
      // `MISSING` note beside a corrected verdict would misinform the next reader
      // (and the next judge, which reads this transcript).
      if (existsSync(tPath)) rewriteTranscript(tPath, gate.lines);

      if (gate.failure) {
        gateFailedHere = true;
        outcomes.push({ verdict: "FAIL", reason: gate.failure, suspect: false });
        continue;
      }
      if (!oldGateFailed) {
        // The judge already saw this rep. Its verdict is on disk — re-read it rather
        // than paying to ask the same question again.
        const saved = verdictFromSavedJudgement(opts.runDir, scenario.id, mode, rep);
        outcomes.push(saved ?? { verdict: rec.judge_verdict, reason: rec.judge_reason, suspect: rec.suspect });
        continue;
      }
      // The gate blocked this rep before, so no judgement of it exists anywhere.
      const transcript = readFileSync(tPath, "utf8");
      outcomes.push(await judgeOneRep({
        runDir: opts.runDir, spec: opts.spec, scenario, transcript,
        adapter: opts.adapter, judge: opts.judge, specDir: opts.specDir,
        mode, rep, now,
      }));
      judgeCalls++;
      judgedHere++;
    }

    const threshold = effectiveThreshold(rec, scenario);
    const next = outcomesToResult(scenario.id, outcomes, outcomes.length, threshold);
    // Overrides and their notes survive: a regate re-decides the gate, and an author
    // override is a statement about the judge, not about the needle.
    scenarios.push({ ...next, override: rec.override, note: rec.note });

    const to = next.judge_verdict;
    if (to !== rec.judge_verdict) {
      changes.push({
        id: scenario.id, from: rec.judge_verdict, to,
        gate: gateFailedHere ? "fail" : "pass",
        judged: judgedHere > 0,
      });
    }
  }

  const ctx = scoreContextFor(prev, opts.spec);

  const results = writeResults(opts.runDir, {
    skill: prev.skill, harness: prev.harness, model: prev.model,
    // Carried verbatim: a regate re-reads saved diffs, it never re-runs the harness.
    harness_cli_version: prev.harness_cli_version, delivery_canary: prev.delivery_canary,
    judge: { provider: opts.judge.provider, model: opts.judge.model },
    timestamp: prev.timestamp, label: prev.label, mode: prev.mode, partial: prev.partial,
    // Only the `gates:` keys of the scenarios actually re-evaluated. Stimulus, rubric
    // and policy were not re-decided here, so their hashes stay exactly as recorded.
    source_hashes: refreshGateHashes(prev.source_hashes, targets),
    scenarios,
  }, ctx);

  appendJournal(opts.runDir, {
    event: "regate", ts: now(),
    scenarios: targets.map((s) => s.id),
    changed: changes.map((c) => `${c.id}: ${c.from}->${c.to} (gate ${c.gate}${c.judged ? ", re-judged" : ""})`),
    judge_calls: judgeCalls,
    ...(blocked.length > 0 ? { skipped: blocked } : {}),
  });

  return { results, changes, judgeCalls };
}

function refreshGateHashes(
  recorded: Record<string, string> | undefined,
  regated: Scenario[],
): Record<string, string> | undefined {
  if (!recorded) return undefined;
  const next = { ...recorded };
  for (const s of regated) {
    const digest = gatesDigest(s);
    if (digest !== null && GATES_PREFIX + s.id in next) next[GATES_PREFIX + s.id] = digest;
  }
  return next;
}
