import { describe, test, expect } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative } from "node:path";
import { deliveryAnchor, canaryPrompt, canaryFailure, runDeliveryCanary } from "../src/canary.js";
import { runSkillModel, formatScorecard } from "../src/run.js";
import { rescoreRun } from "../src/rescore.js";
import { regateRun } from "../src/regate.js";
import { readResults } from "../src/results.js";
import { readJournal } from "../src/journal.js";
import { parseSpec, type Spec } from "../src/spec.js";
import type { HarnessAdapter, RunReq, StructuredRun } from "../src/adapters/types.js";
import type { ExecutionTraceV1 } from "../src/capture-trace-types.js";

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
      judge: async () => '{"votes":[{"criterion":1,"vote":"PASS","reason":"greets"}],"verdict":"PASS","reason":"says hello"}',
    },
  };
}

function structuredProbe(skillDir: string, change: Partial<ExecutionTraceV1> = {}): {
  adapter: HarnessAdapter; reqs: RunReq[]; run: StructuredRun;
} {
  const reqs: RunReq[] = [];
  const run: StructuredRun = {
    transcript: ">>> USER:\nnot evidence\n<<< TOOL:\nRefuse a metered judge, whatever chose it",
    traces: [{
      trace_version: 2, pi_version: "1.1.0", subject: { provider: "f", model: "m" },
      scenario_id: "(delivery-probe)", mode: "green", rep: 0, turn: 0,
      final_text: "## Overview\n## Refuse a metered judge, whatever chose it", final_status: "complete",
      tool_calls: [{ id: "r1", name: "read", args: { path: join(skillDir, "SKILL.md") },
        issueIndex: 0, completionIndex: 0, isError: false,
        result: { bytes: 500, sha256: "a".repeat(64) } }],
      changed_paths: null, cost_usd: null, ...change,
    }],
  };
  return { reqs, run, adapter: {
    ...scripted([]).adapter,
    run: async () => { throw new Error("Structured probe must not launch a second plain call"); },
    runStructured: async req => { reqs.push(req); return run; },
  } };
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
    expect(p).toMatch(/use the read tool to load/);
    expect(p).not.toContain("Ship it");
  });
});

