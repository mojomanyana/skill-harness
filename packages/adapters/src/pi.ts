import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessAdapter, RunReq, JudgeReq, RunMode } from "@skill-check/core";
import { exec, onPath } from "@skill-check/core";

const PI_TIMEOUT_MS = Number(process.env.SKILL_CHECK_PI_TIMEOUT_MS ?? 300_000);

/** Skill-activation flags for a given run mode. */
function skillFlags(mode: RunMode, skillDir: string): string[] {
  switch (mode) {
    case "red":
      return ["--no-skills"];
    case "green":
      return ["--skill", skillDir];
    case "force": {
      const body = readFileSync(join(skillDir, "SKILL.md"), "utf8");
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
    const flags = skillFlags(req.mode, req.skillDir);
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
