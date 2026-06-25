#!/usr/bin/env node
// Thin launcher: run the built CLI if present, otherwise fall back to tsx (dev).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const distCli = join(here, "..", "dist", "cli.js");

if (existsSync(distCli)) {
  await import(pathToFileURL(distCli).href);
} else {
  const srcCli = join(here, "..", "src", "cli.ts");
  const res = spawnSync("npx", ["tsx", srcCli, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exit(res.status ?? 1);
}
