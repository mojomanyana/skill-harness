import { describe, expect, it } from "vitest";
import { withSandbox, type SandboxBackend } from "../src/sandbox.js";

describe("optional sandbox backend seam", () => {
  it("passes network policy, captures the diff, and always cleans up through a fake", async () => {
    const calls: string[] = [];
    const backend: SandboxBackend = {
      name: "fake",
      containment: "os",
      prepare: async (request) => {
        calls.push(`prepare:${request.network}`);
        return {
          cwd: "/sandbox/workspace",
          captureDiff: async () => "diff --git a/a b/a",
          cleanup: async () => { calls.push("cleanup"); },
        };
      },
    };
    const result = await withSandbox(backend, { sourceWorkspace: "/fixture", network: "deny" }, async (session) => {
      calls.push(`run:${session.cwd}`);
      return "ok";
    });
    expect(result).toEqual({ value: "ok", diff: "diff --git a/a b/a", backend: "fake", containment: "os" });
    expect(calls).toEqual(["prepare:deny", "run:/sandbox/workspace", "cleanup"]);
  });

  it("cleans up when the subject operation fails", async () => {
    let cleaned = false;
    const backend: SandboxBackend = {
      name: "fake", containment: "os",
      prepare: async () => ({ cwd: "/sandbox", captureDiff: async () => "", cleanup: async () => { cleaned = true; } }),
    };
    await expect(withSandbox(backend, { sourceWorkspace: "/fixture", network: "allow" }, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(cleaned).toBe(true);
  });
});
