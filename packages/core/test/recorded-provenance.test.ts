import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");
const script = join(root, "scripts/check-recorded-provenance.mjs");
const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("recorded cross-repository provenance", () => {
  it("resolves every recorded commit in a repository named by its provenance file", () => {
    const output = execFileSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        PRINCIPAL_PI_SKILLS_CHECKOUT: process.env.PRINCIPAL_PI_SKILLS_CHECKOUT ?? join(root, "../principal-pi-skills"),
        PI_DADDY_CHECKOUT: process.env.PI_DADDY_CHECKOUT ?? join(root, "../pi-daddy"),
      },
    });
    expect(output).toMatch(/all \d+ recorded provenance commit identity\/identities resolve/);
  });

  it("fails on an unresolvable recorded commit instead of accepting its shape", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "sh-provenance-negative-"));
    temporary.push(fixtureRoot);
    const producer = join(fixtureRoot, "pi-daddy");
    mkdirSync(producer);
    expect(spawnSync("git", ["init", "-q"], { cwd: producer }).status).toBe(0);
    const provenanceDir = join(fixtureRoot, "fixtures");
    mkdirSync(provenanceDir);
    writeFileSync(
      join(provenanceDir, "PI-DADDY-PROVENANCE.md"),
      "Generated from mojomanyana/pi-daddy commit `0000000000000000000000000000000000000000`.\n",
    );

    const result = spawnSync(process.execPath, [script, "--root", fixtureRoot], {
      encoding: "utf8",
      env: { ...process.env, PI_DADDY_CHECKOUT: producer },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/does not resolve/);
  });
});
