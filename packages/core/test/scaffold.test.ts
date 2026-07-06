import { describe, test, expect } from "vitest";
import { parseSpec } from "../src/spec.js";
import { renderTemplateSpec, isTemplateSpec, TEMPLATE_SENTINEL } from "../src/scaffold.js";

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
