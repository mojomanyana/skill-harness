import { describe, it, expect } from "vitest";
import { redactText, redactArgs, truncate } from "../src/redaction.js";

describe("trace redaction", () => {
  it.each([
    ["bearer token", "call with Bearer abcdefghijklmnopqrstuvwxyz123456"],
    ["openai-style key", `key is ${"sk-"}abcdefghijklmnopqrstuvwxyz`],
    ["github token", `${"ghp_"}abcdefghijklmnopqrstuvwxyz1234`],
    ["slack token", "xoxb-1234567890-abcdefghijkl"],
    ["aws key id", `${"AKIA"}IOSFODNN7EXAMPLE`],
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"],
  ])("redacts a %s", (_label, text) => {
    expect(redactText(text)).toContain("[redacted]");
  });

  it("redacts secret keys, private keys, home paths, and deep values", () => {
    const pem = `-----BEGIN ${"RSA"} PRIVATE KEY-----\nMIIEow\nkey\n-----END RSA PRIVATE KEY-----`;
    expect(redactText(pem)).toBe("[redacted]");
    expect(redactText("/home/someone/x", "/home/someone")).toBe("~/x");
    const args = redactArgs({ api_key: "plain", nested: { password: "hunter2" }, deep: { a: { b: { c: { d: "x" } } } } });
    expect(args.api_key).toBe("[redacted]");
    expect((args.nested as Record<string, unknown>).password).toBe("[redacted]");
    expect(JSON.stringify(args)).toContain("[nested]");
  });

  it("keeps ordinary arguments and marks truncation", () => {
    expect(redactArgs({ path: "src/app.ts", count: 3, ok: true })).toEqual({ path: "src/app.ts", count: 3, ok: true });
    expect(truncate("x".repeat(3000))).toContain("[truncated");
    expect(redactArgs(null)).toEqual({});
  });
});
