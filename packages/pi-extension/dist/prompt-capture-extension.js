// packages/adapters/src/prompt-capture-extension.ts
import { appendFileSync, readFileSync, rmSync } from "node:fs";

// packages/adapters/src/prompt-provenance.ts
import { createHash as createHash2, createHmac, timingSafeEqual } from "node:crypto";

// packages/core/src/prompt-normalization.ts
import { createHash } from "node:crypto";
var PROMPT_NORMALIZATION_RULE = "cwd-line-v1";
var PROMPT_NORMALIZATION_PATTERN = "^(Current working directory:)[^\\r\\n]*(\\r?)$";
var PROMPT_NORMALIZATION_FLAGS = "gm";
var PROMPT_NORMALIZATION_REPLACEMENT = "$1<normalized>$2";
var PROMPT_NORMALIZATION_SOURCE_DIGEST = createHash("sha256").update(JSON.stringify([
  "prompt-normalization-registry",
  PROMPT_NORMALIZATION_RULE,
  PROMPT_NORMALIZATION_PATTERN,
  PROMPT_NORMALIZATION_FLAGS,
  PROMPT_NORMALIZATION_REPLACEMENT
])).digest("hex");

// packages/adapters/src/prompt-provenance.ts
function sha(bytes) {
  return createHash2("sha256").update(bytes, "utf8").digest("hex");
}
function normalizePromptPayload(value, rule) {
  if (rule !== PROMPT_NORMALIZATION_RULE) throw new Error(`unknown prompt normalization rule ${String(rule)}`);
  if (typeof value === "string") return value.replace(new RegExp(PROMPT_NORMALIZATION_PATTERN, PROMPT_NORMALIZATION_FLAGS), PROMPT_NORMALIZATION_REPLACEMENT);
  if (Array.isArray(value)) return value.map((entry) => normalizePromptPayload(entry, rule));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizePromptPayload(entry, rule)]));
  return value;
}
function countInStrings(value, needle) {
  if (typeof value === "string") {
    if (!needle) return 0;
    let count = 0, at = 0;
    while ((at = value.indexOf(needle, at)) !== -1) {
      count++;
      at += needle.length;
    }
    return count;
  }
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countInStrings(entry, needle), 0);
  if (value && typeof value === "object") {
    const record = value;
    if (record.role === "user") {
      const content = Array.isArray(record.content) ? record.content : Array.isArray(record.parts) ? record.parts : [];
      return content.filter((block) => block && typeof block === "object" && (["tool_result", "tool_response", "function_response"].includes(String(block.type ?? "")) || "functionResponse" in block || "function_response" in block)).reduce((sum, block) => sum + countInStrings(block, needle), 0);
    }
    return Object.values(record).reduce((sum, entry) => sum + countInStrings(entry, needle), 0);
  }
  return 0;
}
var PROMPT_FIELDS = /* @__PURE__ */ new Set(["instructions", "input", "system", "messages", "prompt", "contents"]);
function promptProjection(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload;
  const projected = Object.fromEntries(Object.entries(record).filter(([key]) => PROMPT_FIELDS.has(key)));
  const config = record.config && typeof record.config === "object" ? record.config : null;
  if (config?.systemInstruction !== void 0) projected.systemInstruction = config.systemInstruction;
  return Object.keys(projected).length ? projected : null;
}
function observationMac(observation, authenticationKey) {
  return createHmac("sha256", authenticationKey).update(JSON.stringify(observation)).digest("hex");
}
function authenticatePromptObservation(observation, authenticationKey) {
  return { observation, mac: observationMac(observation, authenticationKey) };
}
function authenticatePromptSummary(count, authenticationKey) {
  const summary = { count };
  return { summary, mac: createHmac("sha256", authenticationKey).update(JSON.stringify(summary)).digest("hex") };
}
function statusFor(occurrences, mechanism, observable) {
  if (!observable) return "ERROR";
  return occurrences === (mechanism === "none" ? 0 : 1) ? "PASS" : "NOT-MEASURED";
}
function observeProviderPayload(payload, contract, mechanism, requestIndex) {
  const projection = promptProjection(payload);
  const raw = JSON.stringify(projection ?? {});
  const normalized = JSON.stringify(normalizePromptPayload(projection ?? {}, PROMPT_NORMALIZATION_RULE));
  const occurrences = countInStrings(projection ?? {}, contract);
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
    status: statusFor(occurrences, mechanism, observable),
    ...observable ? {} : { error: "provider payload has no supported model-visible prompt field" }
  };
}

// packages/adapters/src/prompt-capture-extension.ts
function promptCapture(pi) {
  const target = process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE;
  const contractPath = process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE;
  if (!target || !contractPath) throw new Error("prompt capture paths are required");
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  delete process.env.SKILL_HARNESS_PROMPT_CAPTURE_FILE;
  delete process.env.SKILL_HARNESS_PROMPT_CONTRACT_FILE;
  rmSync(contractPath, { force: true });
  let requestIndex = 0;
  pi.on("before_provider_request", (event) => {
    const observation = observeProviderPayload(event.payload, contract.text, contract.mechanism, requestIndex++);
    appendFileSync(target, JSON.stringify(authenticatePromptObservation(observation, contract.authentication_key)) + "\n", { encoding: "utf8", mode: 384 });
  });
  pi.on("session_shutdown", () => {
    appendFileSync(target, JSON.stringify(authenticatePromptSummary(requestIndex, contract.authentication_key)) + "\n", { encoding: "utf8", mode: 384 });
  });
}
export {
  promptCapture as default
};
