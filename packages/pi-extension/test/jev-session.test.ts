import { describe, expect, it, vi } from "vitest";
import { createJevSessionHandler } from "../src/jev-session.js";
function setup() {
  const hooks = new Map<string, () => void>();
  const pi: any = {
    on: (event: string, fn: () => void) => hooks.set(event, fn),
    appendEntry: vi.fn(),
  };
  let id = "session-a";
  const ctx: any = {
    hasUI: true,
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
  const handle = createJevSessionHandler(pi, run);
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
    expect(s.pi.appendEntry.mock.calls[0][1].decision).toBe("declined");
    s.ctx.ui.select.mockResolvedValue(1);
    await s.handle("enable", s.ctx);
    expect(s.ctx.ui.select).toHaveBeenCalledTimes(2);
    expect(s.pi.appendEntry.mock.calls[1][1].decision).toBe("granted");
    expect(s.pi.appendEntry.mock.calls[1][1].interactionId).not.toBe(
      s.pi.appendEntry.mock.calls[0][1].interactionId,
    );
  });
  it("accepts the real SDK string choice and defaults dismissal to no", async () => {
    const s = setup();
    s.ctx.ui.select.mockImplementation(
      async (_title: string, choices: string[]) => choices[1],
    );
    await s.handle("enable", s.ctx);
    expect(s.pi.appendEntry.mock.calls[0][1].decision).toBe("granted");
    s.ctx.ui.select.mockResolvedValue(undefined);
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