describe("runDeliveryCanary", () => {
  test("passes when the model quotes the anchor back (whitespace/emphasis tolerant)", async () => {
    const { skillDir } = skillTree();
    const { adapter } = scripted(["## Overview\n## **Refuse a  metered judge, whatever chose it**"]);
    const r = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(r.status).toBe("pass");
    expect(r.observations).toMatchObject({ localSkillAvailable: true, loadingRequested: true,
      successfulSkillRead: "unobserved", returnedAnchor: true, autonomousSelection: "untested" });
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
    expect(reqs[0].tools).toEqual(["read"]);
    expect(reqs[0].extensions).toEqual([]);
    expect(reqs[0].turns[0]).not.toContain(skillDir);
  });

  test("skips (rather than bluffs) when the skill has no probeable heading", async () => {
    const { skillDir } = skillTree("---\nname: x\n---\n\nprose only\n");
    const { adapter, reqs } = scripted(["anything"]);
    const r = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(r.status).toBe("skipped");
    expect(reqs).toEqual([]); // nothing spent
  });

  test("missing local instructions fail before any provider invocation", async () => {
    const skillDir = mkdtempSync(join(tmpdir(), "sh-canary-missing-"));
    const { adapter, reqs } = scripted(["anything"]);
    const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(result).toMatchObject({ status: "fail", probeCalls: 0,
      observations: { localSkillAvailable: false, loadingRequested: false, returnedAnchor: null } });
    expect(reqs).toEqual([]);
    expect(canaryFailure("golden", result, "1.1.0")).toContain("Subject probe calls: 0");
  });

  test.each([
    ["prompt echo", ">>> USER:\n## Refuse a metered judge, whatever chose it\n<<< ASSISTANT:\nNOT_AVAILABLE"],
    ["tool echo", "<<< ASSISTANT:\nNOT_AVAILABLE\n<<< TOOL:\n## Refuse a metered judge, whatever chose it"],
    ["no role boundary", "## Refuse a metered judge, whatever chose it"],
    ["denial", "<<< ASSISTANT:\nI cannot find Refuse a metered judge, whatever chose it"],
  ])("does not mistake %s for a quoted final heading", async (_label, transcript) => {
    const { skillDir } = skillTree();
    const { adapter } = scripted([]);
    adapter.run = async () => transcript;
    const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(result.status).toBe("fail");
    expect(result.observations.returnedAnchor).toBe(false);
    expect(canaryFailure("golden", result, "1.1.0")).toContain("does not prove skill unavailability");
    expect(canaryFailure("golden", result, "1.1.0")).not.toContain("naked");
  });

  test("one structured invocation records instructed exact-file loading separately from selection", async () => {
    const { skillDir } = skillTree();
    const { adapter, reqs } = structuredProbe(skillDir);
    const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(result).toMatchObject({ status: "pass", probeCalls: 1,
      observations: { localSkillAvailable: true, loadingRequested: true, successfulSkillRead: "observed", returnedAnchor: true, autonomousSelection: "untested" } });
    expect(reqs).toHaveLength(1);
  });

  test.each(["no-read", "different-skill", "failed-read", "unfinished-read", "empty-read", "wrong-tool"] as const)(
    "a guessed matching heading with %s remains inconclusive", async kind => {
      const { skillDir } = skillTree();
      const { adapter, run } = structuredProbe(skillDir);
      const call = run.traces[0].tool_calls[0];
      if (kind === "no-read") run.traces[0].tool_calls = [];
      if (kind === "different-skill") call.args.path = join(skillDir, "other", "SKILL.md");
      if (kind === "failed-read") call.isError = true;
      if (kind === "unfinished-read") call.completionIndex = -1;
      if (kind === "empty-read") call.result.bytes = 0;
      if (kind === "wrong-tool") call.name = "bash";
      const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
      expect(result).toMatchObject({ status: "fail", observations: { returnedAnchor: true, successfulSkillRead: "not-observed" } });
    });

  test("a successful read with a tool-output quote but no matching final answer is inconclusive", async () => {
    const { skillDir } = skillTree();
    const { adapter } = structuredProbe(skillDir, { final_text: "NOT_AVAILABLE" });
    const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
    expect(result).toMatchObject({ status: "fail", observations: { returnedAnchor: false, successfulSkillRead: "observed" } });
  });

  test("recognizes relative paths and parser-redacted home paths without matching a basename alone", async () => {
    const { skillDir } = skillTree();
    // Preserve the tilde prefix even when the temporary fixture is outside home.
    const homePath = `~/${relative(homedir(), join(skillDir, "SKILL.md"))}`;
    for (const path of [relative(tmpdir(), join(skillDir, "SKILL.md")), homePath]) {
      const { adapter, run } = structuredProbe(skillDir);
      run.traces[0].tool_calls[0].args.path = path;
      const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
      expect(result.observations.successfulSkillRead).toBe("observed");
    }
  });

  test.each(["provider", "execution", "capture", "unsettled", "empty"] as const)(
    "%s failure cannot become a probe success despite a matching quote", async kind => {
      const { skillDir } = skillTree();
      const { adapter, run } = structuredProbe(skillDir);
      if (kind === "provider") run.providerFailure = "provider unavailable";
      if (kind === "execution") run.executionFailure = "process failed";
      if (kind === "capture") run.traces[0].capture_errors = ["capture truncated"];
      if (kind === "unsettled") run.traces[0].final_status = "incomplete";
      if (kind === "empty") run.traces = [];
      const result = await runDeliveryCanary({ adapter, model: { provider: "f", model: "m" }, skillDir, skillName: "golden", cwd: tmpdir() });
      expect(result.status).toBe("fail");
      expect(result.observations.returnedAnchor).toBeNull();
      expect(result.observations.executionError).toBeTruthy();
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
    expect(ev).toMatchObject({ status: "fail", probeCalls: 1,
      observations: { localSkillAvailable: true, returnedAnchor: false, autonomousSelection: "untested" } });
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
    const summary = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z", canary: true,
    });
    const { results, runDir } = summary;
    expect(reqs).toHaveLength(2);
    expect(results.delivery_canary).toBe("pass");
    expect(results.delivery_observations).toMatchObject({ probeCalls: 1, successfulSkillRead: "unobserved", autonomousSelection: "untested" });
    expect(readResults(runDir)?.delivery_observations).toEqual(results.delivery_observations);
    expect(formatScorecard(summary)).toContain("instructed probe read unobserved");
    expect(formatScorecard(summary)).toContain("autonomous skill selection in scenarios was not measured");
    expect(results.effective_grade.ship).toBe(true);
    expect(rescoreRun({ runDir, spec: spec() }).results.delivery_observations).toEqual(results.delivery_observations);
    const offlineAdapter = { ...adapter,
      run: async () => { throw new Error("Saved observations require no subject rerun"); },
      judge: async () => { throw new Error("A still-passing gate requires no judge rerun"); },
    };
    const regateSpec = spec();
    regateSpec.scenarios[0].assert = { output_excludes: ["DO_NOT_LEAK"] };
    const regated = await regateRun({ runDir, spec: regateSpec, specDir: join(skillDir, "tests"), adapter: offlineAdapter, judge });
    expect(regated.results.delivery_observations).toEqual(results.delivery_observations);
    expect(regated.judgeCalls).toBe(0);
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
    expect(results.delivery_observations).toBeUndefined();
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
      judge: async () => '{"votes":[{"criterion":1,"vote":"PASS","reason":"greets"}],"verdict":"PASS","reason":"ok"}',
    };
    const { results } = await runSkillModel({
      spec: spec(), skillDir, specPath, adapter: bare, model, modelToken: "fireworks:fake",
      judge, mode: "green", timestamp: "2026-08-06T00:00:00Z",
    });
    expect(results.harness_cli_version).toBeUndefined();
    expect(results.effective_grade.ship).toBe(true);
  });
});
