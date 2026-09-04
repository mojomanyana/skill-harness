import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizePromptPayload, observeProviderPayload } from "../src/prompt-provenance.js";
import promptCapture from "../src/prompt-capture-extension.js";

const contract = "# Contract\nDo the thing.\n";

describe("Pi prompt provenance", () => {
  it("the observer handler writes digests, not payload plaintext (breaks if before_provider_request is disconnected or leaks content)", () => {
    const dir = mkdtempSync(join(tmpdir(), "prompt-extension-")), output = join(dir, "out.jsonl"), config = join(dir, "contract.json");
    writeFileSync(output, "", "utf8"); writeFileSync(config, JSON.stringify({ text: contract, mechanism: "append-system-prompt" }), "utf8");
    const oldOut = process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE, oldConfig = process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE;
    process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE = output; process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE = config;
    let handler: ((event: { payload: unknown }) => void) | undefined;
    try {
      promptCapture({ on: (_name, candidate) => { handler = candidate; } });
      expect(process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE).toBeUndefined();
      expect(process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE).toBeUndefined();
      expect(() => readFileSync(config, "utf8")).toThrow();
      handler!({ payload: { instructions: contract, messages: [{ role: "user", content: "secret stimulus" }] } });
      const retained = readFileSync(output, "utf8");
      expect(JSON.parse(retained)).toMatchObject({ contract_occurrences: 1, status: "PASS" });
      expect(retained).not.toContain(contract); expect(retained).not.toContain("secret stimulus");
    } finally {
      if (oldOut === undefined) delete process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE; else process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE = oldOut;
      if (oldConfig === undefined) delete process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE; else process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE = oldConfig;
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("normalizes exactly the Current working directory line (breaks if cwd-line-v1 broadens or disappears)", () => {
    const a = observeProviderPayload({ instructions: `Keep /tmp/a\nCurrent working directory: /tmp/a\n${contract}` }, contract, "append-system-prompt", 0);
    const b = observeProviderPayload({ instructions: `Keep /tmp/a\nCurrent working directory: /tmp/b\n${contract}` }, contract, "append-system-prompt", 0);
    expect(a.raw_sha256).not.toBe(b.raw_sha256);
    expect(a.normalized_sha256).toBe(b.normalized_sha256);
    expect(a.normalization_rule).toBe("cwd-line-v1");
    expect(normalizePromptPayload({ instructions: "Other directory: /keep\nCurrent working directory: /drop\nKeep /drop" }, "cwd-line-v1")).toEqual({ instructions: "Other directory: /keep\nCurrent working directory:<normalized>\nKeep /drop" });
    expect(JSON.stringify(a)).not.toContain(contract);
  });

  it("occurrence count catches zero and duplicate delivery (breaks if delivery is inferred from argv)", () => {
    expect(observeProviderPayload({ instructions: "none" }, contract, "append-system-prompt", 0).status).toBe("FAIL");
    const dup = observeProviderPayload({ instructions: contract + contract }, contract, "append-system-prompt", 0);
    expect(dup.contract_occurrences).toBe(2);
    expect(dup.status).toBe("FAIL");
  });

  it("includes Google systemInstruction in the model-visible projection (breaks if force delivery is checked only at top level)", () => {
    const p = observeProviderPayload({ config: { systemInstruction: contract }, contents: [{ role: "user", parts: [{ text: "hi" }] }] }, contract, "append-system-prompt", 0);
    expect(p).toMatchObject({ contract_occurrences: 1, status: "PASS" });
  });

  it("counts Anthropic tool_result inside a user-role message (breaks if role filtering hides progressive disclosure)", () => {
    const payload = { messages: [{ role: "user", content: [{ type: "text", text: "ordinary user text" }, { type: "tool_result", tool_use_id: "1", content: contract }] }] };
    expect(observeProviderPayload(payload, contract, "pi-skill", 0)).toMatchObject({ contract_occurrences: 1, status: "PASS" });
  });

  it("does not count a user quotation as delivery (breaks if role filtering is removed)", () => {
    expect(observeProviderPayload({ messages: [{ role: "user", content: contract }] }, contract, "none", 0).contract_occurrences).toBe(0);
    expect(observeProviderPayload({ instructions: contract, messages: [{ role: "user", content: contract }] }, contract, "append-system-prompt", 0).contract_occurrences).toBe(1);
  });

  it("red requires zero occurrences (breaks if absent delivery is treated as missing evidence)", () => {
    const p = observeProviderPayload({ instructions: "generic" }, contract, "none", 0);
    expect(p.contract_occurrences).toBe(0);
    expect(p.status).toBe("PASS");
  });
});
