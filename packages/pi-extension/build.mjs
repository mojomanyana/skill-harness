import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
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
// build:ext`) — bundle.test.ts imports the options to rebuild in memory.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await build(buildOptions);
  mkdirSync("packages/skill-harness/assets", { recursive: true });
  mkdirSync("packages/skill-harness/dist", { recursive: true });
  for (const [source, destination] of [
    ["packages/pi-extension/dist/index.js", "packages/skill-harness/dist/index.js"],
    ["assets/report.template.html", "packages/skill-harness/assets/report.template.html"],
    ["assets/report.grade.js", "packages/skill-harness/assets/report.grade.js"],
  ]) copyFileSync(source, destination);
}
