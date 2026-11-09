import { describe, expect, it, vi } from "vitest";
import { createJevController } from "../src/jev-session.js";
import { registerJevPromptHints } from "../src/jev-prompt-hints.js";

const operatorText = "Please find the latest official documentation for private-project-123.";
const activeTools = ["read", "find", "scout_research", "skill_author", "bookie_search", "edit"];
function setup(probability = 0.94) {
  const handlers = new Map<string, Function[]>();
  let active = [...activeTools];
  let session = "owner";
  const pi: any = {
    on(event: string, fn: Function) { handlers.set(event, [...(handlers.get(event) ?? []), fn]); },
    getActiveTools: () => active,
    appendEntry: vi.fn(),
  };
  const ctx: any = {
    cwd: "/unused", hasUI: true, sessionManager: { getSessionId: () => session },
    ui: { select: vi.fn(async () => 0), confirm: vi.fn(async () => true), notify: vi.fn() },
  };
  const provider = vi.fn(async (..._args: unknown[]) => ({ status: "answered", probability,
    resolvedModel: "fixture", usage: { inputTokens: 1, outputTokens: 1, costUsd: null }, latencyMs: 1 }));
  const controller = createJevController(pi, { provider, env: { OPENROUTER_API_KEY: "stub" } });
  registerJevPromptHints(pi, controller);
  const emit = async (event: string, data: unknown) => {
    let result;
    for (const handler of handlers.get(event) ?? []) result = await handler(data, ctx);
    return result;
  };
  const enable = async () => {
    await controller.command("enable workflow", ctx);
    await controller.command("hints", ctx);
    ctx.ui.notify.mockClear();
  };
  const submit = (text: string, args = {}) => emit("input", { source: "interactive", text, ...args });
  const user = (text: string) => ({ role: "user", timestamp: Date.now(), content: [{ type: "text", text }] });
  const context = (messages: unknown[]) => emit("context", { messages });
  const prompt = async (text: string) => { await submit(text); return context([user(text)]); };
  return { pi, ctx, controller, provider, enable, submit, user, context, prompt, emit,
    setActive(tools: string[]) { active = tools; }, switchSession(id: string) { session = id; } };
}

