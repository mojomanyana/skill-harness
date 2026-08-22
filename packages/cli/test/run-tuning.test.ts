import { describe, test, expect } from "vitest";
import { parseRunTuning, releaseExitCode, help, type Args } from "../src/cli.js";

/**
 * `--reps` / `--pass-threshold` must reject invalid provided values rather
 * than silently coercing to a default (bug: `--pass-threshold 90`, a
 * fat-finger for 0.9, used to silently fall back to 0.5 — loosening the gate
 * the user meant to tighten). Matches spec.ts, which throws for the same
 * out-of-range value on the per-scenario `pass_threshold:` field.
 */

function argsFor(flags: Record<string, string>): Args {
  return { _: [], flags, multi: {} };
}

describe("release exit policy", () => {
  const summary = (mode: string, ship: boolean, partial = false) => ({ results: { mode, partial, effective_grade: { ship } } });

  test("a full scored NOT READY run exits non-zero, including one critical failure hidden by a high aggregate", () => {
    expect(releaseExitCode([summary("force", false)])).toBe(1);
  });

  test("SHIP, red baselines, and partial branch-feedback runs do not masquerade as failed release gates", () => {
    expect(releaseExitCode([summary("force", true)])).toBe(0);
    expect(releaseExitCode([summary("red", false)])).toBe(0);
    expect(releaseExitCode([summary("force", false, true)])).toBe(0);
  });
});

describe("parseRunTuning", () => {
  test("absent flags use the defaults", () => {
    expect(parseRunTuning(argsFor({}))).toEqual({ reps: 1, passThreshold: 0.5 });
  });

  test("valid provided flags are used as-is", () => {
    expect(parseRunTuning(argsFor({ reps: "5", "pass-threshold": "0.8" }))).toEqual({
      reps: 5,
      passThreshold: 0.8,
    });
  });

  test("--pass-threshold 90 (fat-finger for 0.9) throws instead of silently coercing", () => {
    expect(() => parseRunTuning(argsFor({ "pass-threshold": "90" }))).toThrow(/pass-threshold/);
  });

  test("--pass-threshold -0.1 throws", () => {
    expect(() => parseRunTuning(argsFor({ "pass-threshold": "-0.1" }))).toThrow(/pass-threshold/);
  });

  test("--reps 0 throws", () => {
    expect(() => parseRunTuning(argsFor({ reps: "0" }))).toThrow(/reps/);
  });

  test("--reps 2.5 throws", () => {
    expect(() => parseRunTuning(argsFor({ reps: "2.5" }))).toThrow(/reps/);
  });
});

test("run --help documents --structured and what it buys", () => {
  const usage = help();
  expect(usage).toContain("--structured");
  expect(usage).toMatch(/cost|token/i);
});

test("run --help documents --arm and where arms are declared", () => {
  const usage = help();
  expect(usage).toContain("--arm");
  expect(usage).toContain("arms.yaml");
});
