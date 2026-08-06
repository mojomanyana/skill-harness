import { describe, test, expect } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deliveryAnchor, canaryPrompt, runDeliveryCanary } from "../src/canary.js";
import { runSkillModel } from "../src/run.js";
import { readJournal } from "../src/journal.js";
import { parseSpec, type Spec } from "../src/spec.js";
import type { HarnessAdapter, RunReq } from "../src/adapters/types.js";

/**
 * The delivery canary and the version record — the two things that would have made
 * the pi-0.83.0 incident announce itself instead of producing two waves of
 * plausible garbage.
 */

const SPEC_YAML = `
skill: golden
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
critical: [A1]
scenarios:
  - id: A1
    title: says hello
    turns: ["Say hello."]
    checklist: ["greets the user"]
`;

const SKILL_MD = `---
name: golden
description: A skill for greeting people warmly and precisely.
---

# Golden

## Overview

Some prose.

## Refuse a metered judge, whatever chose it

More prose.
`;

function spec(): Spec {
  return parseSpec(SPEC_YAML, "/spec/tests/specification.yaml");
}

function skillTree(skillMd = SKILL_MD): { skillDir: string; specPath: string } {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-canary-"));
  mkdirSync(join(skillDir, "tests"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), skillMd, "utf8");
  const specPath = join(skillDir, "tests", "specification.yaml");
  writeFileSync(specPath, SPEC_YAML, "utf8");
  return { skillDir, specPath };
}

/** An adapter whose subject replies are scripted in order; records every request. */
function scripted(replies: string[], version: string | null = "0.83.0"): {
  adapter: HarnessAdapter; reqs: RunReq[];
} {
  const reqs: RunReq[] = [];
  let i = 0;
  return {
    reqs,
    adapter: {
      name: "pi",
      available: async () => true,
      version: async () => version,
      run: async (req) => {
        reqs.push(req);
        return `>>> USER:\n${req.turns[0]}\n\n<<< ASSISTANT:\n${replies[Math.min(i++, replies.length - 1)]}\n`;
      },
      judge: async () => "1. PASS — greets\nVERDICT: PASS\nREASON: says hello",
    },
  };
}

describe("deliveryAnchor", () => {
  test("picks the longest `## ` heading — the least guessable one", () => {
    expect(deliveryAnchor(SKILL_MD)).toBe("Refuse a metered judge, whatever chose it");
  });

  // Under progressive disclosure the frontmatter description is ALWAYS in context,
  // so probing for anything in it would pass against a model that never opened the
  // instructions — the exact failure the canary exists to catch.
  test("never picks anything from the frontmatter", () => {
    const anchor = deliveryAnchor(SKILL_MD)!;
    expect(anchor).not.toMatch(/greeting people warmly/);
  });

  test("returns null when there is no `## ` heading to ask about", () => {
    expect(deliveryAnchor("---\nname: x\n---\n\n# Title only\n\nprose\n")).toBeNull();
  });

  test("the prompt names the skill and offers an honest miss", () => {
    const p = canaryPrompt("golden", "Ship it");
    expect(p).toMatch(/"golden"/);
    expect(p).toMatch(/NOT_AVAILABLE/);
  });
});

describe("runDeliveryCanary", () => {
  test("passes when the model quotes the anchor back (whitespace/emphasis tolerant)", async () => {
    const { skillDir } = skillTree();
    const { adapter } = scripted(["## Overview\n## **Refuse a  metered judge, whatever chose it**"]);
    const r = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(r.status).toBe("pass");
  });

  // This is the shape a naked model produces: a plausible, well-formatted answer
  // about headings it never saw.
  test("fails when the reply is plausible but not the skill's text", async () => {
    const { skillDir } = skillTree();
    const { adapter } = scripted(["## Introduction\n## Usage\n## Best practices"]);
    const r = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(r.status).toBe("fail");
    expect(r.detail).toMatch(/Best practices/); // what it said instead is kept for the report
  });

  test("probes in green mode — the mode whose delivery is in question", async () => {
    const { skillDir } = skillTree();
    const { adapter, reqs } = scripted(["## Refuse a metered judge, whatever chose it"]);
    await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(reqs[0].mode).toBe("green");
  });

  test("skips (rather than bluffs) when the skill has no probeable heading", async () => {
    const { skillDir } = skillTree("---\nname: x\n---\n\nprose only\n");
    const { adapter, reqs } = scripted(["anything"]);
    const r = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(r.status).toBe("skipped");
    expect(reqs).toEqual([]); // nothing spent
  });
});