describe("operator prompt hints", () => {
  it("keeps the original message, shows one voluntary suggestion to both audiences, and sends only fixed labels", async () => {
    const s = setup();
    await s.enable();
    await s.submit(operatorText);
    const messages = [s.user("PRIVATE previous instructions"), { role: "toolResult", content: "SECRET body" },
      s.user(operatorText), { role: "custom", content: "private extension content" }];
    const result = await s.context(messages);
    expect(result.messages.slice(0, -1)).toEqual(messages);
    expect(messages).toHaveLength(4);
    const hint = result.messages.at(-1);
    expect(hint).toMatchObject({ role: "custom", display: false, customType: "skill-harness-jev-hint" });
    expect(hint.content).toContain("scout_research");
    expect(hint.content).toContain("94% estimated fit");
    expect(s.ctx.ui.notify).toHaveBeenCalledWith(hint.content, "info");
    const packet = s.provider.mock.calls[0][2] as { input: string };
    expect(packet.input).toContain("current information requested");
    expect(packet.input).toContain("published source requested");
    expect(packet.input).not.toMatch(/PRIVATE|SECRET|private-project-123|find the latest|extension content|bookie_search/i);
    expect(await s.context(messages)).toBeUndefined();
    expect(await s.context([...messages, { role: "toolResult", content: operatorText }])).toBeUndefined();
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(s.controller.status(s.ctx)).toMatchObject({ used: 1, remaining: 299 });
  });

  it.each([["disabled", false], ["workflow only", false], ["opted in", true]] as const)(
    "requires the separate preference (%s)", async (mode, yes) => {
      const s = setup();
      if (mode === "workflow only") await s.controller.command("enable workflow", s.ctx);
      if (yes) await s.enable();
      expect(!!await s.prompt(operatorText)).toBe(yes);
      expect(s.provider).toHaveBeenCalledTimes(yes ? 1 : 0);
    });

  it.each([[0.9, false, "90%"], [0.89999, false, "89.9%"], [0.9000000000000001, true, ">90%"],
    [0.999999, true, "99.9%"], [1, true, "100%"]] as const)(
    "interprets the returned probability %s without rounding through a boundary", async (p, yes, score) => {
      const s = setup(p);
      await s.enable();
      const result = await s.prompt(operatorText);
      expect(!!result).toBe(yes);
      if (yes) expect(s.ctx.ui.notify.mock.lastCall?.[0]).toContain(score);
      else expect(s.ctx.ui.notify).not.toHaveBeenCalled();
    });

  it("skips unknown, negative, source-like, expanded, non-operator and inactive-tool inputs", async () => {
    const s = setup();
    await s.enable();
    for (const text of ["hello", "yes", "Do not find the latest docs", "Please find the latest docs without Scout",
      "/skill:x find the latest documentation", "> find the latest documentation", "Read this file\npasted source",
      "Read this file " + "a".repeat(1200)]) expect(await s.prompt(text)).toBeUndefined();
    for (const args of [{ source: "extension" }, { source: "rpc" }, { images: [{}] }]) {
      await s.submit(operatorText, args);
      expect(await s.context([s.user(operatorText)])).toBeUndefined();
    }
    await s.submit(operatorText);
    expect(await s.context([s.user(operatorText + " (expanded template body)")])).toBeUndefined();
    s.setActive(["read", "unknown-PRIVATE-extension-name"]);
    expect(await s.prompt(operatorText)).toBeUndefined();
    expect(s.provider).not.toHaveBeenCalled();
  });

  it("scores queued input only when delivered, drops superseded prompts, rechecks live tools and reuses identical packets", async () => {
    const s = setup();
    await s.enable();
    await s.submit(operatorText, { streamingBehavior: "steer" });
    expect(await s.context([{ role: "toolResult", content: "older turn" }])).toBeUndefined();
    const old = s.user(operatorText);
    old.timestamp -= 60_000;
    expect(await s.context([old])).toBeUndefined();
    expect(s.provider).not.toHaveBeenCalled();
    expect(await s.context([s.user(operatorText)])).toBeDefined();
    expect((await s.prompt(operatorText)).messages.at(-1).content).toContain("reused assessment");
    await s.submit(operatorText);
    await s.submit("Hi");
    expect(await s.context([s.user(operatorText)])).toBeUndefined();
    await s.submit(operatorText);
    s.setActive(["read"]);
    expect(await s.context([s.user(operatorText)])).toBeUndefined();
    expect(s.provider).toHaveBeenCalledTimes(1);
  });

  it("adds only one preceding request category for an unambiguous follow-up", async () => {
    const s = setup();
    await s.enable();
    expect(await s.prompt("Draft a skill for PRIVATE-client-A")).toBeDefined();
    expect(await s.prompt("Check the docs for that")).toBeDefined();
    const packet = (s.provider.mock.calls[1][2] as {input: string}).input;
    expect(packet).toContain("immediately preceding task category: author a skill");
    expect(packet).not.toMatch(/PRIVATE-client|Check the docs|Draft a skill/i);
    expect(await s.prompt("Find the file named PRIVATE-config")).toBeDefined();
    expect(await s.prompt("Read that file")).toBeDefined();
    const next = (s.provider.mock.calls[3][2] as {input: string}).input;
    expect(next).toContain("locate workspace files");
    expect(next).not.toMatch(/PRIVATE-config|author a skill/);
  });

  it("abstains after unrelated tasks, intervening messages, authorization changes, and session changes", async () => {
    const s = setup();
    await s.enable();
    await s.prompt("Search saved notes about a private customer");
    expect(await s.prompt("check the docs for that")).toBeUndefined();
    await s.prompt("Draft a skill for a private client");
    expect(await s.prompt("yes")).toBeUndefined();
    expect(await s.prompt("check the docs for that")).toBeUndefined();
    await s.prompt("Draft a skill for a private client");
    await s.submit("check the docs for that");
    await s.controller.command("hints", s.ctx);
    await s.controller.command("hints", s.ctx);
    expect(await s.context([s.user("check the docs for that")])).toBeUndefined();
    await s.submit(operatorText);
    s.switchSession("other");
    expect(await s.context([s.user(operatorText)])).toBeUndefined();
    expect(s.provider).toHaveBeenCalledTimes(2);
  });

  it("honors the owner's remaining paid calls and never fabricates an answer for missing advice", async () => {
    const s = setup();
    await s.enable();
    await s.controller.command("limit 1", s.ctx);
    expect(await s.prompt(operatorText)).toBeDefined();
    s.ctx.ui.notify.mockClear();
    expect(await s.prompt("Read the README file")).toBeUndefined();
    expect(s.ctx.ui.notify).not.toHaveBeenCalled();
    expect(s.provider).toHaveBeenCalledTimes(1);
  });

  it("suppresses a withdrawn tool while its assessment is in flight", async () => {
    const s = setup();
    await s.enable();
    let finish!: (value: Awaited<ReturnType<typeof s.provider>>) => void;
    s.provider.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await s.submit(operatorText);
    const result = s.context([s.user(operatorText)]);
    expect(s.provider).toHaveBeenCalledTimes(1);
    s.setActive(["read"]);
    finish({ status: "answered", probability: 0.99, resolvedModel: "fixture", usage: { inputTokens: 1, outputTokens: 1, costUsd: null }, latencyMs: 1 });
    expect(await result).toBeUndefined();
    expect(s.ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("releases the prompt on timeout even when the provider ignores abort, and ignores a delayed YES", async () => {
    const s = setup();
    await s.enable();
    let finish!: (result: Awaited<ReturnType<typeof s.provider>>) => void;
    s.provider.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await s.submit(operatorText);
    const result = s.context([s.user(operatorText)]);
    expect(await result).toBeUndefined();
    expect((s.provider.mock.calls[0][3] as { signal: AbortSignal }).signal.aborted).toBe(true);
    expect(s.ctx.ui.notify.mock.lastCall?.[0]).toContain("unavailable");
    expect(s.ctx.ui.notify.mock.lastCall?.[0]).not.toContain("scout_research");
    expect(s.controller.status(s.ctx)).toMatchObject({ hintsEnabled: false, used: 1, availability: "ready" });
    expect(await s.prompt("Read the README file")).toBeUndefined();
    expect(s.provider).toHaveBeenCalledTimes(1);
    const handoff = await s.controller.evaluate({
      candidate: "fixture", stage: "verification", nextAction: "Request independent review",
      requirements: "Check the changed component", uncertainty: "Do the tests cover this transition?",
      evidence: "The changed component passed its selected tests",
    }, "real-pi-tool-call", undefined, s.ctx);
    expect(handoff).toMatchObject({ status: "answered", probability: 0.94 });
    finish({ status: "answered", probability: 1, resolvedModel: "fixture", usage: { inputTokens: 1, outputTokens: 1, costUsd: null }, latencyMs: 3000 });
    await new Promise(resolve => setImmediate(resolve));
    expect(s.ctx.ui.notify.mock.calls.filter(([text]: string[]) => text.includes("estimated fit"))).toHaveLength(0);
    expect(s.controller.status(s.ctx)).toMatchObject({ hintsEnabled: false, used: 2, availability: "ready" });
    expect(s.provider).toHaveBeenCalledTimes(2);
  });
});
