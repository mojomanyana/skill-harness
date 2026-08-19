import { describe, test, expect } from "vitest";
import { parseSpec, SpecError } from "../src/spec.js";

const PONYTAIL = `
skill: ponytail
judge_persona: >
  a "ponytail" simplicity sidekick that cuts bloat.
ship_bar:
  total: 8
  min_pass: 6
  no_critical_fail: true
critical: [A1, A2, B1, C1, C2]
scenarios:
  - id: A1
    title: hand-rolled max
    critical: true
    turns:
      - "Review this and simplify it"
    checklist:
      - points to the language builtin (max)
      - says to delete the hand-rolled loop
  - id: B1
    title: speculative plugin pressure
    turns:
      - "Review this config loader"
      - "Make it pluggable"
      - "Just add the plugin system now"
    checklist:
      - holds across turns; declines the speculative plugin
  - id: S1
    title: withdraw rejects overdraft
    mode: seeded
    fixture: fixtures/account
    turns:
      - "Add a withdraw(amount) method"
    assert:
      vitest: true
      diff_contains: ["describe(", "withdraw"]
    checklist:
      - writes a covering test that passes
`;

describe("parseSpec", () => {
  test("parses a valid spec with top-level fields", () => {
    const spec = parseSpec(PONYTAIL, "ponytail/tests/specification.yaml");
    expect(spec.schema).toBe(1);
    expect(spec.skill).toBe("ponytail");
    expect(spec.judge_persona).toContain("simplicity sidekick");
    expect(spec.ship_bar).toEqual({ total: 8, min_pass: 6, no_critical_fail: true });
    expect(spec.critical).toEqual(["A1", "A2", "B1", "C1", "C2"]);
    expect(spec.scenarios).toHaveLength(3);
  });

  test("unifies scenario-level critical flags into the release-gating critical set", () => {
    const spec = parseSpec(`
skill: x
judge_persona: p
ship_bar: { total: 1, min_pass: 1 }
critical: []
scenarios:
  - id: A1
    title: t
    critical: true
    turns: [hi]
    checklist: [ok]
`, "f");
    expect(spec.critical).toEqual(["A1"]);
    expect(spec.scenarios[0].critical).toBe(true);
  });

  test("derives scenario.critical from top-level critical list", () => {
    const spec = parseSpec(PONYTAIL, "x.yaml");
    const a1 = spec.scenarios.find((s) => s.id === "A1")!;
    const b1 = spec.scenarios.find((s) => s.id === "B1")!;
    // A1 sets critical: true explicitly; B1 only via membership in top-level critical[]
    expect(a1.critical).toBe(true);
    expect(b1.critical).toBe(true);
  });

  test("defaults scenario mode to inline", () => {
    const spec = parseSpec(PONYTAIL, "x.yaml");
    const a1 = spec.scenarios.find((s) => s.id === "A1")!;
    expect(a1.mode).toBe("inline");
  });

  test("parses seeded scenario with fixture + assert", () => {
    const spec = parseSpec(PONYTAIL, "x.yaml");
    const s1 = spec.scenarios.find((s) => s.id === "S1")!;
    expect(s1.mode).toBe("seeded");
    expect(s1.fixture).toBe("fixtures/account");
    expect(s1.assert?.vitest).toBe(true);
    expect(s1.assert?.diff_contains).toEqual(["describe(", "withdraw"]);
  });

  test("accepts explicit schema: 1 and rejects an unsupported future schema", () => {
    expect(parseSpec(`schema: 1\n${PONYTAIL}`, "f").schema).toBe(1);
    expect(() => parseSpec(`schema: 2\n${PONYTAIL}`, "f")).toThrow(/unsupported `schema` 2/);
  });

  test("throws SpecError with file path when skill is missing", () => {
    const bad = "judge_persona: x\nship_bar: {total: 1, min_pass: 1}\nscenarios: []";
    expect(() => parseSpec(bad, "broken/spec.yaml")).toThrow(SpecError);
    expect(() => parseSpec(bad, "broken/spec.yaml")).toThrow(/broken\/spec\.yaml/);
    expect(() => parseSpec(bad, "broken/spec.yaml")).toThrow(/skill/);
  });

  test("throws when a scenario has no turns", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: []
    checklist: [does a thing]
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/A1.*turns/s);
  });

  test("throws when a scenario has no checklist", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: []
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/A1.*checklist/s);
  });

  test("throws on duplicate scenario ids", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: [ok]
  - id: A1
    title: t2
    turns: ["yo"]
    checklist: [ok]
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/duplicate.*A1/i);
  });

  test("gives a colon-hazard hint when a checklist item parsed as a YAML mapping", () => {
    // `- right-sizes: a glance` has an unquoted ": " so YAML parses it as a mapping,
    // not a string. The error must name the scenario and explain the colon hazard.
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: C1
    title: t
    turns: ["hi"]
    checklist:
      - right-sizes: a glance — fine
      - this one is a fine string
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/C1/);
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/string/i);
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/colon|quote/i);
  });

  test("throws when seeded scenario lacks a fixture", () => {
    const bad = `
skill: x
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    mode: seeded
    turns: ["hi"]
    checklist: [ok]
`;
    expect(() => parseSpec(bad, "f.yaml")).toThrow(/A1.*fixture/s);
  });
});

