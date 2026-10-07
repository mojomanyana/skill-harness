import { assert, test } from "vitest";
import {callProvider,makeRequest} from "./providers.mjs";
const json=(v,init={})=>new Response(JSON.stringify(v),{status:200,...init});
const ex={input:"state",question:"Ship?"};
test("exact request contracts and allowlists",()=>{assert.deepEqual(makeRequest("openai","gpt-6-luna",ex),{url:"https://api.openai.com/v1/decisions",body:{model:"gpt-6-luna",input:"state",questions:[{type:"predicate",name:"decision",instructions:"Ship?"}]}});assert.deepEqual(makeRequest("jev","typesafe/jev-1.13",ex),{url:"https://openrouter.ai/api/alpha/decisions",body:{model:"typesafe/jev-1.13",state:"state",questions:{decision:{type:"noul",instructions:"Ship?"}}}});assert.throws(()=>makeRequest("openai","wrong",ex),/unsupported model/);assert.throws(()=>makeRequest("other","gpt-6-luna",ex),/unsupported provider/)});
test("normalizes OpenAI answer and preserves refusal",async()=>{let calls=0;const result=await callProvider("openai","gpt-6-luna",ex,{apiKey:"secret-key",fetchImpl:async(url,init)=>{calls++;assert.equal(url,"https://api.openai.com/v1/decisions");assert.equal(init.redirect,"error");return json({model:"gpt-6-luna-20261001",answers:[{type:"predicate",name:"decision",probability:.75}],usage:{input_tokens:10,output_tokens:2}})}});assert.equal(calls,1);assert.equal(result.status,"answered");assert.equal(result.probability,.75);assert.deepEqual(result.usage,{inputTokens:10,outputTokens:2,costUsd:null});assert.equal(JSON.stringify(result).includes("secret"),false);const refused=await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",fetchImpl:async()=>json({model:"gpt-6-luna",answers:[{type:"refusal",name:"decision"}],usage:{input_tokens:1,output_tokens:0}})});assert.equal(refused.status,"refused");assert.equal(refused.probability,null)});
test("normalizes JEV answer and usage",async()=>{const r=await callProvider("jev","typesafe/jev-1.13",ex,{apiKey:"key",fetchImpl:async()=>json({model:"typesafe/jev-1.13-20261001",answers:{decision:{type:"noul",noul:.2}},usage:{input_tokens:4,output_tokens:1,cost:.003}})});assert.equal(r.status,"answered");assert.equal(r.probability,.2);assert.equal(r.resolvedModel,"typesafe/jev-1.13-20261001");assert.deepEqual(r.usage,{inputTokens:4,outputTokens:1,costUsd:.003})});
test("rejects malformed fields and undocumented JEV refusal",async()=>{const bodies=[{model:"gpt-6-luna",answers:[{type:"predicate",name:"other",probability:.5}],usage:{input_tokens:1,output_tokens:1}},{model:"gpt-6-luna",answers:[{type:"predicate",name:"decision",probability:2}],usage:{input_tokens:1,output_tokens:1}},{model:"wrong",answers:[{type:"predicate",name:"decision",probability:.5}],usage:{input_tokens:1,output_tokens:1}},{model:"gpt-6-luna",answers:[{type:"predicate",name:"decision",probability:.5}],usage:{input_tokens:-1,output_tokens:1}}];for(const body of bodies){const r=await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",fetchImpl:async()=>json(body)});assert.equal(r.status,"error");assert.equal(r.error,"invalid provider response")}const r=await callProvider("jev","typesafe/jev-1.13",ex,{apiKey:"key",fetchImpl:async()=>json({model:"typesafe/jev-1.13",answers:{decision:{type:"refusal"}},usage:{input_tokens:1,output_tokens:1,cost:0}})});assert.equal(r.status,"error")});
test("bounds and sanitizes transport with no retries",async()=>{let calls=0;const thrown=await callProvider("openai","gpt-6-luna",ex,{apiKey:"must-not-leak",fetchImpl:async()=>{calls++;throw new Error("must-not-leak raw payload")}});assert.equal(calls,1);assert.equal(thrown.error,"provider request failed");assert.equal(JSON.stringify(thrown).includes("leak"),false);const bad=await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",fetchImpl:async()=>new Response("not json")});assert.equal(bad.error,"invalid provider response");const large=await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",fetchImpl:async()=>new Response("x".repeat(65537))});assert.equal(large.error,"provider response exceeded limit");const http=await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",fetchImpl:async()=>new Response("raw",{status:500})});assert.equal(http.error,"provider request failed")});
test("timeout covers an unfinished response body",async()=>{let calls=0;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode("{"))}});const r=await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",timeoutMs:10,fetchImpl:async()=>{calls++;return new Response(stream)}});assert.equal(calls,1);assert.equal(r.error,"provider request timed out")});
test("invalid local configuration never calls fetch",async()=>{let calls=0;const f=async()=>{calls++;return json({})};assert.equal((await callProvider("openai","wrong",ex,{apiKey:"key",fetchImpl:f})).status,"error");assert.equal((await callProvider("openai","gpt-6-luna",ex,{apiKey:"",fetchImpl:f})).status,"error");assert.equal((await callProvider("openai","gpt-6-luna",ex,{apiKey:"key",fetchImpl:f,timeoutMs:0})).status,"error");assert.equal(calls,0)});

test("deadline covers a fetch implementation that ignores abort", async () => {
  let calls = 0;
  const result = await callProvider("openai", "gpt-6-luna", ex, {
    apiKey: "key",
    timeoutMs: 10,
    fetchImpl: async () => {
      calls++;
      return await new Promise(() => {});
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.error, "provider request timed out");
});

test("incomplete body cancellation cannot hold the deadline result open", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
    },
    cancel() {
      cancelled = true;
      return new Promise(() => {});
    },
  });
  const result = await callProvider("openai", "gpt-6-luna", ex, {
    apiKey: "key",
    timeoutMs: 10,
    fetchImpl: async () => new Response(stream),
  });
  assert.equal(result.error, "provider request timed out");
  assert.equal(cancelled, true);
});

test("usage and resolved models preserve documented unknowns and bounds", async () => {
  const openai = await callProvider("openai", "gpt-6-luna", ex, {
    apiKey: "key",
    fetchImpl: async () => json({
      model: "gpt-6-luna",
      answers: [{ type: "predicate", name: "decision", probability: 0.5 }],
      usage: { input_tokens: 1, output_tokens: 1, cost: -999 },
    }),
  });
  assert.equal(openai.status, "answered");
  assert.equal(openai.usage.costUsd, null);

  const jev = await callProvider("jev", "typesafe/jev-1.13", ex, {
    apiKey: "key",
    fetchImpl: async () => json({
      model: "typesafe/jev-1.13",
      answers: { decision: { type: "noul", noul: 0.5 } },
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  });
  assert.equal(jev.status, "answered");
  assert.equal(jev.usage.costUsd, null);

  const oversizedModel = await callProvider("openai", "gpt-6-luna", ex, {
    apiKey: "key",
    fetchImpl: async () => json({
      model: "gpt-6-luna-" + "x".repeat(256),
      answers: [{ type: "predicate", name: "decision", probability: 0.5 }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  });
  assert.equal(oversizedModel.error, "invalid provider response");
});