describe("run --canary", () => {
  const model = { provider: "fireworks", model: "fake" };
  const judge = { provider: "claude-code" as const, model: "opus" };

  test("a failed canary aborts BEFORE the wave — one probe spent, no transcripts", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter, reqs } = scripted(["## Something I invented"]);
    await expect(runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z", canary: true,
    })).rejects.toThrow(/delivery canary FAILED/);

    expect(reqs).toHaveLength(1); // the probe, and nothing else
    const runDir = join(skillDir, "tests", "results", "pi-fireworks-fake", "2026-08-06T00-00-00Z");
    expect(readdirSync(runDir).filter((f) => f.endsWith(".txt"))).toEqual([]);
    expect(readdirSync(runDir)).not.toContain("results.yaml");
    const ev = readJournal(runDir).find((e) => e.event === "delivery-canary");
    expect(ev).toMatchObject({ status: "fail" });
  });

  test("the abort message names force mode and the harness version", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter } = scripted(["## Something I invented"], "0.83.0");
    await expect(runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z", canary: true,
    })).rejects.toThrow(/--mode force/);
  });

  test("a passing canary runs the wave and is recorded in results.yaml", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter, reqs } = scripted([
      "## Refuse a metered judge, whatever chose it", // the probe
      "Hi there!", // the scenario
    ]);
    const { results } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z", canary: true,
    });
    expect(reqs).toHaveLength(2);
    expect(results.delivery_canary).toBe("pass");
    expect(results.effective_grade.ship).toBe(true);
  });

  test("no canary asked for → no probe, and no claim in the record", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter, reqs } = scripted(["Hi there!"]);
    const { results } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z",
    });
    expect(reqs).toHaveLength(1);
    expect(results.delivery_canary).toBeUndefined();
  });

  // Force puts SKILL.md in the system prompt; there is nothing for a probe to
  // establish, so asking for one must not spend a rep.
  test("force mode ignores --canary rather than paying for a redundant probe", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter, reqs } = scripted(["Hi there!"]);
    const { results } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "force", timestamp: "2026-08-06T00:00:00Z", canary: true,
    });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].mode).toBe("force");
    expect(results.delivery_canary).toBeUndefined();
  });
});

describe("the harness CLI version is on the record", () => {
  const model = { provider: "fireworks", model: "fake" };
  const judge = { provider: "claude-code" as const, model: "opus" };

  test("run records what the adapter reported, in results.yaml and the journal", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter } = scripted(["Hi!"], "0.83.0");
    const { results, runDir } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z",
    });
    expect(results.harness_cli_version).toBe("0.83.0");
    expect(readJournal(runDir).find((e) => e.event === "run-started"))
      .toMatchObject({ harness_cli_version: "0.83.0" });
  });

  test("an adapter that cannot report a version writes no field rather than a guess", async () => {
    const { skillDir, specPath } = skillTree();
    const { adapter } = scripted(["Hi!"], null);
    const { results } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z",
    });
    expect(results.harness_cli_version).toBeUndefined();
  });

  test("an adapter with no version() at all still runs", async () => {
    const { skillDir, specPath } = skillTree();
    const bare: HarnessAdapter = {
      name: "pi", available: async () => true,
      run: async () => ">>> USER:\nhi\n\n<<< ASSISTANT:\nHi!\n",
      judge: async () => "1. PASS — greets\nVERDICT: PASS\nREASON: ok",
    };
    const { results } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter: bare, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z",
    });
    expect(results.harness_cli_version).toBeUndefined();
    expect(results.effective_grade.ship).toBe(true);
  });
});
