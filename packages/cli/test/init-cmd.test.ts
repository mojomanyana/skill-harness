import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, isTemplateSpec } from "@skill-harness/core";
import { cmdInit } from "../src/cli.js";

const tmps: string[] = [];
function tmpRoot() {
  const d = mkdtempSync(join(tmpdir(), "sh-init-"));
  tmps.push(d);
  return d;
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

/** Make <root>/<skill>/ with a SKILL.md but no spec yet. */
function skillRoot(name = "greeter") {
  const root = tmpRoot();
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "SKILL.md"), "# Greeter\nsay hi", "utf8");
  return { root, specPath: join(root, name, "tests", "specification.yaml") };
}
function args(root: string, name: string, extra: Record<string, string | true> = {}) {
  return { _: [name], flags: { skills: root, ...extra }, multi: {} };
}

describe("cmdInit", () => {
  test("writes a parseable template carrying the sentinel", async () => {
    const { root, specPath } = skillRoot();
    await cmdInit(args(root, "greeter"));
    expect(existsSync(specPath)).toBe(true);
    const text = readFileSync(specPath, "utf8");
    expect(parseSpec(text, specPath).skill).toBe("greeter");
    expect(isTemplateSpec(text)).toBe(true);
  });

  test("refuses to overwrite an existing spec without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "hand-written: do not clobber", "utf8");
    await expect(cmdInit(args(root, "greeter"))).rejects.toThrow(/--force/);
    expect(readFileSync(specPath, "utf8")).toBe("hand-written: do not clobber");
  });

  test("--force overwrites", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "old", "utf8");
    await cmdInit(args(root, "greeter", { force: true }));
    expect(isTemplateSpec(readFileSync(specPath, "utf8"))).toBe(true);
  });
});
