import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join } from "node:path";
import { registerCommand, closeReview, type ExtensionAPI } from "./commands.js";
import { registerTool } from "./tool.js";
import { createHarnessDashboard } from "./dashboard.js";
import { activateHarnessTools, registerAuthoring } from "./authoring.js";
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
  // Contextual deferred tool activation when prompt explicitly asks for skill-harness tools.
  const HARNESS_TRIGGER_RE = /\b(skill_author|skill_check_run|skill_improvement|skill-harness)\b/i;
  (pi as unknown as { on(ev: string, fn: (e: { prompt?: string }) => void): void }).on("before_agent_start", (event) => {
    if (typeof event?.prompt === "string" && HARNESS_TRIGGER_RE.test(event.prompt)) {
      activateHarnessTools(pi);
    }
  });
  pi.on("session_shutdown", async () => {
    removeVersionReporter?.();
    closeReview();
  });
}
