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

  it("harvests two distinct turns independently with preserved --id, spaces in path, and redacted verify commands", () => {
    const dir = mkdtempSync(join(tmpdir(), "sh-harvest-two-turn-"));
    dirs.push(dir);
    const session = join(dir, "two-turn session.jsonl");
    const turn1Prompt = "Fix rate limiter burst bug in src/limiter.ts";
    const turn2Prompt = "Fix webhook signature check in src/webhook.ts";
    const lines = [
      JSON.stringify({ type: "message", message: { role: "user", content: turn1Prompt } }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "edit", arguments: { path: "src/limiter.ts" } },
            { type: "toolCall", name: "bash", arguments: { command: "API_TOKEN=sk-secret9876543210abcdef npm test" } },
          ],
        },
      }),
      JSON.stringify({ type: "message", message: { role: "user", content: turn2Prompt } }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [
            { type: "toolCall", name: "edit", arguments: { path: "src/webhook.ts" } },
            { type: "toolCall", name: "bash", arguments: { command: "vitest run webhook.test.ts" } },
          ],
        },
      }),
    ];
    writeFileSync(session, lines.join("\n") + "\n", "utf8");

    const outWithSpaces = join(dir, "harvested evals dir");
    const first = harvestSessionToSpec({
      sessionPath: session,
      outDir: outWithSpaces,
      scenarioId: "turn-one-limiter",
      prompt: turn1Prompt,
    });
    const second = harvestSessionToSpec({
      sessionPath: session,
      outDir: outWithSpaces,
      scenarioId: "turn-two-webhook",
      prompt: turn2Prompt,
    });

    expect(first.specPath).not.toBe(second.specPath);
    expect(first.specPath).toContain("harvested evals dir");

    const spec1 = loadSpec(first.specPath);
    const spec2 = loadSpec(second.specPath);
    expect(spec1.scenarios[0].id).toBe("turn-one-limiter");
    expect(spec1.scenarios[0].turns).toEqual([turn1Prompt]);
    expect(spec2.scenarios[0].id).toBe("turn-two-webhook");
    expect(spec2.scenarios[0].turns).toEqual([turn2Prompt]);
    expect(spec2.scenarios[0].checklist.join("\n")).toContain("src/webhook.ts");

    const raw1 = readFileSync(first.specPath, "utf8");
    expect(raw1).not.toContain("sk-secret9876543210abcdef");
  });

  it("P1/P2: structured turnInput isolates repeated identical prompts, preserves -- prompts, redacts TOKEN=, and avoids 48-char ID collisions", () => {
    const dir = mkdtempSync(join(tmpdir(), "sh-harvest-structured-"));
    dirs.push(dir);
    const out = join(dir, "evals with spaces");

    // Identical prompt across two turns with different verification commands + synthetic TOKEN=
    const repeatedPrompt = "--fix-mode retry backoff handling";
    const maxId = "a".repeat(48);

    const first = harvestSessionToSpec({
      outDir: out,
      unique: true,
      turnInput: {
        scenarioId: maxId,
        prompt: repeatedPrompt,
        editedFiles: ["src/retry.ts"],
        verifyCommands: ["TOKEN=synthetic-token-value-12345 npm test -- retry"],
        notes: "First turn retry failure",
      },
    });
    const second = harvestSessionToSpec({
      outDir: out,
      unique: true,
      turnInput: {
        scenarioId: maxId,
        prompt: repeatedPrompt,
        editedFiles: ["src/backoff.ts"],
        verifyCommands: ["vitest run backoff.test.ts"],
        notes: "Second turn backoff failure",
      },
    });

    expect(first.specPath).not.toBe(second.specPath);
    expect(first.scenarioId).toBe(maxId);
    expect(second.scenarioId).toBe(maxId);
    // Redacted in both returned JSON fields AND saved YAML
    expect(JSON.stringify(first)).not.toContain("synthetic-token-value-12345");
    expect(readFileSync(first.specPath, "utf8")).not.toContain("synthetic-token-value-12345");

    const spec1 = loadSpec(first.specPath);
    const spec2 = loadSpec(second.specPath);
    expect(spec1.scenarios[0].id).toBe(maxId);
    expect(spec1.scenarios[0].turns).toEqual([repeatedPrompt]);
    expect(spec1.scenarios[0].checklist.join("\n")).toContain("npm test -- retry");
    expect(spec1.scenarios[0].checklist.join("\n")).not.toContain("backoff.test.ts");

    expect(spec2.scenarios[0].id).toBe(maxId);
    expect(spec2.scenarios[0].turns).toEqual([repeatedPrompt]);
    expect(spec2.scenarios[0].checklist.join("\n")).toContain("vitest run backoff.test.ts");
    expect(spec2.scenarios[0].checklist.join("\n")).not.toContain("retry");
  });
});
