import { Type } from "typebox";
import type { HarnessAdapter } from "@skill-check/core";
import type { ExtensionAPI } from "./commands.js";
import { resolveSkillDir, runViaExtension, type Scorecard } from "./runner.js";

export const skillCheckRunTool = {
  name: "skill_check_run",
  label: "Run skill-check",
  description: "Run a skill's scenarios and return the scorecard (grade, per-scenario verdicts, failed transcripts). Use after editing a skill to validate it.",
  promptGuidelines: ["Use skill_check_run after editing a skill to validate it against its scenarios."],
  parameters: Type.Object({
    skill: Type.Optional(Type.String({ description: "skill dir/name; defaults to the current project" })),
    model: Type.Optional(Type.String({ description: "provider:model token under test" })),
    reps: Type.Optional(Type.Number({ description: "run each scenario N times" })),
    mode: Type.Optional(Type.String({ description: "red | green | force" })),
  }),
  async execute(
    _id: string,
    params: { skill?: string; model?: string; reps?: number; mode?: string },
    _signal: AbortSignal,
    onUpdate: ((update: { content: { type: "text"; text: string }[] }) => void) | undefined,
    ctx: { cwd: string; __adapter?: HarnessAdapter }
  ): Promise<{ content: { type: "text"; text: string }[]; details: Scorecard }> {
    const skillDir = resolveSkillDir(ctx.cwd, params.skill);
    const card: Scorecard = await runViaExtension({
      skillDir,
      model: params.model,
      reps: params.reps,
      mode: params.mode as "red" | "green" | "force" | undefined,
      adapter: ctx.__adapter,
      timestamp: new Date().toISOString(),
      log: (m) => onUpdate?.({ content: [{ type: "text", text: m }] }),
    });
    const summary = `${card.skill} ${card.grade.letter} (${card.grade.pct}%) — ${card.grade.ship ? "SHIP" : "NOT READY"}\n`
      + card.scenarios.map((s) => `  ${s.id}: ${s.suspect ? "? (suspect)" : s.verdict}`).join("\n")
      + (card.failedTranscripts.length ? `\nfailed transcripts:\n${card.failedTranscripts.join("\n")}` : "");
    return { content: [{ type: "text", text: summary }], details: card };
  },
};

export function registerTool(pi: ExtensionAPI): void {
  pi.registerTool(skillCheckRunTool);
}
