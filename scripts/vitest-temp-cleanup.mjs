import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const KEY = Symbol.for("skill-harness.vitest-temp-cleanup");

/** Route this Vitest project's temp allocations into one invocation-owned root. */
export default function setup() {
  let state = globalThis[KEY];
  if (!state) {
    const previous = process.env.TMPDIR;
    const root = mkdtempSync(join(tmpdir(), "skill-harness-vitest-"));
    state = globalThis[KEY] = { active: 0, previous, root };
    process.env.TMPDIR = root;
  }
  state.active += 1;
  return () => {
    state.active -= 1;
    if (state.active !== 0) return;
    if (state.previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = state.previous;
    rmSync(state.root, { recursive: true, force: true });
    delete globalThis[KEY];
  };
}
