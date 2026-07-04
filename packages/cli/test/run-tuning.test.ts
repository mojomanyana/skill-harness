import { describe, test, expect } from "vitest";
import { parseRunTuning, type Args } from "../src/cli.js";

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
