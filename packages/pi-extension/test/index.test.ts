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
    expect(events).toContain("session_shutdown");
  });
});
