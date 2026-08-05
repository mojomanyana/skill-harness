import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `HARNESS_VERSION` reads `../package.json` relative to its own module location.
 * In `@skill-harness/core` that is core's manifest — but this extension ships as a
 * single esbuild bundle at `packages/pi-extension/dist/index.js`, so at runtime the
 * same expression resolves to **pi-extension's** manifest instead.
 *
 * That is fine as long as the two versions move together, which the release sweep
 * does. This test is what makes "as long as" true: if they ever diverge, every
 * `harness_version` recorded by an extension-driven run misreports which harness
 * produced the numbers — the exact provenance the field exists to give. Cheap
 * guard, and it also catches the version/pin drift that poisoned 0.3.1.
 */
describe("pi-extension version moves in lockstep with core", () => {
  const version = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8")).version;

  test("the bundled extension would report core's version", () => {
    expect(version("../package.json")).toBe(version("../../core/package.json"));
  });
});
