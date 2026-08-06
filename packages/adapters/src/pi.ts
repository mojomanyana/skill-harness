import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { HarnessAdapter, RunReq, JudgeReq, RunMode } from "@skill-harness/core";
import { exec, onPath, envNum } from "@skill-harness/core";

const PI_TIMEOUT_MS = envNum("PI_TIMEOUT_MS", 300_000);

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
function skillFlags(mode: RunMode, skillDir: string): string[] {
  switch (mode) {
    case "red":
      return ["--no-skills"];
    case "green":
      return ["--skill", requireSkillDir(skillDir, mode)];
    case "force": {
      const body = readFileSync(join(requireSkillDir(skillDir, mode), "SKILL.md"), "utf8");
      return ["--no-skills", "--append-system-prompt", body];
    }
  }
}

function header(turnNo: number, total: number, text: string): string {
  const label = total === 1 ? "USER" : `USER (turn ${turnNo}/${total})`;
  return `>>> ${label}:\n${text}\n`;
}

export const piAdapter: HarnessAdapter = {
  name: "pi",

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
      "--provider",
      req.model.provider,
      "--model",
      req.model.model,
    ];
    // An agent-file run IS the system prompt: no skill activation, whatever the mode.
    const flags = req.systemPromptFile
      ? ["--no-skills", "--append-system-prompt", readFileSync(req.systemPromptFile, "utf8")]
      : skillFlags(req.mode, req.skillDir);
    const total = req.turns.length;
    const parts: string[] = [];

    if (total === 1) {
      const args = [...flags, ...common, "--no-session", "-p", req.turns[0]];
      const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
      parts.push(header(1, 1, req.turns[0]));
      parts.push(`<<< ASSISTANT:\n${r.stdout.trim()}\n`);
      if (r.code !== 0) parts.push(`[pi exited ${r.code}]\n${r.stderr.trim()}\n`);
      return parts.join("\n");
    }

    const session = mkdtempSync(join(tmpdir(), "sc-pi-session-"));
    for (let i = 0; i < total; i++) {
      const turnFlags = i === 0 ? ["--session-dir", session] : ["--session-dir", session, "-c"];
      const args = [...flags, ...common, ...turnFlags, "-p", req.turns[i]];
      const r = await exec("pi", args, { cwd: req.cwd, timeoutMs: PI_TIMEOUT_MS });
      parts.push(header(i + 1, total, req.turns[i]));
      parts.push(`<<< ASSISTANT:\n${r.stdout.trim()}\n`);
      if (r.code !== 0) parts.push(`[pi exited ${r.code} on turn ${i + 1}]\n${r.stderr.trim()}\n`);
    }
    return parts.join("\n");
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
