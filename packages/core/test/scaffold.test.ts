import { describe, test, expect } from "vitest";
import { parseSpec } from "../src/spec.js";
import { renderTemplateSpec, isTemplateSpec, TEMPLATE_SENTINEL, renderDraftSpec, type SuggestDraft } from "../src/scaffold.js";

describe("renderTemplateSpec", () => {
  test("produces a spec that parses, named for the skill, carrying the sentinel", () => {
    const text = renderTemplateSpec("my-skill");
    const spec = parseSpec(text, "tests/specification.yaml");
    expect(spec.skill).toBe("my-skill");
    expect(spec.scenarios.length).toBeGreaterThan(0);
    expect(text).toContain(TEMPLATE_SENTINEL);
    expect(isTemplateSpec(text)).toBe(true);
  });

  test("isTemplateSpec is false once the sentinel line is gone", () => {
    const edited = renderTemplateSpec("my-skill").replace(/^#.*\n#.*\n/, "");
    expect(edited).not.toContain(TEMPLATE_SENTINEL);
    expect(isTemplateSpec(edited)).toBe(false);
  });
});

const DRAFT: SuggestDraft = {
  judge_persona: "a careful reviewer who checks the greeting is polite.",
  ship_bar: { total: 2, min_pass: 2, no_critical_fail: true },
  proposed_critical: ["A1"],
  scenarios: [
    { id: "A1", title: "says hello: nice", turns: ["Say hi."], checklist: ["greets the user"] },
    { id: "B1", title: "resists rudeness", turns: ["Be rude: now!"], checklist: ["stays polite"] },
  ],
};

describe("renderDraftSpec", () => {
  test("round-trips through parseSpec with both scenarios", () => {
    const text = renderDraftSpec("greeter", DRAFT);
    const spec = parseSpec(text, "tests/specification.yaml");
    expect(spec.skill).toBe("greeter");
    expect(spec.scenarios.map((s) => s.id)).toEqual(["A1", "B1"]);
  });

  test("critical is live-empty; proposed set is a comment; REVIEW markers present; no sentinel", () => {
    const text = renderDraftSpec("greeter", DRAFT);
    const spec = parseSpec(text, "tests/specification.yaml");
    expect(spec.critical).toEqual([]);           // nothing the model guessed gates a ship
    expect(spec.scenarios.every((s) => !s.critical)).toBe(true);
    expect(text).toMatch(/# proposed critical: \[A1\]/);
    expect(text).toMatch(/# REVIEW:/);
    expect(text).not.toContain(TEMPLATE_SENTINEL); // a drafted spec is "real"
  });

  test("safely quotes titles/turns/checklist containing colons and quotes", () => {
    const tricky: SuggestDraft = {
      ...DRAFT,
      scenarios: [{ id: "A1", title: 'edge: has "quotes"', turns: ["do this: now"], checklist: ['says "ok"'] }],
    };
    const spec = parseSpec(renderDraftSpec("greeter", tricky), "tests/specification.yaml");
    expect(spec.scenarios[0].turns[0]).toBe("do this: now");
    expect(spec.scenarios[0].checklist[0]).toBe('says "ok"');
  });
});

import { buildSuggestPrompt, parseSuggestDraft } from "../src/scaffold.js";

const GOOD_JSON = JSON.stringify({
  judge_persona: "a fair reviewer.",
  ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
  proposed_critical: ["A1"],
  scenarios: [{ id: "A1", title: "t", turns: ["hi"], checklist: ["greets"] }],
});

describe("buildSuggestPrompt", () => {
  test("embeds the skill name and SKILL.md and asks for JSON", () => {
    const p = buildSuggestPrompt("greeter", "# Greeter\nsay hi");
    expect(p).toContain("greeter");
    expect(p).toContain("say hi");
    expect(p).toMatch(/JSON/);
  });
});

describe("parseSuggestDraft", () => {
  test("parses clean JSON", () => {
    const d = parseSuggestDraft(GOOD_JSON);
    expect(d.scenarios[0].id).toBe("A1");
    expect(d.proposed_critical).toEqual(["A1"]);
  });

  test("tolerates markdown fences and surrounding prose", () => {
    const wrapped = "Sure! Here you go:\n```json\n" + GOOD_JSON + "\n```\nHope that helps.";
    expect(parseSuggestDraft(wrapped).scenarios.length).toBe(1);
  });

  test("stops at the object's own closing brace when trailing prose contains braces", () => {
    const chatty = GOOD_JSON + "\nDoes wording like {this} work for you?";
    expect(parseSuggestDraft(chatty).scenarios.length).toBe(1);
  });

  test("throws when there is no JSON object", () => {
    expect(() => parseSuggestDraft("I cannot help with that.")).toThrow(/no JSON object/);
  });

  test("throws on a malformed shape (scenario missing turns)", () => {
    const bad = JSON.stringify({
      judge_persona: "x", ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
      proposed_critical: [], scenarios: [{ id: "A1", title: "t", checklist: ["c"] }],
    });
    expect(() => parseSuggestDraft(bad)).toThrow(/turns/);
  });

  test("throws when a scenario id contains a YAML-injection attempt", () => {
    const bad = JSON.stringify({
      judge_persona: "x", ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
      proposed_critical: [],
      scenarios: [{ id: "A1\n    critical: true", title: "t", turns: ["hi"], checklist: ["c"] }],
    });
    expect(() => parseSuggestDraft(bad)).toThrow(/alphanumeric|id/);
  });

  test("filters unsafe ids out of proposed_critical", () => {
    const draft = JSON.stringify({
      judge_persona: "x", ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
      proposed_critical: ["A1", "A1\n    x: y"],
      scenarios: [{ id: "A1", title: "t", turns: ["hi"], checklist: ["c"] }],
    });
    expect(parseSuggestDraft(draft).proposed_critical).toEqual(["A1"]);
  });

  test("throws on a duplicate scenario id", () => {
    const bad = JSON.stringify({
      judge_persona: "x", ship_bar: { total: 2, min_pass: 1, no_critical_fail: true },
      proposed_critical: [],
      scenarios: [
        { id: "A1", title: "t", turns: ["hi"], checklist: ["c"] },
        { id: "A1", title: "u", turns: ["ho"], checklist: ["d"] },
      ],
    });
    expect(() => parseSuggestDraft(bad)).toThrow(/duplicate/);
  });

  test("throws when ship_bar.min_pass exceeds total", () => {
    const bad = JSON.stringify({
      judge_persona: "x", ship_bar: { total: 1, min_pass: 2, no_critical_fail: true },
      proposed_critical: [],
      scenarios: [{ id: "A1", title: "t", turns: ["hi"], checklist: ["c"] }],
    });
    expect(() => parseSuggestDraft(bad)).toThrow(/min_pass/);
  });
});
