import { describe, test, expect } from "vitest";
import { tryOpen } from "../src/serve.js";

/**
 * Regression tests for bugs found during end-to-end validation.
 */

// Bug 3: the review server crashed when the configured/default opener binary
// (e.g. xdg-open) doesn't exist — spawn's async 'error' event was unhandled.
describe("tryOpen swallows a missing-opener error (bug: server crashed on xdg-open ENOENT)", () => {
  test("calling with a nonexistent opener does not throw or crash", async () => {
    expect(() => tryOpen("http://127.0.0.1:9/", "sc-definitely-not-a-real-binary")).not.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    expect(true).toBe(true);
  });
});
