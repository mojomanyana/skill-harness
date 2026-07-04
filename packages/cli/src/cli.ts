import { readFileSync, existsSync, appendFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import {
  discover, resolveSkill,
  loadSpec, parseSpec,
  parseModelRef,
  runSkillModel, formatScorecard, type RunSummary,
  buildJudgePrompt, judgeInWorkspace,
  readResults, writeResults, transcriptPath, appendJournal, type ScenarioResult,
} from "@skill-check/core";
import { getAdapter } from "@skill-check/adapters";
import { serveReview } from "./serve.js";

const DEFAULT_MODEL = "fireworks:accounts/fireworks/models/deepseek-v4-pro";
const DEFAULT_JUDGE = "anthropic:claude-opus-4-8";

interface Args {
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

function flagStr(args: Args, key: string, fallback?: string): string | undefined {
  const v = args.flags[key];
  if (typeof v === "string") return v;
  if (v === true) return "";
  return fallback;
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

async function cmdRun(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-check run <skill|all> --skills <root>");

  const harnessName = flagStr(args, "harness", "pi")!;
  const adapter = getAdapter(harnessName);
  if (!(await adapter.available())) throw new Error(`harness \`${harnessName}\` is not on PATH`);

  const mode = (flagStr(args, "mode", "green") as "red" | "green" | "force") || "green";
  const judge = parseModelRef(flagStr(args, "judge", DEFAULT_JUDGE)!);
  const label = flagStr(args, "label") || null;
  const parallel = Math.max(1, Number(flagStr(args, "parallel", "1")) || 1);
  const reps = Math.max(1, Math.floor(Number(flagStr(args, "reps", "1")) || 1));
  const ptRaw = Number(flagStr(args, "pass-threshold", "0.5"));
  const passThreshold = Number.isFinite(ptRaw) && ptRaw >= 0 && ptRaw <= 1 ? ptRaw : 0.5;
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
    const spec = loadSpec(skill.specPath);
    for (const token of modelTokens) {
      const model = parseModelRef(token);
      console.log(`\n▶ ${spec.skill} · ${harnessName}:${token} · mode=${mode} · judge=${judge.provider}:${judge.model}`);
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
        onProgress: (m) => console.log(m),
      });
      summaries.push(summary);
      console.log("\n" + formatScorecard(summary) + "\n");
    }
  }

  console.log(`\nReview interactively:  skill-check review ${skills[0]?.name ?? "<skill>"} --skills ${root}`);
}

export async function cmdGrade(args: Args): Promise<void> {
  const runDir = args._[0];
  if (!runDir || !existsSync(runDir)) throw new Error("usage: skill-check grade <run-dir> [--judge prov:model]");
  const judge = parseModelRef(flagStr(args, "judge", DEFAULT_JUDGE)!);

  // spec lives at <runDir>/../../../specification.yaml  (results/<tag>/<ts> -> tests/)
  const testsDir = dirname(dirname(dirname(runDir)));
  const specPath = join(testsDir, "specification.yaml");
  const spec = loadSpec(specPath);
  const adapter = getAdapter("pi");

  const prev = existsSync(join(runDir, "results.yaml")) ? readResults(runDir) : null;
  const overrides = new Map((prev?.scenarios ?? []).map((s) => [s.id, { override: s.override, note: s.note }]));
  const mode = prev?.mode ?? "green";

  // Re-grading rewrites the WHOLE results.yaml, so re-judge exactly the
  // scenarios the run recorded (falling back to the spec for a run with no
  // prior results). The guard and the loop iterate the SAME `targets` set, so
  // they can't diverge: each target must still exist in the spec (for its
  // checklist) AND have a transcript on disk — only overridden transcripts
  // survive a commit (audit-trail design). Anything missing would silently drop
  // a recorded verdict or shrink the grade denominator. Fail fast, before
  // spending any judge calls.
  const specById = new Map(spec.scenarios.map((s) => [s.id, s]));
  const targets = (prev?.scenarios ?? spec.scenarios).map((s) => s.id);

  // Full rep-aware re-grade is deferred to a later milestone. A --reps N>1 run
  // only ever writes rep-suffixed transcripts (`<id>.green.rep<k>.txt`), never
  // the plain `<id>.green.txt` this command reads — so re-grading a reps run
  // would otherwise misreport every scenario as having "no green transcripts".
  // Detect that case and fail with an accurate message instead.
  const entries = readdirSync(runDir);
  const isRepsOnly = (id: string): boolean => {
    if (existsSync(transcriptPath(runDir, id, "green"))) return false;
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repPattern = new RegExp(`^${escaped}\\.green\\.rep\\d+\\.txt$`);
    return entries.some((e) => repPattern.test(e));
  };
  if (targets.some(isRepsOnly)) {
    throw new Error(
      `${runDir} is a --reps run (rep-suffixed transcripts); re-grading reps runs isn't supported yet — resolve suspect scenarios with an override in \`skill-check review\`, or re-run the skill`
    );
  }

  const missing = targets.filter((id) => !specById.has(id) || !existsSync(transcriptPath(runDir, id, "green")));
  if (missing.length === targets.length) {
    throw new Error(`no green transcripts in ${runDir} — nothing to re-grade`);
  }
  if (missing.length > 0) {
    throw new Error(
      `cannot re-grade ${missing.join(", ")} in ${runDir} (transcript missing or scenario no longer in the spec) — re-run instead of grading`
    );
  }

  const scenarioResults: ScenarioResult[] = [];
  for (const id of targets) {
    const scenario = specById.get(id)!; // guaranteed present by the guard above
    const transcript = readFileSync(transcriptPath(runDir, id, "green"), "utf8");
    const prompt = buildJudgePrompt({ skill: spec.skill, persona: spec.judge_persona, scenario, transcript });
    const g = await judgeInWorkspace(adapter, judge, prompt, testsDir);
    console.log(`  ${id} → ${g.verdict}: ${g.reason}`);
    appendJournal(runDir, {
      event: "judge-verdict", ts: nowIso(),
      id, verdict: g.verdict, reason: g.reason, suspect: g.suspect,
    });
    // Mirror run.ts: a suspect verdict also emits a misfire-flag, so journal
    // consumers that scan for misfires see re-graded ones too.
    if (g.suspect) {
      appendJournal(runDir, { event: "misfire-flag", ts: nowIso(), id, reason: g.reason });
    }
    const carry = overrides.get(id);
    scenarioResults.push({
      id,
      judge_verdict: g.verdict,
      judge_reason: g.reason,
      suspect: g.suspect,
      override: carry?.override ?? null,
      note: carry?.note ?? "",
    });
  }

  const ctx = mode === "green" ? { shipBar: spec.ship_bar, critical: spec.critical } : null;
  const results = writeResults(runDir, {
    skill: spec.skill,
    harness: prev?.harness ?? "pi",
    model: prev?.model ?? "unknown",
    judge: { provider: judge.provider, model: judge.model },
    timestamp: nowIso(),
    label: prev?.label ?? null,
    mode,
    scenarios: scenarioResults,
  }, ctx);
  const g = results.effective_grade;
  if (ctx) {
    appendJournal(runDir, {
      event: "score", ts: nowIso(),
      passed: g.passed, total: g.total, pct: g.pct, letter: g.letter, ship: g.ship, note: g.note,
    });
  }
  console.log(`\n  re-graded with ${judge.provider}:${judge.model} → ${g.letter} (${g.pct}%) ${g.ship ? "SHIP" : "NOT READY"}`);
}

