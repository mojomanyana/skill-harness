import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FREE_OFFLINE_COMMANDS } from "../src/command-cost.js";

const root = join(__dirname, "../../..");

function inlineCommands(text: string): string[] {
  return [...text.matchAll(/`([a-z][a-z-]*)`/g)].map((match) => match[1]);
}

describe("free/offline command vocabulary", () => {
  it("has one canonical set and excludes every command that can spend", () => {
    expect([...FREE_OFFLINE_COMMANDS].sort()).toEqual([
      "affected", "coverage", "init", "judge-agreement", "lint",
      "list", "mutation-test", "rescore", "restamp", "stability",
    ]);
    expect(FREE_OFFLINE_COMMANDS).not.toContain("regate");
    expect(FREE_OFFLINE_COMMANDS).not.toContain("grade");
    expect(FREE_OFFLINE_COMMANDS).not.toContain("run");
    expect(FREE_OFFLINE_COMMANDS).not.toContain("suggest");
  });

  it("keeps the two complete documentation lists equal to the canonical set", () => {
    const skill = readFileSync(join(root, "SKILL.md"), "utf8");
    const skillSection = skill.match(/Reach for them before anything paid:\n([\s\S]*?)\. In particular/)?.[1] ?? "";
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    const agentsList = agents.match(/\*\*Cost split an agent must respect:\*\* ([\s\S]*?) are free static\/offline commands/)?.[1] ?? "";
    const cli = readFileSync(join(root, "packages/cli/src/cli.ts"), "utf8");
    const helpClaims = [...cli.matchAll(/\$\{free\("([a-z-]+)"\)\}/g)].map((match) => match[1]);

    expect([...new Set(inlineCommands(skillSection))].sort()).toEqual([...FREE_OFFLINE_COMMANDS].sort());
    expect([...new Set(inlineCommands(agentsList))].sort()).toEqual([...FREE_OFFLINE_COMMANDS].sort());
    expect([...new Set(helpClaims)].sort()).toEqual([...FREE_OFFLINE_COMMANDS].sort());
  });
});
