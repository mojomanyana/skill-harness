import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { buildOptions, observerBuildOptions } from "../build.mjs";

// build:ext bundles @skill-harness/core, which resolves through packages/core/dist.
// Run it before `tsc -b` and esbuild inlines a stale core — and the freshness test
// above still passes, because the in-memory rebuild reads the same stale dist. Both
// sides agree on the wrong input. That is how a bundle missing `_staged/` support got
// committed (caught by CI, which builds from clean, not by the local suite).
// The ordering therefore has to be encoded in the script, not remembered.
describe("build:ext ordering", () => {
  it("build:ext depends on the compiler build, so it can never bundle a stale core", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const ext: string = pkg.scripts["build:ext"];
    expect(ext).toMatch(/npm run build(\s|&|$)/);
    expect(ext.indexOf("npm run build")).toBeLessThan(ext.indexOf("build.mjs"));
  });
});

// The committed packages/pi-extension/dist/index.js is the ONLY thing `pi
// install git:` loads (no build step on install), but the suite aliases
// @skill-harness/* to src and `build:ext` is a manual step — a forgotten
// rebuild would ship stale code silently. Guard against that by rebuilding
// with the exact same esbuild options in memory (no disk write) and diffing
// against the committed bundle.
describe("dist/index.js bundle freshness", () => {
  it("matches an in-memory rebuild from build.mjs's options — if this fails, run `npm run build:ext` and commit dist/index.js", async () => {
    const result = await build({ ...buildOptions, outfile: undefined, write: false });
    const fresh = result.outputFiles[0].text;
    const committed = readFileSync("packages/pi-extension/dist/index.js", "utf8");
    expect(fresh).toBe(committed);
  });

  it("ships the self-contained observer module the bundled adapter loads (breaks if build:ext emits only index.js)", async () => {
    const result = await build({ ...observerBuildOptions, outfile: undefined, write: false });
    expect(readFileSync("packages/pi-extension/dist/prompt-capture-extension.js", "utf8")).toBe(result.outputFiles[0].text);
    expect(result.outputFiles[0].text).not.toContain('from "@skill-harness/core"');
    expect(result.outputFiles[0].text).not.toMatch(/js-yaml|trajectory|qualification/i);
  });
});
