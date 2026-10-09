import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "../../..");

function testFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return testFiles(path);
    return entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("conditional test skips", () => {
  it("allows only the documented release-toolchain, native-runtime and cross-repository gates", () => {
    const conditionals = testFiles(join(root, "packages")).filter((path) => path !== __filename).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(/\b(?:describe|it|test)\.(?:skip|skipIf|runIf|todo)\b|\b(?:xdescribe|xit|xtest)\b/g)]
        .map((match) => ({ path: relative(root, path).replaceAll("\\", "/"), token: match[0], offset: match.index! }));
    });

    expect(conditionals).toHaveLength(3);
    expect(conditionals[0]).toMatchObject({
      path: "packages/cli/test/release-pack.test.ts",
      token: "describe.skipIf",
    });

    expect(conditionals[1]).toMatchObject({
      path: "packages/pi-extension/test/jev-advice.test.ts",
      token: "describe.skipIf",
    });
    const nativeSource = readFileSync(join(root, conditionals[1].path), "utf8");
    expect(nativeSource).toContain('process.env.SKILL_HARNESS_PI_CODEMODE_PACKAGE');
    expect(nativeSource.slice(conditionals[1].offset)).toMatch(/^describe\.skipIf\(!nativePackage\)/);

    expect(conditionals[2]).toMatchObject({ path: "packages/pi-extension/test/jev-advice.test.ts", token: "describe.skipIf" });
    expect(nativeSource).toContain('process.env.SKILL_HARNESS_PRINCIPAL_WORKFLOW');
    expect(nativeSource.slice(conditionals[2].offset)).toMatch(/^describe\.skipIf\(!principalWorkflow\)/);

    const source = readFileSync(join(root, conditionals[0].path), "utf8");
    const allTests = [...source.matchAll(/\bit\s*\(/g)].length;
    const testsInConditionalBlock = [...source.slice(conditionals[0].offset).matchAll(/\bit\s*\(/g)].length;
    expect(testsInConditionalBlock).toBeGreaterThan(0);
    expect(allTests).toBe(testsInConditionalBlock);
  });
});
