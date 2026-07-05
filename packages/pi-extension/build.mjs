import { build } from "esbuild";

await build({
  entryPoints: ["packages/pi-extension/src/index.ts"],
  outfile: "packages/pi-extension/dist/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@earendil-works/*", "typebox", "node:*"],
});
