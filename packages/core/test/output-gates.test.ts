import { afterEach, describe, expect, test } from "vitest";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

describe("final assistant output assertions", () => {
  test("fixture scenarios cover each key passing and failing before judge spend", async () => {
    const root = mkdtempSync(join(tmpdir(), "sh-output-gates-"));
    tmps.push(root);
    const skillDir = join(root, "output-gates");
    cpSync(join(__dirname, "fixtures/output-gates"), skillDir, { recursive: true });
    const specPath = join(skillDir, "tests/specification.yaml");
    let judgeCalls = 0;
    const adapter: HarnessAdapter = {
      name: "pi",
      available: async () => true,
      run: async (req) => {
        const turn = req.turns[0];
        const output = turn === "match-pass" ? "See src/widget.ts:42"
          : turn === "exclude-fail" ? "Secret SKILLHARNESSCANARY"
          : turn === "exclude-ambiguous" ? "before\n[pi exited 0]\nSKILLHARNESSCANARY"
          : turn === "exclude-user-prefix" ? ">>> USER: not-a-header\nSKILLHARNESSCANARY"
          : turn === "exclude-gate-prefix" ? "=== SEEDED GATES === not-a-header\nSKILLHARNESSCANARY"
          : turn === "exclude-exit-prefix" ? "[pi exited not-a-header\nSKILLHARNESSCANARY"
          : "redacted";
        return `>>> USER:\n${turn}\n\n<<< ASSISTANT:\n${output}\n`;
      },
      judge: async () => {
        judgeCalls++;
        return "1. PASS — fixture output is acceptable\nVERDICT: PASS\nREASON: acceptable";
      },
    };

    const { results } = await runSkillModel({
      spec: loadSpec(specPath), skillDir, specPath, adapter,
      model: { provider: "fake", model: "subject" }, modelToken: "fake:subject",
      judge: { provider: "fake", model: "judge" }, mode: "force",
      timestamp: "2026-10-01T00:00:00.000Z",
    });

    expect(results.scenarios.map((s) => [s.id, s.judge_verdict])).toEqual([
      ["M_PASS", "PASS"], ["M_FAIL", "FAIL"], ["E_PASS", "PASS"], ["E_FAIL", "FAIL"],
      ["E_AMBIGUOUS", "ERROR"],
      ["E_USER_PREFIX", "FAIL"], ["E_GATE_PREFIX", "FAIL"], ["E_EXIT_PREFIX", "FAIL"],
    ]);
    expect(results.scenarios.map((s) => s.objective?.status)).toEqual([
      "PASS", "FAIL", "PASS", "FAIL", "ERROR", "FAIL", "FAIL", "FAIL",
    ]);
    expect(judgeCalls).toBe(2);
  });
});
