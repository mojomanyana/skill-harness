import { describe, it, expect, afterEach } from "vitest";
import { rmSync, writeFileSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";
import { runSeeded, capDiff, changedLines } from "../src/seeded.js";
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
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
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
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
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
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
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
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
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
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
    });

    // The failure mode this whole section exists to kill: a confident claim with
    // no code behind it. The judge must be able to see the emptiness.
    expect(r.diff).toBe("");
    expect(r.transcript).toContain("(empty — the model left no staged changes)");
  });
});

describe("assert.diff_excludes", () => {
  const excludesScenario = (contains: string[], excludes: string[]): Scenario => ({
    id: "A2", title: "scope discipline", critical: false, mode: "seeded",
    turns: ["fix only sliceRange"], checklist: ["did not touch lastIndex"],
    fixture: "unused-here", assert: { diff_contains: contains, diff_excludes: excludes },
    workspace: "none",
  });

  // A workspace whose baseline holds both functions, so an edit to either shows up.
  function scopeWorkspace() {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "ranges.ts"), "export function sliceRange(){}\nexport function lastIndex(){}\n", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);
    return ws;
  }

  // Rewrites ranges.ts wholesale; `touchBoth` decides whether the out-of-scope
  // function is disturbed, which is exactly what the negative needle watches.
  function rangesAdapter(touchBoth: boolean): HarnessAdapter {
    return {
      name: "pi", available: async () => true,
      run: async (req: RunReq) => {
        const body = touchBoth
          ? "export function sliceRange(){ return 1 }\nexport function lastIndex(){ return 2 }\n"
          : "export function sliceRange(){ return 1 }\nexport function lastIndex(){}\n";
        writeFileSync(join(req.cwd, "ranges.ts"), body, "utf8");
        return "<<< ASSISTANT: done";
      },
      judge: async () => "VERDICT: PASS",
    };
  }

  it("passes when the forbidden symbol only appears as unchanged context", async () => {
    // The case that decides whether this gate is usable at all. `lastIndex` sits two
    // lines from the edit site in the real A2 fixture, so it lands inside the hunk's
    // context — present in the diff text, untouched by the model. Matching the raw
    // diff would fail every model that fixed exactly the right thing.
    const ws = scopeWorkspace();
    const r = await runSeeded(excludesScenario(["sliceRange"], ["lastIndex"]), {
      skillDir: "/x", adapter: rangesAdapter(false),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
    });
    expect(r.diff).toContain("lastIndex"); // it IS in the diff, as context …
    expect(r.gateFailure).toBeNull(); // … and the gate correctly ignores it
    expect(r.transcript).toContain('diff_excludes "lastIndex": OK');
  });

  it("fails — objectively — when the model edits what it was told to leave alone", async () => {
    const ws = scopeWorkspace();
    const r = await runSeeded(excludesScenario(["sliceRange"], ["lastIndex"]), {
      skillDir: "/x", adapter: rangesAdapter(true),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
    });
    expect(r.gateFailure).toMatch(/forbidden "lastIndex"/);
    expect(r.transcript).toContain('diff_excludes "lastIndex": PRESENT');
  });

  it("does not fire on a filename that merely contains the needle", async () => {
    // `+++ b/ranges.ts` is a header, not a change. Without excluding headers, a
    // needle matching the path would trip on every hunk of the file being fixed.
    const ws = scopeWorkspace();
    const r = await runSeeded(excludesScenario(["sliceRange"], ["ranges.ts"]), {
      skillDir: "/x", adapter: rangesAdapter(false),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
    });
    expect(r.gateFailure).toBeNull();
  });

  it("does not disturb a scenario that sets no diff_excludes", async () => {
    const ws = scopeWorkspace();
    const r = await runSeeded(excludesScenario(["sliceRange"], []), {
      skillDir: "/x", adapter: rangesAdapter(true),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir: "/x",
    });
    expect(r.gateFailure).toBeNull();
    expect(r.transcript).not.toContain("diff_excludes");
  });
});

