import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock core's exec before importing the adapter.
vi.mock("@skill-check/core", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@skill-check/core")>();
  return { ...orig, exec: vi.fn(), onPath: () => true };
});

import { piAdapter } from "../src/index.js";
import { exec } from "@skill-check/core";

const mockedExec = vi.mocked(exec);

beforeEach(() => {
  mockedExec.mockReset();
  mockedExec.mockResolvedValue({ code: 0, stdout: "VERDICT: PASS\nREASON: ok", stderr: "" });
});

describe("judge routing", () => {
  it("routes claude-code judge to the claude CLI", async () => {
    await piAdapter.judge({
      model: { provider: "claude-code", model: "opus" },
      prompt: "grade this",
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toEqual(["-p", "grade this", "--model", "opus"]);
  });

  it("routes any other provider through pi", async () => {
    await piAdapter.judge({
      model: { provider: "anthropic", model: "claude-opus-4-8" },
      prompt: "grade this",
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("pi");
    expect(args).toContain("--provider");
    expect(args).toContain("anthropic");
  });

  it("surfaces judge CLI failure as a tagged string, not a throw", async () => {
    mockedExec.mockResolvedValue({ code: 1, stdout: "", stderr: "boom" });
    const out = await piAdapter.judge({
      model: { provider: "claude-code", model: "opus" },
      prompt: "p",
      cwd: "/tmp",
    });
    expect(out).toMatch(/^\[judge error: claude exited 1\]/);
  });
});
