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

describe("agent-file runs", () => {
  it("uses the file as the system prompt and activates no skill", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "sc-agentfile-"));
    const file = join(dir, "plan.md");
    writeFileSync(file, "# Plan agent\nYou are single-shot.", "utf8");

    await piAdapter.run({
      skillDir: "/s",
      model: { provider: "fireworks", model: "x" },
      mode: "green", // deliberately green: the agent file must win over skill activation
      turns: ["plan this"],
      cwd: "/tmp",
      systemPromptFile: file,
    });
    const [, args] = mockedExec.mock.calls[0];
    expect(args).toContain("--no-skills");
    expect(args).not.toContain("--skill");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("# Plan agent\nYou are single-shot.");
  });
});
