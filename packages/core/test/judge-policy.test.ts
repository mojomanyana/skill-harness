import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { isMeteredJudge, assertJudgeAllowed, allowMeteredJudge } from "../src/judge-policy.js";
import { parseModelRef } from "../src/adapters/types.js";
import { __resetEnvWarnings } from "../src/util/env.js";

const ENV = "SKILL_HARNESS_ALLOW_METERED_JUDGE";

beforeEach(() => { delete process.env[ENV]; __resetEnvWarnings(); });
afterEach(() => { delete process.env[ENV]; });

describe("isMeteredJudge", () => {
  test("subscription-backed providers are not metered", () => {
    expect(isMeteredJudge(parseModelRef("claude-code:claude-opus-4-8"))).toBe(false);
    expect(isMeteredJudge(parseModelRef("openai-codex:gpt-5.6-sol"))).toBe(false);
  });

  test("a local runtime is not metered", () => {
    expect(isMeteredJudge(parseModelRef("ollama:llama3"))).toBe(false);
    expect(isMeteredJudge(parseModelRef("lmstudio:whatever"))).toBe(false);
  });

  test("an API-key provider is metered — including direct OpenAI and the old default", () => {
    expect(isMeteredJudge(parseModelRef("anthropic:claude-opus-4-8"))).toBe(true);
    expect(isMeteredJudge(parseModelRef("fireworks:accounts/fireworks/models/kimi-k3"))).toBe(true);
    expect(isMeteredJudge(parseModelRef("openai:gpt-5.6-sol"))).toBe(true);
  });

  // Allow-list, not deny-list: a provider nobody has classified is treated as
  // able to bill. The cost of being wrong the other way is a surprise invoice.
  test("an unknown provider is assumed to bill", () => {
    expect(isMeteredJudge(parseModelRef("some-new-provider:model"))).toBe(true);
  });
});

describe("assertJudgeAllowed", () => {
  test("subscription judges pass silently", () => {
    expect(() => assertJudgeAllowed(parseModelRef("claude-code:claude-opus-4-8"), { source: "--judge" })).not.toThrow();
    expect(() => assertJudgeAllowed(parseModelRef("openai-codex:gpt-5.6-sol"), { source: "--judge" })).not.toThrow();
  });

  test("a metered judge is refused, naming the provider and the source of the choice", () => {
    expect(() => assertJudgeAllowed(parseModelRef("anthropic:claude-opus-4-8"), { source: "--judge" }))
      .toThrow(/anthropic.*metered|metered.*anthropic/is);
    expect(() => assertJudgeAllowed(parseModelRef("anthropic:claude-opus-4-8"), { source: "the run's recorded judge" }))
      .toThrow(/recorded judge/i);
  });

  // The message is the whole feature: a refusal that doesn't say how to proceed
  // just moves the surprise from the invoice to the terminal.
  test("the refusal names the subscription alternative and the opt-in", () => {
    let msg = "";
    try { assertJudgeAllowed(parseModelRef("anthropic:claude-opus-4-8"), { source: "--judge" }); }
    catch (e) { msg = e instanceof Error ? e.message : String(e); }
    expect(msg).toContain("claude-code:claude-opus-4-8");
    expect(msg).toContain("--allow-metered-judge");
    expect(msg).toContain(ENV);
  });

  test("an explicit opt-in lets it through", () => {
    expect(() => assertJudgeAllowed(parseModelRef("anthropic:claude-opus-4-8"), { source: "--judge", allowMetered: true }))
      .not.toThrow();
  });

  test("the env opt-in lets it through too, for a repo that decided once", () => {
    process.env[ENV] = "1";
    expect(() => assertJudgeAllowed(parseModelRef("anthropic:claude-opus-4-8"), { source: "--judge" })).not.toThrow();
    expect(allowMeteredJudge()).toBe(true);
  });

  // A regrade defaults to the judge the run recorded, so a `results.yaml` naming a
  // metered judge spends on every later regrade — the one path where a file, not a
  // person, made the cost decision.
  test("re-judging a run recorded under the old metered default is refused by default", () => {
    const recorded = { provider: "anthropic", model: "claude-opus-4-8" };
    expect(() => assertJudgeAllowed(recorded, { source: "the run's recorded judge" })).toThrow(/metered/i);
  });
});
