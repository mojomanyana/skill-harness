import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readResults } from "./results.js";
import { HARNESS_VERSION } from "./version.js";

/**
 * Compare two semver-ish version strings by numeric component.
 *
 * String comparison is the trap this exists to avoid: `"0.10.0" < "0.9.0"` is true
 * lexically and false in fact, which would make the tripwire fire backwards exactly
 * once — on the release where it mattered most. A prerelease suffix is dropped rather
 * than ordered: `0.4.0-rc.1` vs `0.4.0` is not a distinction worth a refusal, and
 * getting it wrong in either direction is worse than treating them as equal.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split("-")[0].split(".").map((n) => Number(n) || 0);
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function isDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

/**
 * The newest `harness_version` recorded anywhere under `<skillDir>/tests/results/`, or
 * null when no run records one.
 *
 * Null is the honest answer for a pre-0.3.3 tree and must stay silent: those runs
 * carry no version, so there is nothing to compare and no basis for a warning. The
 * tripwire therefore only sharpens as fresh runs land — the same forward-looking
 * bargain `source_hashes` made.
 */
export function newestRecordedVersion(skillDir: string): string | null {
  const root = join(skillDir, "tests", "results");
  if (!existsSync(root)) return null;
  let newest: string | null = null;
  for (const tag of readdirSync(root).filter((n) => isDir(join(root, n)))) {
    const tagDir = join(root, tag);
    for (const run of readdirSync(tagDir).filter((n) => isDir(join(tagDir, n)))) {
      try {
        const v = readResults(join(tagDir, run)).harness_version;
        if (v && (newest === null || compareVersions(v, newest) > 0)) newest = v;
      } catch {
        // Unreadable results are the consistency check's problem, not this one's.
      }
    }
  }
  return newest;
}

function upgradeAdvice(recorded: string): string {
  return (
    `You are running skill-harness ${HARNESS_VERSION}; this tree holds results recorded by ${recorded}.\n` +
    `  A global install goes stale silently — check with \`skill-harness --version\`, and prefer\n` +
    `  \`npx skill-harness@${recorded}\` (or \`npm i -g skill-harness@latest\`) so the tool matches the records.`
  );
}

/**
 * Refuse to write a fresh measurement with an older tool than the one that produced
 * the records already in the tree.
 *
 * The failure this kills, measured on the reference corpus: a stale global **0.1.0**
 * install would have spent ~102 rep-executions grading *without showing the judge the
 * staged diff* — the exact defect the run was meant to correct — and every resulting
 * number would have looked entirely plausible. It also emitted 38 spurious findings
 * that the current version does not. Nothing announced any of it.
 *
 * `schema` cannot serve here: 0.2.1 → 0.3.0 kept `schema: 2` while changing what a
 * verdict *means*. Only the writing version distinguishes those measurements.
 *
 * Refusal is for `run` alone, because only `run` mints a new measurement that would sit
 * beside newer ones as if comparable. `grade` and `lint` warn (see `downgradeWarning`):
 * both are how someone diagnoses this in the first place, and blocking diagnosis is a
 * bad trade.
 */
export function assertNotDowngraded(skillDir: string, command: "run" | "grade" | "lint"): void {
  if (command !== "run") return;
  const recorded = newestRecordedVersion(skillDir);
  if (!recorded || compareVersions(recorded, HARNESS_VERSION) <= 0) return;
  throw new Error(
    `refusing to run: these results were recorded by a NEWER skill-harness, so a run from this one would not be comparable.\n  ` +
      upgradeAdvice(recorded),
  );
}

/** The loud-but-not-fatal version, for `grade` and `lint`. Null when nothing is newer. */
export function downgradeWarning(skillDir: string): string | null {
  const recorded = newestRecordedVersion(skillDir);
  if (!recorded || compareVersions(recorded, HARNESS_VERSION) <= 0) return null;
  return `warning: this skill-harness is older than the tool that recorded these results.\n  ${upgradeAdvice(recorded)}`;
}
