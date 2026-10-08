import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Tests must exercise src, not stale dist (M1 deferral): alias the workspace
// packages to their TypeScript entry points.
const alias = {
  "@skill-harness/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
  "@skill-harness/adapters": fileURLToPath(new URL("./packages/adapters/src/index.ts", import.meta.url)),
  "@skill-harness/cli/serve": fileURLToPath(new URL("./packages/cli/src/serve.ts", import.meta.url)),
  "@skill-harness/cli": fileURLToPath(new URL("./packages/cli/src/cli.ts", import.meta.url)),
};

const packagesDir = fileURLToPath(new URL("./packages", import.meta.url));
const tempCleanup = fileURLToPath(new URL("./scripts/vitest-temp-cleanup.mjs", import.meta.url));
const packages = readdirSync(packagesDir).filter((name) => statSync(join(packagesDir, name)).isDirectory());

// Vitest 4 no longer discovers vitest.workspace.ts and reduced default excludes.
// Preserve project boundaries, source aliases, and generated-output exclusions.
const exclude = [...configDefaults.exclude, "**/dist/**", "**/coverage/**"];

export default defineConfig({
  test: {
    projects: [
      ...packages.map((pkg) => ({
        test: { name: pkg, root: `packages/${pkg}`, globalSetup: tempCleanup, exclude },
        resolve: { alias },
      })),
      { test: { name: "decision-shadow", root: "experiments/decision-shadow", globalSetup: tempCleanup, exclude } },
    ],
  },
});
