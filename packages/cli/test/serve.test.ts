import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeResults, readResults } from "@skill-check/core";
import { serveReview } from "../src/serve.js";

const SPEC = `
skill: golden
judge_persona: a friendly greeter judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

let skillDir: string;
let runDir: string;
let base: string;
let close: () => void;

beforeAll(async () => {
  skillDir = mkdtempSync(join(tmpdir(), "sc-serve-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "tests", "specification.yaml"), SPEC, "utf8");
  runDir = join(skillDir, "tests", "results", "pi-fake", "2026-07-03T00-00-00Z");
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "A1.green.txt"), "USER: Say hello.\nASSISTANT: (silence)", "utf8");
  writeResults(runDir, {
    skill: "golden", harness: "pi", model: "fireworks:fake",
    judge: { provider: "claude-code", model: "opus" },
    timestamp: "2026-07-03T00:00:00Z", label: null, mode: "green",
    scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "no greeting", suspect: false, override: null, note: "" }],
  }, { shipBar: { total: 1, min_pass: 1, no_critical_fail: true }, critical: ["A1"] });

  process.env.SKILL_CHECK_NO_OPEN = "1";
  const s = await serveReview({ skillDir, skillName: "golden", port: 0, open: false });
  base = `http://127.0.0.1:${s.port}`;
  close = s.close;
});

afterAll(() => {
  close?.();
  rmSync(skillDir, { recursive: true, force: true });
});

async function save(body: object) {
  return fetch(`${base}/save`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("review server /save override rules", () => {
  test("rejects an override without a note (400, error surfaced)", async () => {
    const r = await save({ col: 0, scenarioId: "A1", override: "PASS", note: "" });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error).toMatch(/requires a note/);
    expect(readResults(runDir).scenarios[0].override).toBeNull(); // nothing persisted
  });

  test("accepts an override with a note; grade recomputed; transcript preserved", async () => {
    const r = await save({ col: 0, scenarioId: "A1", override: "PASS", note: "judge missed the greeting" });
    expect(r.status).toBe(200);
    const results = readResults(runDir);
    expect(results.scenarios[0].override).toBe("PASS");
    expect(results.effective_grade.ship).toBe(true); // recomputed override-aware
    const gi = readFileSync(join(skillDir, "tests", "results", ".gitignore"), "utf8");
    expect(gi).toContain("!pi-fake/2026-07-03T00-00-00Z/A1.green.txt");
  });
});
