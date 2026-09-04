import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessAdapter, RunReq, JudgeReq, RunMode, StructuredRun, ExecutionTraceV1, PromptMechanism } from "@skill-harness/core";
import { runPiJson } from "./pi-json.js";
import { collectTrajectorySources, normalizePiTraces, resequence } from "./trajectory.js";
import { bindPromptObservation, observeProviderPayload, promptCaptureIsTrusted, verifyPromptSummary } from "./prompt-provenance.js";
import { exec, onPath, envNum, traceSha256, withProviderFailure, splitPromptDoc } from "@skill-harness/core";

const PI_TIMEOUT_MS = envNum("PI_TIMEOUT_MS", 300_000);
const PROMPT_CAPTURE_EXTENSION = fileURLToPath(new URL("./prompt-capture-extension.js", import.meta.url));

interface BoundContract { text: string; raw: string; mechanism: PromptMechanism }
function contractFor(req: RunReq): BoundContract {
  if (req.systemPromptFile) { const raw = readFileSync(req.systemPromptFile, "utf8"); return { text: raw, raw, mechanism: "system-prompt-file" }; }
  const raw = readFileSync(join(requireSkillDir(req.skillDir, req.mode), "SKILL.md"), "utf8");
  const body = splitPromptDoc(raw).body;
  if (req.mode === "red") return { text: body, raw, mechanism: "none" };
  return { text: body, raw, mechanism: req.mode === "green" ? "pi-skill" : "append-system-prompt" };
}

const RUNTIME_INJECTION_ENV = ["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES"] as const;
function hasRuntimeInjection(req: RunReq): boolean {
  return Boolean(req.armEnv && Object.keys(req.armEnv).length) || RUNTIME_INJECTION_ENV.some(key => Boolean(process.env[key]));
}

