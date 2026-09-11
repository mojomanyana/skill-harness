import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("packages/skill-harness/package.json", "utf8"));

describe("published meta-package Pi extension", () => {
  it("declares the bundled extension and all runtime siblings", () => {
    expect(manifest.pi).toEqual({ extensions: ["./dist/index.js"] });
    expect(manifest.files).toEqual(expect.arrayContaining([
      "dist/index.js",
      "dist/prompt-capture-extension.js",
      "assets/report.template.html",
      "assets/report.grade.js",
    ]));
  });

  it("ships byte-identical committed bundles and review assets", () => {
    expect(readFileSync("packages/skill-harness/dist/index.js")).toEqual(readFileSync("packages/pi-extension/dist/index.js"));
    expect(readFileSync("packages/skill-harness/dist/prompt-capture-extension.js")).toEqual(readFileSync("packages/pi-extension/dist/prompt-capture-extension.js"));
    for (const file of ["report.template.html", "report.grade.js"]) {
      expect(readFileSync(`packages/skill-harness/assets/${file}`)).toEqual(readFileSync(`assets/${file}`));
    }
  });
});
