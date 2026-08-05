import { describe, test, expect, vi, afterEach } from "vitest";
import { HARNESS_VERSION, BAKED_DEFAULT_JUDGE } from "@skill-harness/core";
import { main, help } from "../src/cli.js";

/** Capture console.log output while `fn` runs. */
async function captured(fn: () => Promise<void> | void): Promise<string> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...a) => void lines.push(a.join(" ")));
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join("\n");
}

afterEach(() => {
  delete process.env.SKILL_HARNESS_JUDGE;
  process.exitCode = 0;
});

describe("--version", () => {
  // A stale global install is the failure this exists to make visible: a 0.1.0
  // binary grading a 0.3.x corpus produces plausible numbers and says nothing.
  // Before this, `--version` was `unknown command` and exited 1.
  test("prints the harness version and exits clean", async () => {
    const out = await captured(() => main(["--version"]));
    expect(out.trim()).toBe(HARNESS_VERSION);
    // Untouched means success — `unknown command` used to set it to 1.
    expect(process.exitCode ?? 0).toBe(0);
  });

  test("-v is the same thing", async () => {
    expect((await captured(() => main(["-v"]))).trim()).toBe(HARNESS_VERSION);
  });

  test("the bare `version` subcommand works too", async () => {
    expect((await captured(() => main(["version"]))).trim()).toBe(HARNESS_VERSION);
  });
});

describe("help", () => {
  test("names the running version, so a screenshot of it is dateable", () => {
    expect(help()).toContain(HARNESS_VERSION);
  });

  // Rendered per call rather than frozen at module load, so what it prints is what
  // the next command will actually use.
  test("shows the environment's judge when one is set, not the baked default", () => {
    expect(help()).toContain(BAKED_DEFAULT_JUDGE);
    process.env.SKILL_HARNESS_JUDGE = "fireworks:accounts/fireworks/models/kimi-k3";
    const withEnv = help();
    expect(withEnv).toContain("kimi-k3");
    expect(withEnv).not.toContain(BAKED_DEFAULT_JUDGE);
  });
});
