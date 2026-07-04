import { describe, it, expect, afterEach } from "vitest";
import { rmSync, writeFileSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";
import { runSeeded } from "../src/seeded.js";
import type { Scenario } from "../src/spec.js";
import type { HarnessAdapter, RunReq } from "../src/adapters/types.js";

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

// Fake harness that actually edits the repo it's given, so gates have something to see.
function editingAdapter(line: string): HarnessAdapter {
  return {
    name: "pi",
    available: async () => true,
    run: async (req: RunReq) => {
      writeFileSync(join(req.cwd, "out.txt"), line, "utf8");
      return `<<< ASSISTANT: wrote ${line}`;
    },
    judge: async () => "VERDICT: PASS\nREASON: ok",
  };
}

const seededScenario = (needle: string): Scenario => ({
  id: "S1", title: "seeded", critical: false, mode: "seeded",
  turns: ["edit it"], checklist: ["edited"],
  fixture: "unused-here", assert: { diff_contains: [needle] },
  workspace: "none", // not read by runSeeded; run.ts owns workspace creation
});

describe("runSeeded (workspace prepared by caller)", () => {
  it("passes the diff_contains gate when the harness makes the expected edit", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    expect(r.gateFailure).toBeNull();
    expect(r.transcript).toContain("diff_contains");
    expect(existsSync(join(ws.cwd, "out.txt"))).toBe(true);
  });

  it("fails the gate when the expected content is absent from the diff", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: editingAdapter("something else"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    expect(r.gateFailure).toMatch(/MARKER/);
  });
});
