import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import type { Arm } from "../src/arms.js";
import type { HarnessAdapter, RunReq } from "../src/adapters/types.js";

function corpus(): { root: string; dir: string; specPath: string } {
  const root = mkdtempSync(join(tmpdir(), "sh-armrun-"));
  const dir = join(root, "greeter");
  mkdirSync(join(dir, "tests"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  for (const n of ["plan", "review"]) {
    writeFileSync(join(root, "agents", `${n}.md`), `---\nname: ${n}\ntools: read\n---\n\nbody\n`, "utf8");
  }
  writeFileSync(join(dir, "SKILL.md"), "---\nname: greeter\n---\n\n## Greet\nSay hello.\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(
    specPath,
    [
      "skill: greeter",
      "judge_persona: a friendly reviewer",
      "ship_bar: { total: 1, min_pass: 1, no_critical_fail: true }",
      "scenarios:",
      "  - id: A1",
      "    title: greets",
      "    turns: ['hi']",
      "    checklist: ['says hello']",
    ].join("\n") + "\n",
    "utf8",
  );
  return { root, dir, specPath };
}

function recordingAdapter(): {
  adapter: HarnessAdapter;
  reqs: RunReq[];
  seededAtCallTime: boolean[];
  piDirAtCallTime: boolean[];
} {
  const reqs: RunReq[] = [];
  // The workspace is torn down by `runRep`'s `finally` before `runSkillModel`
  // returns, so `req.cwd` is gone by the time a test can inspect it after the
  // fact — an existsSync check made AFTER the run resolves would read `false`
  // whether or not a leak happened, making it a vacuous check either way. What
  // actually matters — whether the file was there BEFORE the subject ran — has
  // to be captured here, at call time, not reconstructed afterward.
  const seededAtCallTime: boolean[] = [];
  const piDirAtCallTime: boolean[] = [];
  const adapter: HarnessAdapter = {
    name: "pi",
    available: async () => true,
    run: async (req) => {
      reqs.push(req);
      seededAtCallTime.push(existsSync(join(req.cwd, ".pi", "skills", "plan.md")));
      piDirAtCallTime.push(existsSync(join(req.cwd, ".pi")));
      return ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n";
    },
    judge: async () => "VERDICT: PASS\n1. PASS",
    version: async () => "0.84.2",
  };
  return { adapter, reqs, seededAtCallTime, piDirAtCallTime };
}

const ARM = (root: string): Arm => ({
  name: "pi-daddy",
  extensions: [join(root, "agents", "plan.md")], // any existing file: the adapter is faked
  seedSkills: ["agents"],
  requireDefinitions: 2,
  env: { PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl", PI_GRANTS_GRANT: "tool:read" },
});

describe("an arm reaches the subject and the record", () => {
  it("writes into a +arm tag, records the arm, and substitutes <run-dir>", async () => {
    const { root, dir, specPath } = corpus();
    const { adapter, reqs, seededAtCallTime } = recordingAdapter();
    const ambient = mkdtempSync(join(tmpdir(), "sh-ambient-"));
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      arm: ARM(root),
      skillsRoot: root,
      ambientSkillsDir: ambient,
    });

    expect(summary.runDir).toContain("+pi-daddy");
    expect(summary.results.arm).toEqual({
      name: "pi-daddy",
      extensions: [join(root, "agents", "plan.md")],
      definitions: 2,
    });

    const req = reqs[0];
    expect(req.extensions).toContain(join(root, "agents", "plan.md"));
    expect(req.armEnv!.PI_GRANTS_LEDGER).toBe(join(summary.runDir, "pi-daddy.ledger.jsonl"));
    expect(req.armEnv!.PI_GRANTS_GRANT).toBe("tool:read");
    expect(seededAtCallTime[0]).toBe(true);
  });

  it("changes nothing for the control arm", async () => {
    const { root, dir, specPath } = corpus();
    const { adapter, reqs, piDirAtCallTime } = recordingAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol:medium" },
      modelToken: "openai-codex:gpt-5.6-sol:medium",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      skillsRoot: root,
    });
    expect(summary.runDir).not.toContain("+");
    expect(summary.results.arm).toBeUndefined();
    expect(reqs[0].armEnv).toBeUndefined();
    expect(piDirAtCallTime[0]).toBe(false);
  });
});
