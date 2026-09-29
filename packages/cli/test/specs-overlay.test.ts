import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import type { HarnessAdapter } from "@skill-harness/core";
import { cmdGrade, cmdInit, cmdLint, cmdRun, main } from "../src/cli.js";

const SPEC = `skill: demo
judge_persona: a strict judge.
ship_bar: { total: 1, min_pass: 1 }
critical: []
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

const tmps: string[] = [];
const oldSpecs = process.env.SKILL_HARNESS_SPECS;
const oldExitCode = process.exitCode;

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tmps.push(root);
  return root;
}

function fixture(withLocalSpec = false) {
  const skills = tempRoot("sh-skills-");
  const specs = tempRoot("sh-specs-");
  mkdirSync(join(skills, "demo"), { recursive: true });
  writeFileSync(join(skills, "demo", "SKILL.md"), "---\nname: demo\n---\n# Demo\n", "utf8");
  mkdirSync(join(specs, "demo", "tests", "fixtures", "empty"), { recursive: true });
  mkdirSync(join(specs, "demo", "tests", "post"), { recursive: true });
  writeFileSync(join(specs, "demo", "tests", "specification.yaml"), SPEC, "utf8");
  if (withLocalSpec) {
    mkdirSync(join(skills, "demo", "tests"), { recursive: true });
    writeFileSync(join(skills, "demo", "tests", "specification.yaml"), SPEC, "utf8");
  }
  return { skills, specs };
}

function args(skills: string, specs?: string) {
  return {
    _: ["demo"],
    flags: {
      skills,
      ...(specs ? { specs } : {}),
      judge: "openai-codex:gpt-5.6-sol",
      mode: "green",
    },
    multi: { model: ["fake:subject"] },
  };
}

const fake: HarnessAdapter = {
  name: "pi",
  available: async () => true,
  version: async () => "test",
  run: async () => "USER: Say hello.\nASSISTANT: Hello!",
  judge: async () => "1. PASS — greeted\nVERDICT: PASS\nREASON: greeted",
};

async function capture(fn: () => Promise<void>): Promise<{ logs: string[]; errors: string[] }> {
  const logs: string[] = [];
  const errors: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = ((...values: unknown[]) => logs.push(values.map(String).join(" "))) as typeof console.log;
  console.error = ((...values: unknown[]) => errors.push(values.map(String).join(" "))) as typeof console.error;
  try {
    await fn();
    return { logs, errors };
  } finally {
    console.log = log;
    console.error = error;
  }
}

afterEach(() => {
  process.exitCode = oldExitCode;
  if (oldSpecs === undefined) delete process.env.SKILL_HARNESS_SPECS;
  else process.env.SKILL_HARNESS_SPECS = oldSpecs;
  while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true });
});

describe("--specs overlay", () => {
  it("run writes under --specs, records both source roots, and grade/rescore resolve the overlay spec", async () => {
    const { skills, specs } = fixture();
    await capture(() => cmdRun(args(skills, specs), fake));

    const resultsRoot = join(specs, "demo", "tests", "results");
    const tag = readdirSync(resultsRoot).find((name) => name !== ".gitignore")!;
    const runDir = join(resultsRoot, tag, readdirSync(join(resultsRoot, tag))[0]);
    expect(existsSync(join(skills, "demo", "tests", "results"))).toBe(false);

    const recorded = yaml.load(readFileSync(join(runDir, "results.yaml"), "utf8")) as {
      source_hashes: Record<string, string>;
      source_hash_roots: Record<string, string>;
    };
    expect(recorded.source_hashes["SKILL.md"]).toMatch(/^[0-9a-f]{64}$/);
    expect(recorded.source_hashes["stimulus:A1"]).toMatch(/^[0-9a-f]{64}$/);
    expect(recorded.source_hash_roots["SKILL.md"]).toBe("skills");
    expect(recorded.source_hash_roots["skill:prompt"]).toBe("skills");
    expect(recorded.source_hash_roots["stimulus:A1"]).toBe("specs");

    await capture(() => cmdGrade({ _: [runDir], flags: {}, multi: {} }, fake));
    await capture(() => main(["rescore", runDir]));
    const rewritten = yaml.load(readFileSync(join(runDir, "results.yaml"), "utf8")) as {
      source_hash_roots: Record<string, string>;
    };
    expect(rewritten.source_hash_roots["SKILL.md"]).toBe("skills");
    expect(rewritten.source_hash_roots["stimulus:A1"]).toBe("specs");

    writeFileSync(join(skills, "demo", "SKILL.md"), "---\nname: demo\n---\n# Changed\n", "utf8");
    process.exitCode = 0;
    const skillStale = await capture(() => cmdLint({ _: ["demo"], flags: { skills, specs }, multi: {} }));
    expect(skillStale.logs.some((line) => /SKILL\.md changed/.test(line))).toBe(true);

    writeFileSync(join(skills, "demo", "SKILL.md"), "---\nname: demo\n---\n# Demo\n", "utf8");
    writeFileSync(join(specs, "demo", "tests", "specification.yaml"), SPEC.replace("greets the user", "greets warmly"), "utf8");
    process.exitCode = 0;
    const specStale = await capture(() => cmdLint({ _: ["demo"], flags: { skills, specs }, multi: {} }));
    expect(specStale.logs.some((line) => /rubric for `A1` changed/.test(line))).toBe(true);
  });

  it("list and lint resolve specs and SKILL.md coverage from --specs, including the env default", async () => {
    const { skills, specs } = fixture();
    writeFileSync(
      join(specs, "demo", "tests", "specification.yaml"),
      SPEC.replace("    checklist: [\"greets the user\"]", "    checklist: [\"greets the user\"]\n    covers: [\"../SKILL.md#demo\"]"),
      "utf8",
    );
    process.env.SKILL_HARNESS_SPECS = specs;
    const listed = await capture(() => main(["list", "--skills", skills]));
    expect(listed.logs.some((line) => /demo.*spec: --specs/.test(line))).toBe(true);

    const linted = await capture(() => cmdLint({ _: ["all"], flags: { skills, specs }, multi: {} }));
    expect(linted.logs.some((line) => /1 skill\(s\), 0 finding\(s\)/.test(line))).toBe(true);
    expect(process.exitCode).toBe(0);

    process.exitCode = 0;
    const covered = await capture(() => main(["coverage", "demo", "--skills", skills, "--specs", specs]));
    expect(covered.logs.some((line) => /1\/1 sections have a declared test/.test(line))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("keeps --specs authoritative when a spec exists only under --skills", async () => {
    const { skills, specs } = fixture(true);
    rmSync(join(specs, "demo", "tests", "specification.yaml"));
    const localSpec = readFileSync(join(skills, "demo", "tests", "specification.yaml"), "utf8");

    await capture(() => cmdInit({ _: ["demo"], flags: { skills, specs }, multi: {} }));

    expect(readFileSync(join(skills, "demo", "tests", "specification.yaml"), "utf8")).toBe(localSpec);
    expect(existsSync(join(specs, "demo", "tests", "specification.yaml"))).toBe(true);
  });

  it("reports a spec in both roots as an error instead of merging", async () => {
    const { skills, specs } = fixture(true);
    const listed = await capture(() => main(["list", "--skills", skills, "--specs", specs]));
    expect(listed.logs.some((line) => /✗ demo.*both --skills and --specs/.test(line))).toBe(true);

    const linted = await capture(() => cmdLint({ _: ["all"], flags: { skills, specs }, multi: {} }));
    expect(linted.errors.some((line) => /both --skills and --specs/.test(line))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it("keeps the no---specs result location and provenance shape unchanged", async () => {
    const { skills } = fixture(true);
    await capture(() => cmdRun(args(skills), fake));

    const resultsRoot = join(skills, "demo", "tests", "results");
    const tag = readdirSync(resultsRoot).find((name) => name !== ".gitignore")!;
    const runDir = join(resultsRoot, tag, readdirSync(join(resultsRoot, tag))[0]);
    const recorded = yaml.load(readFileSync(join(runDir, "results.yaml"), "utf8")) as Record<string, unknown>;
    expect(recorded.source_hash_roots).toBeUndefined();
  });
});
