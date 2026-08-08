#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { load as yamlLoad } from "js-yaml";
import { basename, dirname, join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import {
  discover, resolveSkill,
  loadSpec, parseSpec,
  appendScenario,
  parseModelRef,
  runSkillModel, formatScorecard, type RunSummary,
  readResults, regradeRun,
  lintSkill, failsGate, type LintFinding,
  type HarnessAdapter,
  renderTemplateSpec, isTemplateSpec, renderDraftSpec, buildSuggestPrompt, parseSuggestDraft,
  rescoreRun,
  regateRun,
  specPathForRunDir,
  collectLift,
  collectStability, boundaryCells, stabilityNote, PATH_LEGEND,
  resolveAdjudicationJudges, adjudicateRun, judgeResemblesSubject,
  computeCoverage, formatCoverage,
  selectAffected, formatAffected, gitDiff,
  exec,
  type Scenario,
  HARNESS_VERSION,
  defaultJudge,
  assertJudgeAllowed,
  assertNotDowngraded,
  downgradeWarning,
} from "@skill-harness/core";
import { getAdapter } from "@skill-harness/adapters";
import { serveReview } from "./serve.js";

const DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";
// The judge default lives in core (`defaultJudge()`), which resolves
// SKILL_HARNESS_JUDGE over a baked value — it was duplicated in three places
// before, and the pi extension's copy could disagree with this one.
const DEFAULT_SUGGEST_MODEL = "claude-code:claude-opus-4-8";

export interface Args {
  _: string[];
  flags: Record<string, string | true>;
  multi: Record<string, string[]>; // repeatable flags
}

const REPEATABLE = new Set(["model", "turn", "check"]);

function parseArgs(argv: string[]): Args {
  const _: string[] = [];
  const flags: Record<string, string | true> = {};
  const multi: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      let key = a.slice(2);
      let val: string | true = true;
      const eq = key.indexOf("=");
      if (eq >= 0) {
        val = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        val = argv[++i];
      }
      if (REPEATABLE.has(key)) {
        (multi[key] ??= []).push(val === true ? "" : val);
      } else {
        flags[key] = val;
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags, multi };
}

export function flagStr(args: Args, key: string, fallback?: string): string | undefined {
  const v = args.flags[key];
  if (typeof v === "string") return v;
  if (v === true) return "";
  return fallback;
}

/** A boolean flag: bare `--flag`, or an explicit `--flag=true` / `--flag=1`. */
export function flagBool(args: Args, key: string): boolean {
  const v = args.flags[key];
  return v === true || v === "true" || v === "1";
}

function resolveModels(args: Args): string[] {
  const models = [...(args.multi.model ?? [])];
  const file = flagStr(args, "models");
  if (file) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) models.push(t);
    }
  }
  // comma-splitting within a single --model token
  const expanded = models.flatMap((m) => m.split(",").map((s) => s.trim()).filter(Boolean));
  return expanded.length ? expanded : [DEFAULT_MODEL];
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Parse the run's reps + pass-threshold flags. Throws on an invalid provided value. */
export function parseRunTuning(args: Args): { reps: number; passThreshold: number } {
  let reps = 1;
  const repsRaw = flagStr(args, "reps");
  if (repsRaw !== undefined && repsRaw !== "") {
    const n = Number(repsRaw);
    if (!Number.isInteger(n) || n < 1) throw new Error(`--reps must be a positive integer (got \`${repsRaw}\`)`);
    reps = n;
  }
  let passThreshold = 0.5;
  const ptRaw = flagStr(args, "pass-threshold");
  if (ptRaw !== undefined && ptRaw !== "") {
    const t = Number(ptRaw);
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error(`--pass-threshold must be a number in [0, 1] (got \`${ptRaw}\`)`);
    passThreshold = t;
  }
  return { reps, passThreshold };
}

// ---------------------------------------------------------------- commands