describe("assert.post_test", () => {
  const postScenario = (path: string): Scenario => ({
    id: "A1", title: "hidden gate", critical: false, mode: "seeded",
    turns: ["implement it"], checklist: ["works"],
    fixture: "unused-here", assert: { post_test: path },
    workspace: "none",
  });

  it("reports a spec error — not model behavior — when the post_test file is missing", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);
    const specDir = mkdtempSync(join(tmpdir(), "sc-spec-")); tmps.push(specDir);

    const r = await runSeeded(postScenario("post/nope.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
    });

    // It must still fail — a silently skipped gate is worse than a loud one — but
    // the message has to point at the spec, not at the model.
    expect(r.gateFailure).toMatch(/post_test file not found/);
    expect(r.gateFailure).toMatch(/spec error, not model behavior/);
  });

  /** A workspace + a spec dir holding a real post-test file. */
  function postTestSetup() {
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);
    const specDir = mkdtempSync(join(tmpdir(), "sc-spec-")); tmps.push(specDir);
    writeFileSync(
      join(specDir, "hidden.test.ts"),
      `import { it, expect } from "vitest";\nit("rejects overdrawing", () => { expect(1).toBe(1) });\n`,
      "utf8"
    );
    return { ws, specDir };
  }

  const fakeVitest = (run: { code: number; stdout?: string; stderr?: string }) =>
    async () => ({ code: run.code, stdout: run.stdout ?? "", stderr: run.stderr ?? "" });

  it("copies the post_test in AFTER the diff is captured, so it never pollutes the diff", async () => {
    const { ws, specDir } = postTestSetup();
    const calls: Array<{ args: string[]; cwd: string }> = [];

    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: async (args, cwd) => { calls.push({ args, cwd }); return { code: 0, stdout: "1 passed", stderr: "" }; },
    });

    expect(r.gateFailure).toBeNull();
    // The model's diff is what the MODEL wrote — the hidden test must not appear in
    // it, or it would leak into the judged transcript and stop being hidden.
    expect(r.diff).toContain("+MARKER");
    expect(r.diff).not.toContain("rejects overdrawing");
    expect(r.diff).not.toContain("skill-harness.post");
    // It landed under the harness-owned name, not the author's basename: a model
    // cannot pre-create that path to shadow the check, because the copy overwrites.
    expect(existsSync(join(ws.cwd, "skill-harness.post.test.ts"))).toBe(true);
    expect(calls).toEqual([{ args: ["skill-harness.post"], cwd: ws.cwd }]);
  });

  it("fails the scenario when the hidden test fails", async () => {
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: 1, stdout: "1 failed" }),
    });
    expect(r.gateFailure).toMatch(/post_test "hidden\.test\.ts" failed \(exit 1\)/);
    expect(r.transcript).toContain('post_test "hidden.test.ts": FAIL');
  });

  it("distinguishes 'the test failed' from 'the test never ran'", async () => {
    // vitest also exits non-zero when it collects nothing. Reporting that as a
    // FAIL would blame the model for a fixture whose include patterns don't cover
    // the workspace root — the single most misleading verdict this gate could give.
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: 1, stderr: "No test files found, exiting with code 1" }),
    });
    expect(r.gateFailure).toMatch(/never collected by vitest/);
    expect(r.gateFailure).toMatch(/spec\/fixture error, not model behavior/);
    expect(r.transcript).toContain("collected no tests");
  });

  it("runs the model's own tests and the hidden test as separate gates", async () => {
    const { ws, specDir } = postTestSetup();
    const calls: string[][] = [];
    const scenario: Scenario = {
      ...postScenario("hidden.test.ts"),
      assert: { vitest: true, post_test: "hidden.test.ts" },
    };
    await runSeeded(scenario, {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: async (args) => { calls.push(args); return { code: 0, stdout: "ok", stderr: "" }; },
    });
    // `vitest: true` grades the model's own tests; post_test grades ours. They are
    // orthogonal, so both invocations must happen.
    expect(calls).toEqual([[], ["skill-harness.post"]]);
  });
});

describe("changedLines", () => {
  const DIFF = [
    "diff --git a/ranges.ts b/ranges.ts",
    "index 111..222 100644",
    "--- a/ranges.ts",
    "+++ b/ranges.ts",
    "@@ -1,4 +1,4 @@",
    " export function untouched(){}",
    "-export function sliceRange(){ return 0 }",
    "+export function sliceRange(){ return 1 }",
    " export function alsoUntouched(){}",
  ].join("\n");

  it("keeps only added and removed lines", () => {
    expect(changedLines(DIFF)).toBe(
      "-export function sliceRange(){ return 0 }\n+export function sliceRange(){ return 1 }"
    );
  });

  it("drops context lines, file headers and hunk markers", () => {
    const out = changedLines(DIFF);
    expect(out).not.toContain("untouched");
    expect(out).not.toContain("+++");
    expect(out).not.toContain("---");
    expect(out).not.toContain("@@");
  });

  it("is empty for a diff with no changes", () => {
    expect(changedLines("")).toBe("");
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
