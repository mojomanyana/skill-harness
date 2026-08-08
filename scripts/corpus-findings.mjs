// Corpus findings — reproduces the numbers in
// docs/posts/2026-08-08-ninety-three-percent-and-still-not-shipping.md
//
// Pass rates, ship rates, under-pressure and critical outcomes across a committed
// results corpus. Reads specs + results.yaml only: free, offline, spends nothing.
//
// Usage:  node scripts/corpus-findings.mjs <path-to-skills-corpus>
// e.g.    node scripts/corpus-findings.mjs ~/prepos/principal-pi-skills
//
// Requires `npm run build` first (corpus-lift.mjs imports packages/core/dist).

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import yaml from "js-yaml";

const ROOT = process.argv[2];
const files = execSync(`find ${ROOT} -name results.yaml`, { encoding: "utf8" }).split("\n").filter(Boolean);

// critical ids live in the SPEC, never in results.yaml — reading them from the
// results (as a first pass did) silently reports zero critical failures forever.
const criticalFor = (skill) => {
  const p = join(ROOT, skill, "tests", "specification.yaml");
  if (!existsSync(p)) return new Set();
  try { return new Set(yaml.load(readFileSync(p, "utf8")).critical ?? []); } catch { return new Set(); }
};
const critCache = new Map();
const crit = (s) => (critCache.has(s) ? critCache.get(s) : (critCache.set(s, criticalFor(s)), critCache.get(s)));

const newest = new Map();
let allOverrides = 0, allSuspect = 0, totalRuns = 0;
for (const f of files) {
  let r; try { r = yaml.load(readFileSync(f, "utf8")); } catch { continue; }
  if (!r || !Array.isArray(r.scenarios)) continue;
  const parts = f.split("/");
  const ri = parts.lastIndexOf("results");
  const tag = parts[ri + 1], skill = parts[ri - 2];
  if (!tag || !skill || skill === "tests") continue;
  totalRuns++;
  for (const s of r.scenarios) { if (s.override) allOverrides++; if (s.suspect) allSuspect++; }
  const key = `${skill} ${tag} ${r.mode}`;
  const prev = newest.get(key);
  if (!prev || String(r.timestamp) > String(prev.r.timestamp)) newest.set(key, { r, skill, tag });
}

const eff = (s) => s.override ?? s.judge_verdict;
const pct = (n, d) => (d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`);

const grid = {};
for (const { r, skill } of newest.values()) {
  const cids = crit(skill);
  const g = ((grid[skill] ??= {})[r.mode] ??= { cells: 0, pass: 0, b: { c: 0, f: 0 }, cr: { c: 0, f: 0 }, models: new Set(), runs: 0, ship: 0 });
  g.runs++; g.models.add(r.model);
  if (r.effective_grade?.ship) g.ship++;
  for (const s of r.scenarios) {
    const v = eff(s);
    g.cells++; if (v === "PASS") g.pass++;
    if (/^B/i.test(s.id)) { g.b.c++; if (v !== "PASS") g.b.f++; }
    if (cids.has(s.id)) { g.cr.c++; if (v !== "PASS") g.cr.f++; }
  }
}

console.log(`corpus: ${totalRuns} committed runs · ${Object.keys(grid).length} skills with results`);
console.log(`author overrides across ALL runs: ${allOverrides}`);
console.log(`unresolved suspect cells across ALL runs: ${allSuspect}`);

for (const mode of ["green", "force", "red"]) {
  const skills = Object.entries(grid).filter(([, m]) => m[mode]);
  if (!skills.length) continue;
  const t = skills.reduce((a, [, m]) => {
    const g = m[mode];
    a.cells += g.cells; a.pass += g.pass; a.bc += g.b.c; a.bf += g.b.f; a.cc += g.cr.c; a.cf += g.cr.f;
    a.runs += g.runs; a.ship += g.ship;
    return a;
  }, { cells: 0, pass: 0, bc: 0, bf: 0, cc: 0, cf: 0, runs: 0, ship: 0 });
  console.log(`\n===== ${mode} · ${skills.length} skills · ${t.runs} runs =====`);
  console.log(`  overall        ${pct(t.pass, t.cells)} pass (${t.pass}/${t.cells})`);
  console.log(`  UNDER PRESSURE ${pct(t.bc - t.bf, t.bc)} pass (${t.bc - t.bf}/${t.bc}) -> ${t.bf}/${t.bc} = ${pct(t.bf, t.bc)} FAIL`);
  console.log(`  critical       ${pct(t.cc - t.cf, t.cc)} pass (${t.cc - t.cf}/${t.cc}) -> ${t.cf} critical failures`);
  console.log(`  runs reporting SHIP: ${t.ship}/${t.runs}`);
}

console.log(`\n===== PAIRED red vs skill-on (same skill, both modes present) =====`);
for (const on of ["green", "force"]) {
  const pairs = Object.entries(grid).filter(([, m]) => m.red && m[on]);
  if (!pairs.length) { console.log(`  ${on}: no skill has both a red and a ${on} run`); continue; }
  const a = pairs.reduce((acc, [, m]) => {
    acc.rc += m.red.cells; acc.rp += m.red.pass; acc.rbc += m.red.b.c; acc.rbf += m.red.b.f;
    acc.oc += m[on].cells; acc.op += m[on].pass; acc.obc += m[on].b.c; acc.obf += m[on].b.f;
    return acc;
  }, { rc: 0, rp: 0, rbc: 0, rbf: 0, oc: 0, op: 0, obc: 0, obf: 0 });
  console.log(`  ${on} vs red · ${pairs.length} skill(s): ${pairs.map(([s]) => s).join(", ")}`);
  console.log(`    overall        red ${pct(a.rp, a.rc)} (${a.rp}/${a.rc})  ->  ${on} ${pct(a.op, a.oc)} (${a.op}/${a.oc})`);
  console.log(`    under pressure red ${pct(a.rbc - a.rbf, a.rbc)} (${a.rbc - a.rbf}/${a.rbc})  ->  ${on} ${pct(a.obc - a.obf, a.obc)} (${a.obc - a.obf}/${a.obc})`);
}

console.log(`\n===== per skill (overall pass / under-pressure pass) =====`);
for (const [skill, m] of Object.entries(grid).sort()) {
  const cell = (mode) => {
    const g = m[mode];
    if (!g) return "     -       ";
    const b = g.b.c ? `${pct(g.b.c - g.b.f, g.b.c)}` : "  -";
    return `${pct(g.pass, g.cells).padStart(4)} / ${b.padStart(4)}`;
  };
  console.log(`  ${skill.padEnd(10)} green ${cell("green")}   force ${cell("force")}   red ${cell("red")}`);
}
