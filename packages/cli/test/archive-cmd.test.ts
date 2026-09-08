import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, help } from "../src/cli.js";
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("archive CLI", () => {
  it("ingests under explicit policy and inspects without exporting raw content", async () => {
    const root = mkdtempSync(join(tmpdir(), "archive-cli-")); roots.push(root); const src = join(root, "source"); mkdirSync(src, { mode: 0o700 });
    writeFileSync(join(src, "events"), '{"private":"synthetic"}\n{"partial":', { mode: 0o600 });
    const policy = join(root, "policy"); writeFileSync(policy, JSON.stringify({ version: "archive-policy-v1", id: "local", revision: "1", sourceRoot: src,
      archiveRoot: join(root, "archive"), maxBytes: 1024, retention: "exact", expiresAt: "2099-01-01T00:00:00.000Z",
      sources: [{ id: "s1", path: "events", parser: { id: "jsonl", version: "1" } }] }), { mode: 0o600 });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await main(["archive", "ingest", "--policy", policy, "--source", "s1"]);
    const result = JSON.parse(String(log.mock.calls.at(-1)![0])); expect(result.syntax).toBe("partial");
    expect(JSON.stringify(result)).not.toContain("synthetic");
    await main(["archive", "inspect", "--policy", policy, "--source", "s1", "--checkpoint", result.checkpointId]);
    expect(JSON.parse(String(log.mock.calls.at(-1)![0])).checkpointId).toBe(result.checkpointId);
    expect(help()).toContain("archive");
    const listeners = process.listenerCount('SIGTERM');
    await main(['archive','watch','--policy',policy,'--source','s1','--max-polls','1']);
    expect(JSON.parse(String(log.mock.calls.at(-1)![0])).polls).toBe(1);
    expect(process.listenerCount('SIGTERM')).toBe(listeners);
  });
  it("rejects missing policy, unsupported operations and inline policy overrides", async () => {
    await expect(main(["archive", "ingest", "--source", "x"])).rejects.toThrow(/policy/);
    await expect(main(["archive", "publish", "--policy", "x", "--source", "x"])).rejects.toThrow(/archive/);
    await expect(main(["archive", "ingest", "--policy", "x", "--source", "x", "--retention", "exact"])).rejects.toThrow(/option/);
  });
});
