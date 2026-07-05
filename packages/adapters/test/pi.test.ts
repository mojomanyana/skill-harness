import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock core's exec before importing the adapter.
vi.mock("@skill-harness/core", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@skill-harness/core")>();
  return { ...orig, exec: vi.fn(), onPath: () => true };
});

import { piAdapter } from "../src/pi.js";
import { exec } from "@skill-harness/core";

const mockedExec = vi.mocked(exec);

beforeEach(() => {
  mockedExec.mockReset();
  mockedExec.mockResolvedValue({ code: 0, stdout: "USER: hi\nASSISTANT: ok\nVERDICT: PASS", stderr: "" });
});

describe("pi adapter nested-run safety", () => {
  it("green-mode subject run passes --no-extensions and still --skill", async () => {
    await piAdapter.run({
      skillDir: "/s",
      model: { provider: "fireworks", model: "x" },
      mode: "green",
      turns: ["hi"],
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("pi");
    expect(args).toContain("--no-extensions");
    expect(args).toContain("--skill");
  });

  it("non-claude-code judge passes --no-extensions", async () => {
    await piAdapter.judge({
      model: { provider: "fireworks", model: "x" },
      prompt: "p",
      cwd: "/tmp",
    });
    const [cmd, args] = mockedExec.mock.calls[0];
    expect(cmd).toBe("pi");
    expect(args).toContain("--no-extensions");
  });
});
