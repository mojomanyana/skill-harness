import { describe, it, expect, afterEach } from "vitest";
import { rmSync, writeFileSync, readFileSync, existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace } from "../src/workspace.js";
import { runSeeded, capDiff, changedLines, vitestTally } from "../src/seeded.js";
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
    expect(r.gateFailure).toMatch(/post_test is not a readable file/);
    expect(r.gateFailure).toMatch(/spec error, not model behavior/);
  });

  it("a post_test that is a DIRECTORY degrades the scenario, never the whole run", async () => {
    // existsSync() is true for a directory and copyFileSync then throws EISDIR.
    // That rejection escaped runSeeded, and runRep guards only workspace setup, so
    // it reached runSkillModel and writeResults never ran — one spec typo
    // (`post_test: post`) discarded every scenario already completed in a paid run.
    const fixture = mkdtempSync(join(tmpdir(), "sc-seed-src-")); tmps.push(fixture);
    writeFileSync(join(fixture, "seed.txt"), "seed", "utf8");
    const ws = createWorkspace({ fixture }, { specDir: "/x" }); tmps.push(ws.cwd);
    const specDir = mkdtempSync(join(tmpdir(), "sc-spec-")); tmps.push(specDir);
    mkdirSync(join(specDir, "post"));

    const r = await runSeeded(postScenario("post"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
    });

    expect(r.gateFailure).toMatch(/post_test is not a readable file/);
    expect(r.gateFailure).toMatch(/spec error, not model behavior/);
    expect(r.transcript).toContain("=== STAGED DIFF ==="); // still a complete transcript
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

  /**
   * A vitest double emitting a realistic summary line, because the gate now
   * requires positive evidence that assertions ran — see `vitestTally`. A double
   * that returned only an exit code would let the gate's own vacuous-pass
   * protection go untested.
   */
  const summary = (t: { passed?: number; failed?: number; skipped?: number; todo?: number }) => {
    const bits = [
      t.failed ? `${t.failed} failed` : "",
      t.passed ? `${t.passed} passed` : "",
      t.skipped ? `${t.skipped} skipped` : "",
      t.todo ? `${t.todo} todo` : "",
    ].filter(Boolean);
    const total = (t.passed ?? 0) + (t.failed ?? 0) + (t.skipped ?? 0) + (t.todo ?? 0);
    return ` Test Files  1 passed (1)\n      Tests  ${bits.join(" | ")} (${total})\n`;
  };

  const fakeVitest = (run: { code: number | null; stdout?: string; stderr?: string }) =>
    async () => ({ code: run.code, stdout: run.stdout ?? "", stderr: run.stderr ?? "" });

  it("copies the post_test in AFTER the diff is captured, so it never pollutes the diff", async () => {
    const { ws, specDir } = postTestSetup();
    const calls: Array<{ args: string[]; cwd: string }> = [];

    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: async (args, cwd) => { calls.push({ args, cwd }); return { code: 0, stdout: summary({ passed: 1 }), stderr: "" }; },
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
      runVitest: fakeVitest({ code: 1, stdout: summary({ failed: 1 }) }),
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
  });

  it("REFUSES to pass when every hidden test is skipped — exit 0 is not evidence", async () => {
    // Verified against real vitest 2.1: a `.skip`'d post-test exits ZERO and prints
    // "Tests  1 skipped". Keying the gate off the exit code therefore reported PASS
    // for a hidden gate that executed no assertions — the exact vacuous-gate shape
    // post_test exists to prevent, and invisible because a passing gate produces
    // output nobody reads.
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: 0, stdout: summary({ skipped: 1 }) }),
    });
    expect(r.gateFailure).toMatch(/skipped\/todo test/);
    expect(r.gateFailure).toMatch(/spec error, not model behavior/);
  });

  it("REFUSES to pass when the summary reports zero tests", async () => {
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: 0, stdout: " Test Files  1 passed (1)\n      Tests   (0)\n" }),
    });
    expect(r.gateFailure).toMatch(/ran no assertions/);
  });

  it("REFUSES to pass when no vitest summary can be parsed at all", async () => {
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: 0, stdout: "something unrecognisable" }),
    });
    expect(r.gateFailure).toMatch(/no parseable vitest summary/);
  });

  it("calls a timeout infrastructure, not a model failure", async () => {
    // exec SIGKILLs at the timeout and the child closes with code === null.
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: null, stdout: "partial output", stderr: "[skill-harness] killed after 120000ms timeout" }),
    });
    expect(r.gateFailure).toMatch(/timed out/);
    expect(r.gateFailure).toMatch(/infrastructure, not model behavior/);
    // stderr must survive: `stdout || stderr` used to discard the kill notice.
    expect(r.transcript).toContain("killed after 120000ms timeout");
  });

  it("does not fire the never-collected check on model output that merely mentions it", async () => {
    // The unanchored regex also matched this string appearing anywhere in test
    // output or a model-authored console.log, flipping a genuine pass into a
    // phantom "your fixture is broken".
    const { ws, specDir } = postTestSetup();
    const r = await runSeeded(postScenario("hidden.test.ts"), {
      skillDir: "/x", adapter: editingAdapter("MARKER"),
      model: { provider: "fireworks", model: "fake" }, mode: "green", cwd: ws.cwd, specDir,
      runVitest: fakeVitest({ code: 0, stdout: `stdout: log("No test files found")\n${summary({ passed: 2 })}` }),
    });
    expect(r.gateFailure).toBeNull();
    expect(r.transcript).toContain("post_test \"hidden.test.ts\": PASS (2 assertion-bearing test(s))");
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
      runVitest: async (args) => { calls.push(args); return { code: 0, stdout: summary({ passed: 1 }), stderr: "" }; },
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

  it("keeps a changed line whose own content starts with -- or ++", () => {
    // The prefix filter could not tell `--- a/x.ts` (a header) from a removed line
    // whose source text begins with `--` (a SQL/Lua comment, a YAML `---`), nor
    // `+++ b/x.ts` from an added `++counter;` at column zero. Both vanished, and
    // diff_excludes then reported OK for a diff that touched the forbidden symbol
    // — a false PASS on an objective gate.
    const tricky = [
      "diff --git a/notes.md b/notes.md",
      "--- a/notes.md",
      "+++ b/notes.md",
      "@@ -1,4 +1,4 @@",
      " context",
      "----",                    // removed a line whose content is `---`
      "--- lastIndex comment",   // removed a line whose content starts with `--`
      "+++lastIndexHack();",     // added a line whose content starts with `++`
      "+normal",
    ].join("\n");
    const out = changedLines(tricky);
    expect(out).toContain("----");
    expect(out).toContain("lastIndex comment");
    expect(out).toContain("lastIndexHack");
    expect(out).toContain("+normal");
    expect(out).not.toContain("a/notes.md"); // the real headers are still gone
    expect(out).not.toContain("b/notes.md");
    expect(out).not.toContain("context");
  });

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

  it("budgets in BYTES, not characters, for multibyte content", () => {
    // Every other case here is ASCII, where byteLength and .length agree — so
    // swapping Buffer.byteLength for .length would pass them all while embedding a
    // CJK diff at ~3x the intended budget, overflowing the judge context the cap
    // exists to protect.
    const cjk = Array.from({ length: 30 }, (_, i) => `+日本語テスト行 ${i}`).join("\n");
    const out = capDiff(cjk, 120);
    const body = out.slice(0, out.indexOf("[… diff truncated"));
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(120);
    expect(body.length).toBeLessThan(Buffer.byteLength(body, "utf8")); // proves it is multibyte
    expect(body).not.toContain("�"); // no character was split
  });

  it("reports the omitted byte count exactly", () => {
    // `used` must count only the separators join() actually emits (n-1 for n
    // lines). Counting one per line under-reported every truncation by a byte —
    // small, but the marker's credibility is the entire point of the marker.
    const diff = "aaaa\nbbbb\ncccc\ndddd";
    const out = capDiff(diff, 10);
    const body = out.slice(0, out.indexOf("\n[… diff truncated"));
    const total = Buffer.byteLength(diff, "utf8");
    const omitted = total - Buffer.byteLength(body, "utf8");
    expect(out).toContain(`${omitted} of ${total} bytes omitted`);
  });

  it("still shows the judge something when one line exceeds the whole cap", () => {
    // A minified bundle or a lockfile line. Keeping nothing handed the judge a
    // marker with zero code under it, while the judge prompt simultaneously tells
    // it not to infer absence — a guaranteed non-answer.
    const oneLine = "+" + "x".repeat(500);
    const out = capDiff(oneLine, 100);
    expect(out.startsWith("+xxx")).toBe(true);
    expect(out).toContain("diff truncated");
    expect(Buffer.byteLength(out.split("\n[… diff truncated")[0], "utf8")).toBeLessThanOrEqual(100);
  });

  it("does not split a multibyte character when truncating an oversized single line", () => {
    const out = capDiff("+" + "日".repeat(200), 50);
    expect(out).not.toContain("�");
    expect(Buffer.from(out, "utf8").toString("utf8")).toBe(out);
  });
});

describe("vitestTally", () => {
  it("parses the shapes vitest actually emits", () => {
    expect(vitestTally(" Test Files  1 passed (1)\n      Tests  3 passed (3)\n")).toEqual({ passed: 3, failed: 0, skipped: 0, todo: 0 });
    expect(vitestTally("      Tests  1 failed | 2 passed (3)")).toEqual({ passed: 2, failed: 1, skipped: 0, todo: 0 });
    expect(vitestTally("      Tests  1 skipped (1)")).toEqual({ passed: 0, failed: 0, skipped: 1, todo: 0 });
    expect(vitestTally("      Tests  1 passed | 1 todo (2)")).toEqual({ passed: 1, failed: 0, skipped: 0, todo: 1 });
  });

  it("returns null when there is no summary line to trust", () => {
    expect(vitestTally("")).toBeNull();
    expect(vitestTally("No test files found, exiting with code 1")).toBeNull();
  });
});
