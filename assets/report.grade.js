// Client-side scorer for the review UI (assets/report.template.html).
//
// This is the SINGLE source of truth for "how does a column get graded in the
// browser" — it must implement exactly the same rules as
// packages/core/src/score.ts's `score()`. It is:
//   (a) imported directly, as plain ESM, by
//       packages/core/test/grade-column-parity.test.ts, which asserts parity
//       against score.ts for a set of fixtures (PASS/FAIL/critical/B-series/
//       suspect/override-resolved-suspect). If you change score.ts's rules
//       and forget to mirror them here, that test fails.
//   (b) injected verbatim into report.template.html's inline <script>, at the
//       GRADE placeholder comment near its top (see renderReport in
//       packages/core/src/report.ts).
//
// INJECTION NOTE: a bare inline <script> (no type="module") cannot contain an
// `export` statement. renderReport() strips the leading `export ` keyword off
// each exported declaration textually before splicing this file's contents
// into the template. Nothing here relies on import/export semantics at
// runtime (no imports, no re-exports), so stripping `export ` and leaving
// plain function declarations behind is safe in both the browser (global
// script scope) and Node (this file imported as an ES module).
//
// No DOM access, no imports — must load in Node (for the parity test) and in
// a plain <script> in the browser (for the review UI).

export function effective(cell) {
  return cell.override || cell.judge_verdict;
}

function letterFor(pct) {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

/**
 * Score one report column against the ship bar — mirrors score.ts's `score()`
 * exactly, over `col.cells` (a scenario-id -> cell map) instead of a flat
 * verdict list. A `suspect` cell without an override is excluded from both
 * `passed` and `total` (untrustworthy: neither pass nor fail) and blocks ship.
 */
export function gradeColumn(col, shipBar, critical) {
  let passed = 0;
  let total = 0;
  let criticalFails = 0;
  let bFails = 0;
  let suspect = 0;

  for (const id of Object.keys(col.cells)) {
    const cell = col.cells[id];
    if (!cell) continue;
    if (cell.suspect && !cell.override) {
      suspect++;
      continue; // excluded, blocks ship
    }
    total++;
    if (effective(cell) === "PASS") {
      passed++;
      continue;
    }
    if (critical.includes(id)) criticalFails++;
    if (/^B/i.test(id)) bFails++;
  }

  const pct = total > 0 ? Math.round((passed * 100) / total) : 0;
  const letter = letterFor(pct);
  const ship =
    total >= shipBar.total &&
    passed >= shipBar.min_pass &&
    (!shipBar.no_critical_fail || criticalFails === 0) &&
    bFails === 0 &&
    suspect === 0;

  return { passed, total, pct, letter, ship, criticalFails, bFails, suspect };
}
