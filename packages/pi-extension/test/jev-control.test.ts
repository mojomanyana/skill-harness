import { describe, expect, it, vi } from "vitest";
import { createJevController } from "../src/jev-session.js";
import { registerJevControl, JEV_CONTROL_CHANNEL, JEV_STATE_CHANNEL } from "../src/jev-control.js";

function setup() {
  const listeners = new Map<string, (value: any) => void>();
  const hooks = new Map<string, Array<(...args: any[]) => unknown>>();
  const broadcasts: any[] = [];
  let sessionId = "parent-session";
  const ctx: any = { cwd: process.cwd(), hasUI: true, sessionManager: { getSessionId: () => sessionId },
    ui: { confirm: vi.fn(async () => true), select: vi.fn(async (_title, options) => options[0]), notify: vi.fn() } };
  const pi: any = { on: (event: string, fn: any) => hooks.set(event, [...(hooks.get(event) ?? []), fn]), appendEntry: vi.fn(),
    events: { on: (channel: string, fn: any) => { listeners.set(channel, fn); return () => listeners.delete(channel); },
      emit: (channel: string, value: unknown) => { if (channel === JEV_STATE_CHANNEL) broadcasts.push(value); else listeners.get(channel)?.(value); } } };
  const provider = vi.fn();
  const controller = createJevController(pi, { provider, env: {} });
  registerJevControl(pi, controller);
  const lifecycle = (event: string) => { for (const hook of hooks.get(event) ?? []) hook({}, ctx); };
  lifecycle("session_start");
  const send = (action: string, requestId = "request-" + action, overrides = {}) => {
    const replies: any[] = [];
    listeners.get(JEV_CONTROL_CHANNEL)?.({ version: 1, requestId, sessionId, action, reply: (r: any) => replies.push(r), ...overrides });
    return replies[0];
  };
  return { send, broadcasts, provider, controller, ctx, pi, lifecycle, listeners, setSession: (id: string) => { sessionId = id; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

describe("optional parent JEV dashboard control", () => {
  it("reports readiness, uses the original paid/storage dialogs once and disables without a provider call", async () => {
    const s = setup();
    expect(s.send("status")).toMatchObject({ version: 1, pending: false, status: { enabled: false, providerReadiness: "missing-key", remaining: 0 } });
    expect(s.send("enable", "click-1")).toMatchObject({ requestId: "click-1", pending: true });
    expect(s.send("enable", "click-2").error).toBe("consent-pending");
    await flush();
    expect(s.ctx.ui.confirm).toHaveBeenCalledTimes(1);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(2);
    expect(s.broadcasts.at(-1)).toMatchObject({ requestId: "click-1", sessionId: "parent-session", pending: false,
      status: { enabled: true, mode: "workflow", storage: "declined", availability: "missing-key", remaining: 300 } });
    s.send("enable", "click-1"); await flush();
    expect(s.ctx.ui.confirm).toHaveBeenCalledTimes(1);
    expect(s.send("disable", "off")).toMatchObject({ status: { enabled: false, storage: null, remaining: 0 } });
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("edits the session total, reconfigures providers and modes, and gates prompt hints in parent dialogs", async () => {
    const s = setup();
    s.ctx.ui.input = vi.fn(async () => "1200");
    expect(s.send("limit", "set").pending).toBe(true);
    await flush();
    expect(s.ctx.ui.input).toHaveBeenCalledWith(expect.stringContaining("Total"), "300");
    expect(s.broadcasts.at(-1)).toMatchObject({ pending: false, status: { enabled: false, limit: 1200, hintsEnabled: false } });
    expect(s.send("limit", "forged", { limit: 9000 }).error).toBe("invalid-request");
    s.send("configure", "on");
    await flush();
    expect(s.ctx.ui.confirm.mock.calls[0][1]).toContain("1200");
    s.send("hints", "show");
    await flush();
    expect(s.send("status").status).toMatchObject({ limit: 1200, used: 0, hintsEnabled: true, controls: ["limit", "configure", "hints"] });
    s.ctx.ui.select.mockResolvedValueOnce(1);
    s.send("configure", "manual");
    await flush();
    expect(s.send("status").status).toMatchObject({ mode: "manual", hintsEnabled: false, limit: 1200, remaining: 1200 });
    expect(s.provider).not.toHaveBeenCalled();
  });
  it("cannot inherit Auto consent or enable another session, and handles missing native UI", async () => {
    const s = setup();
    expect(s.send("enable", "wrong", { sessionId: "child" })).toMatchObject({ status: null, error: "session-unavailable" });
    expect(s.send("enable", "forged", { consent: "granted", auto: true }).error).toBe("invalid-request");
    s.ctx.hasUI = false;
    expect(s.send("enable", "headless").error).toBe("native-consent-unavailable");
    expect(s.ctx.ui.confirm).not.toHaveBeenCalled();
    expect(s.ctx.ui.select).not.toHaveBeenCalled();
    s.ctx.hasUI = true; s.ctx.ui.confirm.mockResolvedValue(false);
    s.send("enable", "declined"); await flush();
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(1);
    expect(s.send("status").status.enabled).toBe(false);
  });
  it("disable or session switch revokes an unanswered confirmation and cannot restore old consent", async () => {
    const s = setup();
    let answer!: (value: boolean) => void;
    s.ctx.ui.confirm.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    s.send("enable", "waiting");
    await flush();
    s.send("disable", "off");
    answer(true); await flush();
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(1);
    expect(s.send("status")).toMatchObject({ pending: false, status: { enabled: false } });
    s.ctx.ui.confirm.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
    s.send("enable", "old-session");
    await flush();
    s.setSession("new-parent"); s.lifecycle("session_switch");
    answer(true); await flush();
    expect(s.send("status").status.enabled).toBe(false);
    expect(s.broadcasts.some(b => b.requestId === "old-session")).toBe(false);
    s.lifecycle("session_shutdown");
    expect(s.listeners.has(JEV_CONTROL_CHANNEL)).toBe(false);
  });
});