async function cmdReview(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-check review <skill> --skills <root>");
  const skill = resolveSkill(root, target);
  const port = Number(flagStr(args, "port", "0")) || 0;
  await serveReview({ skillDir: skill.dir, skillName: skill.name, port });
}

async function cmdAddTest(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-check add-test <skill> --skills <root> --id ... --title ... --turn ... --check ...");
  const skill = resolveSkill(root, target);
  if (!skill.hasSpec) throw new Error(`${target} has no spec yet — create tests/specification.yaml first`);

  const id = flagStr(args, "id");
  const title = flagStr(args, "title");
  const turns = args.multi.turn ?? [];
  const checks = args.multi.check ?? [];
  if (!id || !title || turns.length === 0 || checks.length === 0) {
    throw new Error("add-test requires --id, --title, at least one --turn and one --check");
  }

  // Validate the merged spec before writing.
  const existing = loadSpec(skill.specPath);
  if (existing.scenarios.some((s) => s.id === id)) throw new Error(`scenario id \`${id}\` already exists`);

  const scenario: Record<string, unknown> = { id, title };
  if (flagStr(args, "critical") !== undefined) scenario.critical = true;
  const mode = flagStr(args, "mode");
  if (mode === "seeded") {
    scenario.mode = "seeded";
    scenario.fixture = flagStr(args, "fixture") ?? `fixtures/${id}`;
  }
  scenario.turns = turns;
  scenario.checklist = checks;

  const block = "\n" + yaml.dump({ scenarios: [scenario] }).replace(/^scenarios:\n/, "");
  const merged = readFileSync(skill.specPath, "utf8") + block;
  parseSpec(merged, skill.specPath); // throws if the append broke the spec
  appendFileSync(skill.specPath, block, "utf8");
  console.log(`added scenario ${id} to ${skill.specPath}`);
}

// ---------------------------------------------------------------- dispatch

const HELP = `skill-check — test/optimize loop for agent skills (pi harness)

  run    <skill|all> --skills <root> [--model prov:model ...] [--models file]
                     [--mode red|green|force] [--judge prov:model] [--harness pi] [--label name] [--parallel N] [--reps N] [--pass-threshold T]
  grade  <run-dir>   [--judge prov:model]      re-grade saved transcripts (neutral judge)
  review <skill>     --skills <root> [--port N] serve the interactive review UI
  add-test <skill>   --skills <root> --id ID --title T --turn ... --check ... [--critical] [--mode seeded --fixture path]
  list   --skills <root>                        discovered skills + spec status

defaults: model=${DEFAULT_MODEL}  judge=${DEFAULT_JUDGE}  mode=green  harness=pi`;

export async function main(argv: string[]): Promise<void> {
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));
  switch (cmd) {
    case "run": return cmdRun(args);
    case "grade": return cmdGrade(args);
    case "review": return cmdReview(args);
    case "add-test": return cmdAddTest(args);
    case "list": return cmdList(args);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`unknown command: ${cmd}\n`);
      console.log(HELP);
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
