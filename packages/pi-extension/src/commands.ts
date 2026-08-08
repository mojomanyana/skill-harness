import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, relative } from "node:path";
import { loadSpec, regradeRun, readResults, parseModelRef, defaultJudge, assertJudgeAllowed, type HarnessAdapter, type SessionEntry, computeCoverage, formatCoverage, selectAffected, formatAffected, gitDiff, exec } from "@skill-harness/core";
import { getAdapter } from "@skill-harness/adapters";
import { serveReview, type ServeHandle } from "@skill-harness/cli/serve";
import { resolveSkillDir, runViaExtension } from "./runner.js";
import { runCapture } from "./capture-cmd.js";

/**
 * Minimal structural stand-in for `@earendil-works/pi-coding-agent`'s
 * `ExtensionAPI`/command-handler `ctx` — that package is a peer dependency
 * only (not installed in this workspace; see packages/pi-extension/package.json),
 * so importing its types here would fail module resolution under `tsc -b`.
 * Only the subset actually used is modeled. This is intentional and
 * permanent, not a placeholder pending Task 7: pi is never installed in this
 * workspace, pi supplies the real `ExtensionAPI` type at runtime, and the
 * esbuild bundle marks `@earendil-works/*` external (see build.mjs), so this
 * structural type only needs to satisfy `tsc -b` here.
 */
export interface ExtensionAPI {
  registerCommand(name: string, def: { description: string; handler: (args: string, ctx: CmdCtx) => Promise<void> }): void;
  registerTool(tool: unknown): void;
  on(event: "session_shutdown", handler: () => Promise<void> | void): void;
}

export interface CmdCtx {
  cwd: string;
  hasUI: boolean;
  ui: {
    notify(msg: string, level?: "info" | "warning" | "error"): void;
    setStatus?(key: string, msg: string): void;
    /** Interactive primitives, present only in the TUI — `capture` requires them. */
    select?(prompt: string, choices: string[]): Promise<number | null>;
    input?(prompt: string, initial?: string): Promise<string | null>;
    editor?(prompt: string, initial: string): Promise<string | null>;
    confirm?(prompt: string): Promise<boolean>;
  };
  /** Present in a real pi session; absent under `-p`/json, where capture is refused. */
  sessionManager?: {
    getBranch(): unknown[];
    getSessionPath?(): string;
  };
  isStreaming?(): boolean;
}

const USAGE = "usage: /skill-harness run [skill] [--model p:m] [--reps N] [--mode red|green|force] [--canary] [--judge p:m] | judge [run-dir] | review [skill] | capture [skill] | coverage [skill] | affected [skill] [--base ref]";

/** Minimal arg tokenizer: subcommand + positional args + `--key value` flags. A flag with no following value (or one followed by another `--flag`) is left unset, so callers' `?? default` fallbacks apply. */
function parse(argstr: string): { sub: string; positional: string[]; flags: Record<string, string> } {
  const tokens = argstr.trim().length ? argstr.trim().split(/\s+/) : [];
  const [sub = "", ...rest] = tokens;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        // A bare `--flag` is presence, recorded as "". It used to be dropped
        // entirely, which silently ignored boolean flags like `--canary` — the
        // worst outcome for a flag whose whole job is to refuse a bad run.
        flags[key] = "";
      }
    } else {
      positional.push(tok);
    }
  }
  return { sub, positional, flags };
}

/** Emit a line to the session UI when available, else stdout (print/json/-p mode has ctx.hasUI === false). */
function say(ctx: CmdCtx, msg: string, level: "info" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) ctx.ui.notify(msg, level);
  else console.log(msg);
}

