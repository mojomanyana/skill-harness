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

  it("makes every local guide linked by the installed skill available offline", () => {
    const skill = readFileSync("packages/skill-harness/SKILL.md", "utf8");
    const links = [...skill.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)]
      .map((match) => match[1].split("#")[0])
      .filter((target) => target && !/^[a-z][a-z0-9+.-]*:/i.test(target));
    expect(links.length).toBeGreaterThan(0);
    for (const target of new Set(links)) {
      const path = posix.normalize(target);
      expect(manifest.files, `local guide ${path} must be included in npm`).toContain(path);
      expect(readFileSync(`packages/skill-harness/${path}`), `staged guide ${path} must match its source`)
        .toEqual(readFileSync(path));
    }
  });

  it("ships byte-identical committed bundles and review assets", () => {
    expect(readFileSync("packages/skill-harness/SKILL.md")).toEqual(readFileSync("SKILL.md"));
    expect(readFileSync("packages/skill-harness/dist/index.js")).toEqual(readFileSync("packages/pi-extension/dist/index.js"));
    for (const file of ["report.template.html", "report.grade.js"]) {
      expect(readFileSync(`packages/skill-harness/assets/${file}`)).toEqual(readFileSync(`assets/${file}`));
    }
  });
});