function captureSetup(req: RunReq, env: NodeJS.ProcessEnv | undefined, contract: BoundContract, counter: { value: number }): { env: NodeJS.ProcessEnv | undefined; finish: () => void } {
  if (!req.onPromptObservation) return { env, finish: () => {} };
  // Arbitrary scenario/arm extensions and runtime-injection env execute in Pi's
  // process with full Node authority. Refuse a forgeable positive observation.
  if (!promptCaptureIsTrusted(req.extensions?.length ?? 0, hasRuntimeInjection(req))) return { env, finish: () => {
    const empty = observeProviderPayload({}, contract.text, contract.mechanism, counter.value++);
    req.onPromptObservation?.({ ...empty, status: "ERROR", error: "prompt delivery provenance is unauthenticated when subject extensions or runtime-injection env share Pi's process" });
  } };
  const dir = mkdtempSync(join(tmpdir(), "skill-harness-prompt-"));
  const path = join(dir, "observations.jsonl"), contractPath = join(dir, "contract.json");
  const authenticationKey = randomBytes(32).toString("hex");
  writeFileSync(path, "", { mode: 0o600 });
  writeFileSync(contractPath, JSON.stringify({ text: contract.text, mechanism: contract.mechanism, authentication_key: authenticationKey }), { mode: 0o600 });
  const finish = () => {
    try {
      const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
      const parsed = lines.map(line => { try { return JSON.parse(line) as unknown; } catch { return null; } });
      const records = parsed.slice(0, -1), summary = parsed.at(-1);
      if (!verifyPromptSummary(summary, records.length, authenticationKey)) {
        const empty = observeProviderPayload({}, contract.text, contract.mechanism, counter.value++);
        req.onPromptObservation?.({ ...empty, status: "ERROR", error: "Pi prompt observation log is missing, truncated, replayed, or unauthenticated" });
      } else records.forEach((record, observerRequestIndex) => {
        req.onPromptObservation?.(bindPromptObservation(record, contract.text, contract.mechanism, counter.value++, authenticationKey, observerRequestIndex));
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  return { env: { ...(env ?? process.env), SKILL_HARNESS_PROMPT_CAPTURE_FILE: path, SKILL_HARNESS_PROMPT_CONTRACT_FILE: contractPath }, finish };
}

function observerFlags(req: RunReq): string[] {
  return req.onPromptObservation && promptCaptureIsTrusted(req.extensions?.length ?? 0, hasRuntimeInjection(req)) ? ["--extension", PROMPT_CAPTURE_EXTENSION] : [];
}

/**
 * stderr fragments that mean the provider refused the request, so the run measured
 * nothing about the model. Substring matching on a message pi passes through from
 * the provider — deliberately narrow: a stderr line we cannot classify stays an
 * ordinary non-zero exit, because calling a real model failure "infrastructure"
 * would hide a regression.
 */
const PROVIDER_STDERR_SIGNATURES = [
  "invalidated oauth token",
  "invalid_api_key",
  "insufficient_quota",
];

function providerStderr(stderr: string): string | null {
  const hay = stderr.toLowerCase();
  return PROVIDER_STDERR_SIGNATURES.some((sig) => hay.includes(sig)) ? stderr.trim() : null;
}

/**
 * Refuse to hand pi a skill dir it will silently ignore.
 *
 * Measured on pi 0.83.0: `pi --skill /nonexistent/skilldir -p "hi"` answers
 * normally and exits 0. So a wrong path does not fail a run — it turns every
 * scenario into a no-skill baseline that still looks like a result. Two full waves
 * in the reference corpus scored ≈ their naked-model baseline before a
 * contradictory failure mix gave it away.
 *
 * Returns the ABSOLUTE dir: `discover()` builds `join(root, name)`, so
 * `--skills .` yields a relative path, and pi runs in a neutral cwd of the
 * harness's choosing — a relative `--skill` resolved there points at nothing,
 * which is precisely the case pi swallows.
 */
function requireSkillDir(skillDir: string, mode: RunMode): string {
  const abs = resolve(skillDir);
  const md = join(abs, "SKILL.md");
  const isDir = existsSync(abs) && statSync(abs).isDirectory();
  if (!isDir || !existsSync(md)) {
    throw new Error(
      `mode=${mode} needs a skill directory with a SKILL.md, but ${abs} ${isDir ? "has none" : "is not a directory"}` +
        (abs === skillDir ? "" : ` (given \`${skillDir}\`, resolved against ${process.cwd()})`) +
        ` — pi accepts \`--skill <nonexistent>\` silently (exit 0, a normal answer, no skill in context),` +
        ` so this run would measure a model with no skill and report it as a result.`,
    );
  }
  return abs;
}

/**
 * Skill-activation flags for a given run mode.
 *
 * `green` asks pi to activate the skill and is therefore only as good as pi's
 * delivery: 0.80.x wrapped the prompt with the skill body, 0.83.0 discloses the
 * description and loads the body on demand ("models don't always do this" — pi's
 * own docs). `force` puts SKILL.md in the system prompt, which no pi version has
 * made conditional. Both are checked the same way, because the failure being
 * prevented — a skill dir that isn't there — costs a whole wave either way.
 */
function skillFlags(mode: RunMode, skillDir: string, boundRaw?: string): string[] {
  switch (mode) {
    case "red":
      return ["--no-skills"];
    case "green":
      return ["--skill", requireSkillDir(skillDir, mode)];
    case "force": {
      requireSkillDir(skillDir, mode);
      const body = boundRaw ?? readFileSync(join(resolve(skillDir), "SKILL.md"), "utf8");
      return ["--no-skills", "--append-system-prompt", body];
    }
  }
}

/**
 * Extension flags. `--no-extensions` is ALWAYS present (it already was), and each
 * declared path is added with `--extension`.
 *
 * Measured on pi 0.83.0: `--no-extensions --extension <path>` loads exactly the
 * declared extension and nothing discovered, even with `-a` project-local trust
 * active. Paths are resolved by the caller; a relative one handed to a child
 * process running in a neutral cwd would silently resolve to nothing — the same
 * class of failure as the `--skill` incident.
 */
function extensionFlags(extensions: string[] | undefined): string[] {
  if (!extensions || extensions.length === 0) return [];
  return extensions.flatMap((p) => {
    const abs = resolve(p);
    if (!existsSync(abs)) {
      throw new Error(
        `env.extensions names ${abs}, which does not exist — pi would start without it and the ` +
          `scenario would silently test an agent with no subagent tool at all.`,
      );
    }
    return ["--extension", abs];
  });
}

function header(turnNo: number, total: number, text: string): string {
  const label = total === 1 ? "USER" : `USER (turn ${turnNo}/${total})`;
  return `>>> ${label}:\n${text}\n`;
}

export const piAdapter: HarnessAdapter = {
  name: "pi",
  observesPrompts: true,

  available() {
    return Promise.resolve(onPath("pi"));
  },

  /**
   * `pi --version` (it prints a bare version, e.g. `0.83.0`), recorded in
   * results.yaml as `harness_cli_version`.
   *
   * Null on any failure — a non-zero exit, empty output, or pi missing entirely.
   * A run must not abort because provenance was unavailable, and a fabricated
   * version would be worse than an absent one.
   */
  async version(): Promise<string | null> {
    try {
      const r = await exec("pi", ["--version"], { timeoutMs: 30_000 });
      const line = r.stdout.split("\n")[0]?.trim() ?? "";
      if (r.code !== 0 || line === "") return null;
      // Tolerate a future `pi 1.2.3` / `pi version 1.2.3` shape without losing the
      // bare `0.83.0` one: keep the first version-looking token, else the line.
      return /\d+\.\d+\.\d+\S*/.exec(line)?.[0] ?? line;
    } catch {
      return null;
    }
  },

  /**
   * Run a scenario through pi. Single turn → --no-session -p. Multi turn → a
   * shared --session-dir, -c on every turn after the first. Returns a transcript
   * interleaving user turns with assistant output.
   */
  async run(req: RunReq): Promise<string> {
    const common = [
      "--no-context-files",
      "--no-extensions",
      ...extensionFlags(req.extensions),
      ...observerFlags(req),
      "--provider",
      req.model.provider,
      "--model",
      req.model.model,
    ];
    // Bind bytes once: argv and provenance must describe the same contract even if a file changes mid-run.
    const contract = contractFor(req);
    const flags = req.systemPromptFile
      ? ["--no-skills", "--append-system-prompt", contract.raw]
      : skillFlags(req.mode, req.skillDir, contract.raw);
    const requestCounter = { value: 0 };
    const total = req.turns.length;
    const parts: string[] = [];
    // The arm's env, merged over the harness's own — undefined (not `process.env`)
    // when there is none, so `exec`'s `env: opts.env ?? process.env` inherits
    // normally and the control arm is unaffected.
    const env = req.armEnv ? { ...process.env, ...req.armEnv } : undefined;

    // Collected across turns and written by `withProviderFailure` into the
    // transcript PREAMBLE at the end, never inline after an assistant turn: the
    // preamble is the only region of the transcript the model provably cannot
    // reach, and a marker anywhere else is forgeable by a model that types the
    // words (which would convert a FAIL into ERROR and mute the judge forever).
    let providerFailure: string | null = null;

    if (total === 1) {
      const args = [...flags, ...common, "--no-session", "-p", req.turns[0]];
      const capture = captureSetup(req, env, contract, requestCounter);
      let r;
      try { r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS, env: capture.env }); }
      finally { capture.finish(); }
      parts.push(header(1, 1, req.turns[0]));
      parts.push(`<<< ASSISTANT:\n${r.stdout.trim()}\n`);
      if (r.code !== 0) {
        providerFailure = providerStderr(r.stderr);
        if (!providerFailure) parts.push(`[pi exited ${r.code}]\n${r.stderr.trim()}\n`);
      }
      return withProviderFailure(parts.join("\n"), providerFailure);
    }

    const session = mkdtempSync(join(tmpdir(), "sc-pi-session-"));
    for (let i = 0; i < total; i++) {
      const turnFlags = i === 0 ? ["--session-dir", session] : ["--session-dir", session, "-c"];
      const args = [...flags, ...common, ...turnFlags, "-p", req.turns[i]];
      const capture = captureSetup(req, env, contract, requestCounter);
      let r;
      try { r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS, env: capture.env }); }
      finally { capture.finish(); }
      parts.push(header(i + 1, total, req.turns[i]));
      parts.push(`<<< ASSISTANT:\n${r.stdout.trim()}\n`);
      if (r.code !== 0) {
        const provider = providerStderr(r.stderr);
        // First failure wins, same as the structured path: the turns after an
        // outage are downstream of it, not independent evidence.
        if (provider && providerFailure === null) providerFailure = provider;
        if (!provider) parts.push(`[pi exited ${r.code} on turn ${i + 1}]\n${r.stderr.trim()}\n`);
      }
    }
    return withProviderFailure(parts.join("\n"), providerFailure);
  },

  /**
   * Structured run: same flags, same turn loop, plus `--mode json` and a trace
   * per turn.
   *
   * Shares `skillFlags` and the turn structure with `run()` on purpose — if the
   * two drifted, a trace-gated scenario would be measuring a different delivery
   * than an ungated one, and the gate would be attesting to the wrong execution.
   *
   * The transcript is REBUILT from each turn's final assistant message rather
   * than read from stdout, which is byte-identical to print mode's output (proven
   * on a deterministic prompt; see docs/pi-native-capture-design-2026-08-08.md §2).
   */
  async runStructured(req: RunReq): Promise<StructuredRun> {
    const common = [
      "--no-context-files",
      "--no-extensions",
      ...extensionFlags(req.extensions),
      ...observerFlags(req),
      "--provider",
      req.model.provider,
      "--model",
      req.model.model,
    ];
    const contract = contractFor(req);
    const flags = req.systemPromptFile
      ? ["--no-skills", "--append-system-prompt", contract.raw]
      : skillFlags(req.mode, req.skillDir, contract.raw);
    const requestCounter = { value: 0 };

    const piVersion = await this.version!();
    const total = req.turns.length;
    const traces: ExecutionTraceV1[] = [];
    const parts: string[] = [];
    const session = total === 1 ? null : mkdtempSync(join(tmpdir(), "sc-pi-session-"));
    let providerFailure: string | null = null;
    // Same merge as `run()`: undefined when the arm carries no env, so `spawn`
    // (which treats `undefined` as "inherit") leaves the control arm untouched.
    const env = req.armEnv ? { ...process.env, ...req.armEnv } : undefined;

    for (let i = 0; i < total; i++) {
      const turnFlags =
        session === null
          ? ["--no-session"]
          : i === 0
            ? ["--session-dir", session]
            : ["--session-dir", session, "-c"];
      const args = [...flags, ...common, "--mode", "json", ...turnFlags, "-p", req.turns[i]];

      const capture = captureSetup(req, env, contract, requestCounter);
      let r;
      try {
        r = await runPiJson({
          args,
          cwd: req.cwd,
          timeoutMs: PI_TIMEOUT_MS,
          piVersion,
          subject: req.model,
          scenarioId: req.scenarioId ?? "(unknown)",
          mode: req.mode,
          rep: req.rep ?? 0,
          turn: i,
          homeDir: homedir(),
          env: capture.env,
        });
      } finally { capture.finish(); }

      // A stream with no terminal events at all is not evidence of a clean run.
      // Fail loudly here rather than let an empty trace satisfy a `forbid_calls`
      // gate — "the model called nothing" and "we recorded nothing" must not
      // reach the scorer looking the same.
      if (!r.isComplete) {
        throw new Error(
          `pi --mode json produced no terminal events for turn ${i + 1}/${total}` +
            ` (exit ${r.code}${r.malformedLines ? `, ${r.malformedLines} malformed line(s)` : ""})` +
            (r.stderr.trim() ? `: ${r.stderr.trim()}` : ""),
        );
      }

      if (r.malformedLines > 0) {
        r.trace.capture_errors = [`pi JSONL contained ${r.malformedLines} malformed line(s); absence-based trace assertions are unsafe`];
        r.trace.trace_sha256 = traceSha256(r.trace);
      }
      // Recorded here, written into the transcript preamble by
      // `withProviderFailure` below — not just returned on `providerFailure`: the
      // artifact on disk is the only thing a later `grade`/`regrade` call ever
      // reads (see `judgeOneRep` in core/regrade.ts), and the structured path
      // exits 0 while carrying the evidence, so a field a re-judge never sees
      // leaves it unrecoverable from the saved transcript.
      if (providerFailure === null && r.providerFailure) providerFailure = r.providerFailure;
      traces.push(r.trace);
      parts.push(header(i + 1, total, req.turns[i]));
      parts.push(`<<< ASSISTANT:\n${r.trace.final_text.trim()}\n`);
      if (r.code !== 0) parts.push(`[pi exited ${r.code} on turn ${i + 1}]\n${r.stderr.trim()}\n`);
    }

    const native = req.eventSources?.length
      ? collectTrajectorySources(req.cwd, req.eventSources)
      : { events: [], errors: [] };
    const piEvents = normalizePiTraces(traces);
    const combined = [...piEvents, ...native.events];
    const chronologyErrors: string[] = [];
    if (piEvents.length && native.events.length) {
      if (combined.some((event) => !event.at || !Number.isFinite(Date.parse(event.at)))) {
        chronologyErrors.push("pi/native events cannot be globally ordered because at least one event has no valid `at` timestamp");
      } else {
        const piTimes = new Set(piEvents.map((event) => Date.parse(event.at!)));
        if (native.events.some((event) => piTimes.has(Date.parse(event.at!)))) {
          chronologyErrors.push("pi/native events contain equal timestamps, so strict cross-source order is ambiguous");
        }
      }
    }
    const eventErrors = [...native.errors, ...chronologyErrors];
    return {
      transcript: withProviderFailure(parts.join("\n"), providerFailure),
      traces,
      events: resequence(combined),
      ...(eventErrors.length ? { eventErrors } : {}),
      ...(providerFailure ? { providerFailure } : {}),
    };
  },

  /**
   * Run the judge: no skills, no context files, no session, single prompt.
   * Judge provider `claude-code` routes to the Claude Code CLI (`claude -p`),
   * which authenticates via the user's Claude subscription (OAuth) instead of
   * a provider API key.
   */
  async judge(req: JudgeReq): Promise<string> {
    if (req.model.provider === "claude-code") {
      const args = ["-p", req.prompt, "--model", req.model.model];
      const r = await exec("claude", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
      if (r.stdout.trim().length === 0 && (r.code !== 0 || r.stderr.trim())) {
        return `[judge error: claude exited ${r.code}] ${r.stderr.trim()}`;
      }
      return r.stdout;
    }
    const args = [
      "--no-skills",
      "--no-context-files",
      "--no-extensions",
      "--no-session",
      "--provider",
      req.model.provider,
      "--model",
      req.model.model,
      "-p",
      req.prompt,
    ];
    const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
    // Surface failures: pi writes provider errors (auth, out-of-credits) to stderr
    // and exits non-zero with empty stdout. Pass them through so grading can report.
    if (r.stdout.trim().length === 0 && (r.code !== 0 || r.stderr.trim())) {
      return `[judge error: pi exited ${r.code}] ${r.stderr.trim()}`;
    }
    return r.stdout;
  },
};