describe("env: workspace parsing", () => {
  const base = (extra: string) => `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
${extra}`;

  test("defaults to none when env is absent", () => {
    const spec = parseSpec(base(""), "spec.yaml");
    expect(spec.scenarios[0].workspace).toBe("none");
  });

  test("parses workspace: empty-git", () => {
    const spec = parseSpec(base("    env: { workspace: empty-git }\n"), "spec.yaml");
    expect(spec.scenarios[0].workspace).toBe("empty-git");
  });

  test("parses workspace: fixture:<path> into a fixture ref", () => {
    const spec = parseSpec(base("    env: { workspace: fixture:fixtures/x }\n"), "spec.yaml");
    expect(spec.scenarios[0].workspace).toEqual({ fixture: "fixtures/x" });
  });

  test("a seeded scenario with a fixture defaults its workspace to that fixture", () => {
    const text = `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: S1
    title: seeded
    mode: seeded
    fixture: fixtures/seed1
    turns: ["edit it"]
    checklist: ["edited"]
`;
    const spec = parseSpec(text, "spec.yaml");
    expect(spec.scenarios[0].workspace).toEqual({ fixture: "fixtures/seed1" });
  });

  test("rejects an unknown workspace value", () => {
    expect(() => parseSpec(base("    env: { workspace: banana }\n"), "spec.yaml"))
      .toThrow(/env\.workspace must be/);
  });

  test("rejects an empty fixture path", () => {
    expect(() => parseSpec(base("    env: { workspace: 'fixture:' }\n"), "spec.yaml"))
      .toThrow(/fixture path is empty/);
  });

  test("rejects a seeded scenario with env.workspace: none", () => {
    const text = `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: S1
    title: seeded
    mode: seeded
    fixture: fixtures/s1
    env: { workspace: none }
    turns: ["edit it"]
    checklist: ["edited"]
`;
    expect(() => parseSpec(text, "spec.yaml")).toThrow(/cannot use env\.workspace: none/);
  });

  test("a seeded scenario can still explicitly override to a different fixture", () => {
    const text = `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: S1
    title: seeded
    mode: seeded
    fixture: fixtures/s1
    env: { workspace: 'fixture:fixtures/other' }
    turns: ["edit it"]
    checklist: ["edited"]
`;
    const spec = parseSpec(text, "spec.yaml");
    expect(spec.scenarios[0].workspace).toEqual({ fixture: "fixtures/other" });
  });
});

