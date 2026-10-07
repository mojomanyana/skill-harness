const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_INPUT_LENGTH = 64 * 1024;
const MAX_QUESTION_LENGTH = 8 * 1024;
const MAX_MODEL_LENGTH = 256;
const PROVIDER = Object.freeze({
  name: "jev",
  model: "typesafe/jev-1.13",
  url: "https://openrouter.ai/api/alpha/decisions",
});

const emptyUsage = () => ({ inputTokens: null, outputTokens: null, costUsd: null });

function requiredString(value, name, maxLength) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new TypeError(`${name} must be a non-empty bounded string`);
  }
}

function validateSelection(provider, model) {
  if (provider !== PROVIDER.name) throw new TypeError("unsupported provider");
  if (model !== PROVIDER.model) throw new TypeError("unsupported model");
}

export function makeRequest(provider, model, example) {
  validateSelection(provider, model);
  if (!example || typeof example !== "object" || Array.isArray(example)) {
    throw new TypeError("example must be an object");
  }
  requiredString(example.input, "input", MAX_INPUT_LENGTH);
  requiredString(example.question, "question", MAX_QUESTION_LENGTH);
  return {
    url: PROVIDER.url,
    body: {
      model,
      state: example.input,
      questions: { decision: { type: "noul", instructions: example.question } },
    },
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function probability(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("invalid provider response");
  }
  return value;
}
function tokenCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("invalid provider response");
  }
  return value;
}
function cost(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("invalid provider response");
  }
  return value;
}
function resolvedModel(value, requested) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_MODEL_LENGTH ||
    (value !== requested && !value.startsWith(`${requested}-`))
  ) {
    throw new Error("invalid provider response");
  }
  return value;
}
function normalize(payload, requestedModel) {
  if (
    !isRecord(payload) ||
    !isRecord(payload.answers) ||
    Object.keys(payload.answers).length !== 1 ||
    !isRecord(payload.usage)
  ) {
    throw new Error("invalid provider response");
  }
  const answer = payload.answers.decision;
  if (!isRecord(answer) || answer.type !== "noul") {
    throw new Error("invalid provider response");
  }
  return {
    status: "answered",
    probability: probability(answer.noul),
    resolvedModel: resolvedModel(payload.model, requestedModel),
    usage: {
      inputTokens: tokenCount(payload.usage.input_tokens),
      outputTokens: tokenCount(payload.usage.output_tokens),
      costUsd: cost(payload.usage.cost),
    },
    error: null,
  };
}
function deadline(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(new Error("provider request timed out"));
    signal.addEventListener("abort", () => reject(new Error("provider request timed out")), { once: true });
  });
}
async function readBounded(response, timedOut) {
  if (!response.body || typeof response.body.getReader !== "function") {
    throw new Error("invalid provider response");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw new Error("invalid provider response");
      length += value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error("provider response exceeded limit");
      chunks.push(value);
    }
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function failure(startedAt, error) {
  const publicErrors = ["invalid provider response", "provider request timed out", "provider response exceeded limit"];
  const message = error instanceof Error && publicErrors.includes(error.message)
    ? error.message : "provider request failed";
  return {
    status: "error", probability: null, resolvedModel: null, usage: emptyUsage(),
    latencyMs: Math.max(0, performance.now() - startedAt), error: message,
  };
}

export async function callProvider(provider, model, example, options = {}) {
  const startedAt = performance.now();
  let controller;
  let timer;
  try {
    const request = makeRequest(provider, model, example);
    requiredString(options.apiKey, "apiKey", 16 * 1024);
    if (options.fetchImpl !== undefined && typeof options.fetchImpl !== "function") {
      throw new TypeError("fetchImpl must be a function");
    }
    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new TypeError("invalid timeout");
    }
    controller = new AbortController();
    timer = setTimeout(() => controller.abort(), timeoutMs);
    const timedOut = deadline(controller.signal);
    const response = await Promise.race([
      (options.fetchImpl ?? fetch)(request.url, {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(request.body),
        redirect: "error",
        signal: controller.signal,
      }),
      timedOut,
    ]);
    if (!response || response.ok !== true) throw new Error("provider request failed");
    const text = await readBounded(response, timedOut);
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error("invalid provider response"); }
    return { ...normalize(payload, model), latencyMs: Math.max(0, performance.now() - startedAt) };
  } catch (error) {
    return failure(startedAt, error);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller?.abort();
  }
}
