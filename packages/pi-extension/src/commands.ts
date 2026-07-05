import { dirname, join } from "node:path";
import { loadSpec, regradeRun, type HarnessAdapter } from "@skill-check/core";
import { getAdapter } from "@skill-check/adapters";
import { serveReview, type ServeHandle } from "@skill-check/cli/serve";
import { resolveSkillDir, runViaExtension } from "./runner.js";

/**
 * Minimal structural stand-in for `@earendil-works/pi-coding-agent`'s
 * `ExtensionAPI`/command-handler `ctx` — that package is a peer dependency
 * only (not installed in this workspace; see packages/pi-extension/package.json),
 * so importing its types here would fail module resolution under `tsc -b`.
 * Only the subset actually used is modeled; Task 7 (which bundles against the
 * real pi types via the build's externals) should reconcile/replace this.
 */
export interface ExtensionAPI {
  registerCommand(name: string, def: { description: string; handler: (args: string, ctx: CmdCtx) => Promise<void> }): void;
  registerTool(tool: unknown): void;
}

export interface CmdCtx {
  cwd: string;
  hasUI: boolean;
  ui: {
    notify(msg: string, level?: "info" | "warning" | "error"): void;
    setStatus?(key: string, msg: string): void;
  };
}

const USAGE = "usage: /skill-check run [skill] [--model p:m] [--reps N] [--mode red|green|force] | judge [run-dir] | review [skill]";

/** Minimal arg tokenizer: subcommand + positional args + `--key value` flags. */
function parse(argstr: string): { sub: string; positional: string[]; flags: Record<string, string> } {
  const tokens = argstr.trim().length ? argstr.trim().split(/\s+/) : [];
  const [sub = "", ...rest] = tokens;
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    if (tok.startsWith("--")) {
      const key = tok.slice(2);
      const value = rest[++i] ?? "";
      flags[key] = value;
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
      model: flags.model,
      reps: flags.reps ? Number(flags.reps) : undefined,
      mode: flags.mode as "red" | "green" | "force" | undefined,
      adapter,
      judge: flags.judge,
      timestamp: nowIso(),
      log: (m) => { if (ctx.hasUI) ctx.ui.setStatus?.("skill-check", m); }, // live footer only in TUI
    });
    say(ctx, `${card.skill} ${card.grade.letter} (${card.grade.pct}%) ${card.grade.ship ? "SHIP" : "NOT READY"}`, card.grade.ship ? "info" : "warning");
    for (const s of card.scenarios) say(ctx, `  ${s.id}: ${s.suspect ? "?" : s.verdict}`);
    if (card.failedTranscripts.length) say(ctx, `failed transcripts:\n${card.failedTranscripts.join("\n")}`);
    return;
  }

  if (sub === "judge") {
    const runDir = positional[0] ?? ctx.cwd;
    // derive the spec from the RUN DIR's own skill (results are at <skillDir>/tests/results/<tag>/<ts>/),
    // mirroring cmdGrade (cli.ts:183) — NOT from cwd, which could be a different skill.
    const testsDir = dirname(dirname(dirname(runDir))); // <skillDir>/tests
    const spec = loadSpec(join(testsDir, "specification.yaml"));
    const results = await regradeRun({
      runDir, spec, adapter: adapter ?? getAdapter("pi"),
      judge: { provider: "anthropic", model: "claude-opus-4-8" }, specDir: testsDir, now: nowIso,
    });
    say(ctx, `re-judged ${runDir}: ${results.effective_grade.letter} (${results.effective_grade.pct}%)`);
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
  pi.registerCommand("skill-check", {
    description: "Run, judge, or review a skill's scenarios",
    handler: async (args, ctx) => {
      const h = await handleSkillCheck(args, ctx, { assetsDir });
      if (h) { reviewHandle?.close(); reviewHandle = h; } // keep the latest review server for shutdown cleanup
    },
  });
}
