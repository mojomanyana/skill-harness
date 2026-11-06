import { expect, test, vi } from "vitest";
import { finalizeResults, summarizeRun } from "@skill-harness/core";
import { createHarnessDashboard } from "../src/dashboard.js";
import type { ExtensionAPI } from "../src/commands.js";

function fixture() {
  const updates: unknown[] = [], requests: unknown[] = [], listeners = new Map<string, () => void>();
  const close = vi.fn();
  const pi = { on: (event: string, handler: () => void) => listeners.set(event, handler),
    events: { emit: (channel: string, request: { reply(value: unknown): void }) => {
      expect(channel).toBe("pi-daddy:dashboard-source:v1"); requests.push(request);
      request.reply({ version: 1, ok: true, generation: "source-1", publish: (update: unknown) => { updates.push(update); return true; }, close });
    } },
  } as unknown as ExtensionAPI;
  const ctx = { cwd: "/repo", sessionManager: { getSessionId: () => "session-1" } };
  return { pi, ctx, updates, requests, listeners, close, dashboard: createHarnessDashboard(pi, "test") };
}
const summary = () => summarizeRun(finalizeResults({ skill: "example", harness: "pi", model: "provider:subject",
  subject_profile: { provider: "provider", model: "subject", thinking: "high" },
  judge: { provider: "provider", model: "judge", thinking: "low" },
  timestamp: "2026-11-05", label: null, mode: "force",
  scenarios: [{ id: "A1", judge_verdict: "FAIL", judge_reason: "recorded", suspect: false, override: null, note: "" }],
}, null));

test("optional dashboard publishes bounded known activity and retained provenance, never treating FAIL as runtime failure", async () => {
  const f = fixture();
  const result = summary();
  result.subject.requested.model = "模型".repeat(2000);
  expect(await f.dashboard.run(f.ctx, async () => result, value => value)).toBe(result);
  expect(f.requests).toHaveLength(1);
  expect(f.requests[0]).toMatchObject({ version: 1, sessionId: "session-1", cwd: "/repo", producer: "skill-harness", producerVersion: "test" });
  expect(f.updates[0]).toMatchObject({ sequence: 1, items: [{ state: "running" }] });
  expect(f.updates[1]).toMatchObject({ sequence: 2, items: [{ state: "settled" }, { state: "observed" }] });
  const encoded = JSON.stringify(f.updates[1]);
  expect(Buffer.byteLength(encoded)).toBeLessThan(4096);
  expect(encoded).toContain("effective effort unknown");
  expect(encoded).toContain("1 FAIL");
  expect(encoded).toContain("not a fresh trial");
  expect(encoded).not.toContain("judge_reason");
});

test("session changes close handles and suppress late completion from the old session", async () => {
  const f = fixture();
  let finish!: () => void;
  const run = f.dashboard.run(f.ctx, () => new Promise<void>(resolve => { finish = resolve; }), summary);
  f.listeners.get("session_switch")!();
  finish(); await run;
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.updates).toHaveLength(1);
});

test("failed operations publish generic diagnostics without disclosing errors; absent Daddy never prevents work", async () => {
  const f = fixture();
  await expect(f.dashboard.run(f.ctx, async () => { throw new Error("private transcript"); }, summary)).rejects.toThrow("private transcript");
  expect(JSON.stringify(f.updates)).toContain('"state":"failed"');
  expect(JSON.stringify(f.updates)).not.toContain("private transcript");
  const dashboard = createHarnessDashboard({ on() {} } as unknown as ExtensionAPI, "test");
  expect(await dashboard.run({ cwd: "/repo" }, async () => 42, () => undefined)).toBe(42);
  expect(await f.dashboard.run(f.ctx, async () => 42, () => { throw new Error("broken optional view"); })).toBe(42);
  expect(f.updates.at(-1)).toMatchObject({ items: [{ state: "settled", details: [expect.stringContaining("summary unavailable")] }] });
  expect(await dashboard.run({ cwd: "/repo" }, async () => 42, () => { throw new Error("broken optional view"); })).toBe(42);
});
