import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { skillCheckRunTool } from "../src/tool.js";

function skillFixture(): string {
  const d = mkdtempSync(join(tmpdir(), "sc-tool-"));
  mkdirSync(join(d, "sub", "tests"), { recursive: true });
  writeFileSync(join(d, "sub", "tests", "specification.yaml"),
    `skill: demo\njudge_persona: a judge.\nship_bar: { total: 1, min_pass: 1 }\nscenarios:\n  - id: A1\n    title: t\n    turns: ["hi"]\n    checklist: ["ok"]\n`, "utf8");
  return d;
}

const fakeAdapter = {
  name: "pi",
  available: async () => true,
  run: async () => "USER: hi\nASSISTANT: ok",
  judge: async () => "1. PASS — ok\nVERDICT: PASS\nREASON: fine",
} as any;

describe("skillCheckRunTool", () => {
  it("executes and returns the scorecard content + details, streaming via onUpdate", async () => {
    const root = skillFixture();
    const updates: any[] = [];
    const result = await skillCheckRunTool.execute(
      "id1",
      { skill: join(root, "sub"), mode: "green" },
      new AbortController().signal,
      (u: any) => updates.push(u),
      { cwd: root, __adapter: fakeAdapter } as any
    );
    expect(result.details).toMatchObject({ skill: "demo" });
    expect(result.content[0].text).toMatch(/SHIP|NOT READY/);
    expect(updates.length).toBeGreaterThan(0);
  });

  it("exposes typebox parameters and prompt guidelines", () => {
    expect(skillCheckRunTool.name).toBe("skill_check_run");
    expect(skillCheckRunTool.promptGuidelines?.length).toBeGreaterThan(0);
    expect(skillCheckRunTool.parameters).toBeTruthy();
  });
});
