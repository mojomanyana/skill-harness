import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSkillDir, runViaExtension } from "../src/runner.js";

function skillFixture(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-ext-"));
  mkdirSync(join(d, "sub", "tests"), { recursive: true });
  writeFileSync(join(d, "sub", "tests", "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
  return d;
}

describe("resolveSkillDir", () => {
  it("scans cwd upward to the dir containing tests/specification.yaml", () => {
    const root = skillFixture();
    const start = join(root, "sub", "tests"); // start deep
    expect(resolveSkillDir(start)).toBe(join(root, "sub"));
  });
  it("throws a clear error when no spec is found", () => {
    expect(() => resolveSkillDir(mkdtempSync(join(tmpdir(), "sc-none-")))).toThrow(/specification\.yaml/);
  });
});

describe("runViaExtension", () => {
  it("runs via an injected fake adapter and returns a Scorecard (streams log lines)", async () => {
    const root = skillFixture();
    const lines: string[] = [];
    const fakeAdapter = { name: "pi", available: async () => true,
      run: async () => "USER: hi\nASSISTANT: ok",
      judge: async () => "1. PASS — ok\nVERDICT: PASS\nREASON: fine" } as any;
    const card = await runViaExtension({
      skillDir: join(root, "sub"), adapter: fakeAdapter, mode: "green",
      timestamp: "2026-07-05T00:00:00Z", now: () => "t", log: (m) => lines.push(m),
    });
    expect(card.skill).toBe("demo");
    expect(card.scenarios[0]).toMatchObject({ id: "A1", verdict: "PASS", suspect: false });
    expect(card.grade.ship).toBe(true);
    expect(lines.length).toBeGreaterThan(0); // streamed
  });
});
