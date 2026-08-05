import { describe, test, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  sourceHashes, currentHashFor, describeSourceKey, remedyForKey,
  STIMULUS_PREFIX, RUBRIC_PREFIX, POLICY_PREFIX, GATES_PREFIX, SCENARIO_PREFIX, PERSONA_KEY,
  type SourceContext,
} from "../src/sources.js";
import { parseSpec, type Scenario, type Spec } from "../src/spec.js";

const SPEC_YAML = `
skill: golden
judge_persona: a demanding staff engineer.
ship_bar: { total: 2, min_pass: 2 }
critical: [A1]
scenarios:
  - id: A1
    title: first
    turns: ["do it"]
    checklist: ["does it", "explains it"]
    mode: seeded
    fixture: fixtures/A1
    reps: 3
    pass_threshold: 0.67
    assert:
      diff_contains: ["localhost:8080"]
      diff_excludes: ["TODO"]
      vitest: true
  - id: A2
    title: second
    turns: ["again"]
    checklist: ["does it again"]
`;

/** A skill dir with the spec above, its fixture, and a matching SourceContext. */
function ctxFor(specYaml = SPEC_YAML): { ctx: SourceContext; spec: Spec; specDir: string } {
  const skillDir = mkdtempSync(join(tmpdir(), "sh-src-"));
  const specDir = join(skillDir, "tests");
  mkdirSync(join(specDir, "fixtures", "A1"), { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), "---\nname: golden\n---\nbody\n", "utf8");
  writeFileSync(join(specDir, "fixtures", "A1", "app.ts"), "export const x = 1;\n", "utf8");
  const specPath = join(specDir, "specification.yaml");
  writeFileSync(specPath, specYaml, "utf8");
  const spec = parseSpec(specYaml, specPath);
  return { ctx: { skillDir, specDir, scenarios: spec.scenarios, judgePersona: spec.judge_persona }, spec, specDir };
}

/** Same spec with one edit applied to its YAML text. */
function edited(from: string, to: string): { ctx: SourceContext; spec: Spec } {
  return ctxFor(SPEC_YAML.replace(from, to));
}

describe("a scenario's identity is split by what restores freshness", () => {
  test("each facet gets its own key, per scenario", () => {
    const { ctx } = ctxFor();
    const keys = Object.keys(sourceHashes(ctx));
    for (const id of ["A1", "A2"]) {
      expect(keys).toContain(STIMULUS_PREFIX + id);
      expect(keys).toContain(RUBRIC_PREFIX + id);
      expect(keys).toContain(POLICY_PREFIX + id);
    }
    // Gate keys only where gates exist — an empty digest on every scenario would be
    // noise, and would claim `regate` is the remedy for a spec with no needles.
    expect(keys).toContain(GATES_PREFIX + "A1");
    expect(keys).not.toContain(GATES_PREFIX + "A2");
  });

  test("the persona is spec-level rubric, hashed once", () => {
    const keys = Object.keys(sourceHashes(ctxFor().ctx));
    expect(keys).toContain(PERSONA_KEY);
    expect(keys.filter((k) => k === PERSONA_KEY)).toHaveLength(1);
  });

  // The whole point: an edit must move exactly the key whose remedy fits it, or the
  // gate goes on charging model spend to fix a checklist.
  const cases: Array<{ what: string; from: string; to: string; moves: string; still: string[] }> = [
    {
      what: "a checklist edit is rubric-only — re-gradeable from saved transcripts",
      from: '"does it", "explains it"', to: '"does it", "explains it clearly"',
      moves: RUBRIC_PREFIX + "A1", still: [STIMULUS_PREFIX + "A1", POLICY_PREFIX + "A1", GATES_PREFIX + "A1"],
    },
    {
      what: "a title edit is rubric-only too — it is what the judge is told was tested",
      from: "title: first", to: "title: first, revised",
      moves: RUBRIC_PREFIX + "A1", still: [STIMULUS_PREFIX + "A1", POLICY_PREFIX + "A1"],
    },
    {
      what: "a turn edit is stimulus — the saved transcripts answer a different question now",
      from: '["do it"]', to: '["do it properly"]',
      moves: STIMULUS_PREFIX + "A1", still: [RUBRIC_PREFIX + "A1", POLICY_PREFIX + "A1", GATES_PREFIX + "A1"],
    },
    {
      what: "a threshold edit is policy — free to restore",
      from: "pass_threshold: 0.67", to: "pass_threshold: 0.34",
      moves: POLICY_PREFIX + "A1", still: [STIMULUS_PREFIX + "A1", RUBRIC_PREFIX + "A1", GATES_PREFIX + "A1"],
    },
    {
      what: "a needle edit is gates — answerable from the saved diffs",
      from: '["localhost:8080"]', to: '["localhost:9090"]',
      moves: GATES_PREFIX + "A1", still: [STIMULUS_PREFIX + "A1", RUBRIC_PREFIX + "A1", POLICY_PREFIX + "A1"],
    },
    {
      what: "a negative needle edit is gates as well",
      from: '["TODO"]', to: '["TODO", "FIXME"]',
      moves: GATES_PREFIX + "A1", still: [STIMULUS_PREFIX + "A1", RUBRIC_PREFIX + "A1"],
    },
    {
      what: "flipping assert.vitest is stimulus — it changes what the run does, not how it is judged",
      from: "vitest: true", to: "vitest: false",
      moves: STIMULUS_PREFIX + "A1", still: [RUBRIC_PREFIX + "A1", POLICY_PREFIX + "A1", GATES_PREFIX + "A1"],
    },
  ];

  for (const c of cases) {
    test(c.what, () => {
      const before = sourceHashes(ctxFor().ctx);
      const after = sourceHashes(edited(c.from, c.to).ctx);
      expect(after[c.moves], `${c.moves} should have moved`).not.toBe(before[c.moves]);
      for (const k of c.still) {
        expect(after[k], `${k} should be unchanged`).toBe(before[k]);
      }
    });
  }

  test("a persona edit moves only the persona key", () => {
    const before = sourceHashes(ctxFor().ctx);
    const after = sourceHashes(edited("a demanding staff engineer.", "a lenient reviewer.").ctx);
    expect(after[PERSONA_KEY]).not.toBe(before[PERSONA_KEY]);
    expect(after[RUBRIC_PREFIX + "A1"]).toBe(before[RUBRIC_PREFIX + "A1"]);
    expect(after[STIMULUS_PREFIX + "A1"]).toBe(before[STIMULUS_PREFIX + "A1"]);
  });

  test("adding a scenario marks nothing already measured as changed", () => {
    const before = sourceHashes(ctxFor().ctx);
    const after = sourceHashes(edited("  - id: A2", "  - id: A3\n    title: third\n    turns: [\"new\"]\n    checklist: [\"new\"]\n  - id: A2").ctx);
    for (const k of Object.keys(before)) expect(after[k], k).toBe(before[k]);
  });
});

