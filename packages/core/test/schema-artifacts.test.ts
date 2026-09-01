import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../schemas");

describe("versioned public schemas", () => {
  it.each([
    ["specification-v1.schema.json", "https://skill-harness.dev/schemas/specification-v1.schema.json"],
    ["trajectory-event-v1.schema.json", "https://skill-harness.dev/schemas/trajectory-event-v1.schema.json"],
    ["results-v2.schema.json", "https://skill-harness.dev/schemas/results-v2.schema.json"],
    ["qualification-config-v1.schema.json", "https://skill-harness.dev/schemas/qualification-config-v1.schema.json"],
    ["qualification-invocation-request-v1.schema.json", "https://skill-harness.dev/schemas/qualification-invocation-request-v1.schema.json"],
  ])("ships parseable %s", (file, id) => {
    const schema = JSON.parse(readFileSync(join(root, file), "utf8"));
    expect(schema.$schema).toContain("2020-12");
    expect(schema.$id).toBe(id);
  });

  it("types every trajectory assertion class instead of accepting arbitrary objects", () => {
    const schema = JSON.parse(readFileSync(join(root, "specification-v1.schema.json"), "utf8"));
    for (const key of ["correlate", "freshness", "unique", "forbid_after", "approvals", "coverage"]) {
      expect(schema.$defs.trajectory.properties[key].items.$ref, key).toMatch(/^#\/\$defs\//);
    }
    expect(schema.$defs.selector.properties.count).toBeUndefined();
    expect(schema.$defs.requiredSelector.properties.count.$ref).toBe("#/$defs/count");
  });
});
