import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dump as yamlDump } from "js-yaml";
import {
  buildComparison,
  comparisonExitCode,
  discover,
  fileSha256,
  FIXTURE_PREFIX,
  formatComparison,
  HARNESS_VERSION,
  loadSpec,
  modelSlug,
  parseModelRef,
  resolveSkill,
  runSkillModel,
  SKILL_KEY,
  SKILL_PROMPT_KEY,
  sourceHashes,
  type ComparisonDigests,
  type ComparisonThresholds,
  type HarnessAdapter,
  type RunMode,
} from "@skill-harness/core";

export interface CompareCommandOptions {
  target: string;
  reference: string;
  candidateRoot: string;
  models: string[];
  judgeToken: string;
  mode: RunMode;
  reps: number;
  passThreshold: number;
  parallel: number;
  only?: string[];
  canary?: boolean;
  output?: string;
  thresholds?: ComparisonThresholds;
  adapter: HarnessAdapter;
  now: () => string;
  log?: (line: string) => void;
}

export interface CompareCommandResult {
  outputDir: string;
  reports: ReturnType<typeof buildComparison>[];
  exitCode: 0 | 1 | 2;
}

/** Execute the same immutable plan against reference and candidate snapshots. */
export async function runCompareCommand(options: CompareCommandOptions): Promise<CompareCommandResult> {
  const log = options.log ?? console.log;
  const temp = mkdtempSync(join(tmpdir(), "skill-harness-compare-"));
  try {
    const candidate = snapshotExisting(options.candidateRoot, join(temp, "candidate"));
    const reference = existsSync(options.reference)
      ? snapshotExisting(options.reference, join(temp, "reference"))
      : snapshotGitRef(options.candidateRoot, options.reference, join(temp, "reference"));

    const candidateSkills = options.target === "all"
      ? discover(candidate.skillsRoot).filter((skill) => skill.hasSpec)
      : [resolveSkill(candidate.skillsRoot, options.target)];
    const referenceSkills = new Map(
      (options.target === "all"
        ? discover(reference.skillsRoot).filter((skill) => skill.hasSpec)
        : [resolveSkill(reference.skillsRoot, options.target)])
        .map((skill) => [skill.name, skill]),
    );
    if (!candidateSkills.length) throw new Error(`no candidate skills with specs under ${options.candidateRoot}`);

    const outputDir = resolve(options.output ?? join(options.candidateRoot, ".skill-harness", "comparisons", timestampSlug(options.now())));
    mkdirSync(outputDir, { recursive: true });
    const reports: ReturnType<typeof buildComparison>[] = [];
    const fixtures = (sources: Record<string, string>) => Object.fromEntries(Object.entries(sources).filter(([key]) => key.startsWith(FIXTURE_PREFIX)));
    const inputs = (sources: Record<string, string>) => Object.fromEntries(Object.entries(sources).filter(([key]) => key !== SKILL_KEY && key !== SKILL_PROMPT_KEY));

    // Materialize and validate the ENTIRE skill × model plan before the first
    // paid call. `compare all` must not spend on skill 1 and only then discover
    // that skill 7 is not a valid pair.
    const plans = candidateSkills.map((candidateSkill) => {
      const referenceSkill = referenceSkills.get(candidateSkill.name);
      if (!referenceSkill) throw new Error(`reference has no matching skill \`${candidateSkill.name}\``);
      const candidateSpec = loadSpec(candidateSkill.specPath);
      const referenceSpec = loadSpec(referenceSkill.specPath);
      const candidateIds = candidateSpec.scenarios.map((scenario) => scenario.id).sort();
      const referenceIds = referenceSpec.scenarios.map((scenario) => scenario.id).sort();
      if (JSON.stringify(candidateIds) !== JSON.stringify(referenceIds)) throw new Error(`${candidateSkill.name}: reference/candidate scenario IDs differ`);
      const refSpecDigest = fileSha256(referenceSkill.specPath);
      const candSpecDigest = fileSha256(candidateSkill.specPath);
      if (!refSpecDigest || !candSpecDigest || refSpecDigest !== candSpecDigest) {
        throw new Error(`${candidateSkill.name}: reference/candidate specification.yaml differs — paired comparison changes only the skill under test`);
      }
      const refSources = sourceHashes({ skillDir: referenceSkill.dir, specDir: dirname(referenceSkill.specPath), scenarios: referenceSpec.scenarios, judgePersona: referenceSpec.judge_persona });
      const candSources = sourceHashes({ skillDir: candidateSkill.dir, specDir: dirname(candidateSkill.specPath), scenarios: candidateSpec.scenarios, judgePersona: candidateSpec.judge_persona });
      if (JSON.stringify(Object.entries(inputs(refSources)).sort()) !== JSON.stringify(Object.entries(inputs(candSources)).sort())) {
        throw new Error(`${candidateSkill.name}: reference/candidate fixtures or other test inputs differ — refusing before model calls`);
      }
      return { candidateSkill, referenceSkill, candidateSpec, referenceSpec, refSpecDigest, candSpecDigest, refSources, candSources };
    });
    const modelPlans = options.models.map((token) => ({ token, model: parseModelRef(token) }));
    const judge = parseModelRef(options.judgeToken);

    for (const { candidateSkill, referenceSkill, candidateSpec, referenceSpec, refSpecDigest, candSpecDigest, refSources, candSources } of plans) {
      for (const { token: modelToken, model } of modelPlans) {
        log(`\n▶ compare ${candidateSkill.name} · ${modelToken} · reference then candidate`);
        const timestamp = options.now();
        const referenceRun = await runSkillModel({
          spec: referenceSpec,
          skillDir: referenceSkill.dir,
          specPath: referenceSkill.specPath,
          adapter: options.adapter,
          model,
          modelToken,
          judge,
          mode: options.mode,
          timestamp,
          label: "compare-reference",
          concurrency: options.parallel,
          reps: options.reps,
          passThreshold: options.passThreshold,
          only: options.only,
          canary: options.canary,
          onProgress: (line) => log(`  reference ${line}`),
        });
        const candidateRun = await runSkillModel({
          spec: candidateSpec,
          skillDir: candidateSkill.dir,
          specPath: candidateSkill.specPath,
          adapter: options.adapter,
          model,
          modelToken,
          judge,
          mode: options.mode,
          timestamp,
          label: "compare-candidate",
          concurrency: options.parallel,
          reps: options.reps,
          passThreshold: options.passThreshold,
          only: options.only,
          canary: options.canary,
          onProgress: (line) => log(`  candidate ${line}`),
        });

        const digests: ComparisonDigests = {
          reference: {
            skill: mustDigest(join(referenceSkill.dir, "SKILL.md")),
            spec: refSpecDigest,
            fixtures: fixtures(refSources),
            inputs: inputs(refSources),
          },
          candidate: {
            skill: mustDigest(join(candidateSkill.dir, "SKILL.md")),
            spec: candSpecDigest,
            fixtures: fixtures(candSources),
            inputs: inputs(candSources),
          },
          harness: runtimeHarnessDigest(),
          model: sha256(modelToken),
          judge: sha256(options.judgeToken),
          environment: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            harness_version: HARNESS_VERSION,
            harness_cli_reference: referenceRun.results.harness_cli_version ?? "unavailable",
            harness_cli_candidate: candidateRun.results.harness_cli_version ?? "unavailable",
          },
        };
        const report = buildComparison({
          skill: candidateSpec.skill,
          model: modelToken,
          mode: options.mode,
          reps: options.reps,
          judge: options.judgeToken,
          reference: referenceRun.results,
          candidate: candidateRun.results,
          critical: candidateSpec.critical,
          digests,
          partial: Boolean(options.only?.length),
          thresholds: options.thresholds,
        });
        reports.push(report);

        const cellDir = join(outputDir, candidateSkill.name, modelSlug(model));
        mkdirSync(cellDir, { recursive: true });
        cpSync(referenceRun.runDir, join(cellDir, "reference"), { recursive: true });
        cpSync(candidateRun.runDir, join(cellDir, "candidate"), { recursive: true });
        writeFileSync(join(cellDir, "comparison.yaml"), yamlDump(report, { lineWidth: 120 }), "utf8");
        writeFileSync(join(cellDir, "comparison.txt"), `${formatComparison(report)}\n`, "utf8");
        log(`\n${formatComparison(report)}\n  artifacts: ${cellDir}`);
      }
    }
    const exitCode = reports.reduce<0 | 1 | 2>((highest, report) => Math.max(highest, comparisonExitCode(report)) as 0 | 1 | 2, 0);
    return { outputDir, reports, exitCode };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

interface Snapshot { skillsRoot: string }
function snapshotExisting(skillsRoot: string, destination: string): Snapshot {
  const absolute = realpathSync(resolve(skillsRoot));
  const repo = gitRoot(absolute);
  const sourceRoot = repo ? realpathSync(repo) : absolute;
  const inside = relativeInside(sourceRoot, absolute);
  copyTree(sourceRoot, destination);
  return { skillsRoot: join(destination, inside) };
}
function snapshotGitRef(candidateSkillsRoot: string, ref: string, destination: string): Snapshot {
  const absolute = realpathSync(resolve(candidateSkillsRoot));
  const rawRepo = gitRoot(absolute);
  const repo = rawRepo ? realpathSync(rawRepo) : null;
  if (!repo) throw new Error(`--reference ${ref} is not a directory and --candidate is not inside a git repository`);
  execFileSync("git", ["clone", "--quiet", "--no-checkout", repo, destination], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    execFileSync("git", ["checkout", "--quiet", "--detach", ref], { cwd: destination, stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    throw new Error(`cannot materialize reference git ref \`${ref}\`: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { skillsRoot: join(destination, relativeInside(repo, absolute)) };
}
function relativeInside(root: string, target: string): string {
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== target) {
    throw new Error(`skills root ${target} is outside snapshot root ${root}`);
  }
  return rel;
}
function gitRoot(path: string): string | null {
  try { return execFileSync("git", ["-C", path, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
}
function copyTree(source: string, destination: string): void {
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => {
      const rel = relative(source, path).replace(/\\/g, "/");
      if (!rel) return true;
      return !rel.split("/").some((part) => part === ".git" || part === "node_modules" || part === ".skill-harness") && !/(^|\/)tests\/results(\/|$)/.test(rel);
    },
  });
}
function mustDigest(path: string): string { const digest = fileSha256(path); if (!digest) throw new Error(`cannot digest ${path}`); return digest; }
function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function timestampSlug(value: string): string { return value.replace(/[:.]/g, "-"); }
function runtimeHarnessDigest(): string {
  const hash = createHash("sha256").update(`skill-harness/${HARNESS_VERSION}\0`);
  const require = createRequire(import.meta.url);
  const cliDir = dirname(fileURLToPath(import.meta.url));
  const roots = [
    cliDir,
    join(dirname(cliDir), "assets"),
    dirname(require.resolve("@skill-harness/core")),
    dirname(require.resolve("@skill-harness/adapters")),
  ].filter((root, index, all) => existsSync(root) && all.indexOf(root) === index);
  if (!roots.length) throw new Error("cannot locate running harness artifacts for comparison digest");
  roots.forEach((root, rootIndex) => {
    for (const file of filesUnder(root).sort()) {
      hash.update(`${rootIndex}/${relative(root, file).replace(/\\/g, "/")}`).update("\0").update(readFileSync(file)).update("\0");
    }
  });
  return hash.digest("hex");
}
function filesUnder(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesUnder(join(path, entry.name)) : entry.isFile() ? [join(path, entry.name)] : []);
}
