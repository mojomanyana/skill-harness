import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdCompare, type Args } from "../src/cli.js";
import type { HarnessAdapter } from "@skill-harness/core";

const FIXTURE = join(__dirname, "../../core/test/fixtures/golden-skill");
const fake: HarnessAdapter = {
  name: "fake",
  available: async () => true,
  version: async () => "test-1",
  run: async (request) => request.turns.map((turn) => `>>> USER:\n${turn}\n\n<<< ASSISTANT:\nhello\n`).join("\n"),
  judge: async () => "1. PASS ok\nVERDICT: PASS\nREASON: ok",
};

afterEach(() => { process.exitCode = 0; });

describe("compare command (hermetic, no model calls)", () => {
  it("keeps reference/candidate artifacts independently inspectable and records exact digests", async () => {
    const root = mkdtempSync(join(tmpdir(), "sh-compare-cmd-"));
    const reference = join(root, "reference");
    const candidate = join(root, "candidate");
    cpSync(FIXTURE, join(reference, "golden-skill"), { recursive: true });
    cpSync(FIXTURE, join(candidate, "golden-skill"), { recursive: true });
    writeFileSync(join(candidate, "golden-skill", "SKILL.md"), `${readFileSync(join(candidate, "golden-skill", "SKILL.md"), "utf8")}\nCandidate instruction.\n`);
    const output = join(root, "out");
    const args: Args = {
      _: ["golden-skill"],
      flags: {
        reference,
        candidate,
        output,
        mode: "force",
        judge: "claude-code:j",
        reps: "1",
      },
      multi: { model: ["fake:m"] },
    };
    await cmdCompare(args, fake);
    const cell = join(output, "golden-skill", "fake-m");
    expect(existsSync(join(cell, "reference", "results.yaml"))).toBe(true);
    expect(existsSync(join(cell, "candidate", "results.yaml"))).toBe(true);
    expect(existsSync(join(cell, "comparison.yaml"))).toBe(true);
    const manifest = readFileSync(join(cell, "comparison.yaml"), "utf8");
    expect(manifest).toContain("deterministic_sampling: false");
    expect(manifest).toMatch(/harness: [a-f0-9]{64}/);
    expect(manifest).toMatch(/model: [a-f0-9]{64}/);
    expect(manifest).toContain("release_eligible: true");
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("--affected with no selected scenarios makes zero subject/judge calls", async () => {
    const root = mkdtempSync(join(tmpdir(), "sh-compare-affected-"));
    cpSync(FIXTURE, join(root, "golden-skill"), { recursive: true });
    const specPath = join(root, "golden-skill", "tests", "specification.yaml");
    const ordinarySpec = readFileSync(specPath, "utf8")
      .replace("critical: [A1]", "critical: []")
      .replace("id: A1", "id: C1")
      .replace("    critical: true\n", "    covers: [SKILL.md#golden-skill]\n")
      .replace("id: B1", "id: C2")
      .replace("    title: holds over two turns", "    covers: [SKILL.md#golden-skill]\n    title: holds over two turns");
    writeFileSync(specPath, ordinarySpec);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-qm", "base"], { cwd: root });
    let calls = 0;
    const refusing: HarnessAdapter = { ...fake, run: async () => { calls++; throw new Error("must not run"); }, judge: async () => { calls++; throw new Error("must not judge"); } };
    await cmdCompare({
      _: ["golden-skill"],
      flags: { reference: "HEAD", candidate: root, mode: "force", judge: "claude-code:j", affected: true },
      multi: { model: ["fake:m"] },
    }, refusing);
    expect(calls).toBe(0);
  });

  it("rejects mismatched non-skill test inputs before any paid call", async () => {
    const root = mkdtempSync(join(tmpdir(), "sh-compare-preflight-"));
    const reference = join(root, "reference"), candidate = join(root, "candidate");
    for (const side of [reference, candidate]) {
      cpSync(FIXTURE, join(side, "golden-skill"), { recursive: true });
      const specPath = join(side, "golden-skill", "tests", "specification.yaml");
      writeFileSync(specPath, readFileSync(specPath, "utf8").replace("    title: says hello", "    title: says hello\n    system_prompt_file: agent.md"));
      writeFileSync(join(side, "golden-skill", "tests", "agent.md"), side === reference ? "reference" : "candidate");
    }
    let calls = 0;
    const refusing: HarnessAdapter = { ...fake, run: async () => { calls++; return ""; }, judge: async () => { calls++; return ""; } };
    await expect(cmdCompare({
      _: ["golden-skill"],
      flags: { reference, candidate, mode: "force", judge: "claude-code:j" },
      multi: { model: ["fake:m"] },
    }, refusing)).rejects.toThrow(/test inputs differ.*before model calls/);
    expect(calls).toBe(0);
  });

  it("marks --only comparisons as branch feedback that never SHIPs", async () => {
    const root = mkdtempSync(join(tmpdir(), "sh-compare-cmd-"));
    const reference = join(root, "reference");
    const candidate = join(root, "candidate");
    cpSync(FIXTURE, join(reference, "golden-skill"), { recursive: true });
    cpSync(FIXTURE, join(candidate, "golden-skill"), { recursive: true });
    const output = join(root, "out");
    await cmdCompare({
      _: ["golden-skill"],
      flags: { reference, candidate, output, mode: "force", judge: "claude-code:j", only: "A1" },
      multi: { model: ["fake:m"] },
    }, fake);
    const manifest = readFileSync(join(output, "golden-skill", "fake-m", "comparison.yaml"), "utf8");
    expect(manifest).toContain("partial: true");
    expect(manifest).toContain("release_eligible: false");
    expect(manifest).toContain("ship: false");
  });
});
