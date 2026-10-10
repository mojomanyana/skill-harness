import { describe, expect, it, vi } from "vitest";
import { createJevController } from "../src/jev-session.js";
function setup() {
  const hooks = new Map<string, () => void>();
  const pi: any = {
    on: (event: string, fn: () => void) => hooks.set(event, fn),
    appendEntry: vi.fn(),
  };
  let id = "session-a";
  const ctx: any = {
    hasUI: true,
    modelRegistry: { getProviderAuthStatus: vi.fn(()=>({configured:true})), getApiKeyForProvider: vi.fn(async()=>"manual-native-test-key") },
    sessionManager: { getSessionId: () => id },
    ui: {
      select: vi.fn().mockResolvedValue(0),
      notify: vi.fn(),
      input: vi.fn(),
      confirm: vi.fn().mockResolvedValue(true),
    },
  };
  const preview = JSON.stringify({ count: 1, caseSetHash: "a".repeat(64) });
  const run = vi.fn(async (args: string[], options: any) => {
    if (args[0] === "preview") options.emit(preview);
    else options.beforeProviderCall();
  });
  const handle = createJevController(pi, {run,env:{}}).command;
  return { ctx, pi, run, handle, hooks, setId: (s: string) => (id = s) };
}
describe("per-session JEV storage activation", () => {
  it("asks on every enable; a decline still permits confirmed JEV execution", async () => {
    const s = setup();
    await s.handle("enable", s.ctx);
    s.ctx.ui.input
      .mockResolvedValueOnce("/selected.json")
      .mockResolvedValueOnce("/new.jsonl");
    await s.handle("run", s.ctx);
    expect(s.run).toHaveBeenCalledTimes(3);
    expect(s.run.mock.calls[2][1].sessionConsent.decision).toBe("declined");
    expect(s.run.mock.calls[2][1].env).toEqual({OPENROUTER_API_KEY:"manual-native-test-key"});
    expect(s.ctx.modelRegistry.getApiKeyForProvider.mock.calls).toEqual([["openrouter"]]);
    expect(JSON.stringify(s.ctx.ui.notify.mock.calls)).not.toContain("manual-native-test-key");
    expect(s.pi.appendEntry.mock.calls[0][1].decision).toBe("declined");
    s.ctx.ui.select.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await s.handle("enable", s.ctx);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(4);
    expect(s.pi.appendEntry.mock.calls[1][1].decision).toBe("granted");
    expect(s.pi.appendEntry.mock.calls[1][1].interactionId).not.toBe(
      s.pi.appendEntry.mock.calls[0][1].interactionId,
    );
  });
  it("accepts the real SDK string choice and defaults dismissal to no", async () => {
    const s = setup();
    s.ctx.ui.select.mockImplementation(
      async (_title: string, choices: string[]) => choices[choices.length === 1 ? 0 : 1],
    );
    await s.handle("enable", s.ctx);
    expect(s.pi.appendEntry.mock.calls[0][1].decision).toBe("granted");
    s.ctx.ui.select.mockResolvedValueOnce(0).mockResolvedValueOnce(undefined);
    await s.handle("enable", s.ctx);
    expect(s.pi.appendEntry.mock.calls[1][1].decision).toBe("declined");
  });
  it("does not restore permission across startup, reload or session identity changes", async () => {
    const s = setup();
    await s.handle("enable", s.ctx);
    s.hooks.get("session_start")!();
    await expect(s.handle("run", s.ctx)).rejects.toThrow("Enable JEV");
    await s.handle("enable", s.ctx);
    s.setId("session-b");
    await expect(s.handle("run", s.ctx)).rejects.toThrow("Enable JEV");
  });
  it("rejects interactive activation without UI before appending consent", async () => {
    const s = setup();
    s.ctx.hasUI = false;
    await expect(s.handle("enable", s.ctx)).rejects.toThrow("per-session");
    expect(s.pi.appendEntry).not.toHaveBeenCalled();
  });
  it.each([
    "disable",
    "session_start",
    "session_shutdown",
    "session-change",
    "newer-decline",
  ])("never restores an older grant after %s", async (action) => {
    const s = setup();
    let answer!: (value: number) => void;
    s.ctx.ui.select.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const old = s.handle("enable", s.ctx);
    if (action === "disable") await s.handle("disable", s.ctx);
    else if (action === "session_start" || action === "session_shutdown")
      s.hooks.get(action)!();
    else if (action === "session-change") s.setId("session-b");
    else await s.handle("enable", s.ctx);
    answer(1);
    await old;
    expect(
      s.pi.appendEntry.mock.calls.some((c) => c[1].decision === "granted"),
    ).toBe(false);
  });
  it("does not adopt a newer consent while an older run waits for confirmation", async () => {
    const s = setup();
    await s.handle("enable", s.ctx);
    s.ctx.ui.input
      .mockResolvedValueOnce("/cases")
      .mockResolvedValueOnce("/out");
    s.ctx.ui.confirm.mockImplementation(async () => {
      await s.handle("enable", s.ctx);
      return true;
    });
    await expect(s.handle("run", s.ctx)).rejects.toThrow(
      "Session or consent changed",
    );
    expect(s.run.mock.calls.every((c) => c[0][0] === "preview")).toBe(true);
  });
});


