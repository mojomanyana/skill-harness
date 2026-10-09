import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { registerCommand, closeReview, type ExtensionAPI } from "./commands.js";
import { registerTool } from "./tool.js";
import { createJevController } from "./jev-session.js";
import { registerJevAdvice } from "./jev-advice.js";
import { registerJevControl } from "./jev-control.js";

/**
 * pi extension entry point. Registers the `/skill-harness` command and the
 * `skill_check_run` tool, and wires up review-server cleanup on shutdown.
 *
 * `assetsDir` is computed relative to THIS module's location so it resolves
 * correctly both from source (src/index.ts, run via tsx/ts-node) and from the
 * committed esbuild bundle (dist/index.js). In both layouts the module lives
 * one directory below the package root (`packages/pi-extension/{src,dist}/`),
 * which itself lives two below the repo root (`packages/pi-extension/`) —
 * three levels total — so `../../../assets` from either location lands on
 * the repo-root `assets/`.
 */
export default function (pi: ExtensionAPI): void {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const assetsDir = basename(dirname(moduleDir)) === "skill-harness"
    ? join(moduleDir, "..", "assets")
    : join(moduleDir, "..", "..", "..", "assets");
  const packageRoot = basename(dirname(moduleDir)) === "skill-harness" ? join(moduleDir, "..") : join(moduleDir, "..", "..", "..");
  let loadedVersion: string | undefined;
  try {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    if (["skill-harness", "skill-harness-monorepo"].includes(manifest.name)) loadedVersion = manifest.version;
  } catch { /* Optional diagnostic only. */ }
  const removeVersionReporter = pi.events?.on("pi-daddy:ecosystem-versions:v1", request => {
    const report = (request as { report?: unknown } | null)?.report;
    if (typeof report === "function" && typeof loadedVersion === "string") report({ id: "skill-harness", version: loadedVersion, root: packageRoot });
  });
  const jev = createJevController(pi);
  registerCommand(pi, assetsDir, jev.command);
  registerJevAdvice(pi, jev);
  registerJevControl(pi, jev);
  registerTool(pi);
  pi.on("session_shutdown", async () => {
    removeVersionReporter?.();
    closeReview();
  });
}
