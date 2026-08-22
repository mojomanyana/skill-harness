import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import { PROVIDER_FAILURE_MARKER } from "../src/provider-failure.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

function skillWithOneScenario(): { dir: string; specPath: string } {
  const root = mkdtempSync(join(tmpdir(), "sh-provfail-"));
  const dir = join(root, "greeter");
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), "---\nname: greeter\n---\n\n## Greet\nSay hello.\n", "utf8");
  const specPath = join(dir, "tests", "specification.yaml");
  writeFileSync(
    specPath,
    [
      "skill: greeter",
      "judge_persona: a strict reviewer",
      "ship_bar:",
      "  total: 1",
      "  min_pass: 1",
      "scenarios:",
      "  - id: A1",
      "    title: greets",
      "    turns: ['hi']",
      "    checklist: ['says hello']",
    ].join("\n") + "\n",
    "utf8",
  );
  return { dir, specPath };
}

/** Adapter that fails provider-side in the TEXT path and counts judge calls. */
function textFailAdapter(): { adapter: HarnessAdapter; judgeCalls: () => number } {
  let judgeCalls = 0;
  const adapter: HarnessAdapter = {
    name: "fake",
    available: async () => true,
    run: async () => `>>> USER:\nhi\n\n<<< ASSISTANT:\n\n${PROVIDER_FAILURE_MARKER} openai-codex: invalidated oauth token\n`,
    judge: async () => {
      judgeCalls += 1;
      return "VERDICT: PASS\n1. PASS";
    },
    version: async () => "0.84.2",
  };
  return { adapter, judgeCalls: () => judgeCalls };
}

describe("a provider failure is infrastructure, not a model verdict", () => {
  it("records ERROR and spends no judge call (text path)", async () => {
    const { dir, specPath } = skillWithOneScenario();
    const { adapter, judgeCalls } = textFailAdapter();
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol" },
      modelToken: "openai-codex:gpt-5.6-sol",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
    });
    const a1 = summary.results.scenarios.find((s) => s.id === "A1")!;
    expect(a1.judge_verdict).toBe("ERROR");
    expect(a1.judge_reason).toContain("openai-codex");
    expect(judgeCalls()).toBe(0);
  });

  it("records ERROR from a structured providerFailure with a success exit", async () => {
    const { dir, specPath } = skillWithOneScenario();
    let judgeCalls = 0;
    const adapter: HarnessAdapter = {
      name: "fake",
      available: async () => true,
      run: async () => ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n",
      // Non-empty assistant text is deliberate: an empty turn would also be caught
      // by the `noResponse` retry path and the test would pass for the wrong
      // reason, masking a deleted `providerFailure` check (confirmed by mutation).
      runStructured: async () => ({
        transcript: ">>> USER:\nhi\n\n<<< ASSISTANT:\nhello\n",
        traces: [],
        providerFailure: "openai-codex: WebSocket error",
      }),
      judge: async () => { judgeCalls += 1; return "VERDICT: PASS\n1. PASS"; },
      version: async () => "0.84.2",
    };
    const summary = await runSkillModel({
      spec: loadSpec(specPath),
      skillDir: dir,
      specPath,
      adapter,
      model: { provider: "openai-codex", model: "gpt-5.6-sol" },
      modelToken: "openai-codex:gpt-5.6-sol",
      judge: { provider: "claude-code", model: "claude-opus-4-8" },
      mode: "force",
      timestamp: "2026-08-22T00:00:00.000Z",
      structured: true,
    });
    const a1 = summary.results.scenarios.find((s) => s.id === "A1")!;
    expect(a1.judge_verdict).toBe("ERROR");
    expect(a1.judge_reason).toContain("openai-codex");
    expect(judgeCalls).toBe(0);
  });
});
