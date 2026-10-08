import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJevController } from "../src/jev-session.js";
import { createJevAdviceTool } from "../src/jev-advice.js";
import { JEV_QUESTION, prepareHandoff } from "../src/jev-packet.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const answer = { status: "answered", probability: 0.8, resolvedModel: "typesafe/jev-1.13", usage: { inputTokens: 10, outputTokens: 1, costUsd: null }, latencyMs: 2 };
const packet = { action: "evaluate", candidate: "repo@abc", requirements: "Acceptance: clear queued work; preserve active work.", evidence: "Required queue and active-work checks passed on candidate abc." };
function setup(storage = false) {
  const root = mkdtempSync(join(tmpdir(), "jev-workflow-test-"));
  roots.push(root);
  const storageHome = join(root, "private");
  const hooks = new Map<string, () => void>();
  let sessionId = "actual-pi-session";
  const pi: any = { on: (event: string, fn: () => void) => hooks.set(event, fn), appendEntry: vi.fn() };
  const ctx: any = {
    sessionManager: { getSessionId: () => sessionId }, hasUI: true, cwd: root,
    ui: { select: vi.fn(async (_: string, choices: string[]) => choices[storage ? 1 : 0]), confirm: vi.fn(async () => true), notify: vi.fn() },
  };
  const provider = vi.fn(async () => ({ ...answer }));
  const env: NodeJS.ProcessEnv = { OPENROUTER_API_KEY: "test-key-never-sent" };
  const controller = createJevController(pi, { provider, env, storageHome });
  const tool = createJevAdviceTool(controller);
  const execute = (params: unknown = packet, signal?: AbortSignal, id = "actual-tool-call") => tool.execute(id, params, signal, undefined, ctx);
  return { root, storageHome, pi, ctx, provider, env, controller, tool, execute, hooks, setId: (id: string) => { sessionId = id; } };
}
function details(result: Awaited<ReturnType<ReturnType<typeof setup>["execute"]>>) { return result.details as any; }
describe("session-scoped handoff advice", () => {
  it("registers a provider-compatible object schema and offers free disabled status", async () => {
    const s = setup();
    expect(s.tool.parameters.type).toBe("object");
    expect(details(await s.execute({ action: "status" }))).toMatchObject({ enabled: false, mode: "disabled", storage: null, remaining: 0, availability: "disabled" });
    expect(s.provider).not.toHaveBeenCalled();
    expect(s.pi.appendEntry).not.toHaveBeenCalled();
    expect(existsSync(s.storageHome)).toBe(false);
  });
  it("requires fresh paid-scope approval; manual enable and cancelled approval cannot authorize the tool", async () => {
    const s = setup();
    await s.controller.command("enable", s.ctx);
    expect(details(await s.execute()).status).toBe("unavailable");
    expect(details(await s.execute({ action: "status" }))).toMatchObject({ mode: "manual", availability: "manual-only", remaining: 0 });
    s.ctx.ui.confirm.mockResolvedValue(false);
    await s.controller.command("enable workflow", s.ctx);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(1);
    expect(details(await s.execute({ action: "status" })).enabled).toBe(false);
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("transmits only the fixed question and selected packet; decline creates no harness files", async () => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    expect(s.ctx.ui.confirm.mock.calls[0][1]).toMatch(/3 automatic workflow paid calls.*typesafe\/jev-1\.13/);
    const result = details(await s.execute());
    expect(result).toMatchObject({ status: "answered", probability: 0.8, remaining: 2, advisory: true,
      source: { sessionId: "actual-pi-session", toolCallId: "actual-tool-call", retained: false } });
    const [provider, model, request, options] = (s.provider.mock.calls as any)[0];
    expect(provider).toBe("jev");
    expect(model).toBe("typesafe/jev-1.13");
    expect(request.question).toBe(JEV_QUESTION);
    expect(JSON.parse(request.input)).toEqual({ candidate: packet.candidate, requirements: packet.requirements, evidence: packet.evidence });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ provider: "jev", requestedModel: "typesafe/jev-1.13", resolvedModel: "typesafe/jev-1.13", usage: answer.usage, latencyMs: 2 });
    expect(JSON.stringify(result)).not.toContain("test-key");
    expect(existsSync(s.storageHome)).toBe(false);
  });
  it("retains exact pre-call selected bytes with actual runtime identities, separate from prediction and verified capture", async () => {
    const s = setup(true);
    await s.controller.command("enable workflow", s.ctx);
    let selectionAtCall: string | undefined;
    s.provider.mockImplementation(async () => {
      const directory = readdirSync(join(s.storageHome, "jev-workflow"))[0];
      selectionAtCall = readFileSync(join(s.storageHome, "jev-workflow", directory, "selection.json"), "utf8");
      return answer;
    });
    const result = details(await s.execute());
    const bytes = readFileSync(result.source.path, "utf8");
    expect(bytes).toBe(selectionAtCall);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(result.source.sha256);
    const selected = JSON.parse(bytes);
    expect(selected).toMatchObject({
      kind: "skill-harness-selected-handoff-v1", sessionId: "actual-pi-session", toolCallId: "actual-tool-call",
      provenance: "tool-selected-input", candidateIdentity: "caller-claimed", sourceBinding: "unassessed",
      redaction: "unassessed", rights: "unassessed", labelStatus: "unlabeled",
      trainingEligible: false, exportEligible: false, publicCaptureVerified: false,
      consent: { sessionId: "actual-pi-session", decision: "granted" },
      authorization: { sessionId: "actual-pi-session", maximumCalls: 3 },
    });
    expect(selected).not.toHaveProperty("probability");
    expect(createHash("sha256").update(selected.input).digest("hex")).toBe(selected.inputSha256);
    const outcome = JSON.parse(readFileSync(join(result.source.path, "..", "outcome.json"), "utf8"));
    expect(outcome.source.sha256).toBe(result.source.sha256);
    expect(outcome).toMatchObject({ trainingEligible: false, exportEligible: false, labelStatus: "unlabeled" });
    if (process.platform !== "win32") expect(statSync(result.source.path).mode & 0o777).toBe(0o600);
  });
  it.each([
    { action: "status", sessionId: "forged" },
    { ...packet, provider: "other" },
    { ...packet, question: "different" },
    { ...packet, consent: "granted" },
    { ...packet, path: "/private" },
    { action: "evaluate", candidate: "c", requirements: "r" },
    { ...packet, evidence: 1 },
    { ...packet, evidence: " " },
    { ...packet, evidence: "\ud800" },
    { ...packet, evidence: "x".repeat(16000) },
  ])("rejects forged scope, malformed or oversized packets before any provider call", async (params) => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    await expect(s.execute(params)).rejects.toThrow();
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("accepts valid Unicode pairs and enforces the full serialized packet limit", () => {
    const valid = { candidate: "c", requirements: "r", evidence: "🙂".repeat(5000) };
    expect(prepareHandoff(valid).input).toContain("🙂");
    const empty = JSON.stringify({ ...valid, evidence: "" });
    expect(() => prepareHandoff({ ...valid, evidence: "x".repeat(16000 - empty.length) })).not.toThrow();
    expect(() => prepareHandoff({ ...valid, evidence: "x".repeat(16001 - empty.length) })).toThrow("16000");
  });
  it.each(["", " ", "x".repeat(257)])("requires an actual nonempty tool-call identity", async (id) => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    await expect(s.execute(packet, undefined, id)).rejects.toThrow("toolCallId");
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("deduplicates completed inputs and caps distinct calls without charging status", async () => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    const first = details(await s.execute());
    expect(details(await s.execute())).toMatchObject({ reused: true, source: first.source });
    await s.execute({ ...packet, candidate: "second" });
    await s.execute({ ...packet, candidate: "third" });
    expect(details(await s.execute({ ...packet, candidate: "fourth" })).status).toBe("unavailable");
    expect(details(await s.execute({ action: "status" }))).toMatchObject({ availability: "limit-reached", remaining: 0 });
    expect(details(await s.execute()).reused).toBe(true);
    expect(s.provider).toHaveBeenCalledTimes(3);
  });
  it("reserves one slot before awaiting and suppresses simultaneous same or different inputs", async () => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    let finish!: (result: typeof answer) => void;
    s.provider.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const first = s.execute();
    expect(details(await s.execute()).reason).toContain("in flight");
    expect(details(await s.execute({ ...packet, candidate: "other" })).reason).toContain("in flight");
    expect(s.provider).toHaveBeenCalledTimes(1);
    finish(answer);
    await first;
    expect(details(await s.execute()).reused).toBe(true);
  });
  it("suppresses provider errors without retry until a fresh paid/storage activation", async () => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    s.provider.mockResolvedValueOnce({ ...answer, status: "error", probability: null } as any);
    expect(details(await s.execute()).status).toBe("unavailable");
    expect(details(await s.execute({ ...packet, candidate: "new" })).status).toBe("unavailable");
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(details(await s.execute({ action: "status" })).availability).toBe("provider-error");
    await s.controller.command("enable workflow", s.ctx);
    expect(s.ctx.ui.confirm).toHaveBeenCalledTimes(2);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(2);
    expect(details(await s.execute()).status).toBe("answered");
    expect(s.provider).toHaveBeenCalledTimes(2);
  });
  it("checks missing keys and already-aborted calls before reserving budget or writing", async () => {
    const s = setup(true);
    await s.controller.command("enable workflow", s.ctx);
    delete s.env.OPENROUTER_API_KEY;
    expect(details(await s.execute({ action: "status" })).availability).toBe("missing-key");
    expect(details(await s.execute())).toMatchObject({ resolvedModel: null, latencyMs: null, usage: { inputTokens: null, outputTokens: null, costUsd: null } });
    s.env.OPENROUTER_API_KEY = "test";
    const abort = new AbortController();
    abort.abort();
    await s.execute(packet, abort.signal);
    expect(details(await s.execute({ action: "status" })).remaining).toBe(3);
    expect(s.provider).not.toHaveBeenCalled();
    expect(existsSync(s.storageHome)).toBe(false);
  });
  it.each(["disable", "session_start", "session_shutdown", "new-activation", "tool-abort", "identity-change"])(
    "discards late success after %s and never writes its outcome", async (change) => {
      const s = setup(true);
      await s.controller.command("enable workflow", s.ctx);
      let finish!: (result: typeof answer) => void;
      s.provider.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      const abort = new AbortController();
      const pending = s.execute(packet, abort.signal);
      const providerSignal = (s.provider.mock.calls as any)[0][3].signal;
      if (change === "disable") await s.controller.command("disable", s.ctx);
      else if (change === "new-activation") await s.controller.command("enable workflow", s.ctx);
      else if (change === "tool-abort") abort.abort();
      else if (change === "identity-change") s.setId("new-session");
      else s.hooks.get(change)!();
      if (change !== "identity-change") expect(providerSignal.aborted).toBe(true);
      finish(answer);
      expect(details(await pending).status).toBe("unavailable");
      const directory = readdirSync(join(s.storageHome, "jev-workflow"))[0];
      expect(existsSync(join(s.storageHome, "jev-workflow", directory, "outcome.json"))).toBe(false);
      if (change === "new-activation") expect(details(await s.execute({ action: "status" }))).toMatchObject({ availability: "ready", remaining: 3 });
    },
  );
  it("never resurrects an old paid confirmation or storage grant", async () => {
    const s = setup(true);
    let confirm!: (answer: boolean) => void;
    s.ctx.ui.confirm.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
    const old = s.controller.command("enable workflow", s.ctx);
    await s.controller.command("disable", s.ctx);
    confirm(true);
    await old;
    expect(s.ctx.ui.select).not.toHaveBeenCalled();
    let select!: (answer: string) => void;
    s.ctx.ui.select.mockImplementationOnce(() => new Promise((resolve) => { select = resolve; }));
    const second = s.controller.command("enable workflow", s.ctx);
    await Promise.resolve();
    s.hooks.get("session_start")!();
    select("Yes — retain selected decision data for later LoRA review");
    await second;
    expect(s.pi.appendEntry).not.toHaveBeenCalled();
    expect(details(await s.execute({ action: "status" })).enabled).toBe(false);
  });
  it("preserves measured advice when separate outcome retention fails, without overwriting or retrying", async () => {
    const s = setup(true);
    await s.controller.command("enable workflow", s.ctx);
    let outcomePath = "";
    s.provider.mockImplementationOnce(async () => {
      const directory = readdirSync(join(s.storageHome, "jev-workflow"))[0];
      outcomePath = join(s.storageHome, "jev-workflow", directory, "outcome.json");
      writeFileSync(outcomePath, "existing file");
      return answer;
    });
    expect(details(await s.execute())).toMatchObject({ status: "answered", probability: 0.8, usage: answer.usage, latencyMs: 2, reason: expect.stringContaining("retention failed") });
    expect(readFileSync(outcomePath, "utf8")).toBe("existing file");
    expect(details(await s.execute({ action: "status" })).availability).toBe("storage-error");
    await s.execute({ ...packet, candidate: "another" });
    expect(s.provider).toHaveBeenCalledTimes(1);
  });
  it("refuses broken retention before sending data and hides exception details", async () => {
    const s = setup(true);
    writeFileSync(s.storageHome, "not a directory");
    await s.controller.command("enable workflow", s.ctx);
    expect(details(await s.execute())).toMatchObject({ status: "unavailable", probability: null });
    expect(s.provider).not.toHaveBeenCalled();
    const noStorage = setup();
    await noStorage.controller.command("enable workflow", noStorage.ctx);
    noStorage.provider.mockRejectedValueOnce(new Error("private provider response and test-key"));
    expect(JSON.stringify(await noStorage.execute())).not.toContain("private provider");
    expect(JSON.stringify(await noStorage.execute())).not.toContain("test-key");
  });
});