async function cmdList(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const skills = discover(root);
  console.log(`skills under ${root}:`);
  for (const s of skills) {
    if (!s.hasSpec) {
      console.log(`  ○ ${s.name}  (no spec)`);
      continue;
    }
    try {
      const spec = loadSpec(s.specPath);
      const seeded = spec.scenarios.filter((x) => x.mode === "seeded").length;
      const seededNote = seeded ? `, ${seeded} seeded` : "";
      console.log(`  ● ${s.name}  (${spec.scenarios.length} scenarios${seededNote})`);
    } catch (e) {
      console.log(`  ✗ ${s.name}  INVALID: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\n● = testable · ○ = no spec yet · ✗ = spec present but invalid`);
}

export async function cmdRun(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness run <skill|all> --skills <root>");

  // Judge policy is checked first, ahead of the harness/PATH check and long before
  // any subject tokens are spent: a refusal that arrives after the model has been
  // paid for is a worse version of the problem it exists to prevent.
  const judgeFlagRun = flagStr(args, "judge");
  const judge = parseModelRef(judgeFlagRun ?? defaultJudge());
  assertJudgeAllowed(judge, {
    source: judgeFlagRun ? "--judge" : "the default judge (SKILL_HARNESS_JUDGE or the baked value)",
    allowMetered: flagBool(args, "allow-metered-judge"),
  });

  const harnessName = flagStr(args, "harness", "pi")!;
  const adapter = getAdapter(harnessName);
  if (!(await adapter.available())) throw new Error(`harness \`${harnessName}\` is not on PATH`);

  const mode = (flagStr(args, "mode", "green") as "red" | "green" | "force") || "green";
  const canary = flagBool(args, "canary");
  const label = flagStr(args, "label") || null;
  const parallel = Math.max(1, Number(flagStr(args, "parallel", "1")) || 1);
  const { reps, passThreshold } = parseRunTuning(args);
  const onlyRaw = flagStr(args, "only");
  let only = onlyRaw ? onlyRaw.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
  const affected = flagBool(args, "affected");
  if (affected && only) {
    throw new Error("--affected and --only both choose the scenario set — pass one, not both");
  }
  const modelTokens = resolveModels(args);

  const skills =
    target === "all"
      ? discover(root).filter((s) => s.hasSpec)
      : [resolveSkill(root, target)];

  const summaries: RunSummary[] = [];
  for (const skill of skills) {
    if (!skill.hasSpec) {
      console.log(`skip ${skill.name}: no spec`);
      continue;
    }
    // A run from an older tool than the records already here would produce numbers
    // that look comparable and are not. Checked per skill, before its first token.
    assertNotDowngraded(skill.dir, "run");
    const spec = loadSpec(skill.specPath);
    if (affected) {
      // Reuses the exact `--only` machinery, so an affected run is partial and
      // cannot report SHIP — the same guarantee, through the same code path.
      const result = await computeAffected(args, spec.scenarios, skill.specPath);
      console.log(formatAffected(result, spec.scenarios.length));
      only = result.selected.map((sel) => sel.id);
      if (only.length === 0) {
        console.log(`skip ${skill.name}: no scenario is affected by this change`);
        continue;
      }
    }
    for (const token of modelTokens) {
      const model = parseModelRef(token);
      // The version is on the banner because a stale global install is otherwise
      // invisible: a 0.1.0 binary grades a 0.3.x corpus, produces plausible
      // numbers, and nothing on screen says which tool made them.
      console.log(`\n▶ ${spec.skill} · ${harnessName}:${token} · mode=${mode} · judge=${judge.provider}:${judge.model} · skill-harness ${HARNESS_VERSION}`);
      const summary = await runSkillModel({
        spec,
        skillDir: skill.dir,
        specPath: skill.specPath,
        adapter,
        model,
        modelToken: token,
        judge,
        mode,
        timestamp: nowIso(),
        label,
        concurrency: parallel,
        reps,
        passThreshold,
        only,
        canary,
        onProgress: (m) => console.log(m),
      });
      summaries.push(summary);
      // Lift is derived from what's on disk, so it picks up a red baseline from
      // any earlier run — the tag dir (<harness>-<modelslug>) is the join key.
      const tag = basename(dirname(summary.runDir));
      const lift = collectLift(skill.dir).find((l) => l.tag === tag);
      // Stability is derived from history INCLUDING the run just written, and scoped to
      // this tag + mode: another model's flips under this model's scorecard would be a
      // worse error than not reporting them at all.
      const stability = collectStability(skill.dir).filter((c) => c.tag === tag && c.mode === summary.results.mode);
      console.log("\n" + formatScorecard(summary, lift, stability) + "\n");
    }
  }

  console.log(`\nReview interactively:  skill-harness review ${skills[0]?.name ?? "<skill>"} --skills ${root}`);
}

export async function cmdGrade(args: Args, adapterOverride?: HarnessAdapter): Promise<void> {
  const runDir = args._[0];
  if (!runDir) throw new Error("usage: skill-harness grade <run-dir> [--judge prov:model] [--suspect-only]");
  if (!existsSync(runDir)) {
    throw new Error(`run dir not found: ${resolve(runDir)} (relative paths resolve against the cwd)`);
  }

  // spec lives at <runDir>/../../../specification.yaml  (results/<tag>/<ts> -> tests/)
  const testsDir = dirname(dirname(dirname(runDir)));
  const specPath = join(testsDir, "specification.yaml");
  const spec = loadSpec(specPath);

  const prev = existsSync(join(runDir, "results.yaml")) ? readResults(runDir) : null;
  // Re-judge with the run's RECORDED judge + harness (parity with /rejudge) —
  // an explicit --judge flag still wins; with no prior results, fall back to
  // the CLI default.
  const judgeFlag = flagStr(args, "judge");
  const judge = judgeFlag ? parseModelRef(judgeFlag) : (prev?.judge ?? parseModelRef(defaultJudge()));
  // A regrade reuses the judge the run RECORDED, so a run that names a metered judge
  // bills on every later regrade with no flag typed anywhere. Latent rather than live
  // in the reference corpus (all ~140 committed runs there record `claude-code`), but
  // it is the one path where the cost decision was made by a file, not a person.
  assertJudgeAllowed(judge, {
    source: judgeFlag ? "--judge" : prev?.judge ? "the run's recorded judge" : "the default judge",
    allowMetered: flagBool(args, "allow-metered-judge"),
  });
  const adapter = adapterOverride ?? getAdapter(prev?.harness ?? "pi");

  // Warn rather than refuse: re-grading is cheap, it writes no new measurement of the
  // model, and it is one of the ways someone diagnoses a stale install in the first
  // place. Blocking the diagnosis would be the wrong trade.
  const stale = downgradeWarning(dirname(testsDir));
  if (stale) console.error(stale);

  const results = await regradeRun({
    runDir, spec, adapter, judge, specDir: testsDir, now: nowIso,
    onlySuspect: flagBool(args, "suspect-only"),
  });
  for (const s of results.scenarios) {
    console.log(`  ${s.id} → ${s.judge_verdict}: ${s.judge_reason}`);
  }
  let final = results;

  // Adjudication is opt-in. Without --auto-rejudge nothing below runs and not one
  // extra call is made — a spec may declare triggers, but spec configuration alone
  // never authorizes spending.
  const judges = resolveAdjudicationJudges({
    enabled: flagBool(args, "auto-rejudge"),
    primary: judge,
    secondaryToken: flagStr(args, "secondary-judge"),
    tieBreakToken: flagStr(args, "tie-break-judge"),
    subject: parseModelRef(results.model),
    parseRef: parseModelRef,
    assertAllowed: (j, source) => assertJudgeAllowed(j, { source, allowMetered: flagBool(args, "allow-metered-judge") }),
    resemblesSubject: judgeResemblesSubject,
    warn: (m) => console.error(m),
  });

  if (judges) {
    final = await adjudicateRun({
      runDir, spec, adapter, results, primaryJudge: judge,
      secondaryJudge: judges.secondary, tieBreakJudge: judges.tieBreak,
      specDir: testsDir, now: nowIso,
      log: (m) => console.log(m),
    });
  }

  const g = final.effective_grade;
  console.log(`\n  re-graded with ${judge.provider}:${judge.model} → ${g.letter} (${g.pct}%) ${g.ship ? "SHIP" : "NOT READY"}`);
}

/**
 * Re-score saved runs against the current spec's thresholds — no model or judge calls.
 * Reps are the measurement; thresholds are policy. When policy changes, recompute rather
 * than reconcile two numbers in prose.
 */
async function cmdRescore(args: Args): Promise<void> {
  const runDirs = args._;
  if (runDirs.length === 0) throw new Error("usage: skill-harness rescore <run-dir> [<run-dir> ...]");
  let moved = 0;
  for (const raw of runDirs) {
    const runDir = resolve(raw);
    if (!existsSync(runDir)) throw new Error(`run dir not found: ${runDir} (relative paths resolve against the cwd)`);
    const spec = loadSpec(specPathForRunDir(runDir));
    const { results, changes } = rescoreRun({ runDir, spec, now: nowIso });
    const g = results.effective_grade;
    console.log(`\n${results.skill} · ${results.model}`);
    for (const c of changes) {
      console.log(`  ${c.id}: ${c.from} → ${c.to}  (${c.passes}/${c.clean} @ threshold ${c.toThreshold})`);
    }
    if (changes.length === 0) console.log("  (no verdict changed)");
    moved += changes.length;
    console.log(`  → ${g.letter} (${g.pct}%) ${g.passed}/${g.total} ${g.ship ? "SHIP" : "NOT READY"}`);
  }
  console.log(`\n${runDirs.length} run(s) re-scored, ${moved} verdict(s) moved.`);
}

/**
 * Re-evaluate needle gates against the saved staged diffs — free, except for the reps
 * whose gate verdict flips from fail to pass, which the judge never saw and must now
 * be shown. Prints the cost before making those calls.
 */
export async function cmdRegate(args: Args, adapterOverride?: HarnessAdapter): Promise<void> {
  const runDirs = args._;
  if (runDirs.length === 0) throw new Error("usage: skill-harness regate <run-dir> [<run-dir> ...] [--judge prov:model]");

  const judgeFlag = flagStr(args, "judge");
  let moved = 0;
  let calls = 0;
  for (const raw of runDirs) {
    const runDir = resolve(raw);
    if (!existsSync(runDir)) throw new Error(`run dir not found: ${runDir} (relative paths resolve against the cwd)`);
    const specPath = specPathForRunDir(runDir);
    const spec = loadSpec(specPath);
    const prev = readResults(runDir);
    const judge = judgeFlag ? parseModelRef(judgeFlag) : (prev.judge ?? parseModelRef(defaultJudge()));
    assertJudgeAllowed(judge, {
      source: judgeFlag ? "--judge" : "the run's recorded judge",
      allowMetered: flagBool(args, "allow-metered-judge"),
    });

    const { results, changes, judgeCalls } = await regateRun({
      runDir, spec, specDir: dirname(specPath),
      adapter: adapterOverride ?? getAdapter(prev.harness ?? "pi"),
      judge, now: nowIso,
    });
    const g = results.effective_grade;
    console.log(`\n${results.skill} · ${results.model}`);
    for (const c of changes) {
      console.log(`  ${c.id}: ${c.from} → ${c.to}  (gate ${c.gate}${c.judged ? ", re-judged from the saved transcript" : ", no judge call"})`);
    }
    if (changes.length === 0) console.log("  (no verdict changed)");
    console.log(`  → ${g.letter} (${g.pct}%) ${g.passed}/${g.total} ${g.ship ? "SHIP" : "NOT READY"}`);
    moved += changes.length;
    calls += judgeCalls;
  }
  // The cost line matters: regate is advertised as free, and it is — except for the
  // flipped reps, which it must not spend silently.
  console.log(`\n${runDirs.length} run(s) re-gated, ${moved} verdict(s) moved, ${calls} judge call(s) (no model re-runs).`);
}

/**
 * Run-over-run verdict stability, derived from committed results. Free and offline: it
 * reads results.yaml files and computes — no model, no judge, no harness.
 *
 * Exits 0 whatever it finds. A boundary cell is not a defect in the skill or in the
 * spec; it is a statement about how much one run of that cell is worth. Making it a
 * gate would turn "this needs more reps" into "your build is broken".
 */
async function cmdStability(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0] ?? "all";
  const windowRaw = flagStr(args, "window");
  const window = windowRaw ? Number(windowRaw) : undefined;
  if (windowRaw !== undefined && (!Number.isInteger(window) || (window as number) < 2)) {
    throw new Error(`--window must be an integer >= 2 (got \`${windowRaw}\`) — one run has no run-over-run step`);
  }
  const showAll = flagBool(args, "all");

  const skills = target === "all" ? discover(root).filter((s) => s.hasSpec) : [resolveSkill(root, target)];
  if (skills.length === 0) throw new Error(`no skills with a spec under ${root}`);

  let boundaries = 0;
  for (const skill of skills) {
    const all = collectStability(skill.dir, { window });
    if (all.length === 0) {
      console.log(`\n${skill.name}: no scored runs yet — stability needs at least two runs of the same skill × model × mode`);
      continue;
    }
    // One block per model tag × delivery mode: green and force are different
    // deliveries of the same text, so their histories are never one series.
    const groups = new Map<string, typeof all>();
    for (const s of all) {
      const key = `${s.tag} · mode=${s.mode}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
    }
    console.log(`\n── ${skill.name} ──`);
    for (const [key, cells] of groups) {
      const runs = Math.max(...cells.map((c) => c.points.length));
      console.log(`  ${key}  (${runs} run(s) in the window)`);
      const boundary = boundaryCells(cells);
      boundaries += boundary.length;
      for (const s of boundary) {
        console.log(`    ⇄ ${s.critical ? "CRITICAL " : ""}${stabilityNote(s)}`);
      }
      if (showAll) {
        for (const s of cells) {
          if (s.state !== "boundary") console.log(`    ${s.state === "stable" ? "=" : "?"} ${stabilityNote(s)}`);
        }
      } else {
        const stable = cells.filter((c) => c.state === "stable").length;
        const unmeasured = cells.filter((c) => c.state === "unmeasured").length;
        console.log(`    ${stable} held their verdict · ${unmeasured} with no comparable step (--all to list them)`);
      }
    }
  }
  console.log(`\n${boundaries} boundary cell(s). ${PATH_LEGEND}`);
  if (boundaries > 0) {
    console.log(`A boundary cell is worth re-running with more reps (--reps) before you trust one run of it;`);
    console.log(`within-run flakiness cannot see this, because it only ever looks at one run.`);
  }
}

async function cmdReview(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness review <skill> --skills <root>");
  const skill = resolveSkill(root, target);
  const port = Number(flagStr(args, "port", "0")) || 0;
  await serveReview({ skillDir: skill.dir, skillName: skill.name, port });
}

async function cmdAddTest(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness add-test <skill> --skills <root> --id ... --title ... --turn ... --check ...");
  const skill = resolveSkill(root, target);
  if (!skill.hasSpec) throw new Error(`${target} has no spec yet — create tests/specification.yaml first`);

  const id = flagStr(args, "id");
  const title = flagStr(args, "title");
  const turns = args.multi.turn ?? [];
  const checks = args.multi.check ?? [];
  if (!id || !title || turns.length === 0 || checks.length === 0) {
    throw new Error("add-test requires --id, --title, at least one --turn and one --check");
  }

  const scenario: Record<string, unknown> = { id, title };
  if (flagStr(args, "critical") !== undefined) scenario.critical = true;
  const mode = flagStr(args, "mode");
  if (mode === "seeded") {
    scenario.mode = "seeded";
    scenario.fixture = flagStr(args, "fixture") ?? `fixtures/${id}`;
  }
  scenario.turns = turns;
  scenario.checklist = checks;

  // Duplicate-id rejection, merged-spec validation and the atomic write all live
  // in appendScenario — shared with capture promotion so the two paths cannot
  // disagree about what a valid write is.
  appendScenario({ specPath: skill.specPath, scenario });
  console.log(`added scenario ${id} to ${skill.specPath}`);
}

/**
 * `coverage` — which instruction sections have a test declared against them.
 *
 * Free and offline. `--strict` turns uncovered sections into a non-zero exit, and
 * is opt-in: an uncovered section is information, not a defect, and a linter that
 * reddens CI for it teaches people to add a token `covers:` to silence it.
 */
async function cmdCoverage(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness coverage <skill|all> --skills <root> [--strict]");
  const strict = flagBool(args, "strict");
  const skills = target === "all" ? discover(root).filter((s) => s.hasSpec) : [resolveSkill(root, target)];

  let anyUncovered = false;
  let anyBroken = false;
  for (const skill of skills) {
    if (!skill.hasSpec) continue;
    const spec = loadSpec(skill.specPath);
    const specDir = dirname(skill.specPath);
    const report = computeCoverage({
      specDir,
      scenarios: spec.scenarios,
      // SKILL.md lives one level above tests/, and is the file `covers` almost
      // always points at, so report on it even when nothing references it —
      // otherwise a skill with zero `covers` reports 0 sections and looks fine.
      baseFiles: [relative(specDir, join(skill.dir, "SKILL.md")).split("\\").join("/")],
      pendingCaptures: readPendingCaptures(specDir),
    });
    console.log(formatCoverage(report, spec.skill));
    if (report.uncovered.length) anyUncovered = true;
    if (report.broken.length) anyBroken = true;
  }

  // A broken reference fails regardless of --strict: it is a wrong statement in
  // the spec, not a gap in coverage.
  if (anyBroken) {
    console.error("\nbroken `covers` references above — fix the reference or the heading");
    process.exitCode = 1;
    return;
  }
  if (strict && anyUncovered) {
    console.error("\n--strict: some sections have no declared test");
    process.exitCode = 1;
  }
}

/** Pending captures and the sections they are parked against. Free, offline, tolerant. */
function readPendingCaptures(specDir: string): { id: string; covers: string[] }[] {
  const dir = join(specDir, "captures");
  if (!existsSync(dir)) return [];
  const out: { id: string; covers: string[] }[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
    try {
      const raw = yamlLoad(readFileSync(join(dir, file), "utf8")) as Record<string, unknown> | null;
      if (!raw || raw.status === "promoted") continue;
      const covers = Array.isArray(raw.covers) ? raw.covers.filter((c): c is string => typeof c === "string") : [];
      if (covers.length) out.push({ id: String(raw.id ?? file.replace(/\.yaml$/, "")), covers });
    } catch {
      // A malformed capture is the capture command's problem to report; coverage
      // must not fail because a draft file is mid-edit.
    }
  }
  return out;
}

/** `affected` — which scenarios a change could plausibly touch. Free and offline. */
async function cmdAffected(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness affected <skill> --skills <root> [--base <git-ref>]");
  const skill = resolveSkill(root, target);
  if (!skill.hasSpec) throw new Error(`${target} has no spec`);
  const spec = loadSpec(skill.specPath);
  const result = await computeAffected(args, spec.scenarios, skill.specPath);
  console.log(formatAffected(result, spec.scenarios.length));
}

/** Shared by `affected` and `run --affected`, so the two can never disagree. */
async function computeAffected(args: Args, scenarios: Scenario[], specPath: string) {
  const base = flagStr(args, "base", "HEAD")!;
  const repoRoot = await gitRepoRoot(dirname(specPath));
  const diff = await gitDiff(repoRoot, base);
  return selectAffected({ scenarios, specDir: dirname(specPath), diff, repoRoot });
}

async function gitRepoRoot(from: string): Promise<string> {
  const r = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: from, timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`not a git repository (from ${from}) — --affected needs one to diff against`);
  return r.stdout.trim();
}

/** Write a spec to disk, creating its tests/ dir. The single choke point for spec
 *  writes (init/suggest) so a future atomic-write/backup/audit change lands in one place. */
function writeSpecFile(specPath: string, text: string): void {
  mkdirSync(dirname(specPath), { recursive: true });
  writeFileSync(specPath, text, "utf8");
}

export async function cmdInit(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness init <skill> --skills <root> [--force]");
  const skill = resolveSkill(root, target);
  const force = flagStr(args, "force") !== undefined;
  if (skill.hasSpec && !force) {
    throw new Error(`${skill.specPath} exists — edit it, or pass --force to overwrite`);
  }
  const text = renderTemplateSpec(skill.name);
  parseSpec(text, skill.specPath); // guard: the template must always be valid
  writeSpecFile(skill.specPath, text);
  console.log(`wrote template ${skill.specPath} — fill it in, or run \`skill-harness suggest ${skill.name}\` to LLM-draft it.`);
}

export async function cmdSuggest(args: Args, adapterOverride?: HarnessAdapter): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness suggest <skill> --skills <root> [--model prov:model] [--force]");

  // resolveSkill throws a SKILL.md-specific error when the directory exists but
  // lacks one, so we don't reimplement that check here; a resolved skill always
  // has a SKILL.md at skill.dir.
  const skill = resolveSkill(root, target);
  const skillMd = readFileSync(join(skill.dir, "SKILL.md"), "utf8");

  // Overwrite without --force only when the target is absent or an *unedited*
  // template. A file that still carries the sentinel but no longer matches the
  // pristine template has been hand-edited — refuse it so we never clobber work.
  const force = flagStr(args, "force") !== undefined;
  if (skill.hasSpec && !force) {
    const existing = readFileSync(skill.specPath, "utf8");
    if (existing !== renderTemplateSpec(skill.name)) {
      const hint = isTemplateSpec(existing)
        ? "looks like an edited template — pass --force to overwrite (or delete your edits)"
        : "already has real content — pass --force to overwrite";
      throw new Error(`${skill.specPath} ${hint}`);
    }
  }

  const model = parseModelRef(flagStr(args, "model", DEFAULT_SUGGEST_MODEL)!);
  const adapter = adapterOverride ?? getAdapter("pi");
  const cwd = mkdtempSync(join(tmpdir(), "sh-suggest-cwd-"));
  try {
    const basePrompt = buildSuggestPrompt(skill.name, skillMd);
    let text: string | null = null;
    let count = 0;
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && text === null; attempt++) {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous reply was rejected: ${lastErr}. Return corrected JSON only.`;
      const raw = await adapter.judge({ model, prompt, cwd });
      // A `[judge error` prefix is a hard adapter failure (auth, exec, credits) —
      // retrying won't help, so fail fast with a model hint. An empty reply is
      // treated as a transient miss and gets the same retry as a bad-JSON reply.
      if (raw.startsWith("[judge error")) {
        throw new Error(`model ${model.provider}:${model.model} failed — ${raw.trim()} (try --model fireworks:...)`);
      }
      if (!raw.trim()) {
        lastErr = "model produced no output";
        continue;
      }
      try {
        const draft = parseSuggestDraft(raw);
        const candidate = renderDraftSpec(skill.name, draft);
        parseSpec(candidate, skill.specPath); // validate before writing
        text = candidate;
        count = draft.scenarios.length;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (text === null) {
      throw new Error(`could not get a valid spec from ${model.provider}:${model.model} after 2 attempts (${lastErr}) — try \`skill-harness init ${skill.name}\` for a manual template`);
    }
    writeSpecFile(skill.specPath, text);
    console.log(`drafted ${count} scenario(s) → ${skill.specPath}`);
    console.log(`review it (especially the proposed critical set), then \`skill-harness run ${skill.name} --skills ${root}\``);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/**
 * Exit-code contract: 0 = no gate-failing findings, 1 = >=1 of them, or a resolution
 * error (unknown skill/root, no skills with a spec).
 *
 * `info` findings (run-over-run stability notes) print and annotate but never fail the
 * gate: a boundary cell says how much one run of a scenario is worth, which is not a
 * defect in the spec, the fixtures or the results. A linter that reddens CI for it would
 * teach everyone to stop reading it.
 */
export async function cmdLint(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0] ?? "all";
  let skillDirs: string[];
  try {
    skillDirs = target === "all"
      ? discover(root).filter((s) => s.hasSpec).map((s) => s.dir)
      : [resolveSkill(root, target).dir];
  } catch (e) {
    console.error(`error: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
    return;
  }
  if (skillDirs.length === 0) {
    console.error(`no skills with a spec under ${root}`);
    process.exitCode = 1;
    return;
  }
  const gha = process.env.GITHUB_ACTIONS === "true";
  const findings: LintFinding[] = [];
  for (const dir of skillDirs) {
    let f: LintFinding[];
    try { f = lintSkill(dir); }
    catch (e) { f = [{ skill: dir, code: "lint-error", message: e instanceof Error ? e.message : String(e) }]; }
    findings.push(...f);
    if (f.filter(failsGate).length === 0) console.log(`✓ ${dir}`);
    for (const x of f) {
      const where = x.scenario ? `${dir}/${x.scenario}` : dir; // dir-based label, consistent with the ✓ line
      const fails = failsGate(x);
      console.log(`${fails ? "✗" : "ℹ"} ${where}: ${x.code} — ${x.message}`);
      if (gha) console.log(`::${fails ? "error" : "notice"} title=skill-harness::${where}: ${x.code} — ${x.message}`);
    }
  }
  const gating = findings.filter(failsGate).length;
  const notes = findings.length - gating;
  console.log(`\n${skillDirs.length} skill(s), ${gating} finding(s)${notes > 0 ? `, ${notes} note(s) (do not fail the gate)` : ""}`);
  process.exitCode = gating > 0 ? 1 : 0;
}

// ---------------------------------------------------------------- dispatch

/**
 * The help text, rendered per call rather than frozen at module load.
 *
 * The `defaults:` line reports the judge that the *next* command will actually
 * use, which `SKILL_HARNESS_JUDGE` can change after this module was imported. A
 * help screen that prints a default the tool won't use is worse than one that
 * prints none.
 */
export function help(): string {
  return `skill-harness ${HARNESS_VERSION} — test/optimize loop for agent skills (pi harness)

  run    <skill|all> --skills <root> [--model prov:model ...] [--models file] [--only A1,D2]
                     [--affected --base <git-ref>]  run only the scenarios a change could touch (partial; never SHIPs)
                     [--mode red|green|force] [--judge prov:model] [--harness pi] [--label name] [--parallel N] [--reps N] [--pass-threshold T]
                     [--canary]  green only: spend ONE probe proving the skill reached the model, and abort the run if it did not
  grade  <run-dir>   [--judge prov:model] [--suspect-only]   re-grade saved transcripts (neutral judge)
                     [--auto-rejudge] [--secondary-judge p:m] [--tie-break-judge p:m]
                       ask again about untrustworthy cells (ambiguous / contradictory / non-unanimous /
                       ship-deciding). OFF by default; prints the exact MAX extra call count first.
  rescore <run-dir>...                          re-score saved reps vs current spec thresholds (free)
  regate <run-dir>...  [--judge prov:model]     re-evaluate diff needles against the saved diffs (free; judges only reps whose gate flipped)
  stability <skill|all> --skills <root> [--window N] [--all]  run-over-run verdict flips per scenario (free, offline)
  review <skill>     --skills <root> [--port N] serve the interactive review UI
  add-test <skill>   --skills <root> --id ID --title T --turn ... --check ... [--critical] [--mode seeded --fixture path]
  init   <skill>     --skills <root> [--force]     scaffold a commented template spec (free, offline)
  suggest <skill>    --skills <root> [--model prov:model] [--force]  LLM-draft a spec from SKILL.md (spends tokens)
  list   --skills <root>                        discovered skills + spec status
  lint   <skill|all> --skills <root>           validate specs/fixtures + results-consistency (CI gate; exits non-zero on findings)
  coverage <skill|all> --skills <root> [--strict]   which instruction sections have a declared test (free, offline)
  affected <skill>   --skills <root> [--base ref]   which scenarios a change could touch (free, offline)

  version  print ${HARNESS_VERSION} and exit (also --version / -v)

defaults: model=${DEFAULT_MODEL}  judge=${defaultJudge()}  mode=green  harness=pi
  green and force are both scored; red is the unscored baseline. green delivery depends on the
  harness version (pi >= 0.83.0 discloses only the skill's description and loads the body on demand),
  so --mode force is the delivery that cannot silently degrade — and --canary proves green per run.
  the judge default is Opus on your Claude subscription (\`claude-code\` → \`claude -p\`), not a
  metered API key. Set SKILL_HARNESS_JUDGE to change it for a repo or a shell; --judge wins over both.`;
}

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  switch (cmd) {
    case "run": return cmdRun(args);
    case "grade": return cmdGrade(args);
    case "rescore": return cmdRescore(args);
    case "regate": return cmdRegate(args);
    case "stability": return cmdStability(args);
    case "review": return cmdReview(args);
    case "add-test": return cmdAddTest(args);
    case "init": return cmdInit(args);
    case "suggest": return cmdSuggest(args);
    case "list": return cmdList(args);
    case "lint": return cmdLint(args);
    case "coverage": return cmdCoverage(args);
    case "affected": return cmdAffected(args);
    case "version":
    case "--version":
    case "-v":
      // Bare version, one line, nothing else: this is what a script or a confused
      // user greps to find out whether the binary on PATH is the one they think.
      console.log(HARNESS_VERSION);
      return;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(help());
      return;
    default:
      console.error(`unknown command: ${cmd}\n`);
      console.log(help());
      process.exitCode = 1;
  }
}

// Skip dispatch under vitest: importing this module (e.g. to exercise cmdGrade
// directly in tests) must not also run a CLI command against the test runner's
// own argv. Real entrypoints (tsx on src/cli.ts, or the bin launcher importing
// dist/cli.js) never set VITEST, so this leaves production invocation untouched.
if (!process.env.VITEST) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`error: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