export async function handleSkillCheck(
  argstr: string,
  ctx: CmdCtx,
  opts?: { adapter?: HarnessAdapter; assetsDir?: string }
): Promise<ServeHandle | void> {
  const { sub, positional, flags } = parse(argstr);
  const adapter = opts?.adapter;
  const nowIso = () => new Date().toISOString();

  if (sub === "run") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const card = await runViaExtension({
      skillDir,
      // `|| undefined`: a valueless `--model` / `--mode` must fall back to the
      // default rather than pass "" down as if it were a token.
      model: flags.model || undefined,
      reps: flags.reps ? Number(flags.reps) : undefined,
      mode: (flags.mode || undefined) as "red" | "green" | "force" | undefined,
      canary: flags.canary !== undefined && flags.canary !== "false",
      adapter,
      judge: flags.judge || undefined,
      timestamp: nowIso(),
      log: (m) => { if (ctx.hasUI) ctx.ui.setStatus?.("skill-harness", m); }, // live footer only in TUI
    });
    say(ctx, `${card.skill} ${card.grade.letter} (${card.grade.pct}%) ${card.grade.ship ? "SHIP" : "NOT READY"}`, card.grade.ship ? "info" : "warning");
    for (const s of card.scenarios) say(ctx, `  ${s.id}: ${s.suspect ? "?" : s.verdict}`);
    if (card.failedTranscripts.length) say(ctx, `failed transcripts:\n${card.failedTranscripts.join("\n")}`);
    return;
  }

  if (sub === "judge") {
    const runDir = resolve(ctx.cwd, positional[0] ?? ".");
    // derive the spec from the RUN DIR's own skill (results are at <skillDir>/tests/results/<tag>/<ts>/),
    // mirroring cmdGrade (cli.ts:183) — NOT from cwd, which could be a different skill.
    const testsDir = dirname(dirname(dirname(runDir))); // <skillDir>/tests
    const spec = loadSpec(join(testsDir, "specification.yaml"));
    // Re-judge with the run's RECORDED judge + harness (parity with cmdGrade,
    // cli.ts:186-192 — M6's whole premise is CLI/extension parity); an
    // explicit --judge flag still wins, and a run with no prior results.yaml
    // falls back to the default judge.
    const prev = existsSync(join(runDir, "results.yaml")) ? readResults(runDir) : null;
    const judge = flags.judge ? parseModelRef(flags.judge) : (prev?.judge ?? parseModelRef(defaultJudge()));
    assertJudgeAllowed(judge, {
      source: flags.judge ? "--judge" : prev?.judge ? "the run's recorded judge" : "the default judge",
    });
    const results = await regradeRun({
      runDir, spec, adapter: adapter ?? getAdapter(prev?.harness ?? "pi"),
      judge, specDir: testsDir, now: nowIso,
    });
    say(ctx, `re-judged ${runDir}: ${results.effective_grade.letter} (${results.effective_grade.pct}%)`);
    return;
  }

  if (sub === "coverage") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const specDir = dirname(specPath);
    const report = computeCoverage({
      specDir,
      scenarios: spec.scenarios,
      baseFiles: [relative(specDir, join(skillDir, "SKILL.md")).split("\\").join("/")],
    });
    say(ctx, formatCoverage(report, spec.skill), report.broken.length ? "warning" : "info");
    return;
  }

  if (sub === "affected") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const specPath = join(skillDir, "tests", "specification.yaml");
    const spec = loadSpec(specPath);
    const base = flags.base || "HEAD";
    const rev = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: dirname(specPath), timeoutMs: 30_000 });
    if (rev.code !== 0) {
      say(ctx, "affected needs a git repository to diff against", "error");
      return;
    }
    const repoRoot = rev.stdout.trim();
    const result = selectAffected({
      scenarios: spec.scenarios,
      specDir: dirname(specPath),
      diff: await gitDiff(repoRoot, base),
      repoRoot,
    });
    say(ctx, formatAffected(result, spec.scenarios.length));
    // Deliberately reports and stops. Spending is a separate, explicit act:
    // `/skill-harness run <skill> --only <ids>` with the list above.
    return;
  }

  if (sub === "capture") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const ui = ctx.ui;
    // Capture is a conversation with the author: without the interactive
    // primitives there is no preview step, and preview-before-write is the
    // control that keeps a secret out of a committed file.
    if (!ctx.sessionManager || !ui.select || !ui.input || !ui.editor || !ui.confirm) {
      say(ctx, "capture needs an interactive pi session (it is unavailable under -p / --mode json)", "error");
      return;
    }
    const sm = ctx.sessionManager;
    const result = await runCapture(skillDir, {
      cwd: ctx.cwd,
      ui: {
        select: ui.select.bind(ui),
        input: ui.input.bind(ui),
        editor: ui.editor.bind(ui),
        confirm: ui.confirm.bind(ui),
        say: (m) => say(ctx, m),
      },
      sessionEntries: () => sm.getBranch() as SessionEntry[],
      sessionPath: () => sm.getSessionPath?.() ?? "",
      isStreaming: () => ctx.isStreaming?.() ?? false,
      homeDir: homedir(),
      now: nowIso,
      runOnly: async (dir, scenarioId) => {
        const card = await runViaExtension({
          skillDir: dir,
          only: [scenarioId],
          adapter,
          timestamp: nowIso(),
          log: (m) => { if (ctx.hasUI) ctx.ui.setStatus?.("skill-harness", m); },
        });
        // Deliberately no grade line: a --only run is partial and cannot ship-grade,
        // so printing a letter here would invite reading it as one.
        return card.scenarios.map((s) => `  ${s.id}: ${s.suspect ? "?" : s.verdict}`).join("\n");
      },
    });
    if (result.status !== "cancelled") say(ctx, `capture ${result.status}: ${result.capture?.id}`);
    return;
  }

  if (sub === "review") {
    const skillDir = resolveSkillDir(ctx.cwd, positional[0]);
    const spec = loadSpec(join(skillDir, "tests", "specification.yaml"));
    const handle = await serveReview({
      skillDir, skillName: spec.skill, port: 0, open: false, adapter,
      assetsDir: opts?.assetsDir, // threaded from index.ts via the closure, never off ctx
    });
    say(ctx, `review server: http://127.0.0.1:${handle.port}/`);
    return handle; // index.ts registers a session_shutdown to close it
  }

  say(ctx, USAGE);
}

let reviewHandle: ServeHandle | null = null;

/** Close any running review server (called from index.ts's session_shutdown). */
export function closeReview(): void {
  reviewHandle?.close();
  reviewHandle = null;
}

export function registerCommand(pi: ExtensionAPI, assetsDir?: string): void {
  pi.registerCommand("skill-harness", {
    description: "Run, judge, or review a skill's scenarios",
    handler: async (args, ctx) => {
      const h = await handleSkillCheck(args, ctx, { assetsDir });
      if (h) { reviewHandle?.close(); reviewHandle = h; } // keep the latest review server for shutdown cleanup
    },
  });
}
