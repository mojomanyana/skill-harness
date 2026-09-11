import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

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
  // The observer needs four dependency-free normalization constants, not the
  // core barrel (which pulls YAML, trajectory and qualification code into Pi).
  alias: { "@skill-harness/core": resolve("packages/core/src/prompt-normalization.ts") },
};

// Only run the build when this file is executed directly (`npm run
// build:ext`) — bundle.test.ts imports the options to rebuild in memory.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await build(buildOptions);
  // Pi loads this as a separate --extension module beside the main bundle.
  // Bundle its provenance logic so a git installation needs no workspace package.
  await build(observerBuildOptions);
  mkdirSync("packages/skill-harness/assets", { recursive: true });
  mkdirSync("packages/skill-harness/dist", { recursive: true });
  for (const [source, destination] of [
    ["packages/pi-extension/dist/index.js", "packages/skill-harness/dist/index.js"],
    ["packages/pi-extension/dist/prompt-capture-extension.js", "packages/skill-harness/dist/prompt-capture-extension.js"],
    ["assets/report.template.html", "packages/skill-harness/assets/report.template.html"],
    ["assets/report.grade.js", "packages/skill-harness/assets/report.grade.js"],
  ]) copyFileSync(source, destination);
}
