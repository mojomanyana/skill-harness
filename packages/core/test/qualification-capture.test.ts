import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openQualificationBoundedCapture, redactQualificationOutput } from "../src/qualification-capture.js";

describe("qualification bounded capture", () => {
  it("redacts a complete credential-bearing line before any durable write", () => {
    const root = mkdtempSync(join(tmpdir(), "qualification-capture-"));
    const path = join(root, "stdout.partial");
    const secret = "sentinel-oauth-access-token-value";
    const capture = openQualificationBoundedCapture(path, 4096, (text) => redactQualificationOutput(text, [secret]));
    capture.write(Buffer.from(`credential=${secret}\n`, "utf8"));
    capture.close();
    expect(readFileSync(path, "utf8")).toContain("[REDACTED credential]");
    expect(readFileSync(path, "utf8")).not.toContain(secret);
  });

  it("discards a limit-split final line instead of persisting an unmatchable secret prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "qualification-capture-"));
    const path = join(root, "stdout.partial");
    const secret = "sentinel-oauth-access-token-value";
    const capture = openQualificationBoundedCapture(path, 12, (text) => redactQualificationOutput(text, [secret]));
    capture.write(Buffer.from(secret, "utf8"));
    capture.close();
    expect(capture.truncated).toBe(true);
    expect(readFileSync(path)).toHaveLength(0);
  });
});
