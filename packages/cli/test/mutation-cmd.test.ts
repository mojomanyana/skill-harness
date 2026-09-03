import { afterEach, describe, expect, it, vi } from "vitest";
import { cmdMutationTest, help } from "../src/cli.js";

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

describe("mutation-test command", () => {
  it("is free/offline and prints every detected mutation class", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((value) => lines.push(String(value)));
    await cmdMutationTest();
    const output = lines.join("\n");
    expect(output).toContain("21/21 mutations detected");
    expect(output).toContain("head-equal-tree-different");
    expect(output).toContain("evidence-before-authority");
    expect(output).toContain("mismatch-finalization-identity");
    expect(output).toContain("no model or judge calls");
    expect(process.exitCode ?? 0).toBe(0);
  });

  it("is documented beside compare in CLI help", () => {
    expect(help()).toContain("mutation-test");
    expect(help()).toContain("compare <skill|all>");
  });
});
