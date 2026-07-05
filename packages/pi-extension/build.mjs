import { build } from "esbuild";
import { pathToFileURL } from "node:url";

export const buildOptions = {
  entryPoints: ["packages/pi-extension/src/index.ts"],
  outfile: "packages/pi-extension/dist/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@earendil-works/*", "typebox", "node:*"],
};

// Only run the build when this file is executed directly (`npm run
// build:ext`) — bundle.test.ts imports `buildOptions` to rebuild in memory
// and compare against the committed dist/index.js, without triggering a
// second real build.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await build(buildOptions);
}
