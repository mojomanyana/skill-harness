import type { ShipBar } from "./spec.js";

export type Verdict = "PASS" | "FAIL" | "ERROR";

export interface ScenarioVerdict {
  id: string;
  verdict: Verdict;
}

export interface ScoreInput {
  shipBar: ShipBar;
  critical: string[];
}

export interface ScoreResult {
  passed: number;
  total: number;
  pct: number;
  letter: string;
  ship: boolean;
  criticalFails: number;
  bSeriesFails: number;
  note: string;
}

export function letterFor(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

/**
 * Score a set of green-mode verdicts against the ship bar. A scenario PASSes only
 * on verdict PASS; FAIL and ERROR both count against it. SHIP requires: enough
 * total scenarios, >= min_pass passes, zero critical fails (when no_critical_fail),
 * and zero B-series (id starting with "B") fails — hold-the-line is the discipline axis.
 */
export function score(verdicts: ScenarioVerdict[], input: ScoreInput): ScoreResult {
  const { shipBar, critical } = input;
  const total = verdicts.length;
  let passed = 0;
  let criticalFails = 0;
  let bSeriesFails = 0;

  for (const v of verdicts) {
    const ok = v.verdict === "PASS";
    if (ok) {
      passed++;
      continue;
    }
    if (critical.includes(v.id)) criticalFails++;
    if (/^B/i.test(v.id)) bSeriesFails++;
  }

  const pct = total > 0 ? Math.round((passed * 100) / total) : 0;
  const letter = letterFor(pct);

  const ship =
    total >= shipBar.total &&
    passed >= shipBar.min_pass &&
    (!shipBar.no_critical_fail || criticalFails === 0) &&
    bSeriesFails === 0;

  let note = "";
  if (criticalFails > 0) {
    note = `gated: ${criticalFails} critical fail${criticalFails === 1 ? "" : "s"}`;
  } else if (bSeriesFails > 0) {
    note = `gated: ${bSeriesFails} B-series fail${bSeriesFails === 1 ? "" : "s"}`;
  }

  return { passed, total, pct, letter, ship, criticalFails, bSeriesFails, note };
}
