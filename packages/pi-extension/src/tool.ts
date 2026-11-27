import { Type } from "typebox";
import { withProcessScope, type HarnessAdapter } from "@skill-harness/core";
import type { ExtensionAPI } from "./commands.js";
import type { HarnessDashboard } from "./dashboard.js";
import { resolveSkillLocation, runViaExtension, type Scorecard } from "./runner.js";

// NOTE: the export name, the tool's model-facing `name`, and `handleSkillCheck`
// in commands.ts are intentionally NOT rebranded (only the `label` was). A tool
// name is a stable API identifier, and pi-extension is private/git-install
// (never published to npm), so renaming would break existing installs with no
// npm-version boundary to cushion it. KEEP as skill_check_run.
export interface EvaluationGapReport {
  evaluationGap: true;
  skill: string;
  keepTaskOpen: false;
  message: string;
  offer: string;
  summary?: undefined;
  resultsSha256?: undefined;
}

export const skillCheckRunTool = {
  name: "skill_check_run",
  label: "Run skill-harness",
  exposure: "direct" as const,
  defaultActive: true,
  description:
    "Run a skill's scenarios and return the scorecard (exact scenarios run, repetitions, coverage label, per-scenario verdicts, expected vs observed on failures, and failed transcripts). Use after editing a skill to validate directly relevant scenarios in Standard mode, or also related scenarios in Ambitious mode.",
  promptGuidelines: [
    "Use skill_check_run after editing a skill to validate affected scenarios. A failed scenario keeps the task open until fixed and rerun, or until an intentional behavior change explains why the evaluation needs updating.",
  ],
  parameters: Type.Object({
    skill: Type.Optional(Type.String({ description: "skill dir/name; defaults to the current project" })),
    specs: Type.Optional(Type.String({ description: "Separate evaluation repository root; spec is <root>/<skill-name>/tests/specification.yaml" })),
    scenarios: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { description: "Run only these scenario IDs (focused or related-role coverage)" })),
    coverageScope: Type.Optional(Type.Union([Type.Literal("focused"), Type.Literal("related"), Type.Literal("full")], {
      description: "Label coverage accurately: focused (directly relevant scenarios), related (shared change affecting several roles), or full",
    })),
    thinking: Type.Optional(Type.String({ description: "Explicit requested Pi effort: off, minimal, low, medium, high, xhigh or max; effective effort may be unavailable" })),
    judgeThinking: Type.Optional(Type.String({ description: "Explicit requested judge effort; changes calibration/reuse identity" })),
    model: Type.Optional(Type.String({ description: "provider:model token under test (defaults to active session model)" })),
    judge: Type.Optional(Type.String({ description: "Independent Pi provider:model judge (defaults to active session model or configured judge)" })),
    reps: Type.Optional(Type.Number({ description: "run each scenario N times", minimum: 1, maximum: 20 })),
    mode: Type.Optional(Type.String({ description: "red | green | force (green and force are scored; red is the baseline)" })),
    canary: Type.Optional(Type.Boolean({ description: "green only: spend one instructed skill-loading/quote probe and stop if inconclusive; does not test autonomous selection" })),
  }),
  async execute(
    _id: string,
    params: {
      skill?: string;
      specs?: string;
      scenarios?: string[];
      coverageScope?: "focused" | "related" | "full";
      model?: string;
      judge?: string;
      thinking?: string;
      judgeThinking?: string;
      reps?: number;
      mode?: string;
      canary?: boolean;
    },
    signal: AbortSignal,
    onUpdate: ((update: { content: { type: "text"; text: string }[] }) => void) | undefined,
    ctx: {
      cwd: string;
      model?: { provider?: string; id?: string };
      __adapter?: HarnessAdapter;
      sessionManager?: { getSessionId(): string };
    }
  ): Promise<{ isError?: boolean; content: { type: "text"; text: string }[]; details: Scorecard | EvaluationGapReport }> {
    let resolved: { skillDir: string; specPath: string };
    try {
      resolved = resolveSkillLocation(ctx.cwd, params.skill, params.specs ?? process.env.SKILL_HARNESS_SPECS);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/no tests\/specification\.yaml found/i.test(msg)) {
        const target = params.skill ?? ctx.cwd;
        const offer = "No evaluation exists for this changed skill behavior yet. Offer to create one with skill_author or `/skill-harness create`.";
        const gap: EvaluationGapReport = {
          evaluationGap: true,
          skill: target,
          keepTaskOpen: false,
          message: msg,
          offer,
        };
        return {
          content: [{ type: "text", text: `Evaluation gap for ${target}: ${msg}\n${offer}` }],
          details: gap,
        };
      }
      throw error;
    }
    const sessionModel =
      ctx.model?.provider && ctx.model?.id ? `${ctx.model.provider}:${ctx.model.id}` : undefined;
    const card: Scorecard = await withProcessScope({ signal }, () => runViaExtension({
      skillDir: resolved.skillDir,
      specPath: resolved.specPath,
      model: params.model,
      sessionModel,
      thinking: params.thinking,
      judgeThinking: params.judgeThinking,
      judge: params.judge,
      reps: params.reps,
      mode: params.mode as "red" | "green" | "force" | undefined,
      canary: params.canary,
      only: params.scenarios,
      coverageScope: params.coverageScope,
      adapter: ctx.__adapter,
      timestamp: new Date().toISOString(),
      log: (m) => onUpdate?.({ content: [{ type: "text", text: m }] }),
    }));
    const scenarioLines = card.scenarios.map((s) => {
      const base = `  ${s.id}: ${s.suspect ? "? (suspect)" : s.verdict}`;
      if (s.verdict === "PASS") return base;
      const expected = s.expected?.length ? `\n    expected: ${s.expected.join(" | ")}` : "";
      const observed = s.observed ? `\n    observed: ${s.observed}` : "";
      return `${base}${expected}${observed}`;
    });
    const failureNote = card.keepTaskOpen
      ? "\nTask remains open: fix the in-scope skill regression and rerun the affected scenario(s), or explain why the evaluation needs updating before modifying it if behavior intentionally changed."
      : "";
    const summary =
      `${card.skill} ${card.grade.letter} (${card.grade.pct}%) — ${card.grade.ship ? "SHIP" : "NOT READY"}\n` +
      `Coverage: ${card.coverage.label} · reps=${card.reps} · scenarios=[${card.coverage.scenariosRun.join(", ")}]\n` +
      (card.summaryLines?.length ? card.summaryLines.join("\n") + "\n" : "") +
      scenarioLines.join("\n") +
      (card.failedTranscripts.length ? `\nfailed transcripts:\n${card.failedTranscripts.join("\n")}` : "") +
      failureNote;
    return { ...(card.keepTaskOpen ? { isError: true } : {}), content: [{ type: "text", text: summary }], details: card };
  },
};

