import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Spec } from "./spec.js";
import { readResults, writeResults, type ResultsFile, type ScenarioResult } from "./results.js";
import { appendJournal } from "./journal.js";
import { policyDigest, POLICY_PREFIX } from "./sources.js";

/**
 * Refresh the `policy:` keys a run recorded, since a rescore has just re-applied the
 * current policy to every rep it holds.
 *
 * Unlike a re-grade, this needs no id list: `rescoreRun` walks every recorded
 * scenario, and the ones it carries verbatim (single-rep, ERROR, JUDGE-AMBIGUOUS) are
 * carried *because the current threshold cannot change their verdict* — they are
 * scored under today's policy too. Only keys the run already carried are touched, so
 * this never fabricates coverage.
 */
function refreshPolicyHashes(
  recorded: Record<string, string> | undefined,
  spec: Spec,
): Record<string, string> | undefined {
  if (!recorded) return undefined;
  const next = { ...recorded };
  for (const s of spec.scenarios) {
    if (POLICY_PREFIX + s.id in next) next[POLICY_PREFIX + s.id] = policyDigest(s);
  }
  return next;
}

export interface RescoreOptions {
  runDir: string;
  spec: Spec;
  now?: () => string;
}

export interface RescoreChange {
  id: string;
  from: ScenarioResult["judge_verdict"];
  to: ScenarioResult["judge_verdict"];
  passes: number;
  clean: number;
  fromThreshold: number;
  toThreshold: number;
}

export interface RescoreResult {
  results: ResultsFile;
  changes: RescoreChange[];
}

/**
 * Re-score a run against the CURRENT spec's pass thresholds — no model calls, no judge
 * calls. Reps are the raw measurement (`passes` of `clean`); a threshold is *policy*.
 * When the policy changes, the honest move is to recompute the old measurements under it
 * rather than reconcile two numbers in prose — and to record what moved.
 *
 * Only reps-bearing scenarios can be re-scored: a single-rep verdict has no rate to
 * re-apply a threshold to, and ERROR/JUDGE-AMBIGUOUS carry no trustworthy rate at all —
 * both are carried verbatim. Overrides, notes, and suspect flags are preserved: this
 * changes the collapse rule, nothing about what the judge said.
 */
export function rescoreRun(opts: RescoreOptions): RescoreResult {
  const now = opts.now ?? (() => new Date().toISOString());
  const prev = readResults(opts.runDir);
  if (!prev) throw new Error(`no results.yaml in ${opts.runDir}`);
  const specById = new Map(opts.spec.scenarios.map((s) => [s.id, s]));

  const changes: RescoreChange[] = [];
  const scenarios: ScenarioResult[] = prev.scenarios.map((s) => {
    const scenario = specById.get(s.id);
    // no rate to re-apply, or an untrustworthy verdict → carry verbatim
    if (!scenario || s.reps === undefined || s.clean === undefined || s.passes === undefined) return s;
    if (s.judge_verdict === "ERROR" || s.judge_verdict === "JUDGE-AMBIGUOUS") return s;
    if (s.clean === 0) return s;

    const toThreshold = scenario.passThreshold ?? 0.5;
    const fromThreshold = s.pass_threshold ?? toThreshold;
    if (toThreshold === fromThreshold) return s;

    const rate = s.passes / s.clean;
    const verdict: ScenarioResult["judge_verdict"] = rate >= toThreshold ? "PASS" : "FAIL";
    if (verdict !== s.judge_verdict) {
      changes.push({ id: s.id, from: s.judge_verdict, to: verdict, passes: s.passes, clean: s.clean, fromThreshold, toThreshold });
    }
    return { ...s, judge_verdict: verdict, pass_threshold: toThreshold };
  });

  const ctx = prev.mode === "green" && !prev.partial
    ? { shipBar: opts.spec.ship_bar, critical: opts.spec.critical }
    : null;
  const results = writeResults(opts.runDir, {
    skill: prev.skill, harness: prev.harness, model: prev.model, judge: prev.judge,
    timestamp: prev.timestamp, label: prev.label, mode: prev.mode,
    partial: prev.partial,
    // A rescore re-applies the CURRENT policy (thresholds, critical set) to the
    // recorded reps, so `policy:` drift is genuinely resolved by having run this —
    // that is what makes `rescore` the honest remedy lint names for it. Stimulus,
    // rubric and gate hashes are untouched: none of them was re-evaluated here.
    source_hashes: refreshPolicyHashes(prev.source_hashes, opts.spec),
    scenarios,
  }, ctx);

  appendJournal(opts.runDir, {
    event: "rescore", ts: now(),
    changed: changes.map((c) => `${c.id}: ${c.from}->${c.to} (${c.passes}/${c.clean} @ ${c.toThreshold})`),
    passed: results.effective_grade.passed, total: results.effective_grade.total,
    pct: results.effective_grade.pct, ship: results.effective_grade.ship,
  });
  return { results, changes };
}

/** Locate the spec for a run dir: results/<tag>/<ts> → ../../../specification.yaml */
export function specPathForRunDir(runDir: string): string {
  const p = join(runDir, "..", "..", "..", "specification.yaml");
  if (!existsSync(p)) throw new Error(`no specification.yaml above ${runDir}`);
  return p;
}