describe("currentHashFor resolves every new key kind", () => {
  test("an unchanged spec round-trips each key", () => {
    const { ctx } = ctxFor();
    for (const [key, recorded] of Object.entries(sourceHashes(ctx))) {
      expect(currentHashFor(key, ctx), key).toBe(recorded);
    }
  });

  test("a removed scenario is not comparable rather than stale, for every facet", () => {
    const { ctx } = ctxFor();
    for (const p of [STIMULUS_PREFIX, RUBRIC_PREFIX, POLICY_PREFIX, GATES_PREFIX]) {
      expect(currentHashFor(p + "GONE", ctx)).toBeUndefined();
    }
  });

  // Runs recorded before the split carry one combined `scenario:<id>` key. They must
  // keep comparing, or every published scorecard turns stale on upgrade.
  test("the legacy combined key still resolves", () => {
    const { ctx } = ctxFor();
    const legacy = currentHashFor(SCENARIO_PREFIX + "A1", ctx);
    expect(typeof legacy).toBe("string");
    // And it still moves for a rubric-only edit, since it covers everything.
    expect(currentHashFor(SCENARIO_PREFIX + "A1", edited('"does it", "explains it"', '"does it"').ctx)).not.toBe(legacy);
  });

  test("a newer version's unknown prefixed key stays not-comparable", () => {
    expect(currentHashFor("someday:A1", ctxFor().ctx)).toBeUndefined();
  });
});

describe("each key kind names its own cheapest honest remedy", () => {
  test("the remedy is the tool that actually restores freshness", () => {
    expect(remedyForKey(STIMULUS_PREFIX + "A1")).toMatch(/re-run/);
    expect(remedyForKey(RUBRIC_PREFIX + "A1")).toMatch(/re-grade|grade/);
    expect(remedyForKey(RUBRIC_PREFIX + "A1")).toMatch(/judge-only|no model spend/);
    expect(remedyForKey(POLICY_PREFIX + "A1")).toMatch(/rescore/);
    expect(remedyForKey(POLICY_PREFIX + "A1")).toMatch(/free/);
    expect(remedyForKey(GATES_PREFIX + "A1")).toMatch(/regate/);
    expect(remedyForKey(PERSONA_KEY)).toMatch(/re-grade|grade/);
  });

  test("stimulus-remedy sources — SKILL.md, fixtures, agent files — say re-run", () => {
    expect(remedyForKey("SKILL.md")).toMatch(/re-run/);
    expect(remedyForKey("fixture:fixtures/A1")).toMatch(/re-run/);
    expect(remedyForKey("agents/review.md")).toMatch(/re-run/);
  });

  // A legacy key is one hash over everything, so which facet moved is unknowable.
  // Claiming a cheap remedy would be a guess presented as a fact.
  test("a pre-split key admits it cannot tell you which facet changed", () => {
    const r = remedyForKey(SCENARIO_PREFIX + "A1");
    expect(r).toMatch(/re-run/);
    expect(r).toMatch(/predates|cannot tell|which part/i);
  });

  test("the human label distinguishes the facets", () => {
    expect(describeSourceKey(STIMULUS_PREFIX + "A1")).toMatch(/stimulus.*A1/);
    expect(describeSourceKey(RUBRIC_PREFIX + "A1")).toMatch(/rubric.*A1/);
    expect(describeSourceKey(POLICY_PREFIX + "A1")).toMatch(/policy.*A1/);
    expect(describeSourceKey(GATES_PREFIX + "A1")).toMatch(/gates.*A1/);
    expect(describeSourceKey(PERSONA_KEY)).toMatch(/persona/);
  });
});
