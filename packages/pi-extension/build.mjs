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

export const observerBuildOptions = {
  entryPoints: ["packages/adapters/src/prompt-capture-extension.ts"],
  outfile: "packages/pi-extension/dist/prompt-capture-extension.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["node:*"],
};

// Only run the build when this file is executed directly (`npm run
// build:ext`) — bundle.test.ts imports the options to rebuild in memory.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await build(buildOptions);
  // Pi loads this as a separate --extension module beside the main bundle.
  // Bundle its provenance logic so a git installation needs no workspace package.
  await build(observerBuildOptions);
}