describe("reps + pass_threshold parsing", () => {
  const base = (extra: string) => `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: ["ok"]
${extra}`;

  test("absent → undefined", () => {
    const s = parseSpec(base(""), "spec.yaml").scenarios[0];
    expect(s.reps).toBeUndefined();
    expect(s.passThreshold).toBeUndefined();
  });

  test("parses reps and pass_threshold", () => {
    const s = parseSpec(base("    reps: 5\n    pass_threshold: 0.8\n"), "spec.yaml").scenarios[0];
    expect(s.reps).toBe(5);
    expect(s.passThreshold).toBe(0.8);
  });

  test("rejects non-positive-integer reps", () => {
    expect(() => parseSpec(base("    reps: 0\n"), "spec.yaml")).toThrow(/reps/);
    expect(() => parseSpec(base("    reps: 2.5\n"), "spec.yaml")).toThrow(/reps/);
  });

  test("rejects pass_threshold outside 0..1", () => {
    expect(() => parseSpec(base("    pass_threshold: 1.5\n"), "spec.yaml")).toThrow(/pass_threshold/);
    expect(() => parseSpec(base("    pass_threshold: -0.1\n"), "spec.yaml")).toThrow(/pass_threshold/);
  });
});

describe("env.remote + system_prompt_file", () => {
  const base = (extra: string) => `
skill: t
judge_persona: a tester.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    turns: ["go"]
    checklist: ["does the thing"]
${extra}
`;

  test("env.remote: true parses and defaults to false", () => {
    const withRemote = base("    env:\n      remote: true\n      workspace: empty-git");
    expect(parseSpec(withRemote, "f").scenarios[0].remote).toBe(true);
    expect(parseSpec(base(""), "f").scenarios[0].remote).toBe(false);
  });

  test("env.remote on a bare cwd is an authoring error, not silently ignored", () => {
    expect(() => parseSpec(base("    env:\n      remote: true\n      workspace: none"), "f"))
      .toThrow(/no repo to attach it to/);
  });

  test("env.remote must be a boolean", () => {
    expect(() => parseSpec(base('    env:\n      remote: "yes"'), "f")).toThrow(/must be true or false/);
  });

  test("system_prompt_file parses", () => {
    const sc = parseSpec(base("    system_prompt_file: ../../agents/plan.md"), "f").scenarios[0];
    expect(sc.systemPromptFile).toBe("../../agents/plan.md");
  });

  test("an agent-file scenario must be single-turn — a subagent has no turn two", () => {
    const multi = `
skill: t
judge_persona: a tester.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: t
    system_prompt_file: ../../agents/plan.md
    turns: ["go", "again"]
    checklist: ["does the thing"]
`;
    expect(() => parseSpec(multi, "f")).toThrow(/single-shot by contract/);
  });

  test("system_prompt_file must be a non-empty string", () => {
    expect(() => parseSpec(base("    system_prompt_file: '   '"), "f")).toThrow(/non-empty string/);
  });
});

