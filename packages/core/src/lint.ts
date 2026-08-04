import { existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import yaml from "js-yaml";
import { loadSpec, SpecError } from "./spec.js";
import { readResults, finalizeResults, findTranscriptFiles, resultsPath, type ScoreContext } from "./results.js";
import { currentHashFor, describeSourceKey, scenarioIdForKey, effectiveFixture, SCENARIO_PREFIX, UNREADABLE } from "./sources.js";
import { MARKERS, unknownMarkerDirs, suggestMarker } from "./workspace.js";

export type LintCode = "spec" | "ship_bar" | "critical" | "fixture" | "fixture-marker" | "consistency" | "stale" | "lint-error";

export interface LintFinding {
  readonly skill: string; // skill name (basename of the dir when the spec fails to parse)
  readonly scenario?: string;
  readonly code: LintCode;
  readonly message: string;
}

/** True if `p` exists and is a directory. Never throws (TOCTOU-safe: a race or dangling
 * symlink between the check and the stat is treated as "not a directory", not an error). */
function isDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

/**
 * Validate one skill's spec + fixtures statically (and results-consistency when
 * committed results exist — see the consistency block). Never throws: a bad spec
 * becomes a single `code:"spec"` finding. Returns ALL findings so the CLI can
 * report every problem across every skill.
 */
export function lintSkill(skillDir: string): LintFinding[] {
  const specPath = join(skillDir, "tests", "specification.yaml");
  const findings: LintFinding[] = [];
  let spec: import("./spec.js").Spec;
  try {
    spec = loadSpec(specPath);
  } catch (e) {
    const message = e instanceof SpecError ? e.message : e instanceof Error ? e.message : String(e);
    return [{ skill: basename(skillDir), code: "spec", message }];
  }
  const skill = spec.skill;

  // ship_bar sanity
  if (spec.ship_bar.total < 1) {
    findings.push({ skill, code: "ship_bar", message: "ship_bar.total must be >= 1" });
  }
  if (spec.ship_bar.min_pass < 1) {
    findings.push({ skill, code: "ship_bar", message: "ship_bar.min_pass must be >= 1" });
  }
  if (spec.ship_bar.min_pass > spec.ship_bar.total) {
    findings.push({ skill, code: "ship_bar", message: `ship_bar.min_pass (${spec.ship_bar.min_pass}) > total (${spec.ship_bar.total})` });
  }
  if (spec.ship_bar.total > spec.scenarios.length) {
    findings.push({ skill, code: "ship_bar", message: `ship_bar.total (${spec.ship_bar.total}) > scenario count (${spec.scenarios.length})` });
  }

  // critical ids exist
  const ids = new Set(spec.scenarios.map((s) => s.id));
  for (const cid of spec.critical) {
    if (!ids.has(cid)) findings.push({ skill, code: "critical", message: `critical id \`${cid}\` is not a scenario` });
  }

  // fixture paths exist — check the EFFECTIVE workspace fixture (what the runtime actually
  // copies: run.ts uses scenario.workspace, not the raw scenario.fixture — an inline scenario
  // with env.workspace: fixture:PATH sets workspace.fixture but NOT scenario.fixture). Resolve
  // relative to the spec's dir, matching workspace.ts resolve(specDir, fixture) where specDir = <skillDir>/tests.
  const specDir = dirname(specPath);
  for (const s of spec.scenarios) {
    const fx = effectiveFixture(s); // shared with sources.ts so hashing and linting can't drift
    if (fx) {
      const abs = isAbsolute(fx) ? fx : resolve(specDir, fx);
      if (!isDir(abs)) {
        findings.push({ skill, scenario: s.id, code: "fixture", message: `fixture not found: ${fx}` });
      } else {
        // A mistyped fixture marker (`_uncommited/`) is rejected at run time by
        // createWorkspace — but only once a run has been started, where it surfaces as
        // a scenario FAIL among real results. lint is free, offline and runs in CI, so
        // it is where an author should meet this. The set flagged here is exactly the
        // set workspace.ts refuses, so lint can never bless a fixture the runtime then
        // rejects.
        // try/catch because lintSkill's contract is "never throws": isDir() proves the
        // path stats, not that it can be read, and an EACCES on readdir would escape
        // to cli.ts, which replaces this skill's ENTIRE finding list with one
        // lint-error — silently discarding the staleness and consistency checks below.
        let markers: string[] = [];
        try {
          markers = unknownMarkerDirs(abs);
        } catch (e) {
          findings.push({
            skill, scenario: s.id, code: "fixture",
            message: `fixture ${fx} could not be read: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        for (const dir of markers) {
          const guess = suggestMarker(dir);
          findings.push({
            skill,
            scenario: s.id,
            code: "fixture-marker",
            message:
              `fixture ${fx} has unknown top-level marker directory \`${dir}/\`` +
              (guess ? ` — did you mean \`${guess}/\`?` : "") +
              ` Known markers are ${MARKERS.map((m) => `\`${m}/\``).join(" and ")};` +
              ` rename it, or move it deeper if it is ordinary content.`,
          });
        }
      }
    }
  }

  // assert.post_test must exist. A post-test that isn't there fails its scenario at
  // run time with a "spec error" message, but that costs a full model run to discover
  // — and lint is the free, offline gate that exists to catch it first.
  for (const s of spec.scenarios) {
    const pt = s.assert?.post_test;
    if (!pt) continue;
    const abs = isAbsolute(pt) ? pt : resolve(specDir, pt);
    if (!isFile(abs)) {
      findings.push({ skill, scenario: s.id, code: "fixture", message: `assert.post_test not found: ${pt}` });
    }
  }

  // system_prompt_file must exist — an agent-file scenario silently falling back to
  // skill activation would measure the wrong artifact entirely.
  for (const s of spec.scenarios) {
    if (!s.systemPromptFile) continue;
    const abs = isAbsolute(s.systemPromptFile) ? s.systemPromptFile : resolve(specDir, s.systemPromptFile);
    if (!isFile(abs)) {
      findings.push({ skill, scenario: s.id, code: "fixture", message: `system_prompt_file not found: ${s.systemPromptFile}` });
    }
  }

  // results-consistency — only for committed results.yaml (skipped silently otherwise).
  // Each run dir gets ONE try: schema-1 is intentionally skipped (continue, no finding —
  // migrateResults carries a schema-1 grade verbatim, so recomputing it would false-flag).
  // Anything else that goes wrong (unparseable YAML, or a schema-2 file that's missing/
  // malformed fields — e.g. `scenarios: null`) is caught and surfaces as a `consistency`
  // finding instead of throwing (lintSkill never throws) or being silently dropped (a
  // broken committed artifact must fail the gate, not pass it).
  const resultsRoot = join(skillDir, "tests", "results");
  for (const runDir of enumerateRunDirs(resultsRoot)) {
    try {
      const raw = yaml.load(readFileSync(resultsPath(runDir), "utf8")) as { schema?: unknown };
      if (raw?.schema !== 2) continue; // schema-1 intentionally skipped — no finding
      const r = readResults(runDir);
      // A run whose scenario set no longer matches the spec predates a spec reshape
      // (scenarios added/removed). Its grade was computed against the OLD ship bar and
      // cannot be meaningfully recomputed against the new one — recomputing would flag
      // every historical run each time a spec grows. Staleness (source_hashes) is the
      // mechanism that says "re-run"; consistency only polices runs the current spec
      // can actually re-score. Override/transcript rules below still apply.
      const specIds = new Set(spec.scenarios.map((sc) => sc.id));
      const sameSet = r.scenarios.length === specIds.size && r.scenarios.every((sc) => specIds.has(sc.id));
      const ctx: ScoreContext | null = r.mode === "green" && !r.partial ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
      const recomputed = !sameSet ? null : finalizeResults(
        { skill: r.skill, harness: r.harness, model: r.model, judge: r.judge, timestamp: r.timestamp, label: r.label, mode: r.mode, partial: r.partial, source_hashes: r.source_hashes, scenarios: r.scenarios },
        ctx,
      ).effective_grade;
      if (recomputed && JSON.stringify(recomputed) !== JSON.stringify(r.effective_grade)) {
        findings.push({ skill, code: "consistency", message: `results.yaml effective_grade is stale in ${runDir} (recompute differs)` });
      }
      for (const s of r.scenarios) {
        if (s.override != null) {
          if (!s.note || !s.note.trim()) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no note (${runDir})` });
          if (findTranscriptFiles(runDir, s.id, r.mode).length === 0) findings.push({ skill, scenario: s.id, code: "consistency", message: `override on ${s.id} has no preserved transcript (${runDir})` });
        }
      }
    } catch (e) {
      findings.push({ skill, code: "consistency", message: `results.yaml unreadable or malformed in ${runDir}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  // staleness — the newest FULL (non-partial) run per model tag recorded sha256 hashes of
  // every source it measured: SKILL.md, agent files, each scenario's definition and each
  // fixture tree. If any has changed since, the committed result describes inputs that no
  // longer exist — exactly how three regressions hid behind a 100%-SHIP table for four
  // weeks, and how a swapped fixture went unreported by a "7 skills, 0 findings" lint.
  // Runs predating source_hashes (or predating a given key kind) are skipped silently — no
  // retroactive noise; partial runs never count as coverage.
  for (const tagDir of enumerateTagDirs(resultsRoot)) {
    // Newest FULL run: partial (--only) runs are iteration artifacts and never count as
    // coverage — a fresh partial must not silence a stale full run underneath it.
    let full: { runDir: string; r: import("./results.js").ResultsFile } | null = null;
    for (const runDir of runDirsNewestFirst(tagDir)) {
      try {
        const r = readResults(runDir);
        if (r.partial) continue;
        full = { runDir, r };
        break;
      } catch { break; } // unreadable → the consistency block already reports it
    }
    const hashes = full?.r.source_hashes;
    if (!full || !hashes) continue; // predates source_hashes → silent
    {
      const newest = full.runDir;
      const ctx = { skillDir, specDir, scenarios: spec.scenarios };
      for (const [key, recorded] of Object.entries(hashes)) {
        const what = describeSourceKey(key);
        const scenario = scenarioIdForKey(key, spec.scenarios);
        // The run itself failed to hash this source, so it was never verified and
        // no comparison here can establish anything about it.
        if (recorded === UNREADABLE) {
          findings.push({ skill, scenario, code: "stale", message: `${what} could not be read when the newest ${basename(tagDir)} run was recorded (${newest}) — that source was never verified; re-run` });
          continue;
        }
        const current = currentHashFor(key, ctx);
        // undefined = not comparable: a scenario the spec no longer has (a reshape,
        // per the scenario-set check above), or a key kind written by a newer
        // skill-harness than this one.
        if (current === undefined) continue;
        if (current === null) {
          findings.push({ skill, scenario, code: "stale", message: `${what} no longer exists but the newest ${basename(tagDir)} run measured it (${newest})` });
        } else if (current !== recorded) {
          findings.push({ skill, scenario, code: "stale", message: `${what} changed since the newest ${basename(tagDir)} run (${newest}) — results are stale; re-run before publishing` });
        }
      }

      // Coverage: a scenario the spec defines that the newest full run never
      // measured. Without this, RENAMING a scenario is invisible — the old key
      // resolves to "not comparable" and the new one was never recorded — so a
      // 100%/SHIP scorecard survives an arbitrary spec rewrite reporting zero
      // findings. Gated on the run having recorded scenario keys at all, so runs
      // predating the key kind stay silent like every other pre-existing run.
      if (Object.keys(hashes).some((k) => k.startsWith(SCENARIO_PREFIX))) {
        for (const s of spec.scenarios) {
          if (!(SCENARIO_PREFIX + s.id in hashes)) {
            findings.push({ skill, scenario: s.id, code: "stale", message: `the newest ${basename(tagDir)} run (${newest}) did not measure scenario \`${s.id}\` — the published result covers a different scenario set than the spec; re-run before publishing` });
          }
        }
      }
    }
  }

  return findings;
}

