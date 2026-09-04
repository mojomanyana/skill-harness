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
  it("derives the skipped count from the sole release-pack describe block", () => {
    const conditionals = testFiles(join(root, "packages")).filter((path) => path !== __filename).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(/\b(?:describe|it|test)\.(?:skip|skipIf|runIf|todo)\b|\b(?:xdescribe|xit|xtest)\b/g)]
        .map((match) => ({ path: relative(root, path).replaceAll("\\", "/"), token: match[0], offset: match.index! }));
    });

    expect(conditionals).toHaveLength(1);
    expect(conditionals[0]).toMatchObject({
      path: "packages/cli/test/release-pack.test.ts",
      token: "describe.skipIf",
    });

    const source = readFileSync(join(root, conditionals[0].path), "utf8");
    const allTests = [...source.matchAll(/\bit\s*\(/g)].length;
    const testsInConditionalBlock = [...source.slice(conditionals[0].offset).matchAll(/\bit\s*\(/g)].length;
    expect(testsInConditionalBlock).toBeGreaterThan(0);
    expect(allTests).toBe(testsInConditionalBlock);
  });
});
