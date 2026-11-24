import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { harvestSessionToSpec } from "../src/harvest.js";
import { loadSpec } from "../src/spec.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("harvestSessionToSpec", () => {
  it("extracts user prompt, edited files, redacts secrets, and writes a valid specification.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "sh-harvest-"));
    dirs.push(dir);
    const session = join(dir, "session.jsonl");
    const lines = [
      JSON.stringify({
        type: "message",
        message: {
          role: "user",
          content: [{ type: "text", text: "Fix src/limiter.mjs concurrency (ignore key sk-1234567890abcdefghijklmnop)." }],
        },
      }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "edit", arguments: { path: "src/limiter.mjs" } },
            { type: "toolCall", name: "bash", arguments: { command: "npm test" } },
          ],
        },
      }),
    ];
    writeFileSync(session, lines.join("\n") + "\n", "utf8");

    const out = join(dir, "out");
    const res = harvestSessionToSpec({ sessionPath: session, outDir: out, skillName: "limiter-regression" });
    expect(res.skillName).toBe("limiter-regression");
    expect(res.editedFiles).toEqual(["src/limiter.mjs"]);
    expect(res.verifyCommands).toEqual(["npm test"]);
    const raw = readFileSync(res.specPath, "utf8");
    expect(raw).not.toContain("sk-1234567890abcdefghijklmnop");
    const parsed = loadSpec(res.specPath);
    expect(parsed.scenarios).toHaveLength(1);
    expect(parsed.scenarios[0].id).toBe("H1");
  });
});
