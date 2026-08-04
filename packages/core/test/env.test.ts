import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { envFlag, envNum, readEnv, __resetEnvWarnings } from "../src/util/env.js";

const NEW = "SKILL_HARNESS_TESTVAR";
const OLD = "SKILL_CHECK_TESTVAR";

function clear(): void {
  delete process.env[NEW];
  delete process.env[OLD];
}

beforeEach(() => {
  clear();
  __resetEnvWarnings();
});
afterEach(clear);

describe("readEnv", () => {
  test("prefers the SKILL_HARNESS_ name", () => {
    process.env[NEW] = "new";
    process.env[OLD] = "old";
    expect(readEnv("TESTVAR")).toBe("new");
  });

  test("falls back to the legacy SKILL_CHECK_ name", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true); // legacy read warns; keep suite output clean
    process.env[OLD] = "old";
    expect(readEnv("TESTVAR")).toBe("old");
    spy.mockRestore();
  });

  test("is undefined when neither is set", () => {
    expect(readEnv("TESTVAR")).toBeUndefined();
  });

  // An exported-but-empty var is how CI often "unsets" a value; treating it as
  // set would make the legacy fallback unreachable for those users.
  test("treats an empty value as unset, so the legacy name still wins", () => {
    process.env[NEW] = "";
    process.env[OLD] = "old";
    expect(readEnv("TESTVAR")).toBe("old");
  });

  test("warns once, on stderr, when the legacy name is what supplied the value", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env[OLD] = "old";
    readEnv("TESTVAR");
    readEnv("TESTVAR");
    const warnings = spy.mock.calls.map((c) => String(c[0])).filter((s) => s.includes(OLD));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(NEW); // tells the user what to rename it to
    spy.mockRestore();
  });

  test("does not warn when the new name is used", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env[NEW] = "new";
    readEnv("TESTVAR");
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).not.toContain("SKILL_CHECK_");
    spy.mockRestore();
  });
});

describe("envNum", () => {
  test("parses the new name", () => {
    process.env[NEW] = "5000";
    expect(envNum("TESTVAR", 120)).toBe(5000);
  });

  test("parses the legacy name", () => {
    process.env[OLD] = "5000";
    expect(envNum("TESTVAR", 120)).toBe(5000);
  });

  test("returns the fallback when unset", () => {
    expect(envNum("TESTVAR", 120)).toBe(120);
  });

  // The pre-rename code did `Number(process.env.X ?? default)`, so a garbage
  // value became NaN and silently disabled the timeout it fed. Never NaN.
  test("a malformed value warns and yields the fallback, never NaN", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env[NEW] = "not-a-number";
    expect(envNum("TESTVAR", 120)).toBe(120);
    expect(spy.mock.calls.map((c) => String(c[0])).join("")).toContain(NEW);
    spy.mockRestore();
  });

  test("a non-positive value warns and yields the fallback", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    process.env[NEW] = "0";
    expect(envNum("TESTVAR", 120)).toBe(120);
    spy.mockRestore();
  });
});

describe("envFlag", () => {
  test("any non-empty value is on, under either name", () => {
    process.env[NEW] = "1";
    expect(envFlag("TESTVAR")).toBe(true);
    delete process.env[NEW];
    process.env[OLD] = "yes";
    expect(envFlag("TESTVAR")).toBe(true);
  });

  test("unset is off", () => {
    expect(envFlag("TESTVAR")).toBe(false);
  });
});
