import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { buildOptions } from "../build.mjs";

// The committed packages/pi-extension/dist/index.js is the ONLY thing `pi
// install git:` loads (no build step on install), but the suite aliases
// @skill-check/* to src and `build:ext` is a manual step — a forgotten
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
});
