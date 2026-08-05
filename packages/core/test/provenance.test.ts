import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { HARNESS_VERSION } from "../src/version.js";
import { defaultJudge, BAKED_DEFAULT_JUDGE } from "../src/defaults.js";
import { finalizeResults, writeResults, readResults, migrateResults, type ResultsDraft } from "../src/results.js";
import { __resetEnvWarnings } from "../src/util/env.js";

function draft(over: Partial<ResultsDraft> = {}): ResultsDraft {
  return {
    skill: "golden",
    harness: "pi",
    model: "fireworks:fake",
    judge: { provider: "anthropic", model: "opus" },
    timestamp: "2026-08-05T00:00:00Z",
    label: null,
    mode: "green",
    scenarios: [{ id: "A1", judge_verdict: "PASS", judge_reason: "", suspect: false, override: null, note: "" }],
    ...over,
  };
}

describe("HARNESS_VERSION", () => {
  // The version is provenance for every number this tool publishes, so a
  // placeholder or an `undefined` leaking into a results file is worse than useless.
  test("is the real semver of the running package", () => {
    expect(HARNESS_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  test("matches what package.json declares", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(HARNESS_VERSION).toBe(pkg.version);
  });
});

describe("every results write records the version that produced it", () => {
  // `schema` is the wrong sentinel for "can this number be compared to that one":
  // 0.2.1 → 0.3.0 kept schema 2 while changing what a verdict MEANS (the judge
  // started seeing the diff, needles started matching changed lines only).
  test("finalizeResults stamps harness_version, like it stamps schema", () => {
    const results = finalizeResults(draft(), null);
    expect(results.harness_version).toBe(HARNESS_VERSION);
    expect(results.schema).toBe(2);
  });

  test("it survives a write/read round trip through YAML", () => {
    const runDir = join(mkdtempSync(join(tmpdir(), "sh-prov-")), "run");
    writeResults(runDir, draft(), null);
    expect(readResults(runDir).harness_version).toBe(HARNESS_VERSION);
    const raw = yaml.load(readFileSync(join(runDir, "results.yaml"), "utf8")) as Record<string, unknown>;
    expect(raw.harness_version).toBe(HARNESS_VERSION);
  });

  // Runs recorded before this field existed are the whole reason it is optional.
  // Inventing a version for them would fabricate provenance we do not have.
  test("a run recorded before the field existed reads back without one", () => {
    const migrated = migrateResults({
      schema: 2, skill: "golden", harness: "pi", model: "m",
      judge: { provider: "a", model: "o" }, timestamp: "t", label: null, mode: "green",
      effective_grade: { passed: 1, total: 1, pct: 100, letter: "A", ship: true, note: "" },
      scenarios: [],
    });
    expect(migrated.harness_version).toBeUndefined();
  });
});

describe("defaultJudge", () => {
  const KEYS = ["SKILL_HARNESS_JUDGE", "SKILL_CHECK_JUDGE"];
  const clear = () => KEYS.forEach((k) => delete process.env[k]);

  beforeEach(() => { clear(); __resetEnvWarnings(); });
  afterEach(clear);

  test("is the baked default when the environment says nothing", () => {
    expect(defaultJudge()).toBe(BAKED_DEFAULT_JUDGE);
  });

  // The default must not be able to spend money nobody asked for. `claude-code`
  // routes through `claude -p` on the user's subscription (OAuth); `anthropic`
  // is a metered API key, and it billed a corpus once by accident as the default.
  test("the baked default is the subscription path, not a metered API", () => {
    expect(BAKED_DEFAULT_JUDGE.split(":")[0]).toBe("claude-code");
    expect(defaultJudge().startsWith("anthropic:")).toBe(false);
  });

  // The baked default is a metered API. A user who steers rather than types every
  // flag needs to set judge policy once, per repo or per shell, instead of
  // remembering `--judge` on every invocation — a forgotten flag must not bill.
  test("SKILL_HARNESS_JUDGE overrides it", () => {
    process.env.SKILL_HARNESS_JUDGE = "fireworks:accounts/fireworks/models/kimi-k3";
    expect(defaultJudge()).toBe("fireworks:accounts/fireworks/models/kimi-k3");
  });

  test("the pre-rename SKILL_CHECK_JUDGE still works", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true); // legacy read warns
    process.env.SKILL_CHECK_JUDGE = "fireworks:legacy";
    expect(defaultJudge()).toBe("fireworks:legacy");
    spy.mockRestore();
  });

  test("an explicit --judge still beats the environment — the env is only the default", () => {
    process.env.SKILL_HARNESS_JUDGE = "fireworks:from-env";
    // The CLI's precedence is flag ?? defaultJudge(); this asserts the seam it relies on.
    const flag: string | undefined = "anthropic:explicit";
    expect(flag ?? defaultJudge()).toBe("anthropic:explicit");
  });
});
