import type { SanitizedArgs } from "./capture-trace-types.js";

/** Values longer than this are truncated rather than persisted whole. */
export const MAX_VALUE_CHARS = 2000;

const REDACTED = "[redacted]";
const SECRET_KEY = /^(.*[-_])?(password|passwd|secret|token|api[-_]?key|apikey|auth|authorization|credential|private[-_]?key|access[-_]?key|session[-_]?key)([-_].*)?$/i;
const SECRET_VALUE: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi,
];

export function redactText(input: string, homeDir?: string): string {
  let out = input;
  out = out.replace(SECRET_VALUE[SECRET_VALUE.length - 1], `$1${REDACTED}@`);
  for (const re of SECRET_VALUE.slice(0, -1)) out = out.replace(re, REDACTED);
  if (homeDir && homeDir.length > 1) out = out.split(homeDir).join("~");
  return out;
}

export function truncate(input: string, max = MAX_VALUE_CHARS): string {
  if (input.length <= max) return input;
  return `${input.slice(0, max)}… [truncated ${input.length - max} chars]`;
}

export function redactArgs(args: unknown, homeDir?: string, depth = 0): SanitizedArgs {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return {};
  const out: SanitizedArgs = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = redactValue(value, homeDir, depth);
  }
  return out;
}

function redactValue(value: unknown, homeDir: string | undefined, depth: number): unknown {
  if (typeof value === "string") return truncate(redactText(value, homeDir));
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 3) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redactValue(v, homeDir, depth + 1));
  if (typeof value === "object") return redactArgs(value, homeDir, depth + 1);
  return String(value);
}
