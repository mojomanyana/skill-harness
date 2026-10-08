import { build } from "esbuild";
await build({
  entryPoints: ["packages/cli/src/decision.ts"],
  outfile: "packages/cli/dist/decision.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  external: ["@skill-harness/*", "node:*"],
});
