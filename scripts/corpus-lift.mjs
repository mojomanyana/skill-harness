// Corpus lift — reproduces the numbers in
// docs/posts/2026-08-08-ninety-three-percent-and-still-not-shipping.md
//
// Red-vs-skill lift across a committed corpus, via the harness's OWN collectLift
// so the exclusions (mode-insensitive, aggregation mismatch) are the real ones.
//
// Usage:  node scripts/corpus-lift.mjs <path-to-skills-corpus>
// e.g.    node scripts/corpus-lift.mjs ~/prepos/principal-pi-skills
//
// Requires `npm run build` first (corpus-lift.mjs imports packages/core/dist).

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { collectLift } from "../packages/core/dist/lift.js";

const ROOT = process.argv[2];
const skills = readdirSync(ROOT).filter((n) => existsSync(join(ROOT, n, "tests", "specification.yaml")));

const tot = {
  lifts: 0, compared: 0, gained: 0, regressed: 0, kept: 0, bothFail: 0,
  inconclusive: 0, redPassed: 0, greenPassed: 0,
  modeInsensitive: 0, aggMismatch: 0, greenOnly: 0, redOnly: 0,
};
const byMode = {};

for (const skill of skills) {
  for (const l of collectLift(join(ROOT, skill))) {
    tot.lifts++;
    for (const k of ["compared", "gained", "regressed", "kept", "bothFail", "inconclusive", "redPassed", "greenPassed"]) tot[k] += l[k];
    tot.modeInsensitive += l.modeInsensitive.length;
    tot.aggMismatch += l.aggregationMismatch.length;
    tot.greenOnly += l.greenOnly.length;
    tot.redOnly += l.redOnly.length;

    const m = (byMode[l.mode] ??= { lifts: 0, compared: 0, gained: 0, regressed: 0, kept: 0, bothFail: 0, redPassed: 0, greenPassed: 0, skills: new Set() });
    m.lifts++; m.skills.add(skill);
    for (const k of ["compared", "gained", "regressed", "kept", "bothFail", "redPassed", "greenPassed"]) m[k] += l[k];

    console.log(
      `${skill.padEnd(10)} ${l.mode.padEnd(5)} ${l.model.split("/").pop().padEnd(16)} ` +
      `compared ${String(l.compared).padStart(2)}  +${l.gained} gained  -${l.regressed} regressed  ` +
      `${l.kept} kept  ${l.bothFail} bothFail  ${l.inconclusive} inconc  ` +
      `red ${l.redPassed} -> skill ${l.greenPassed}` +
      (l.modeInsensitive.length ? `  [${l.modeInsensitive.length} mode-insensitive excluded]` : "") +
      (l.aggregationMismatch.length ? `  [${l.aggregationMismatch.length} agg-mismatch excluded]` : ""),
    );
  }
}

const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);
console.log(`\n===== TOTALS across ${tot.lifts} comparable red/skill pairs =====`);
console.log(`  compared cells: ${tot.compared}`);
console.log(`  gained ${tot.gained} · regressed ${tot.regressed} · kept ${tot.kept} · bothFail ${tot.bothFail} · inconclusive ${tot.inconclusive}`);
console.log(`  net delta: ${tot.greenPassed - tot.redPassed}  (red ${tot.redPassed} -> skill ${tot.greenPassed} of ${tot.compared})`);
console.log(`  red pass rate ${pct(tot.redPassed, tot.compared)} -> skill-on ${pct(tot.greenPassed, tot.compared)}`);
console.log(`  excluded: ${tot.modeInsensitive} mode-insensitive, ${tot.aggMismatch} aggregation-mismatch`);
console.log(`  coverage gaps: ${tot.greenOnly} skill-only ids, ${tot.redOnly} red-only ids`);

for (const [mode, m] of Object.entries(byMode)) {
  console.log(`\n  --- ${mode} (${m.lifts} pairs, ${m.skills.size} skills) ---`);
  console.log(`      compared ${m.compared}  gained ${m.gained}  regressed ${m.regressed}  kept ${m.kept}  bothFail ${m.bothFail}`);
  console.log(`      red ${pct(m.redPassed, m.compared)} (${m.redPassed}/${m.compared}) -> ${mode} ${pct(m.greenPassed, m.compared)} (${m.greenPassed}/${m.compared})`);
}
