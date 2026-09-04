import { createHash } from "node:crypto";
import { PROMPT_NORMALIZATION_FLAGS, PROMPT_NORMALIZATION_PATTERN, PROMPT_NORMALIZATION_REPLACEMENT, PROMPT_NORMALIZATION_RULE, type PromptMechanism, type PromptProvenance } from "@skill-harness/core";
export { PROMPT_NORMALIZATION_RULE } from "@skill-harness/core";

function sha(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** Registry entry 1: replace exactly Pi's dynamic cwd line, preserving every other byte. */
export function normalizePromptPayload(value: unknown, rule: typeof PROMPT_NORMALIZATION_RULE): unknown {
  if (rule !== PROMPT_NORMALIZATION_RULE) throw new Error(`unknown prompt normalization rule ${String(rule)}`);
  if (typeof value === "string") return value.replace(new RegExp(PROMPT_NORMALIZATION_PATTERN, PROMPT_NORMALIZATION_FLAGS), PROMPT_NORMALIZATION_REPLACEMENT);
  if (Array.isArray(value)) return value.map((entry) => normalizePromptPayload(entry, rule));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizePromptPayload(entry, rule)]));
  return value;
}

function countInStrings(value: unknown, needle: string): number {
  if (typeof value === "string") {
    if (!needle) return 0;
    let count = 0, at = 0;
    while ((at = value.indexOf(needle, at)) !== -1) { count++; at += needle.length; }
    return count;
  }
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countInStrings(entry, needle), 0);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A scenario may quote the contract. User-authored text is stimulus, never
    // delivery, but providers also place tool results inside role=user messages.
    if (record.role === "user") {
      const content = Array.isArray(record.content) ? record.content : Array.isArray(record.parts) ? record.parts : [];
      return content
        .filter(block => block && typeof block === "object" && (
          ["tool_result", "tool_response", "function_response"].includes(String((block as Record<string, unknown>).type ?? "")) ||
          "functionResponse" in (block as Record<string, unknown>) || "function_response" in (block as Record<string, unknown>)
        ))
        .reduce<number>((sum, block) => sum + countInStrings(block, needle), 0);
    }
    return Object.values(record).reduce<number>((sum, entry) => sum + countInStrings(entry, needle), 0);
  }
  return 0;
}

const PROMPT_FIELDS = new Set(["instructions", "input", "system", "messages", "prompt", "contents"]);
function promptProjection(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const projected = Object.fromEntries(Object.entries(record).filter(([key]) => PROMPT_FIELDS.has(key)));
  const config = record.config && typeof record.config === "object" ? record.config as Record<string, unknown> : null;
  if (config?.systemInstruction !== undefined) projected.systemInstruction = config.systemInstruction;
  return Object.keys(projected).length ? projected : null;
}

/** Compute observation from final provider payload prompt bytes; caller supplies content, never status. */
export function observeProviderPayload(payload: unknown, contract: string, mechanism: PromptMechanism, requestIndex: number): PromptProvenance {
  const projection = promptProjection(payload);
  const raw = JSON.stringify(projection ?? {});
  const normalized = JSON.stringify(normalizePromptPayload(projection ?? {}, PROMPT_NORMALIZATION_RULE));
  const occurrences = countInStrings(projection ?? {}, contract);
  const expectsDelivery = mechanism !== "none";
  const observable = projection !== null;
  return {
    capture_version: "prompt-provenance-v1",
    request_index: requestIndex,
    raw_sha256: sha(raw),
    normalized_sha256: sha(normalized),
    normalization_rule: PROMPT_NORMALIZATION_RULE,
    bytes: Buffer.byteLength(raw),
    contract_sha256: sha(contract),
    contract_bytes: Buffer.byteLength(contract),
    contract_occurrences: occurrences,
    mechanism,
    status: observable ? (occurrences === (expectsDelivery ? 1 : 0) ? "PASS" : "FAIL") : "ERROR",
    ...(observable ? {} : { error: "provider payload has no supported model-visible prompt field" }),
  };
}
