import { defineWorkspace } from "vitest/config";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Tests must exercise src, not stale dist (M1 deferral): alias the workspace
// packages to their TypeScript entry points.
const alias = {
  "@skill-check/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
  "@skill-check/adapters": fileURLToPath(new URL("./packages/adapters/src/index.ts", import.meta.url)),
};

const packagesDir = fileURLToPath(new URL("./packages", import.meta.url));
const packages = readdirSync(packagesDir).filter((name) => statSync(join(packagesDir, name)).isDirectory());

export default defineWorkspace(
  packages.map((pkg) => ({
    test: { name: pkg, root: `packages/${pkg}` },
    resolve: { alias },
  }))
);
