import { randomUUID } from "node:crypto";
import { observePrincipalCandidate, type CandidateObservation } from "./jev-candidate.js";
import { evidenceReferences, sha256, verifyEvidence, type EvidenceRef } from "./jev-evidence.js";
// @ts-expect-error Shared JavaScript module is checked by dedicated tests and bundled for npm.
import { main as decisionMain } from "../../../experiments/decision-shadow/main.mjs";
// @ts-expect-error Shared JavaScript consent contract has dedicated boundary tests.
import { createStorageConsent } from "../../../experiments/decision-shadow/learning-data.mjs";
// @ts-expect-error Shared provider validation/transport has dedicated boundary tests.
import { callProvider } from "../../../experiments/decision-shadow/providers.mjs";
import type { ExtensionAPI, CmdCtx } from "./commands.js";
import {
  JEV_PROVIDER, JEV_MODEL, JEV_QUESTION, JEV_WORKFLOW_LIMIT, JEV_SOURCE_KIND,
  prepareHandoff, createHandoffSource, retainHandoffSource, requireIdentity, type HandoffPacket,
} from "./jev-packet.js";

export type JevContext = Pick<CmdCtx, "sessionManager" | "cwd">;
export interface AdviceResult {
  advisory: true;
  status: "answered" | "unavailable";
  probability: number | null;
  provider: string;
  requestedModel: string;
  resolvedModel: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
  latencyMs: number | null;
  reason?: string;
  remaining: number;
  inputSha256?: string;
  source?: { kind: string; sha256: string; sessionId: string; toolCallId: string; retained: boolean; path?: string; candidateIdentity: string; sourceBinding: string };
  reused?: boolean;
}
const unmeasuredProvider = () => ({
  provider: JEV_PROVIDER, requestedModel: JEV_MODEL, resolvedModel: null,
  usage: { inputTokens: null, outputTokens: null, costUsd: null }, latencyMs: null,
});
const missingKeyRemedy = "Set OPENROUTER_API_KEY in the environment that launches Pi, restart Pi, then enable JEV again with fresh session consent.";
interface Activation {
  sessionId: string;
  consent: any;
  mode: "manual" | "workflow";
  authorization: unknown;
  abort: AbortController;
  used: number;
  busy: boolean;
  blocked: string | null;
  cache: Map<string, AdviceResult>;
  selections: Map<string, { candidate: string; inputSha256: string; retained: ReturnType<typeof retainHandoffSource>; observation?: CandidateObservation }>;
  linked: Map<string, { path: string; sha256: string }>;
}

