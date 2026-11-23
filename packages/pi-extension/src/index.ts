import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { registerCommand, closeReview, type ExtensionAPI } from "./commands.js";
import { registerTool } from "./tool.js";
import { createHarnessDashboard } from "./dashboard.js";
import { registerAuthoring } from "./authoring.js";
import { registerImprovement } from "./improvement.js";

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
  const dashboard = createHarnessDashboard(pi, loadedVersion ?? "unknown");
  registerCommand(pi, assetsDir, dashboard);
  registerAuthoring(pi);
  registerImprovement(pi);
  registerTool(pi, dashboard);
  pi.on("session_shutdown", async () => {
    removeVersionReporter?.();
    closeReview();
  });
}
