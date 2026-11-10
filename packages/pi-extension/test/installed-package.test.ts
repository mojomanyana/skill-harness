import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("packages/skill-harness/package.json", "utf8"));

describe("published meta-package Pi extension", () => {
  it("declares the bundled extension and all runtime siblings", () => {
    expect(manifest.pi).toEqual({ extensions: ["./dist/index.js"], skills: ["./SKILL.md"] });
    expect(manifest.dependencies.typebox).toBeUndefined();
    expect(manifest.peerDependencies.typebox).toBe("*");
    expect(manifest.peerDependenciesMeta.typebox).toEqual({ optional: true });
    expect(manifest.files).toEqual(expect.arrayContaining([
      "CHANGELOG.md",
      "dist/index.js",
      "SKILL.md",
      "docs/EVAL-AUTHORING.md",
      "docs/USAGE.md",
      "docs/MODEL-PROFILES.md",
      "docs/DECISION-LEARNING.md",
      "assets/report.template.html",
      "assets/report.grade.js",
    ]));
  });

  it("declares a source-backed package entry for every local skill guide", () => {
    const skill = readFileSync("packages/skill-harness/SKILL.md", "utf8");
    const links = [...skill.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)]
      .map((match) => match[1].split("#")[0])
      .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
    expect(links.length).toBeGreaterThan(0);
    for (const target of new Set(links)) {
      const path = posix.normalize(target);
      expect(manifest.files, `local guide ${path} must be included in npm`).toContain(path);
      // Canonical archive tests verify packaged bytes; ignored staging files need not exist in a clean checkout.
      expect(readFileSync(path).length, `linked guide ${path} must have a source`).toBeGreaterThan(0);
    }
  });

  it("ships byte-identical committed bundles and review assets", () => {
    const sameBytes = (left: string, right: string) =>
      expect(readFileSync(left).equals(readFileSync(right)), `${left} differs from ${right}`).toBe(true);
    sameBytes("packages/skill-harness/SKILL.md", "SKILL.md");
    sameBytes("packages/skill-harness/dist/index.js", "packages/pi-extension/dist/index.js");
    for (const file of ["report.template.html", "report.grade.js"]) {
      sameBytes(`packages/skill-harness/assets/${file}`, `assets/${file}`);
    }
  });
});
