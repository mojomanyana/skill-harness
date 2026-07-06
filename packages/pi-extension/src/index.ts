import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { registerCommand, closeReview, type ExtensionAPI } from "./commands.js";
import { registerTool } from "./tool.js";

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
  const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "assets");
  registerCommand(pi, assetsDir);
  registerTool(pi);
  pi.on("session_shutdown", async () => {
    closeReview();
  });
}