/** Model-tag dirs under tests/results (each holds timestamped run dirs). */
function enumerateTagDirs(resultsRoot: string): string[] {
  if (!existsSync(resultsRoot)) return [];
  try {
    return readdirSync(resultsRoot).map((t) => join(resultsRoot, t)).filter(isDir);
  } catch { return []; }
}

/** Timestamped run dirs holding a results.yaml, newest first (ISO slugs sort lexicographically). */
function runDirsNewestFirst(tagDir: string): string[] {
  let timestamps: string[];
  try { timestamps = readdirSync(tagDir); } catch { return []; }
  return timestamps.sort().reverse()
    .map((ts) => join(tagDir, ts))
    .filter((d) => isDir(d) && existsSync(join(d, "results.yaml")));
}

/**
 * All committed run dirs under a skill's tests/results (<tag>/<timestamp>/results.yaml).
 * Empty if none. Never throws: unreadable/dangling entries (e.g. a broken symlink, or a
 * TOCTOU removal between readdir and statSync) are skipped rather than propagated, so a
 * single bad entry can't abort lintSkill's "never throws" contract.
 */
function enumerateRunDirs(resultsRoot: string): string[] {
  if (!existsSync(resultsRoot)) return [];
  const out: string[] = [];
  let tags: string[];
  try { tags = readdirSync(resultsRoot); } catch { return out; }
  for (const tag of tags) {
    const tagDir = join(resultsRoot, tag);
    if (!isDir(tagDir)) continue;
    let timestamps: string[];
    try { timestamps = readdirSync(tagDir); } catch { continue; }
    for (const ts of timestamps) {
      const runDir = join(tagDir, ts);
      if (isDir(runDir) && existsSync(join(runDir, "results.yaml"))) out.push(runDir);
    }
  }
  return out;
}