export function registerTool(pi: ExtensionAPI, dashboard?: HarnessDashboard): void {
  const wrap = async (...args: Parameters<typeof skillCheckRunTool.execute>) => {
    const out = dashboard
      ? await dashboard.run(
          args[4],
          () => skillCheckRunTool.execute(...args),
          (result) => ("evaluationGap" in result.details ? undefined : result.details.summary),
          {
            id: args[0],
            digest: (result) => ("evaluationGap" in result.details ? undefined : result.details.resultsSha256),
          },
        )
      : await skillCheckRunTool.execute(...args);
    try {
      const details = out.details;
      if ("evaluationGap" in details) {
        pi.events?.emit?.("pi-daddy:ecosystem-activity:v1", {
          producer: "skill-harness",
          kind: "eval-gap",
          detail: `Skill Harness · no evaluation found for ${details.skill} (offer to create one)`,
        });
      } else {
        const passed = details.scenarios.filter((s) => s.verdict === "PASS").length;
        const total = details.scenarios.length;
        const status = details.keepTaskOpen ? "FAIL (task stays open)" : "PASS";
        pi.events?.emit?.("skill-harness:eval-result:v1", {
          version: 1,
          skill: details.skill,
          keepTaskOpen: details.keepTaskOpen,
          reps: details.reps,
          coverage: details.coverage,
          scenarios: details.scenarios,
        });
        pi.events?.emit?.("pi-daddy:ecosystem-activity:v1", {
          producer: "skill-harness",
          kind: details.keepTaskOpen ? "eval-failed" : "eval-passed",
          detail: `Skill Harness · ${details.skill} ${status} (${passed}/${total}, ${details.coverage.label}, reps=${details.reps})`,
        });
      }
    } catch {
      /* Optional activity publication never fails evaluation results. */
    }
    return out;
  };
  pi.registerTool({ ...skillCheckRunTool, execute: wrap });
}
