import Ajv from 'ajv';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJevController } from "../src/jev-session.js";
import { createJevAdviceTool } from "../src/jev-advice.js";
import { JEV_QUESTION, prepareHandoff } from "../src/jev-packet.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const answer = { status: "answered", probability: 0.8, resolvedModel: "typesafe/jev-1.13", usage: { inputTokens: 10, outputTokens: 1, costUsd: null }, latencyMs: 2 };
const packet = { action: "evaluate", stage: "implementation" as const, nextAction: "Proceed to independent review", uncertainty: "Do the cache ownership and queue admission rules interact safely?", candidate: "repo@abc", requirements: "Acceptance: clear queued work; preserve active work.", evidence: "Required queue and active-work checks passed on candidate abc." };
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
  it.each(["enable", "enable workflow"])("reports missing credentials immediately after %s without probing or losing the storage choice", async (command) => {
    const s = setup(true);
    for (const key of [undefined, "", " \t "]) {
      if (key === undefined) delete s.env.OPENROUTER_API_KEY;
      else s.env.OPENROUTER_API_KEY = key;
      await s.controller.command(command, s.ctx);
      const notification = s.ctx.ui.notify.mock.lastCall?.[0];
      expect(notification).toContain(command === "enable workflow" ? "workflow calls authorized" : "manual mode activated");
      expect(notification).toContain("LoRA storage granted for this session only");
      expect(notification).toContain("Provider unavailable: OPENROUTER_API_KEY is missing or blank in this Pi process");
      expect(notification).toContain("environment that launches Pi, restart Pi");
      expect(notification).toContain("fresh session consent");
      expect(notification).toContain("No provider call was made");
      expect(details(await s.execute({ action: "status" }))).toMatchObject({
        enabled: true, storage: "granted", providerReadiness: "missing-key",
        availability: command === "enable workflow" ? "missing-key" : "manual-only",
        remaining: command === "enable workflow" ? 3 : 0,
      });
    }
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(3);
    expect(new Set(s.pi.appendEntry.mock.calls.map((call) => call[1].interactionId)).size).toBe(3);
    expect(s.provider).not.toHaveBeenCalled();
    expect(existsSync(s.storageHome)).toBe(false);
  });
  it.each(["enable", "enable workflow"])("reports only local key presence after %s, without claiming provider validation or exposing the key", async (command) => {
    const s = setup();
    await s.controller.command(command, s.ctx);
    const notification = s.ctx.ui.notify.mock.lastCall?.[0];
    expect(notification).toContain("OPENROUTER_API_KEY is present");
    expect(notification).toContain("credentials and provider access have not been verified");
    expect(notification).toContain("No provider call was made");
    expect(details(await s.execute({ action: "status" }))).toMatchObject({
      providerReadiness: "key-present", availability: command === "enable workflow" ? "ready" : "manual-only",
    });
    expect(JSON.stringify(s.ctx.ui.notify.mock.calls)).not.toContain(s.env.OPENROUTER_API_KEY);
    expect(s.provider).not.toHaveBeenCalled();
  });
  it.each([false, true])("observes current credentials when the storage prompt completes (key present: %s)", async (present) => {
    const s = setup();
    if (present) delete s.env.OPENROUTER_API_KEY;
    s.ctx.ui.select.mockImplementationOnce(async () => {
      if (present) s.env.OPENROUTER_API_KEY = "new-test-key";
      else delete s.env.OPENROUTER_API_KEY;
      return "No — use JEV without retaining data for LoRA";
    });
    await s.controller.command("enable workflow", s.ctx);
    expect(s.ctx.ui.notify.mock.lastCall?.[0]).toContain(present ? "OPENROUTER_API_KEY is present" : "Provider unavailable");
    expect(details(await s.execute({ action: "status" }))).toMatchObject({
      storage: "declined", remaining: 3, providerReadiness: present ? "key-present" : "missing-key",
    });
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("updates free readiness status without automatic calls and requires fresh consent after restart", async () => {
    const s = setup(true);
    delete s.env.OPENROUTER_API_KEY;
    await s.controller.command("enable workflow", s.ctx);
    expect(details(await s.execute())).toMatchObject({ status: "unavailable", remaining: 3, reason: expect.stringContaining("fresh session consent") });
    expect(existsSync(s.storageHome)).toBe(false);
    s.env.OPENROUTER_API_KEY = "replacement-test-key";
    expect(details(await s.execute({ action: "status" }))).toMatchObject({ availability: "ready", providerReadiness: "key-present", remaining: 3 });
    s.hooks.get("session_start")!();
    expect(details(await s.execute({ action: "status" }))).toMatchObject({ enabled: false, storage: null, availability: "disabled", providerReadiness: "key-present" });
    expect(details(await s.execute()).status).toBe("unavailable");
    await s.controller.command("enable workflow", s.ctx);
    expect(s.ctx.ui.confirm).toHaveBeenCalledTimes(2);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(2);
    expect(s.pi.appendEntry.mock.calls[1][1].interactionId).not.toBe(s.pi.appendEntry.mock.calls[0][1].interactionId);
    expect(s.provider).not.toHaveBeenCalled();
    expect(details(await s.execute())).toMatchObject({ status: "answered", remaining: 2,
      source: { sessionId: "actual-pi-session", toolCallId: "actual-tool-call" } });
    expect(s.provider).toHaveBeenCalledTimes(1);
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
    expect(JSON.parse(request.input)).toEqual({ candidate: packet.candidate, stage: packet.stage, nextAction: packet.nextAction, uncertainty: packet.uncertainty, requirements: packet.requirements, evidence: packet.evidence });
    expect(request.question).toContain("proposed next action");
    expect(request.question).toContain("not final acceptance");
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
      schema: 2, kind: "skill-harness-selected-decision-v2", sessionId: "actual-pi-session", toolCallId: "actual-tool-call",
      provenance: "tool-selected-input", candidateIdentity: "caller-claimed", sourceBinding: "unassessed",
      redaction: "unassessed", rights: "unassessed", labelStatus: "unlabeled",
      trainingEligible: false, exportEligible: false, publicCaptureVerified: false,
      consent: { sessionId: "actual-pi-session", decision: "granted" },
      authorization: { sessionId: "actual-pi-session", maximumCalls: 3 },
    });
    expect(selected).not.toHaveProperty("probability");
    expect(readFileSync(join(result.source.path, "..", "input.txt"), "utf8")).toBe(selected.input);
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
    { ...packet, stage: "acceptance" },
    { ...packet, uncertainty: " " },
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
    const { action: _action, ...fields } = packet;
    const valid = { ...fields, candidate: "c", requirements: "r", evidence: "🙂".repeat(5000) };
    expect(prepareHandoff(valid).input).toContain("🙂");
    const overhead = Array.from(prepareHandoff({ ...valid, evidence: "x" }).input).length - 1;
    expect(() => prepareHandoff({ ...valid, evidence: "x".repeat(16000 - overhead) })).not.toThrow();
    expect(() => prepareHandoff({ ...valid, evidence: "x".repeat(16001 - overhead) })).toThrow("16000");
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

describe("decision evidence and later outcome linkage", () => {
  const ref = (s: ReturnType<typeof setup>, name: string, bytes: string) => {
    const path = join(s.root, name);
    writeFileSync(path, bytes);
    return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
  };
  it("verifies explicit evidence before spend, freezes its bytes locally and never silently sends file contents", async () => {
    const s = setup(true);
    const evidence = ref(s, "verification.txt", "local selected record, not automatic remote input");
    await s.controller.command("enable workflow", s.ctx);
    const value = { ...packet, evidenceRefs: [evidence] };
    const result = details(await s.execute(value));
    const selection = JSON.parse(readFileSync(result.source.path, "utf8"));
    expect(selection).toMatchObject({ candidateIdentity: "caller-claimed", sourceBinding: "local-reference-digests-verified", evidenceClaims: "unassessed" });
    expect(selection.evidenceRefs).toEqual([{ ...evidence, bytes: Buffer.byteLength(readFileSync(evidence.path, "utf8")) }]);
    const directory = join(result.source.path, "..");
    expect(readFileSync(join(directory, "decision-evidence-1.bin"), "utf8")).toBe(readFileSync(evidence.path, "utf8"));
    const request = (s.provider.mock.calls as any)[0][2];
    expect(request.input).not.toContain(evidence.path);
    expect(request.input).not.toContain("local selected record");
    writeFileSync(evidence.path, "changed after selection");
    await expect(s.execute(value)).rejects.toThrow("sha256");
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(details(await s.execute({ action: "status" })).remaining).toBe(2);
  });
  it("links frozen engineering evidence without provider spend, inferred labels or acceptance, and deduplicates repeats", async () => {
    const s = setup(true);
    await s.controller.command("enable workflow", s.ctx);
    const advice = details(await s.execute());
    const sourceBefore = readFileSync(advice.source.path);
    const evidence = ref(s, "independent-review.txt", "Independent review: APPROVE; selected candidate observed.");
    const args = { action: "link-outcome", selectionSha256: advice.source.sha256, candidate: packet.candidate, evidenceRefs: [evidence] };
    const mappingPath = join(advice.source.path, "..", "evidence.json");
    const mappingBefore = readFileSync(mappingPath);
    writeFileSync(mappingPath, JSON.stringify({schema: 1, evidenceRefs: [{path: "invented", sha256: "0".repeat(64)}]}));
    await expect(s.execute(args)).rejects.toThrow("evidence mapping changed");
    writeFileSync(mappingPath, mappingBefore);
    const result = details(await s.execute(args));
    expect(result).toMatchObject({ status: "linked", inputSha256: advice.inputSha256, labelStatus: "unlabeled", independence: "unassessed", exportEligible: false, trainingEligible: false, reused: false });
    expect(new Ajv({ strict: false }).compile(s.tool.outputSchema)(result)).toBe(true);
    expect(details(await s.execute(args))).toMatchObject({ path: result.path, sha256: result.sha256, reused: true });
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(details(await s.execute({ action: "status" })).remaining).toBe(2);
    const stored = JSON.parse(readFileSync(result.path, "utf8"));
    expect(stored.source.sha256).toBe(advice.source.sha256);
    expect(stored.sessionId).toBe("actual-pi-session");
    expect(readFileSync(join(result.path, "..", stored.evidenceRefs[0].retainedPath), "utf8")).toContain("APPROVE");
    expect(readFileSync(advice.source.path)).toEqual(sourceBefore);
    const frozenEvidence = join(result.path, "..", stored.evidenceRefs[0].retainedPath);
    const frozenBefore = readFileSync(frozenEvidence);
    writeFileSync(frozenEvidence, "tampered");
    await expect(s.execute(args)).rejects.toThrow("engineering evidence changed");
    writeFileSync(frozenEvidence, frozenBefore);
    await expect(s.execute({ ...args, candidate: "different" })).rejects.toThrow("candidate");
    await expect(s.execute({ ...args, selectionSha256: "0".repeat(64) })).rejects.toThrow("selection");
    await s.controller.command("enable workflow", s.ctx);
    await expect(s.execute(args)).rejects.toThrow("activation");
  });
  it("refuses outcome retention without storage consent, after source mutation, or after cancellation", async () => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    const advice = details(await s.execute());
    const evidence = ref(s, "tests.txt", "tests passed");
    const args = { action: "link-outcome", selectionSha256: advice.source.sha256, candidate: packet.candidate, evidenceRefs: [evidence] };
    await expect(s.execute(args)).rejects.toThrow("storage consent");
    expect(existsSync(s.storageHome)).toBe(false);
    const retained = setup(true);
    await retained.controller.command("enable workflow", retained.ctx);
    const selected = details(await retained.execute());
    const request = { ...args, selectionSha256: selected.source.sha256 };
    const abort = new AbortController(); abort.abort();
    await expect(retained.execute(request, abort.signal)).rejects.toThrow("changed");
    writeFileSync(selected.source.path, "changed source");
    await expect(retained.execute(request)).rejects.toThrow("source changed");
    expect(retained.provider).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed, repeated, missing or mismatched selected evidence without reserving a call", async () => {
    const s = setup();
    await s.controller.command("enable workflow", s.ctx);
    const evidence = ref(s, "evidence.txt", "observed");
    const link = join(s.root, "link.txt");
    symlinkSync(evidence.path, link);
    const oversized = ref(s, "oversized.txt", "x".repeat(2 * 1024 * 1024 + 1));
    for (const evidenceRefs of [[], [{...evidence, path: link}], [oversized], [{...evidence, path: s.root}], [evidence, evidence], [{...evidence, sha256: "0".repeat(64)}], [{...evidence, path: join(s.root,"missing")}], [{...evidence, extra: true}]]) {
      await expect(s.execute({ ...packet, evidenceRefs })).rejects.toThrow();
    }
    expect(s.provider).not.toHaveBeenCalled();
    expect(details(await s.execute({ action: "status" })).remaining).toBe(3);
  });
});

describe("optional Principal candidate observation", () => {
  function connect(s: ReturnType<typeof setup>, transform: (response: any, request: any) => any = response => response) {
    s.pi.events = { emit: (channel: string, request: any) => {
      expect(channel).toBe("principal:candidate-observe");
      expect(request).not.toHaveProperty("root");
      const response = { requestId: request.requestId, sessionId: request.sessionId,
        candidate: { algorithm: "principal-candidate-v1", root: s.root, id: packet.candidate, head: "base" } };
      request.reply(transform(response, request));
    } };
  }
  it("records a matching live observation separately from source truth and rechecks it before reuse or outcome linking", async () => {
    const s = setup(true);
    connect(s);
    await s.controller.command("enable workflow", s.ctx);
    const result = details(await s.execute());
    expect(result.source.candidateIdentity).toBe("principal-runtime-observed");
    const selected = JSON.parse(readFileSync(result.source.path, "utf8"));
    expect(selected.candidateObservation).toMatchObject({ sessionId: "actual-pi-session", candidate: { id: packet.candidate, root: s.root } });
    expect(selected).toMatchObject({ evidenceClaims: "unassessed", trainingEligible: false });
    expect((s.provider.mock.calls as any)[0][2].input).not.toContain(s.root);
    expect(details(await s.execute()).reused).toBe(true);
    const evidencePath = join(s.root, "result.txt"); writeFileSync(evidencePath, "passed");
    const evidenceRefs = [{ path: evidencePath, sha256: createHash("sha256").update("passed").digest("hex") }];
    const link = { action: "link-outcome", selectionSha256: result.source.sha256, candidate: packet.candidate, evidenceRefs };
    connect(s, response => ({ ...response, candidate: { ...response.candidate, id: "changed" } }));
    await expect(s.execute()).rejects.toThrow("candidate observation");
    await expect(s.execute(link)).rejects.toThrow("candidate observation");
    s.pi.events.emit = () => {};
    await expect(s.execute(link)).rejects.toThrow("no longer available");
    expect(s.provider).toHaveBeenCalledTimes(1);
  });
  it("refuses stale correlation, other sessions/roots/candidates, reported failures and multiple responses before spend", async () => {
    const s = setup(true);
    await s.controller.command("enable workflow", s.ctx);
    const other = setup();
    for (const transform of [
      (r: any) => ({ ...r, requestId: "old" }),
      (r: any) => ({ ...r, sessionId: "other-session" }),
      (r: any) => ({ ...r, candidate: { ...r.candidate, root: other.root } }),
      (r: any) => ({ ...r, candidate: { ...r.candidate, id: "different" } }),
      (r: any) => ({ ...r, error: "candidate-observation-failed" }),
      (r: any, request: any) => { request.reply(r); return r; },
    ]) {
      connect(s, transform);
      await expect(s.execute()).rejects.toThrow();
    }
    expect(s.provider).not.toHaveBeenCalled();
    expect(existsSync(s.storageHome)).toBe(false);
    expect(details(await s.execute({ action: "status" })).remaining).toBe(3);
  });
  it("keeps no-response standalone operation honestly caller-claimed", async () => {
    const s = setup();
    s.pi.events = { emit: () => {} };
    await s.controller.command("enable workflow", s.ctx);
    expect(details(await s.execute()).source.candidateIdentity).toBe("caller-claimed");
  });
});

describe("native structured JEV advice", () => {
  it("returns the same validated data to direct and scripted callers for status, refusal, answer and reuse", async () => {
    const s = setup(true);
    const validate = new Ajv({ strict: false }).compile(s.tool.outputSchema);
    const inspect = (result: Awaited<ReturnType<typeof s.execute>>) => {
      expect(validate(result.structuredContent), JSON.stringify(validate.errors)).toBe(true);
      expect(result.structuredContent).toEqual(result.details);
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
      return details(result);
    };
    expect(inspect(await s.execute({ action: "status" })).enabled).toBe(false);
    expect(inspect(await s.execute()).status).toBe("unavailable");
    expect(s.provider).not.toHaveBeenCalled();
    await s.controller.command("enable workflow", s.ctx);
    expect(inspect(await s.execute()).status).toBe("answered");
    expect(inspect(await s.execute(packet, undefined, "second-call")).reused).toBe(true);
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(1);
    s.hooks.get("session_start")!();
    expect(inspect(await s.execute()).status).toBe("unavailable");
    await s.controller.command("enable workflow", s.ctx);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(2);
    expect(validate({ ...answer, advisory: false })).toBe(false);
  });
});

// Explicit local qualification, no credentials/models: the real Pi sandbox calls a fake provider
// through the actual Harness tool/controller. Ordinary unit tests do not download a Pi runtime.
const nativePackage = process.env.SKILL_HARNESS_PI_CODEMODE_PACKAGE;
const principalAdapter = process.env.SKILL_HARNESS_PRINCIPAL_CODEMODE;
const codemodeVariants = principalAdapter ? ['native', 'principal'] : ['native'];
describe.skipIf(!nativePackage)("Pi 1.1.0 tool-only Codemode composition", () => {
  it.each(codemodeVariants)("%s preserves structured results, consent, dedupe, partial failure, cancellation and revocation without model globals", async (variant) => {
    const manifest = JSON.parse(readFileSync(join(nativePackage!, "package.json"), "utf8"));
    expect(manifest.version).toBe("1.1.0");
    const native = await import(pathToFileURL(join(nativePackage!, "dist/index.js")).href);
    const s = setup(true);
    let codemode: any;
    if (variant === "principal") {
      const loader = await import(pathToFileURL(join(nativePackage!, "dist/core/extensions/loader.js")).href);
      const runtime = native.createExtensionRuntime();
      runtime.getAllTools = () => [s.tool];
      runtime.getSettings = () => ({});
      runtime.appendEntry = vi.fn();
      const loaded = await loader.loadExtensions([principalAdapter!], s.root, undefined, runtime);
      expect(loaded.errors).toEqual([]);
      codemode = loaded.extensions[0].tools.get("principal_codemode")?.definition;
      expect(codemode?.name).toBe("principal_codemode");
    } else {
      native.createCodemodeExtension({ mode: "on", models: false })({
        registerTool: (tool: unknown) => { codemode = tool; },
        appendEntry: vi.fn(), getAllTools: () => [s.tool], getSettings: () => ({}),
      });
    }
    expect(codemode.exposure).toBe("model-only");
    const loadout = codemode.prepareLoadout({
      declared: [s.tool, codemode], callable: [s.tool],
      getExposure: (name: string) => name === "jev_advice" ? "direct" : "model-only",
      getNamespace: () => undefined, getPromptGuidelines: () => [],
    });
    expect(loadout.descriptions[codemode.name]).toContain("Run JavaScript");
    expect(loadout.descriptions[codemode.name]).not.toContain("models.classify");
    if (variant === "principal") expect(loadout.descriptions).not.toHaveProperty("codemode");
    let nestedId = 0;
    const ctx: any = {
      tools: [s.tool], sessionManager: { getBranch: () => [] },
      modelRegistry: new Proxy({}, { get: () => { throw new Error("Raw model access is forbidden by this qualification"); } }),
      executeTool: async (_name: string, params: unknown, options: { signal: AbortSignal }) => {
        const id = `native-nested-${++nestedId}`;
        try {
          return { result: await s.execute(params, options.signal, id), isError: false, toolCall: { id } };
        } catch (error) {
          return { result: { content: [{ type: "text", text: String(error) }] }, isError: true, toolCall: { id } };
        }
      },
    };
    const run = (code: string, signal?: AbortSignal) => codemode.execute(`outer-${nestedId}`, { code }, signal, undefined, ctx);
    const output = (result: any) => result.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n");
    const scriptValue = (result: any) => JSON.parse(result.content.filter((item: any) => item.type === 'text').at(-1).text);
    const disabled = await run('const s = await tools.jev_advice({action:"status"}); return {enabled:s.enabled, globals:typeof models};');
    expect(disabled.isError).not.toBe(true);
    expect(scriptValue(disabled)).toEqual({enabled:false, globals:'undefined'});
    expect(s.provider).not.toHaveBeenCalled();
    await s.controller.command("enable workflow", s.ctx);
    const reused = await run(`const p=${JSON.stringify(packet)}; const first=await tools.jev_advice(p); const again=await tools.jev_advice(p); return {status:first.status,reused:again.reused,source:first.source.toolCallId};`);
    expect(reused.isError).not.toBe(true);
    expect(scriptValue(reused)).toMatchObject({status:'answered',reused:true});
    expect(output(reused)).toContain('native-nested-');
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(s.ctx.ui.confirm).toHaveBeenCalledTimes(1);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(1);
    const partial = await run('const r=await Promise.allSettled([tools.jev_advice({action:"status"}),tools.jev_advice({action:"status",consent:"forged"})]); return r.map(x=>x.status);');
    expect(partial.isError).not.toBe(true);
    expect(scriptValue(partial)).toEqual(['fulfilled','rejected']);
    expect((await run('return await models.classify("anything",{});')).isError).toBe(true);
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect((await run('return await tools.codemode({code:"return 1"});')).isError).toBe(true);
    expect((await run('return await tools.principal_codemode({code:"return 1"});')).isError).toBe(true);
    let release!: (value: typeof answer) => void;
    let started!: () => void;
    let cancelled!: () => void;
    const providerStarted = new Promise<void>(resolve => { started = resolve; });
    const providerCancelled = new Promise<void>(resolve => { cancelled = resolve; });
    s.provider.mockImplementationOnce((_provider: any, _model: any, _packet: any, options: any) => {
      options.signal.addEventListener("abort", cancelled, {once:true});
      started();
      return new Promise(resolve => { release = resolve; });
    });
    const abort = new AbortController();
    const pending = run(`return await tools.jev_advice(${JSON.stringify({...packet,candidate:"cancelled-candidate"})});`, abort.signal);
    await providerStarted;
    abort.abort();
    await providerCancelled;
    release(answer);
    expect((await pending).isError).toBe(true);
    const selections = readdirSync(join(s.storageHome,"jev-workflow"));
    expect(selections.some(name => !existsSync(join(s.storageHome,"jev-workflow",name,"outcome.json")))).toBe(true);
    expect(s.provider).toHaveBeenCalledTimes(2);
    s.hooks.get("session_start")!();
    const revoked = await run(`return (await tools.jev_advice(${JSON.stringify(packet)})).status;`);
    expect(output(revoked)).toContain('unavailable');
    expect(s.provider).toHaveBeenCalledTimes(2);
  }, 30000);
});
// Optional cross-repository qualification of the actual bridge; ordinary tests need no Principal checkout.
const principalWorkflow = process.env.SKILL_HARNESS_PRINCIPAL_WORKFLOW;
describe.skipIf(!principalWorkflow)("Principal live candidate composition", () => {
  it("uses Principal's canonical algorithm and refuses real worktree drift before provider spend", async () => {
    const principal = await import(pathToFileURL(principalWorkflow!).href);
    const s = setup(true);
    execFileSync("git", ["init", "--quiet", s.root]);
    writeFileSync(join(s.root, ".gitignore"), "private/\n");
    writeFileSync(join(s.root, "README.md"), "baseline\n");
    execFileSync("git", ["-C", s.root, "add", "."]);
    execFileSync("git", ["-C", s.root, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
    const handlers = new Map<string, (request: unknown) => void>();
    s.pi.events = { on: (channel: string, handler: any) => { handlers.set(channel, handler); return () => handlers.delete(channel); },
      emit: (channel: string, request: unknown) => handlers.get(channel)?.(request) };
    principal.registerCandidateObserver(s.pi)(s.ctx);
    const current = principal.observeCandidate(s.root);
    await s.controller.command("enable workflow", s.ctx);
    const selected = { ...packet, candidate: current.id };
    const result = details(await s.execute(selected));
    expect(result.source.candidateIdentity).toBe("principal-runtime-observed");
    const receipt = JSON.parse(readFileSync(result.source.path, "utf8"));
    expect(receipt.candidateObservation.candidate).toEqual(current);
    writeFileSync(join(s.root, "README.md"), "changed after decision\n");
    await expect(s.execute(selected)).rejects.toThrow("candidate observation");
    expect(s.provider).toHaveBeenCalledTimes(1);
    expect(details(await s.execute({action:"status"})).remaining).toBe(2);
  });
});