describe("assert.trajectory + env.event_sources", () => {
  const base = (extra: string) => `
skill: demo
judge_persona: a judge.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A1
    title: governed workflow
    turns: ["run it"]
    checklist: ["completes safely"]
${extra}`;

  test("parses an adapter-neutral trajectory assertion and versioned native sources", () => {
    const scenario = parseSpec(base(`    env:
      event_sources:
        - adapter: principal-assurance-v1
          path: .git/principal-pi-skills/assurance-v1/runs/*/events.jsonl
        - adapter: pi-daddy-v1
          path: .pi/grants-ledger.jsonl
          required: false
    assert:
      trajectory:
        version: "1.0"
        require:
          - event: risk_classified
        forbid:
          - event: writer_lease_conflict
`), "f").scenarios[0];
    expect(scenario.trajectoryAssert?.version).toBe("1.0");
    expect(scenario.eventSources).toEqual([
      { adapter: "principal-assurance-v1", path: ".git/principal-pi-skills/assurance-v1/runs/*/events.jsonl", required: true },
      { adapter: "pi-daddy-v1", path: ".pi/grants-ledger.jsonl", required: false },
    ]);
  });

  test("existing trace-only specs keep the old shape", () => {
    const scenario = parseSpec(base(`    assert:
      trace:
        forbid_calls: [write]
`), "f").scenarios[0];
    expect(scenario.traceAssert).toBeDefined();
    expect(scenario.trajectoryAssert).toBeUndefined();
    expect(scenario.eventSources).toBeUndefined();
  });

  test("rejects an event source traversal rather than reading outside the workspace", () => {
    expect(() => parseSpec(base(`    env:
      event_sources:
        - adapter: normalized-v1
          path: ../../secrets.jsonl
    assert:
      trajectory:
        version: "1.0"
        require: [{ event: done }]
`), "f")).toThrow(/event_sources.*workspace-relative/);
  });

  test("a trajectory assertion with no event sources still permits normalized pi tool events", () => {
    const scenario = parseSpec(base(`    assert:
      trajectory:
        version: "1.0"
        require:
          - event: tool_started
            where: { tool: read }
`), "f").scenarios[0];
    expect(scenario.eventSources).toBeUndefined();
  });
});

describe("assert.diff_excludes / assert.post_test (additive seeded gates)", () => {
  const seeded = (assertBlock: string) => `
skill: t
judge_persona: a tester.
ship_bar: { total: 1, min_pass: 1 }
scenarios:
  - id: A2
    title: scope discipline
    mode: seeded
    fixture: fixtures/A2
    turns: ["fix sliceRange"]
    checklist: ["left lastIndex alone"]
    assert:
${assertBlock}
`;

  test("parses diff_excludes and post_test", () => {
    const sc = parseSpec(
      seeded(`      diff_contains: ["sliceRange"]\n      diff_excludes: ["lastIndex"]\n      post_test: post/A2.test.ts`),
      "f"
    ).scenarios[0];
    expect(sc.assert?.diff_contains).toEqual(["sliceRange"]);
    expect(sc.assert?.diff_excludes).toEqual(["lastIndex"]);
    expect(sc.assert?.post_test).toBe("post/A2.test.ts");
  });

  test("both fields are optional — an existing spec parses unchanged", () => {
    // Rule 5: additive only. A spec written before these fields existed must keep
    // producing exactly the assert object it did before.
    const sc = parseSpec(seeded(`      vitest: true\n      diff_contains: ["x"]`), "f").scenarios[0];
    expect(sc.assert).toEqual({ vitest: true, diff_contains: ["x"] });
    expect(sc.assert?.diff_excludes).toBeUndefined();
    expect(sc.assert?.post_test).toBeUndefined();
  });

  test("diff_excludes must be strings", () => {
    expect(() => parseSpec(seeded(`      diff_excludes: [3]`), "f")).toThrow(/`assert.diff_excludes` must be strings/);
  });

  test("an empty diff_excludes needle is rejected — it would match every diff", () => {
    expect(() => parseSpec(seeded(`      diff_excludes: [""]`), "f")).toThrow(/would match every diff/);
  });

  test("an empty diff_contains needle is rejected too — the silent direction", () => {
    // The asymmetry that existed here was backwards by severity: an empty
    // diff_excludes fails forever and gets investigated; an empty diff_contains
    // passes on every diff, including an empty one, and nobody ever looks.
    expect(() => parseSpec(seeded(`      diff_contains: [""]`), "f")).toThrow(/could never fail/);
  });

  test("a needle both required and forbidden is an authoring error, not a permanent failure", () => {
    expect(() =>
      parseSpec(seeded(`      diff_contains: ["a", "b"]\n      diff_excludes: ["b"]`), "f")
    ).toThrow(/both[\s\S]*could never pass/);
  });

  test("post_test must be a non-empty path", () => {
    expect(() => parseSpec(seeded(`      post_test: '  '`), "f")).toThrow(/`assert.post_test` must be a non-empty path/);
  });
});
