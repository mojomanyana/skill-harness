import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const root = resolve(import.meta.dirname, "../../..");
const scriptPath = resolve(root, "scripts/smoke-real-pi.sh");
const script = readFileSync(scriptPath, "utf8");

function spec(skill: string): any {
  return yaml.load(readFileSync(resolve(root, `scripts/smoke/skills/${skill}/tests/specification.yaml`), "utf8"));
}

function executable(dir: string, name: string, body: string): void {
  const path = resolve(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}


describe("real-pi release smoke contract", () => {
  it("separates the hostile-extension probe from authenticated delivery and adjudication", () => {
    expect(script).toContain('EXTENSION_SKILL="trace-smoke"');
    expect(script).toContain('DELIVERY_SKILL="delivery-smoke"');
    expect(script).toContain('openai-codex:gpt-5.6-luna');
    expect(script).toContain('openai-codex:gpt-5.6-sol');
    expect(script).toContain('--judge "$JUDGE"');
    expect(script).toContain('expected unauthenticated extension delivery ERROR');
    expect(script).toContain('authenticated delivery: PASS');

    const extension = spec("trace-smoke");
    expect(extension.scenarios[0].env.extensions).toHaveLength(1);
    const delivery = spec("delivery-smoke");
    expect(delivery.scenarios[0].env?.extensions).toBeUndefined();
    expect(delivery.scenarios).toHaveLength(1);
    expect(delivery.ship_bar).toMatchObject({ total: 1, min_pass: 1 });
  });

  it("stops before lint or paid work when Claude is present but not runnable", () => {
    const dir = mkdtempSync(resolve(tmpdir(), "smoke-script-contract-"));
    const marker = resolve(dir, "node-called");
    try {
      executable(dir, "pi", 'echo "pi-test"');
      executable(dir, "claude", 'exit 1');
      executable(dir, "node", `: > "${marker}"; exit 0`);
      const result = spawnSync("/bin/bash", [scriptPath], {
        cwd: root, encoding: "utf8",
        env: { ...process.env, SMOKE_JUDGE: "claude-code:test", PATH: `${dir}${delimiter}${process.env.PATH ?? ""}` },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("claude is on PATH but not runnable");
      expect(() => readFileSync(marker)).toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  for (const [name, lintOutput] of [
    ["an unexplained lint failure", "error: simulated lint crash"],
    ["a stale finding mixed with an unexplained failure", "✗ fixture: stale — old run\\nerror: simulated lint crash"],
  ] as const) {
    it(`treats ${name} as fatal before a paid run`, () => {
      const dir = mkdtempSync(resolve(tmpdir(), "smoke-script-contract-"));
      const marker = resolve(dir, "paid-run-started");
      try {
        executable(dir, "pi", 'echo "pi-test"');
        executable(dir, "claude", 'echo "claude-test"');
        executable(dir, "node", `
if [ "$2" = "lint" ]; then printf '%b\\n' "${lintOutput}" >&2; exit 1; fi
if [ "$2" = "run" ]; then : > "${marker}"; fi
exit 0`);
        const result = spawnSync("/bin/bash", [scriptPath], {
          cwd: root, encoding: "utf8",
          env: { ...process.env, PATH: `${dir}${delimiter}${process.env.PATH ?? ""}` },
        });
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("lint command failed");
        expect(() => readFileSync(marker)).toThrow();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
