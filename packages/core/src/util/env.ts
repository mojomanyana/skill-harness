/**
 * Environment-variable resolution for the `SKILL_HARNESS_*` namespace.
 *
 * The tuning vars predate the skill-check → skill-harness rename and shipped in
 * 0.1.x under a `SKILL_CHECK_` prefix. Anyone who set one of those in a shell
 * profile or CI config must keep working, so every name is resolved new-first
 * with a legacy fallback and a one-time notice pointing at the new spelling.
 *
 * Call these with the *suffix* only (`"PI_TIMEOUT_MS"`), never a full name — the
 * prefixes are this module's business, which is what keeps ROADMAP rule 5 (no
 * new `SKILL_CHECK_*` names) enforceable by grepping for the prefix.
 */

const NEW_PREFIX = "SKILL_HARNESS_";
const LEGACY_PREFIX = "SKILL_CHECK_";

/** Suffixes already warned about, so a module-scope read doesn't nag per call. */
const warned = new Set<string>();

/** Test seam: clears the once-per-suffix warning memo. */
export function __resetEnvWarnings(): void {
  warned.clear();
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  process.stderr.write(`skill-harness: ${message}\n`);
}

/**
 * Resolve `SKILL_HARNESS_<suffix>`, falling back to `SKILL_CHECK_<suffix>`.
 *
 * An empty value counts as unset: exporting a var as `""` is a common way to
 * neutralize it in CI, and honoring it as "set" would make the legacy fallback
 * unreachable for exactly those users.
 */
export function readEnv(suffix: string): string | undefined {
  const fresh = process.env[NEW_PREFIX + suffix];
  if (fresh) return fresh;

  const legacy = process.env[LEGACY_PREFIX + suffix];
  if (legacy) {
    warnOnce(
      `legacy:${suffix}`,
      `${LEGACY_PREFIX}${suffix} is the pre-rename name and still honored; rename it to ${NEW_PREFIX}${suffix}.`,
    );
    return legacy;
  }
  return undefined;
}

/**
 * Resolve a positive-integer var, e.g. a timeout in ms.
 *
 * A set-but-unparseable value warns and yields `fallback` rather than passing
 * `NaN` down: the pre-rename `Number(process.env.X ?? default)` turned a typo
 * into a NaN timeout, which silently disabled the timeout it was feeding.
 */
export function envNum(suffix: string, fallback: number): number {
  const raw = readEnv(suffix);
  if (raw === undefined) return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    warnOnce(
      `malformed:${suffix}`,
      `${NEW_PREFIX}${suffix}=${JSON.stringify(raw)} is not a positive number; using ${fallback}.`,
    );
    return fallback;
  }
  return n;
}

/** Resolve a boolean var: any non-empty value is on. */
export function envFlag(suffix: string): boolean {
  return readEnv(suffix) !== undefined;
}
