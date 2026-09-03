import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

type Step = { name?: string; uses?: string; with?: Record<string, string | number> };
type Workflow = {
  jobs: Record<string, {
    defaults?: { run?: { "working-directory"?: string } };
    env?: Record<string, string>;
    steps: Step[];
  }>;
};

describe("CI auxiliary checkout isolation", () => {
  it("keeps the principal provenance checkout outside the skill-harness release source tree", () => {
    const workflow = load(readFileSync(join(__dirname, "../../../.github/workflows/ci.yml"), "utf8")) as Workflow;
    const job = workflow.jobs["build-test"];
    const harness = job.steps.find((step) => step.uses === "actions/checkout@v5" && step.name === "Check out skill-harness");
    const principal = job.steps.find((step) => step.name === "Check out immutable principal fixture producer");
    const piDaddy = job.steps.find((step) => step.name === "Check out pi-daddy provenance history");

    expect(job.defaults?.run?.["working-directory"]).toBe("skill-harness");
    expect(harness?.with?.path).toBe("skill-harness");
    expect(principal?.with?.path).toBe("principal-pi-skills");
    expect(piDaddy?.with?.path).toBe("pi-daddy-provenance");
    expect(piDaddy?.with?.["fetch-depth"]).toBe(0);
    expect(job.env?.PRINCIPAL_PI_SKILLS_CHECKOUT).toBe("${{ github.workspace }}/principal-pi-skills");
    expect(job.env?.PI_DADDY_CHECKOUT).toBe("${{ github.workspace }}/pi-daddy-provenance");
    expect(new Set([harness?.with?.path, principal?.with?.path, piDaddy?.with?.path])).toHaveProperty("size", 3);
  });
});
