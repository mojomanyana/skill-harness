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
  if (cell.override) return cell.override;
  // Mechanical evidence outranks a prose judge. Objective PASS deliberately
  // forces nothing — the checklist judge still decides the behavioral rubric.
  if (cell.objective && cell.objective.status === "ERROR") return "ERROR";
  if (cell.objective && cell.objective.status === "NOT-MEASURED") return "NOT-MEASURED";
  if (cell.objective && cell.objective.status === "FAIL") return "FAIL";
  return cell.judge_verdict;
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
  let errors = 0;
  let notMeasured = 0;

  for (const id of Object.keys(col.cells)) {
    const cell = col.cells[id];
    if (!cell) continue;
    if (cell.suspect && !cell.override) {
      suspect++;
      continue; // excluded, blocks ship
    }
    const verdict = effective(cell);
    if (verdict === "NOT-MEASURED") {
      notMeasured++;
      continue;
    }
    if (verdict === "ERROR" || verdict === "JUDGE-AMBIGUOUS") {
      errors++;
      continue;
    }
    total++;
    if (verdict === "PASS") {
      passed++;
      continue;
    }
    if (critical.includes(id)) criticalFails++;
    if (/^B/i.test(id)) bFails++;
  }

  if (col.partial === true) {
    return { passed: 0, total: 0, pct: 0, letter: "-", ship: false, criticalFails, bFails, suspect, errors, notMeasured };
  }

  const pct = total > 0 ? Math.round((passed * 100) / total) : 0;
  const letter = letterFor(pct);
  const validBar = Number.isInteger(shipBar.total) && shipBar.total >= 1 && Number.isInteger(shipBar.min_pass) && shipBar.min_pass >= 1 && shipBar.min_pass <= shipBar.total;
  const ship =
    validBar &&
    total >= shipBar.total &&
    passed >= shipBar.min_pass &&
    (!shipBar.no_critical_fail || criticalFails === 0) &&
    bFails === 0 &&
    suspect === 0 &&
    errors === 0 &&
    notMeasured === 0;

  return { passed, total, pct, letter, ship, criticalFails, bFails, suspect, errors, notMeasured };
}

/**
 * Red-vs-green class for ONE scenario — mirrors `classify` in
 * packages/core/src/lift.ts exactly. Kept in the client because the author
 * flips green verdicts live in this UI: a server-computed class would freeze at
 * page load and could show "gained" beside a cell the author just marked FAIL.
 *
 * `liftCell` supplies the red side (verdict + redSuspect, from the baseline run,
 * which this view never edits); `greenCell` is the live report cell, so its
 * override and suspect state are read through the same effective()/suspect rule
 * the grader uses.
 */
export function liftClass(liftCell, greenCell) {
  const conclusive = (verdict, suspect) =>
    !suspect && verdict !== "ERROR" && verdict !== "NOT-MEASURED" && verdict !== "JUDGE-AMBIGUOUS";

  const redOk = conclusive(liftCell.red, liftCell.redSuspect);
  const greenOk = conclusive(effective(greenCell), !!greenCell.suspect && !greenCell.override);
  if (!redOk || !greenOk) return "inconclusive";

  const redPass = liftCell.red === "PASS";
  const greenPass = effective(greenCell) === "PASS";
  if (redPass && greenPass) return "kept";
  if (!redPass && greenPass) return "gained";
  if (redPass && !greenPass) return "regressed";
  return "both-fail";
}

/**
 * Aggregate a column's lift over the live cells — mirrors computeLift's counters
 * in packages/core/src/lift.ts. Only scenarios the baseline also covered are
 * counted, matching the server's intersection rule.
 */
export function liftSummary(col) {
  const out = { gained: 0, regressed: 0, kept: 0, bothFail: 0, inconclusive: 0, compared: 0, redPassed: 0, greenPassed: 0, delta: 0 };
  if (!col.lift) return null;
  for (const id of Object.keys(col.lift.cells)) {
    const greenCell = col.cells[id];
    if (!greenCell) continue;
    const liftCell = col.lift.cells[id];
    const cls = liftClass(liftCell, greenCell);
    out.compared++;
    if (cls === "both-fail") out.bothFail++;
    else out[cls]++;
    if (cls !== "inconclusive") {
      if (liftCell.red === "PASS") out.redPassed++;
      if (effective(greenCell) === "PASS") out.greenPassed++;
    }
  }
  out.delta = out.greenPassed - out.redPassed;
  return out;
}

/**
 * The lift badge for a column with nothing to show in the number: `{text, title}`,
 * or null when the column should carry no badge at all.
 *
 * A *missing* baseline and an *unusable* one are different facts. Nothing is
 * comparable when every shared scenario ran identically in both modes, or when the
 * two sides aggregated differently (red at 1 rep vs green at 3) — a red baseline
 * exists, and "no red baseline" would send the author off to re-run the one thing
 * they already have. The server's headline already states which it is and what to
 * re-run, so it becomes the tooltip verbatim.
 */
export function liftNoneBadge(col) {
  if (col.lift) {
    return { text: "lift not comparable", title: col.liftHeadline || "nothing in the red baseline could be compared" };
  }
  // Green and force are both skill-delivered, so both can be missing a baseline.
  // A red column is the baseline and gets no badge at all.
  if (col.mode === "green" || col.mode === "force") {
    return { text: "no red baseline", title: "run the same scenarios with --mode red to get a baseline" };
  }
  return null;
}
