/**
 * Provider-side failure detection.
 *
 * A provider outage is INFRASTRUCTURE, never a model verdict. Measured 2026-08-22:
 * an invalidated `openai-codex` OAuth token makes pi report
 * `stopReason: "error"` with a `provider_transport_failure` diagnostic and **exit 0**
 * in `--mode json`, and exit 1 with `Encountered invalidated oauth token for user,
 * failing request` on stderr in text mode. Neither path was classified, so a wave
 * against a dead token produced model FAILs shaped exactly like findings.
 *
 * Two entry points because the two run paths surface it differently, and the
 * structured one is the WEAKER signal — it hides the real message behind a generic
 * transport error and exits 0. Do not assume `--structured` improves diagnosis.
 */

/**
 * Written into a transcript by the adapter when pi failed provider-side, so the
 * text path can carry a machine-readable signal through a `string` return without
 * widening `HarnessAdapter.run`. Read back by `providerFailureFromTranscript`.
 *
 * The marker must not be forgeable by a model that types the same words into its
 * answer — and a verdict is what hangs on it, since a forged marker converts a
 * would-be FAIL into ERROR and (via `judgeOneRep`'s short-circuit) permanently
 * suppresses the judge on every later re-grade. Line-anchoring alone does not do
 * that: nothing stops a model emitting a newline and then the marker.
 *
 * So position, not spelling, is the guarantee. The marker is written ONLY into the
 * transcript PREAMBLE — everything before the first `>>> ` turn header — which the
 * adapter composes before any model output exists. There is no ordering by which a
 * model's text can land there. See `withProviderFailure` (write) and
 * `providerFailureFromTranscript` (read); both live here so the two halves of the
 * convention cannot drift apart.
 */
export const PROVIDER_FAILURE_MARKER = "[skill-harness] provider failure:";

/**
 * The adapters' shared turn-header prefix (`>>> USER:` / `>>> USER (turn n/m):`),
 * which is where the preamble ends and model-influenced content begins.
 */
const TURN_HEADER_PREFIX = ">>> ";

/**
 * Prefix `transcript` with the provider-failure marker, or return it unchanged.
 *
 * The one supported way to write the marker: it must precede the first turn header
 * to be readable back, and putting the rule next to the reader keeps a future
 * adapter from re-introducing the forgeable placement.
 */
export function withProviderFailure(transcript: string, failure: string | null): string {
  return failure ? `${PROVIDER_FAILURE_MARKER} ${failure}\n\n${transcript}` : transcript;
}

/** Diagnostic types that mean the provider never ran the request. */
const FAILURE_DIAGNOSTICS = new Set(["provider_transport_failure"]);

interface Diagnostic {
  type?: unknown;
  error?: { message?: unknown } | null;
}

/**
 * A provider failure named by one `pi --mode json` line, or null.
 *
 * Fail-closed on the diagnostic, fail-open on the parse: an unreadable line is not
 * evidence of a failure, and throwing here would abort a wave over one bad line.
 */
export function providerFailureFromJsonLine(line: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const message = (parsed as { message?: Record<string, unknown> } | null)?.message;
  if (!message || typeof message !== "object") return null;
  const diagnostics = (message as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(diagnostics)) return null;
  for (const raw of diagnostics as Diagnostic[]) {
    if (typeof raw?.type !== "string" || !FAILURE_DIAGNOSTICS.has(raw.type)) continue;
    const provider = typeof (message as { provider?: unknown }).provider === "string"
      ? (message as { provider: string }).provider
      : "unknown provider";
    const detail = typeof raw.error?.message === "string" ? raw.error.message : raw.type;
    return `${provider}: ${detail}`;
  }
  return null;
}

/**
 * The failure the adapter recorded in a transcript's preamble, or null.
 *
 * Scanning STOPS at the first turn header. Everything from there on is model
 * output or interleaved with it, so a marker found there is not evidence the
 * provider failed — it is evidence the model typed the words.
 */
export function providerFailureFromTranscript(transcript: string): string | null {
  for (const line of transcript.split("\n")) {
    if (line.startsWith(TURN_HEADER_PREFIX)) return null;
    if (line.startsWith(PROVIDER_FAILURE_MARKER)) return line.slice(PROVIDER_FAILURE_MARKER.length).trim();
  }
  return null;
}