describe("manual JEV credential reuse",()=>{
  it("does not resolve credentials before paid confirmation and refuses revocation while resolution waits",async()=>{
    const s=setup();await s.handle("enable",s.ctx);
    expect(s.ctx.modelRegistry.getApiKeyForProvider).not.toHaveBeenCalled();
    s.ctx.ui.input.mockResolvedValueOnce("/cases").mockResolvedValueOnce("/out");
    s.ctx.ui.confirm.mockResolvedValueOnce(false);await s.handle("run",s.ctx);
    expect(s.ctx.modelRegistry.getApiKeyForProvider).not.toHaveBeenCalled();
    s.ctx.ui.input.mockResolvedValueOnce("/cases").mockResolvedValueOnce("/out");
    let resolve!: (value:string)=>void,entered!: ()=>void;
    const enteredLookup=new Promise<void>(done=>{entered=done;});
    s.ctx.modelRegistry.getApiKeyForProvider.mockImplementationOnce(()=>{entered();return new Promise<string>(done=>{resolve=done;});});
    const pending=s.handle("run",s.ctx);await enteredLookup;
    await s.handle("disable",s.ctx);resolve("late-test-key");
    await expect(pending).rejects.toThrow("Session or consent changed");
    expect(s.run.mock.calls.every(call=>call[0][0]==="preview")).toBe(true);
  });
});


describe("native manual JEV route", () => {
  it.each(["authentication", "response"])("previews the selected native model and rejects revocation during %s", async boundary => {
    const s = setup();
    const model = { type: "classifier", provider: "typesafe", id: "jev-latest", api: "typesafe-system-one",
      baseUrl: "https://synthetic.invalid", contextWindow: 64000, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
    let resolve!: () => void, entered!: () => void;
    const enteredAuth = new Promise<void>(done => { entered = done; });
    const sent = vi.fn();
    const classify = vi.fn(async (_model: any, _context: any, options: any) => {
      if (boundary === "authentication") { entered(); await new Promise<void>(done => { resolve = done; }); }
      await options.transformHeaders({ authorization: "private-auth" }); sent();
      if (boundary === "response") { entered(); await new Promise<void>(done => { resolve = done; }); }
      return { ...model, model: model.id, stopReason: "stop", answers: { decision: { type: "bool", probability: 0.8 } } };
    });
    s.ctx.modelRegistry = { getModelsOfType: () => [model], getProviderAuthStatus: () => ({configured:true}), classify };
    s.run.mockImplementation(async (args, options) => {
      if (args[0] === "preview") options.emit(JSON.stringify({count:1,caseSetHash:"a".repeat(64)}));
      else { options.beforeProviderCall(); await options.nativeProviderCall({input:"selected",question:"Ready?"}); }
    });
    await s.handle("enable", s.ctx);
    expect(classify).not.toHaveBeenCalled();
    s.ctx.ui.input.mockResolvedValueOnce("/cases").mockResolvedValueOnce("/result");
    s.ctx.ui.confirm.mockResolvedValueOnce(false);
    await s.handle("run", s.ctx);expect(classify).not.toHaveBeenCalled();
    s.ctx.ui.input.mockResolvedValueOnce("/cases").mockResolvedValueOnce("/result");
    const pending = s.handle("run", s.ctx);await enteredAuth;
    expect(s.run.mock.calls.at(-1)?.[0]).toContain("typesafe");
    expect(s.run.mock.calls.at(-1)?.[0]).toContain("jev-latest");
    expect(s.run.mock.calls.at(-1)?.[1]).toMatchObject({ nativeRoute:{provider:"typesafe",model:"jev-latest"},learningRoot:expect.any(String) });
    expect(s.run.mock.calls.at(-1)?.[1].env).toBeUndefined();
    await s.handle("disable", s.ctx);resolve();
    await expect(pending).rejects.toThrow();
    expect(sent).toHaveBeenCalledTimes(boundary === "authentication" ? 0 : 1);
    expect(JSON.stringify(s.ctx.ui.notify.mock.calls)).not.toContain("private-auth");
  });
});
