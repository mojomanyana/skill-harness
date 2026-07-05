import type { HarnessAdapter } from "@skill-harness/core";
import { piAdapter } from "./pi.js";

/**
 * Registered harnesses. pi is the only one (per project scope). The interface
 * (`HarnessAdapter`) is the extension point — add an entry here to support more.
 */
const ADAPTERS: Record<string, HarnessAdapter> = {
  pi: piAdapter,
};

export function getAdapter(name: string): HarnessAdapter {
  const a = ADAPTERS[name];
  if (!a) {
    throw new Error(`unknown harness \`${name}\` (available: ${Object.keys(ADAPTERS).join(", ")})`);
  }
  return a;
}

export { piAdapter };
