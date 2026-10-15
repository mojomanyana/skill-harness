import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { diagnoseRun } from "../src/diagnose.js";
import { runSkillModel } from "../src/run.js";
import { loadSpec } from "../src/spec.js";

it("diagnoses a saved failure without rerunning models or changing the historical result", async () => {
  const root = mkdtempSync(join(tmpdir(), "harness-diagnose-"));
  try {
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "SKILL.md"), "---\nname: demo\ndescription: demo\n---\nUse evidence.");
    const path = join(root, "tests/specification.yaml");
    const raw = { skill: "demo", judge_persona: "Check the answer", ship_bar: { total: 1, min_pass: 1 },
      scenarios: [{ id: "A", title: "Answer", turns: ["What is the value?"], checklist: ["Reports the documented value."] }] };
    writeFileSync(path, JSON.stringify(raw));
    let calls = 0;
    const result = await runSkillModel({ skillDir: root, specPath: path, spec: loadSpec(path), model: { provider: "local", model: "subject" }, modelToken: "local:subject", judge: { provider: "local", model: "judge" }, mode: "force", timestamp: "2026-10-15T00:00:00.000Z",
      adapter: { name: "pi", available: async () => true, run: async () => { calls++; return ">>> USER:\nWhat is the value?\n\n<<< ASSISTANT:\nwrong\n"; }, judge: async () => { calls++; return '{"votes":[{"criterion":1,"vote":"FAIL","reason":"Unsupported value"}],"verdict":"FAIL","reason":"Unsupported value"}'; } } });
    const before = readFileSync(join(result.runDir, "results.yaml"));
    const report = diagnoseRun(result.runDir, root, path);
    expect(report.causalConclusion).toBe("not-established");
    expect(report.issues.some(i => i.category === "behavior")).toBe(true);
    expect(calls).toBe(2);
    raw.scenarios[0].checklist = ["Reports the value with its source."];
    writeFileSync(path, JSON.stringify(raw));
    const changed = diagnoseRun(result.runDir, root, path);
    expect(changed.issues.some(i => i.category === "configuration" && i.next.includes("grade"))).toBe(true);
    expect(readFileSync(join(result.runDir, "results.yaml"))).toEqual(before);
    expect(calls).toBe(2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
