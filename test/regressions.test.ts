import { describe, test, expect } from "vitest";
import { exec } from "../src/util/exec.js";
import { gradeTranscript } from "../src/grade.js";
import { tryOpen } from "../src/serve.js";
import type { HarnessAdapter } from "../src/adapters/types.js";

/**
 * Regression tests for three bugs found during end-to-end validation.
 */

// Bug 1: pi hung headless because exec inherited an open stdin. With stdin
// redirected to /dev/null ("ignore"), a stdin-reading process gets EOF and exits
// instead of blocking forever.
describe("exec does not inherit stdin (bug: pi hung headless)", () => {
  test("a stdin-reading command terminates instead of hanging", async () => {
    const r = await exec("cat", [], { timeoutMs: 5000 });
    expect(r.code).toBe(0); // EOF immediately → clean exit, no timeout kill
    expect(r.stderr).not.toMatch(/timeout/);
  });
});

// Bug 2: the review server crashed when xdg-open was missing because spawn emits
// 'error' asynchronously and an unhandled 'error' event takes down the process.
describe("tryOpen swallows a missing-opener error (bug: server crashed on xdg-open ENOENT)", () => {
  test("calling with a nonexistent opener does not throw or crash", async () => {
    expect(() => tryOpen("http://127.0.0.1:9/", "sc-definitely-not-a-real-binary")).not.toThrow();
    // give the async 'error' event a tick to fire; if unhandled it would crash the run.
    await new Promise((r) => setTimeout(r, 50));
    expect(true).toBe(true);
  });
});

// Bug 3: judge provider errors (e.g. out-of-credits) surfaced as a generic
// "no parseable verdict" with no clue to the cause. Now the actual judge output
// is included in the reason.
describe("gradeTranscript surfaces the judge's real error (bug: cause was invisible)", () => {
  function stubAdapter(output: string): HarnessAdapter {
    return {
      name: "stub",
      available: async () => true,
      run: async () => "",
      judge: async () => output,
    };
  }

  test("an unparseable provider error is echoed into the reason", async () => {
    const adapter = stubAdapter('[judge error: pi exited 1] 400 {"error":"out of extra usage"}');
    const r = await gradeTranscript(adapter, { provider: "anthropic", model: "claude-opus-4-8" }, "prompt", "/tmp");
    expect(r.verdict).toBe("ERROR");
    expect(r.reason).toMatch(/out of extra usage/);
    expect(r.reason).not.toBe("judge produced no parseable verdict");
  });

  test("a clean verdict still parses normally", async () => {
    const adapter = stubAdapter("VERDICT: PASS\nREASON: looks right");
    const r = await gradeTranscript(adapter, { provider: "fireworks", model: "kimi" }, "prompt", "/tmp");
    expect(r.verdict).toBe("PASS");
    expect(r.reason).toBe("looks right");
  });
});
