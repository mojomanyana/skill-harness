import { describe, it, expect, afterEach } from "vitest";
import { rmSync, writeFileSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";
import { runSeeded, capDiff } from "../src/seeded.js";
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

describe("runSeeded shows the judge the code, not just the model's prose about it", () => {
  it("returns the staged diff and embeds it in the judged transcript", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    // The full diff comes back for the caller to persist …
    expect(r.diff).toContain("+MARKER");
    expect(r.diff).toContain("out.txt");
    // … and a copy reaches the judge, under its own heading, after the gates.
    expect(r.transcript).toContain("=== STAGED DIFF ===");
    expect(r.transcript).toContain("+MARKER");
    expect(r.transcript.indexOf("=== SEEDED GATES ===")).toBeLessThan(
      r.transcript.indexOf("=== STAGED DIFF ===")
    );
  });

  it("still reports the diff when a gate fails — that is when you most want to read it", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: editingAdapter("something else"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    expect(r.gateFailure).toMatch(/MARKER/);
    expect(r.diff).toContain("+something else");
    expect(r.transcript).toContain("=== STAGED DIFF ===");
  });

  it("says so explicitly when the model changed nothing", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);

    const noop: HarnessAdapter = {
      name: "pi", available: async () => true,
      run: async () => "<<< ASSISTANT: I have added the withdraw method.",
      judge: async () => "VERDICT: PASS",
    };
    const r = await runSeeded(seededScenario("MARKER"), {
      skillDir: "/x", adapter: noop,
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd,
    });

    // The failure mode this whole section exists to kill: a confident claim with
    // no code behind it. The judge must be able to see the emptiness.
    expect(r.diff).toBe("");
    expect(r.transcript).toContain("(empty — the model left no staged changes)");
  });
});

describe("capDiff", () => {
  const bigDiff = Array.from({ length: 500 }, (_, i) => `+line ${i} of a very large refactor`).join("\n");

  it("passes a diff under the cap through untouched", () => {
    expect(capDiff("+small\n+diff", 10_000)).toBe("+small\n+diff");
  });

  it("cuts on a line boundary and stays within the budget", () => {
    const out = capDiff(bigDiff, 400);
    const body = out.slice(0, out.indexOf("[… diff truncated"));
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(400);
    // No half-written line survived the cut.
    for (const line of body.trimEnd().split("\n")) {
      expect(line).toMatch(/^\+line \d+ of a very large refactor$/);
    }
  });

  it("marks the truncation with real byte counts and warns the judge not to infer absence", () => {
    const out = capDiff(bigDiff, 400);
    const total = Buffer.byteLength(bigDiff, "utf8");
    expect(out).toMatch(new RegExp(`\\d+ of ${total} bytes omitted`));
    expect(out).toContain("cap 400");
    // Silent truncation would manufacture exactly the false FAIL this change removes.
    expect(out).toContain("Do not treat anything below the cut as absent");
  });

  it("does not truncate at exactly the cap", () => {
    const exact = "a".repeat(50);
    expect(capDiff(exact, 50)).toBe(exact);
  });
});
