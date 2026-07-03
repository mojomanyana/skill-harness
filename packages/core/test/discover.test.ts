import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discover } from "../src/discover.js";

let root: string;

const SPEC = `
skill: ponytail
judge_persona: p
ship_bar: {total: 1, min_pass: 1, no_critical_fail: true}
critical: []
scenarios:
  - id: A1
    title: t
    turns: ["hi"]
    checklist: [ok]
`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "sc-discover-"));
  // ponytail: has a valid spec next to a SKILL.md
  mkdirSync(join(root, "ponytail", "tests"), { recursive: true });
  writeFileSync(join(root, "ponytail", "SKILL.md"), "# ponytail");
  writeFileSync(join(root, "ponytail", "tests", "specification.yaml"), SPEC);
  // brainstorming: a skill dir but no spec
  mkdirSync(join(root, "brainstorming"), { recursive: true });
  writeFileSync(join(root, "brainstorming", "SKILL.md"), "# brainstorming");
  // tools: not a skill, no SKILL.md — should be ignored as a skill
  mkdirSync(join(root, "tools"), { recursive: true });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("discover", () => {
  test("finds skills that have a spec and marks them testable", () => {
    const skills = discover(root);
    const pony = skills.find((s) => s.name === "ponytail");
    expect(pony).toBeDefined();
    expect(pony!.hasSpec).toBe(true);
    expect(pony!.specPath).toBe(join(root, "ponytail", "tests", "specification.yaml"));
  });

  test("includes skill dirs without a spec, marked not testable", () => {
    const skills = discover(root);
    const bs = skills.find((s) => s.name === "brainstorming");
    expect(bs).toBeDefined();
    expect(bs!.hasSpec).toBe(false);
  });

  test("returns skills sorted by name", () => {
    const names = discover(root).map((s) => s.name);
    expect(names).toEqual([...names].sort());
  });
});
