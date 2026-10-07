import { assert, test } from "vitest";
import { callProvider, makeRequest } from "./providers.mjs";

const json = (value, init = {}) => new Response(JSON.stringify(value), { status: 200, ...init });
const example = { input: "state", question: "Ship?" };
const model = "typesafe/jev-1.13";
const payload = (overrides = {}) => ({
  model,
  answers: { decision: { type: "noul", noul: 0.5 } },
  usage: { input_tokens: 4, output_tokens: 1, cost: 0.003 },
  ...overrides,
});

test("emits the exact JEV request and rejects every other provider or model", () => {
  assert.deepEqual(makeRequest("jev", model, example), {
    url: "https://openrouter.ai/api/alpha/decisions",
    body: {
      model,
      state: "state",
      questions: { decision: { type: "noul", instructions: "Ship?" } },
    },
  });
  assert.throws(() => makeRequest("openai", "gpt-6-luna", example), /unsupported provider/);
  assert.throws(() => makeRequest("jev", "other", example), /unsupported model/);
  assert.throws(() => makeRequest("__proto__", model, example), /unsupported provider/);
});

test("normalizes a JEV answer, snapshot, and usage", async () => {
  let calls = 0;
  const result = await callProvider("jev", model, example, {
    apiKey: "secret-key",
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, "https://openrouter.ai/api/alpha/decisions");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.authorization, "Bearer secret-key");
      return json(payload({ model: model + "-20261001" }));
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "answered");
  assert.equal(result.probability, 0.5);
  assert.equal(result.resolvedModel, model + "-20261001");
  assert.deepEqual(result.usage, { inputTokens: 4, outputTokens: 1, costUsd: 0.003 });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("preserves an absent JEV cost as unknown", async () => {
  const result = await callProvider("jev", model, example, {
    apiKey: "key",
    fetchImpl: async () => json(payload({
      usage: { input_tokens: 4, output_tokens: 1 },
    })),
  });
  assert.equal(result.status, "answered");
  assert.equal(result.usage.costUsd, null);
});

test("rejects malformed answers, models, probabilities, usage, and refusal", async () => {
  const bodies = [
    payload({ answers: { other: { type: "noul", noul: 0.5 } } }),
    payload({ answers: { decision: { type: "predicate", noul: 0.5 } } }),
    payload({ answers: { decision: { type: "noul", noul: 2 } } }),
    payload({ model: "wrong" }),
    payload({ model: model + "-" + "x".repeat(256) }),
    payload({ usage: { input_tokens: -1, output_tokens: 1, cost: 0 } }),
    payload({ usage: { input_tokens: 1, output_tokens: 1, cost: -1 } }),
    payload({ answers: { decision: { type: "refusal" } } }),
  ];
  for (const body of bodies) {
    const result = await callProvider("jev", model, example, {
      apiKey: "key",
      fetchImpl: async () => json(body),
    });
    assert.equal(result.status, "error");
    assert.equal(result.error, "invalid provider response");
  }
});

test("bounds and sanitizes transport failures without retrying", async () => {
  let calls = 0;
  const thrown = await callProvider("jev", model, example, {
    apiKey: "must-not-leak",
    fetchImpl: async () => { calls++; throw new Error("must-not-leak raw payload"); },
  });
  assert.equal(calls, 1);
  assert.equal(thrown.error, "provider request failed");
  assert.equal(JSON.stringify(thrown).includes("leak"), false);

  const invalid = await callProvider("jev", model, example, {
    apiKey: "key", fetchImpl: async () => new Response("not json"),
  });
  assert.equal(invalid.error, "invalid provider response");
  const large = await callProvider("jev", model, example, {
    apiKey: "key", fetchImpl: async () => new Response("x".repeat(65_537)),
  });
  assert.equal(large.error, "provider response exceeded limit");
  const http = await callProvider("jev", model, example, {
    apiKey: "key", fetchImpl: async () => new Response("raw", { status: 500 }),
  });
  assert.equal(http.error, "provider request failed");
});

test("deadline covers an unfinished response body", async () => {
  let calls = 0;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("{")); },
  });
  const result = await callProvider("jev", model, example, {
    apiKey: "key", timeoutMs: 10,
    fetchImpl: async () => { calls++; return new Response(stream); },
  });
  assert.equal(calls, 1);
  assert.equal(result.error, "provider request timed out");
});

test("deadline covers a fetch implementation that ignores abort", async () => {
  let calls = 0;
  const result = await callProvider("jev", model, example, {
    apiKey: "key", timeoutMs: 10,
    fetchImpl: async () => { calls++; return await new Promise(() => {}); },
  });
  assert.equal(calls, 1);
  assert.equal(result.error, "provider request timed out");
});

test("incomplete body cancellation cannot hold the result open", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("{")); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  });
  const result = await callProvider("jev", model, example, {
    apiKey: "key", timeoutMs: 10, fetchImpl: async () => new Response(stream),
  });
  assert.equal(result.error, "provider request timed out");
  assert.equal(cancelled, true);
});

test("invalid local configuration never calls fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return json(payload()); };
  assert.equal((await callProvider("openai", "gpt-6-luna", example, {
    apiKey: "key", fetchImpl,
  })).status, "error");
  assert.equal((await callProvider("jev", "wrong", example, {
    apiKey: "key", fetchImpl,
  })).status, "error");
  assert.equal((await callProvider("jev", model, example, {
    apiKey: "", fetchImpl,
  })).status, "error");
  assert.equal((await callProvider("jev", model, example, {
    apiKey: "key", fetchImpl, timeoutMs: 0,
  })).status, "error");
  assert.equal(calls, 0);
});
