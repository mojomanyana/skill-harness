import { spawn } from "node:child_process";
import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { redactText } from "./capture.js";
import { qualificationSha256 } from "./qualification-config.js";

export interface QualificationOutputReceipt {
  path: string;
  total_bytes: number;
  captured_bytes: number;
  truncated: boolean;
  sha256: string;
}

export interface QualificationBoundedCapture {
  path: string;
  total_bytes: number;
  captured_bytes: number;
  truncated: boolean;
  write(chunk: Buffer): void;
  close(): void;
}

export interface QualificationArtifactAttestation {
  ok: boolean;
  actual: { provider: string; model: string } | null;
  fallback: boolean;
  refused: boolean;
  error: string | null;
}

export function redactQualificationOutput(text: string, secretValues: readonly string[] = []): string {
  let output = text;
  for (const secret of [...new Set(secretValues)].sort((left, right) => right.length - left.length)) {
    if (secret.length >= 8) output = output.split(secret).join("[REDACTED credential]");
  }
  output = output
    .replace(/\b([A-Z][A-Z0-9_]*(?:API_KEY|ACCESS_KEY|SECRET_KEY|AUTH_TOKEN|BEARER_TOKEN|SESSION_TOKEN))\s*[:=]\s*[^\s,;"']+/gi, "$1=[REDACTED credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED credential]")
    .replace(/\b(?:sk|sess|key|token)-[A-Za-z0-9._-]{8,}/gi, "[REDACTED credential]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED credential]");
  return redactText(output);
}

export function openQualificationBoundedCapture(
  path: string,
  limit: number,
  redact: (text: string) => string,
): QualificationBoundedCapture {
  const fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let acceptedRawBytes = 0;
  let closed = false;
  const persist = (text: string) => {
    if (!text) return;
    const sanitized = Buffer.from(redact(text), "utf8");
    const remaining = Math.max(0, limit - state.captured_bytes);
    const part = sanitized.subarray(0, remaining);
    if (part.length > 0) {
      writeSync(fd, part);
      state.captured_bytes += part.length;
      fsyncSync(fd);
    }
    if (sanitized.length > remaining) state.truncated = true;
  };
  const flushLines = () => {
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      persist(pending.slice(0, newline + 1));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  };
  const state: QualificationBoundedCapture = {
    path, total_bytes: 0, captured_bytes: 0, truncated: false,
    write(chunk) {
      state.total_bytes += chunk.length;
      const remainingRaw = Math.max(0, limit - acceptedRawBytes);
      const accepted = chunk.subarray(0, remainingRaw);
      acceptedRawBytes += accepted.length;
      if (accepted.length > 0) {
        pending += decoder.write(accepted);
        flushLines();
      }
      if (chunk.length > remainingRaw) state.truncated = true;
    },
    close() {
      if (closed) return;
      pending += decoder.end();
      // If the raw limit split a line, discard that incomplete tail rather than
      // persisting a credential prefix that cannot be matched as a whole value.
      if (!state.truncated) persist(pending);
      pending = "";
      fsyncSync(fd);
      closeSync(fd);
      closed = true;
    },
  };
  return state;
}

export function qualificationOutputReceipt(
  spoolRoot: string,
  path: string,
  capture: QualificationBoundedCapture,
): QualificationOutputReceipt {
  const bytes = readFileSync(path);
  return {
    path: path.slice(spoolRoot.length + 1),
    total_bytes: capture.total_bytes,
    captured_bytes: bytes.length,
    truncated: capture.truncated,
    sha256: qualificationSha256(bytes),
  };
}

export function verifyQualificationOutputReceipt(spoolRoot: string, receipt: QualificationOutputReceipt): void {
  const path = join(spoolRoot, receipt.path);
  let fd: number | undefined;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`qualification output ${receipt.path} must be a regular non-symlink file`);
    const bytes = readFileSync(fd);
    if (bytes.length !== receipt.captured_bytes || qualificationSha256(bytes) !== receipt.sha256) {
      throw new Error(`qualification output ${receipt.path} digest/size mismatch`);
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function attestQualificationPiJsonl(
  text: string,
  requested: { provider: string; model: string },
): QualificationArtifactAttestation {
  const records: Record<string, unknown>[] = [];
  try {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const value = JSON.parse(line) as unknown;
      if (!plainObject(value)) throw new Error("event is not an object");
      records.push(value);
    }
  } catch {
    return { ok: false, actual: null, fallback: false, refused: false, error: "artifact is not valid JSONL" };
  }
  const fallback = records.some((record) => record.type === "provider_fallback" || record.type === "model_fallback" || Object.hasOwn(record, "fallback_provider") || Object.hasOwn(record, "fallback_model"));
  const messages = records
    .filter((record) => record.type === "message_end" && plainObject(record.message) && record.message.role === "assistant")
    .map((record) => record.message as Record<string, unknown>);
  if (messages.length === 0) return { ok: false, actual: null, fallback, refused: false, error: "artifact has no authoritative assistant provider/model identity" };
  const identities = messages.map((message) => ({ provider: stringValue(message.provider), model: stringValue(message.model) }));
  if (identities.some((identity) => !identity.provider || !identity.model)) return { ok: false, actual: null, fallback, refused: false, error: "artifact assistant identity is missing provider or model" };
  const actual = { provider: identities.at(-1)!.provider!, model: identities.at(-1)!.model! };
  if (fallback) return { ok: false, actual, fallback: true, refused: false, error: "artifact reports provider/model fallback" };
  if (identities.some((identity) => identity.provider !== requested.provider)) return { ok: false, actual, fallback: false, refused: false, error: `provider substitution: requested ${requested.provider}, observed ${actual.provider}` };
  if (identities.some((identity) => identity.model !== requested.model)) return { ok: false, actual, fallback: false, refused: false, error: `model substitution: requested ${requested.model}, observed ${actual.model}` };
  const terminal = messages.at(-1)!;
  const errorMessage = stringValue(terminal.errorMessage) ?? "";
  const refused = terminal.stopReason === "error" && /(?:refus|not supported|not available|subscription|usage limit|unauthor)/i.test(errorMessage);
  if (terminal.stopReason === "error" && !refused) return { ok: false, actual, fallback: false, refused: false, error: errorMessage || "assistant ended with an error" };
  return { ok: true, actual, fallback: false, refused, error: refused ? errorMessage : null };
}

export async function spawnQualificationCapture(
  command: string,
  argv: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout_ms: number; output_limit_bytes: number },
): Promise<{ stdout: string; stderr: string; code: number | null; timed_out: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0), timedOut = false;
    const append = (current: Buffer, chunk: Buffer) => Buffer.concat([current, chunk]).subarray(0, options.output_limit_bytes);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, options.timeout_ms);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), code, timed_out: timedOut }); });
  });
}

function plainObject(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
