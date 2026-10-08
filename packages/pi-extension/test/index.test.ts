import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import factory from "../src/index.js";

describe("pi-extension factory", () => {
  it("registers the /skill-harness command and skill_check_run tool, and a session_shutdown hook", () => {
    const commands: string[] = [];
    const tools: string[] = [];
    const events: string[] = [];
    const fakePi: any = {
      registerCommand: (name: string) => commands.push(name),
      registerTool: (def: any) => tools.push(def.name),
      on: (event: string) => events.push(event),
    };
    factory(fakePi);
    expect(commands).toContain("skill-harness");
    expect(tools).toContain("skill_check_run");
    expect(tools).toContain("jev_advice");
    expect(events).toContain("session_shutdown");
  });
});


it("reports the loaded Harness generation and detaches its native event-bus listener on shutdown", async () => {
  const listeners = new Map<string, (data: unknown) => void>(), shutdown: Array<() => void | Promise<void>> = [];
  factory({ registerCommand() {}, registerTool() {}, on(event, fn) { if (event === "session_shutdown") shutdown.push(fn); },
    events: { on(channel, fn) { listeners.set(channel, fn); return () => { listeners.delete(channel); }; } },
  });
  const rows: unknown[] = [];
  listeners.get("pi-daddy:ecosystem-versions:v1")!({ report: (value: unknown) => rows.push(value) });
  expect(rows).toEqual([{ id: "skill-harness", version: JSON.parse(readFileSync("package.json", "utf8")).version, root: expect.any(String) }]);
  for (const close of shutdown) await close();
  expect(listeners.size).toBe(0);
});
