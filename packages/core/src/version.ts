import { createRequire } from "node:module";

/**
 * The version of the harness that is running, read from this package's own
 * `package.json`.
 *
 * Why this exists: `schema` is the wrong sentinel for "can these two numbers be
 * compared". 0.2.1 → 0.3.0 kept `results.yaml` at `schema: 2` while changing what
 * a verdict *means* — the judge started seeing the staged diff, and needle gates
 * started matching changed lines rather than raw diff text. A record that says
 * only `schema: 2` cannot tell you which of those it was graded under, and a stale
 * global install produces plausible-looking numbers with no warning.
 *
 * `createRequire` rather than a JSON import: an `import ... from
 * "../package.json"` needs `resolveJsonModule` and changes the emit layout under
 * `tsc -b` (the JSON is copied into `dist/`, shifting relative depths). A runtime
 * require resolves `../package.json` against this module's own location, which is
 * the package root in both the source tree (`src/version.ts`) and the published
 * build (`dist/version.js`).
 */
const require = createRequire(import.meta.url);
export const HARNESS_VERSION: string = (require("../package.json") as { version: string }).version;
