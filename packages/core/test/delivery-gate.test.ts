import { expect, it, vi } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSpec, runSkillModel, type HarnessAdapter } from "../src/index.js";

it("fresh runs do not produce delivery evidence when setup fails before the provider", async () => {
  const skillDir = mkdtempSync(join(tmpdir(), "delivery-workspace-error-"));
  cpSync(join(__dirname, "fixtures/golden-skill"), skillDir, { recursive: true });
  const specPath = join(skillDir, "tests/specification.yaml");
  const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
  spec.scenarios = [{ ...spec.scenarios[0], workspace: { fixture: "missing-fixture" } }];
  const adapter: HarnessAdapter = {
    name: "pi", available: async () => true,
    run: async () => { throw new Error("subject must not launch"); },
    judge: async () => { throw new Error("judge must not launch"); },
  };
  try {
    const { results } = await runSkillModel({ spec, skillDir, specPath, adapter, model: { provider: "fake", model: "m" }, modelToken: "fake:m", judge: { provider: "fake-judge", model: "j" }, mode: "force", timestamp: "2026-09-04T00:00:01.000Z" });
    expect(results.schema).toBe(2);
    expect(results.subject_invocations).toBeUndefined();
    expect(results.scenarios[0].judge_verdict).toBe("ERROR");
    expect(results.scenarios[0].objective?.assertions.some(assertion => assertion.kind === "skill_delivered")).not.toBe(true);
  } finally { rmSync(skillDir, { recursive: true, force: true }); }
});

it("fresh runs ignore legacy adapter delivery hooks and can never become NOT-MEASURED", async () => {
  const skillDir = mkdtempSync(join(tmpdir(), "delivery-gate-"));
  cpSync(join(__dirname, "fixtures/golden-skill"), skillDir, { recursive: true });
  const specPath = join(skillDir, "tests/specification.yaml");
  const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
  const judge = vi.fn(async () => "VERDICT: PASS\nREASON: judged");
  const adapter = {
    name: "pi", observesPrompts: true, available: async () => true,
    run: async (req: unknown) => {
      (req as { onPromptObservation?: (value: unknown) => void }).onPromptObservation?.({ status: "NOT-MEASURED" });
      return ">>> USER:\nhi\n\n<<< ASSISTANT:\nanswer\n";
    },
    judge,
  } as HarnessAdapter;
  try {
    const { results } = await runSkillModel({ spec, skillDir, specPath, adapter, model: { provider: "fake", model: "m" }, modelToken: "fake:m", judge: { provider: "fake-judge", model: "j" }, mode: "green", timestamp: "2026-09-04T00:00:00.000Z" });
    expect(results.schema).toBe(2);
    expect(results.subject_invocations).toBeUndefined();
    expect(results.scenarios.every(scenario => scenario.judge_verdict !== "NOT-MEASURED")).toBe(true);
    expect(results.scenarios.every(scenario => !scenario.objective?.assertions.some(assertion => assertion.kind === "skill_delivered"))).toBe(true);
    expect(judge).toHaveBeenCalled();
  } finally { rmSync(skillDir, { recursive: true, force: true }); }
});
