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

    expect(conditionals).toHaveLength(4);
    expect(conditionals[0]).toMatchObject({
      path: "packages/cli/test/release-pack.test.ts",
      token: "describe.skipIf",
    });

    for (const conditional of conditionals.slice(1, 3)) {
      expect(conditional).toMatchObject({ path: "packages/core/test/fixture-limits.test.ts", token: "it.skipIf" });
      const fixtureSource = readFileSync(join(root, conditional.path), "utf8");
      expect(fixtureSource.slice(conditional.offset)).toMatch(/^it\.skipIf\(process\.platform !== "linux"\)/);
    }
    expect(conditionals[3]).toMatchObject({ path: "packages/core/test/process.test.ts", token: "describe.skipIf" });
    const processSource = readFileSync(join(root, conditionals[3].path), "utf8");
    expect(processSource.slice(conditionals[3].offset)).toMatch(/^describe\.skipIf\(process\.platform !== "linux"\)/);

    const source = readFileSync(join(root, conditionals[0].path), "utf8");
    const allTests = [...source.matchAll(/\bit\s*\(/g)].length;
    const testsInConditionalBlock = [...source.slice(conditionals[0].offset).matchAll(/\bit\s*\(/g)].length;
    expect(testsInConditionalBlock).toBeGreaterThan(0);
    expect(allTests).toBe(testsInConditionalBlock);
  });
});