/** Permission is live owner-session state, never restored from entries or inherited by children. */
export function createJevController(
  pi: ExtensionAPI,
  options: {
    run?: typeof decisionMain;
    provider?: typeof callProvider;
    env?: NodeJS.ProcessEnv;
    storageHome?: string;
  } = {},
) {
  const run = options.run ?? decisionMain;
  let epoch = 0;
  let active: Activation | null = null;
  const clearSession = () => {
    epoch++;
    active?.abort.abort();
    active = null;
  };
  pi.on("session_start", clearSession);
  pi.on("session_switch", clearSession);
  pi.on("session_shutdown", clearSession);
  const currentId = (ctx: JevContext) => {
    const id = ctx.sessionManager?.getSessionId();
    if (active && active.sessionId !== id) clearSession();
    return id;
  };
  const hasKey = () => !!(options.env ?? process.env).OPENROUTER_API_KEY?.trim();
  const status = (ctx: JevContext) => {
    const id = currentId(ctx);
    const availability = !id ? "missing-session" : !active ? "disabled"
      : active.mode === "manual" ? "manual-only"
      : active.blocked ?? (active.busy ? "busy" : active.used >= JEV_WORKFLOW_LIMIT ? "limit-reached"
        : !hasKey() ? "missing-key" : "ready");
    return {
      enabled: active !== null, mode: active?.mode ?? "disabled",
      storage: active?.consent.decision ?? null,
      remaining: active?.mode === "workflow" ? JEV_WORKFLOW_LIMIT - active.used : 0,
      availability,
      providerReadiness: hasKey() ? "key-present" : "missing-key",
      advisory: true,
    };
  };

  const evaluate = async (value: HandoffPacket, toolCallId: string, signal: AbortSignal | undefined, ctx: JevContext): Promise<AdviceResult> => {
    requireIdentity(toolCallId, "Pi toolCallId");
    const packet = prepareHandoff(value);
    const id = currentId(ctx);
    const unavailable = (reason: string): AdviceResult => ({
      advisory: true, status: "unavailable", probability: null, reason, ...unmeasuredProvider(),
      remaining: active?.mode === "workflow" ? JEV_WORKFLOW_LIMIT - active.used : 0,
    });
    if (!id || !active || active.mode !== "workflow")
      return unavailable("Explicit /skill-harness jev enable workflow activation is required in this Pi session.");
    const bound = active;
    const assertCurrent = () => {
      if (active !== bound || ctx.sessionManager?.getSessionId() !== bound.sessionId || bound.abort.signal.aborted || signal?.aborted)
        throw new Error("Session, authorization or tool execution changed");
    };
    if (signal?.aborted) return unavailable("Tool execution was cancelled.");

    if (bound.blocked) return unavailable("Workflow advice is suppressed after an error; explicit new activation is required.");
    if (bound.busy) return unavailable("An advisory request is already in flight; no additional call was made.");
    const candidateObservation = observePrincipalCandidate(pi, ctx, value.candidate);
    const evidence = verifyEvidence(value.evidenceRefs, ctx.cwd);
    const cacheKey = sha256(JSON.stringify({ inputSha256: packet.inputSha256, evidenceRefs: evidenceReferences(evidence), candidate: candidateObservation?.candidate ?? null }));
    const cached = bound.cache.get(cacheKey);
    if (cached) return { ...cached, remaining: JEV_WORKFLOW_LIMIT - bound.used, reused: true };
    if (bound.used >= JEV_WORKFLOW_LIMIT) return unavailable("This activation's advisory call limit is reached.");
    if (!hasKey()) return unavailable(`OPENROUTER_API_KEY is unavailable; no call was made. ${missingKeyRemedy}`);
    const abort = new AbortController();
    const cancel = () => abort.abort();
    const signals = [bound.abort.signal, signal].filter((s): s is AbortSignal => s !== undefined);
    for (const s of signals) {
      if (s.aborted) cancel();
      else s.addEventListener("abort", cancel, { once: true });
    }
    bound.busy = true;
    bound.used++; // Reserve synchronously, before I/O or any await.
    let receipt: AdviceResult["source"];
    try {
      assertCurrent();
      const source = createHandoffSource({
        packet, sessionId: bound.sessionId, toolCallId,
        consent: bound.consent, authorization: bound.authorization, evidence, candidateObservation,
      });
      const retained = bound.consent.decision === "granted"
        ? retainHandoffSource(source, assertCurrent, options.storageHome, evidence)
        : undefined;
      if (retained) bound.selections.set(source.sha256, { candidate: value.candidate, inputSha256: packet.inputSha256, retained, observation: candidateObservation });
      receipt = {
        kind: JEV_SOURCE_KIND, sha256: source.sha256,
        sessionId: bound.sessionId, toolCallId, retained: !!retained,
        candidateIdentity: source.source.candidateIdentity, sourceBinding: source.source.sourceBinding,
        ...(retained ? { path: retained.path } : {}),
      };
      assertCurrent();
      const result = await (options.provider ?? callProvider)(JEV_PROVIDER, JEV_MODEL, packet, {
        apiKey: (options.env ?? process.env).OPENROUTER_API_KEY,
        signal: abort.signal,
      });
      assertCurrent();
      if (result.status !== "answered") bound.blocked = "provider-error";
      const advice: AdviceResult = {
        advisory: true,
        status: result.status === "answered" ? "answered" : "unavailable",
        probability: result.status === "answered" ? result.probability : null,
        provider: JEV_PROVIDER, requestedModel: JEV_MODEL, resolvedModel: result.resolvedModel,
        usage: result.usage, latencyMs: result.latencyMs,
        ...(result.status === "answered" ? {} : { reason: "Provider unavailable; further workflow calls require explicit new activation." }),
        remaining: JEV_WORKFLOW_LIMIT - bound.used, inputSha256: packet.inputSha256, source: receipt,
      };
      try { retained?.writeOutcome(advice); }
      catch {
        assertCurrent();
        bound.blocked = "storage-error";
        advice.reason = "Provider outcome received, but outcome retention failed; further workflow calls require explicit new activation.";
      }
      bound.cache.set(cacheKey, Object.freeze(advice));
      return advice;
    } catch {
      // Includes cancellation, transport exceptions and storage failures. Never retry or expose raw errors.
      bound.blocked = "execution-error";
      return {
        advisory: true, status: "unavailable", probability: null, ...unmeasuredProvider(),
        reason: "Advice unavailable or cancelled; no approval is implied. Explicit new activation is required for further workflow calls.",
        remaining: JEV_WORKFLOW_LIMIT - bound.used, inputSha256: packet.inputSha256,
        ...(receipt ? { source: receipt } : {}),
      };
    } finally {
      bound.busy = false;
      for (const s of signals) s.removeEventListener("abort", cancel);
    }
  };

  const linkOutcome = (selectionSha256: string, candidate: string, evidenceRefs: EvidenceRef[], toolCallId: string, signal: AbortSignal | undefined, ctx: JevContext) => {
    requireIdentity(toolCallId, "Pi toolCallId");
    currentId(ctx);
    const bound = active;
    if (!bound || bound.mode !== "workflow" || bound.consent.decision !== "granted" || bound.busy)
      throw new Error("Outcome linking requires idle workflow advice and current-session storage consent");
    const selection = bound.selections.get(selectionSha256);
    if (!selection || candidate !== selection.candidate)
      throw new Error("Outcome selection and candidate must match retained advice from this activation");
    const assertCurrent = () => {
      if (active !== bound || ctx.sessionManager?.getSessionId() !== bound.sessionId || signal?.aborted || bound.abort.signal.aborted)
        throw new Error("Session, authorization or tool execution changed");
    };
    assertCurrent();
    const observation = observePrincipalCandidate(pi, ctx, candidate);
    if (selection.observation && !observation) throw new Error("Principal observation is no longer available for this selection");
    const refs = verifyEvidence(evidenceRefs, ctx.cwd);
    if (!refs.length) throw new Error("Outcome linking requires selected engineering evidence");
    const key = sha256(JSON.stringify({ selectionSha256, refs: evidenceReferences(refs) }));
    const prior = bound.linked.get(key);
    if (prior) selection.retained.verifyRetained(prior);
    const receipt = prior ?? selection.retained.linkOutcome(candidate, refs, toolCallId, assertCurrent, observation);
    bound.linked.set(key, receipt);
    return { advisory: true as const, status: "linked" as const, ...receipt, selectionSha256,
      inputSha256: selection.inputSha256, reused: !!prior, independence: "unassessed" as const,
      trainingEligible: false as const, exportEligible: false as const, labelStatus: "unlabeled" as const };
  };

  const command = async (args: string, ctx: CmdCtx) => {
    const action = args.trim() || "status";
    const sessionId = currentId(ctx);
    if (!sessionId) throw Error("JEV requires the current Pi session identity");
    requireIdentity(sessionId, "Pi sessionId");
    if (action === "status") {
      ctx.ui.notify(
        JSON.stringify(status(ctx)),
      );
      return;
    }
    if (action === "disable") {
      clearSession();
      ctx.ui.notify(
        "JEV disabled. Existing selected records remain local; disable storage in their review before export if needed.",
      );
      return;
    }
    if (!ctx.hasUI || !ctx.ui.select)
      throw Error(
        "Interactive JEV activation requires a per-session storage answer. Use the explicit CLI storage option in noninteractive mode.",
      );
    if (action === "enable" || action === "enable workflow") {
      // Ask on every enable, including re-enable. Dismissal is a decline, never inherited consent.
      clearSession();
      const activation = epoch;
      const workflow = action === "enable workflow";
      let authorization: unknown = null;
      if (workflow) {
        if (!ctx.ui.confirm) throw new Error("Workflow JEV activation requires interactive paid-scope confirmation");
        const confirmed = await ctx.ui.confirm(
          "Enable optional JEV handoff advice for THIS Pi session?",
          `Allow up to ${JEV_WORKFLOW_LIMIT} automatic workflow paid calls to ${JEV_MODEL} through OpenRouter using OPENROUTER_API_KEY. The coordinator may send selected candidate, stage, proposed next action, engineering uncertainty, requirements and evidence (at most 16000 characters per packet) for a fixed question about whether that next action is justified. Mechanical checks stay local. The question does not certify final acceptance or require later review to be already complete. Advice never grants approval. This is separate from your Pi subscription; no retry or fallback. Manual jev run calls remain separately confirmed outside this workflow limit.`,
        );
        if (activation !== epoch || ctx.sessionManager?.getSessionId() !== sessionId || confirmed !== true) return;
        authorization = {
          kind: "jev-workflow-paid-scope", interactionId: randomUUID(), sessionId,
          recordedAt: new Date().toISOString(), provider: JEV_PROVIDER, model: JEV_MODEL,
          question: JEV_QUESTION, maximumCalls: JEV_WORKFLOW_LIMIT,
        };
      }
      const choices = [
        "No — use JEV without retaining data for LoRA",
        "Yes — retain selected decision data for later LoRA review",
      ];
      const answer = await ctx.ui.select(
        "Store selected data from THIS session for future LoRA dataset review? Workflow selections are saved under ~/.skill-harness/jev-workflow. Storage does not grant training permission; No does not change Pi native session history.",
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
      active = {
        sessionId, consent, authorization, mode: workflow ? "workflow" : "manual",
        abort: new AbortController(), used: 0, busy: false, blocked: null, cache: new Map(), selections: new Map(), linked: new Map(),
      };
      ctx.ui.notify(
        (workflow ? `JEV workflow calls authorized for this session (up to ${JEV_WORKFLOW_LIMIT} paid calls). LoRA storage ` : "JEV manual mode activated; each selected paid call still requires confirmation. LoRA storage ") +
          consent.decision +
          " for this session only. " +
          (hasKey()
            ? "Provider readiness: OPENROUTER_API_KEY is present; credentials and provider access have not been verified. No provider call was made."
            : `Provider unavailable: OPENROUTER_API_KEY is missing or blank in this Pi process. No provider call was made. ${missingKeyRemedy}`),
      );
      return;
    }
    if (action !== "run")
      throw Error("usage: /skill-harness jev enable [workflow] | status | disable | run");
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
  return { command, status, evaluate, linkOutcome };
}

export type JevController = ReturnType<typeof createJevController>;

/** Compatibility entry point for manual command consumers. */
export function createJevSessionHandler(pi: ExtensionAPI, run: typeof decisionMain = decisionMain) {
  return createJevController(pi, { run }).command;
}
