import { randomUUID } from "node:crypto";
// @ts-expect-error Shared JavaScript module is checked by dedicated tests and bundled for npm.
import { main as decisionMain } from "../../../experiments/decision-shadow/main.mjs";
// @ts-expect-error Shared JavaScript consent contract has dedicated boundary tests.
import { createStorageConsent } from "../../../experiments/decision-shadow/learning-data.mjs";
import type { ExtensionAPI, CmdCtx } from "./commands.js";

/** Session-local opt-in only: previous entries are never used to restore permission. */
export function createJevSessionHandler(
  pi: ExtensionAPI,
  run: typeof decisionMain = decisionMain,
) {
  let epoch = 0;
  let active: { sessionId: string; consent: any } | null = null;
  const clearSession = () => {
    epoch++;
    active = null;
  };
  pi.on("session_start", clearSession);
  pi.on("session_shutdown", clearSession);
  return async (args: string, ctx: CmdCtx) => {
    const action = args.trim() || "status";
    const sessionId = ctx.sessionManager?.getSessionId();
    if (!sessionId) throw Error("JEV requires the current Pi session identity");
    if (active && active.sessionId !== sessionId) {
      epoch++;
      active = null;
    }
    if (action === "status") {
      ctx.ui.notify(
        active
          ? "JEV enabled; LoRA storage " + active.consent.decision + "."
          : "JEV disabled for this session.",
      );
      return;
    }
    if (action === "disable") {
      epoch++;
      active = null;
      ctx.ui.notify(
        "JEV disabled. Existing selected records remain local; disable storage in their review before export if needed.",
      );
      return;
    }
    if (!ctx.hasUI || !ctx.ui.select)
      throw Error(
        "Interactive JEV activation requires a per-session storage answer. Use the explicit CLI storage option in noninteractive mode.",
      );
    if (action === "enable") {
      // Ask on every enable, including re-enable. Dismissal is a decline, never inherited consent.
      const activation = ++epoch;
      active = null;
      const choices = [
        "No — use JEV without retaining data for LoRA",
        "Yes — retain selected decision data for later LoRA review",
      ];
      const answer = await ctx.ui.select(
        "Store selected data from THIS session for future LoRA dataset review? Storage does not grant training permission.",
        choices,
      );
      if (
        activation !== epoch ||
        ctx.sessionManager?.getSessionId() !== sessionId
      )
        return;
      const granted = answer === 1 || String(answer) === choices[1];
      const consent = createStorageConsent({
        sessionId,
        decision: granted ? "granted" : "declined",
        interactionId: randomUUID(),
        recordedAt: new Date().toISOString(),
      });
      pi.appendEntry?.("skill-harness-jev-storage-choice", consent);
      active = { sessionId, consent };
      ctx.ui.notify(
        "JEV enabled for explicitly selected paid calls. LoRA storage " +
          consent.decision +
          " for this session only.",
      );
      return;
    }
    if (action !== "run")
      throw Error("usage: /skill-harness jev enable | status | disable | run");
    if (!active)
      throw Error(
        "Enable JEV in this session first: /skill-harness jev enable",
      );
    const bound = active;
    const assertCurrent = () => {
      if (
        active !== bound ||
        ctx.sessionManager?.getSessionId() !== bound.sessionId
      )
        throw Error("Session or consent changed");
    };
    if (!ctx.ui.input || !ctx.ui.confirm)
      throw Error("Interactive case selection/confirmation is unavailable");
    const cases = await ctx.ui.input(
      "Path to explicitly curated decision cases JSON",
    );
    if (!cases) return;
    const out = await ctx.ui.input(
      "New local result path (existing files are never overwritten)",
    );
    if (!out) return;
    let preview = "";
    await run(
      [
        "preview",
        "--cases",
        cases,
        "--provider",
        "jev",
        "--model",
        "typesafe/jev-1.13",
      ],
      {
        emit: (text: string) => {
          preview = text;
        },
      },
    );
    const summary = JSON.parse(preview);
    if (ctx.ui.editor)
      await ctx.ui.editor(
        "Exact outbound JEV requests (review only; edits here are not submitted)",
        preview,
      );
    else ctx.ui.notify(preview);
    if (
      !(await ctx.ui.confirm(
        "Confirm selected JEV API calls",
        `Send these ${summary.count} questions to JEV typesafe/jev-1.13 through its metered API?`,
      ))
    )
      return;
    // Re-read/compare prevents the previewed file changing before submission.
    let current = "";
    await run(
      [
        "preview",
        "--cases",
        cases,
        "--provider",
        "jev",
        "--model",
        "typesafe/jev-1.13",
      ],
      {
        emit: (text: string) => {
          current = text;
        },
      },
    );
    if (current !== preview)
      throw Error("Cases changed after preview; select and review them again");
    assertCurrent();
    await run(
      [
        "run",
        "--cases",
        cases,
        "--provider",
        "jev",
        "--model",
        "typesafe/jev-1.13",
        "--out",
        out,
        "--allow-remote",
      ],
      {
        sessionConsent: bound.consent,
        expectedCaseSetHash: summary.caseSetHash,
        beforeProviderCall: assertCurrent,
        emit: (text: string) => ctx.ui.notify(text),
      },
    );
  };
}
