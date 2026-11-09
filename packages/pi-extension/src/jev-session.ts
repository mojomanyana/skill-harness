import { randomUUID } from "node:crypto";
import { observePrincipalCandidate, type CandidateObservation } from "./jev-candidate.js";
import { evidenceReferences, sha256, verifyEvidence, type EvidenceRef } from "./jev-evidence.js";
// @ts-expect-error Shared JavaScript module is checked by dedicated tests and bundled for npm.
import { main as decisionMain } from "../../../experiments/decision-shadow/main.mjs";
// @ts-expect-error Shared JavaScript consent contract has dedicated boundary tests.
import { createStorageConsent } from "../../../experiments/decision-shadow/learning-data.mjs";
// @ts-expect-error Shared provider validation/transport has dedicated boundary tests.
import { callProvider } from "../../../experiments/decision-shadow/providers.mjs";
// @ts-expect-error Shared native classifier contract is covered by dedicated behavioral tests.
import { isNativeJevModel, nativeModelSha256, validateNativeRoute, makeNativeRequest, normalizeNativeResult } from "../../../experiments/decision-shadow/native-jev.mjs";
// @ts-expect-error Shared local storage resolver is covered by dedicated tests.
import { resolveDataRoot } from "../../../experiments/decision-shadow/data-root.mjs";
import type { ExtensionAPI, CmdCtx, NativeClassifierModel } from "./commands.js";
import {
  JEV_PROVIDER, JEV_MODEL, JEV_QUESTION, DEFAULT_WORKFLOW_LIMIT,
  prepareHandoff, createHandoffSource, retainHandoffSource, requireIdentity, type HandoffPacket, type NativeJevRoute,
} from "./jev-packet.js";

export type JevContext = Pick<CmdCtx, "sessionManager" | "cwd" | "modelRegistry">;
export const JEV_HINT_FAILURE = "jev-hint-unavailable";
export const JEV_HINT_TIMEOUT_MS = 2500;
export const JEV_YES_THRESHOLD = 0.9;
/** A positive advisory recommendation is not approval; lower scores abstain. */
export function interpretJevAdvice(status: string, probability: number | null) {
  const available = status === "answered" && typeof probability === "number" &&
    Number.isFinite(probability) && probability >= 0 && probability <= 1;
  const recommendation: "yes" | "insufficient-confidence" | "unavailable" = !available
    ? "unavailable" : probability! > JEV_YES_THRESHOLD ? "yes" : "insufficient-confidence";
  return { recommendation, yesThreshold: JEV_YES_THRESHOLD } as const;
}
export interface AdviceResult {
  advisory: true;
  status: "answered" | "unavailable";
  probability: number | null;
  recommendation: "yes" | "insufficient-confidence" | "unavailable";
  yesThreshold: typeof JEV_YES_THRESHOLD;
  provider: string;
  requestedModel: string;
  resolvedModel: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; costUsd: number | null };
  latencyMs: number | null;
  returnedProvider?: string | null;
  returnedModel?: string | null;
  costSource?: "pi-catalog-estimate" | null;
  reason?: string;
  remaining: number;
  inputSha256?: string;
  source?: { kind: string; sha256: string; sessionId: string; toolCallId: string; retained: boolean; path?: string; candidateIdentity: string; sourceBinding: string };
  reused?: boolean;
}
interface NativeSelection {
  route: NativeJevRoute;
  model: NativeClassifierModel;
  registry: NonNullable<CmdCtx["modelRegistry"]>;
}
const unmeasuredProvider = (selection?: NativeSelection | null) => ({
  provider: selection?.route.provider ?? JEV_PROVIDER, requestedModel: selection?.route.model ?? JEV_MODEL, resolvedModel: null,
  usage: { inputTokens: null, outputTokens: null, costUsd: null }, latencyMs: null,
});
const missingKeyRemedy = "Configure OpenRouter in Pi, or set OPENROUTER_API_KEY in the environment that launches Pi, restart Pi, then enable JEV again with fresh session consent.";
interface Activation {
  sessionId: string;
  selection: NativeSelection | null;
  storageRoot: string;
  consent: any;
  mode: "manual" | "workflow";
  authorization: unknown;
  abort: AbortController;
  budget: SessionBudget;
  hintConsent?: AbortController;
  busy: boolean;
  blocked: string | null;
  cache: Map<string, AdviceResult>;
  selections: Map<string, { candidate: string; inputSha256: string; retained: ReturnType<typeof retainHandoffSource>; observation?: CandidateObservation }>;
  linked: Map<string, { path: string; sha256: string }>;
}

interface SessionBudget { sessionId: string; limit: number; used: number }
const BUDGET_ENTRY = "skill-harness-jev-session-budget-v1";
const validCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const remainingCalls = (budget: SessionBudget) => Math.max(0, budget.limit - budget.used);

// Some SDK/credential promises ignore cancellation. Stop waiting and let the owning
// workflow proceed. Late native callbacks still have to pass the live dispatch guard.
async function waitForHint<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => reject(new Error("Prompt hint cancelled"));
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
  try { return await Promise.race([operation, cancelled]); }
  finally { signal.removeEventListener("abort", cancel); }
}

function paidScope(sessionId: string, selection: NativeSelection | null, limit: number) {
  return {
    kind: "jev-session-paid-scope-v1", interactionId: randomUUID(), sessionId, recordedAt: new Date().toISOString(),
    ...(selection ? { route: selection.route } : { provider: JEV_PROVIDER, model: JEV_MODEL }),
    question: JEV_QUESTION, maximumCalls: limit,
  };
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
    active?.hintConsent?.abort();
    active?.abort.abort();
    active = null;
  };
  let budget: SessionBudget | undefined;
  const reset = () => { clearSession(); budget = undefined; };
  pi.on("session_start", reset);
  pi.on("session_switch", reset);
  pi.on("session_shutdown", reset);
  const currentId = (ctx: JevContext) => {
    const id = ctx.sessionManager?.getSessionId();
    if ((budget && budget.sessionId !== id) || (active && active.sessionId !== id)) reset();
    return id;
  };
  // Restore accounting only. Every new activation requires fresh permission.
  const sessionBudget = (sessionId: string, ctx: JevContext) => {
    if (budget?.sessionId === sessionId) return budget;
    const restored = { sessionId, limit: DEFAULT_WORKFLOW_LIMIT, used: 0 };
    for (const entry of ctx.sessionManager?.getEntries?.() ?? []) {
      if (entry.type !== "custom" || entry.customType !== BUDGET_ENTRY) continue;
      const data = entry.data as Partial<SessionBudget> | null;
      if (data?.sessionId === sessionId && validCount(data.limit) && validCount(data.used)) {
        restored.limit = data.limit;
        restored.used = Math.max(restored.used, data.used);
      }
    }
    budget = restored;
    return restored;
  };
  const updateBudget = (owner: SessionBudget, next: Pick<SessionBudget, "limit" | "used">) => {
    pi.appendEntry?.(BUDGET_ENTRY, { sessionId: owner.sessionId, ...next });
    Object.assign(owner, next);
  };
  const debit = (owner: SessionBudget) => {
    if (!remainingCalls(owner)) throw new Error("JEV session call limit reached");
    updateBudget(owner, { limit: owner.limit, used: owner.used + 1 });
  };
  const environmentKey = () => {
    const key = (options.env ?? process.env).OPENROUTER_API_KEY;
    return key?.trim() ? key : undefined;
  };
  // Free status reads configuration metadata only: never resolve command/OAuth credentials here.
  const readiness = (ctx: JevContext, selection = active?.selection): "key-present" | "pi-configured" | "missing-key" => {
    if ((!selection || selection.route.provider === "openrouter") && environmentKey()) return "key-present";
    try {
      if (ctx.modelRegistry?.getProviderAuthStatus?.(selection?.route.provider ?? "openrouter").configured === true)
        return "pi-configured";
    } catch { /* Status remains conservative without exposing credential-manager errors. */ }
    return "missing-key";
  };
  const nativeKey = async (ctx: JevContext) => {
    try {
      const key = await ctx.modelRegistry?.getApiKeyForProvider?.("openrouter");
      return environmentKey() ?? (typeof key === "string" && key.trim() ? key : undefined);
    } catch { return undefined; } // Auth errors can include private command output; never return them.
  };
  const assertRoute = (selection: NativeSelection, ctx: JevContext) => {
    const current = selection.registry.getModelsOfType?.("classifier").find(model =>
      model.provider === selection.route.provider && model.id === selection.route.model);
    if (ctx.modelRegistry !== selection.registry || !current || !isNativeJevModel(current) || nativeModelSha256(current) !== selection.route.modelSha256)
      throw new Error("Selected JEV model configuration changed; enable again and choose the model");
  };
  const classify = async (selection: NativeSelection, example: { input: string; question: string }, signal: AbortSignal,
    ctx: JevContext, beforeDispatch: () => void) => {
    assertRoute(selection, ctx);
    const started = performance.now();
    let dispatched = false;
    const result = await selection.registry.classify!(selection.model, makeNativeRequest(example), {
      signal, maxRetries: 0,
      ...(selection.route.provider === "openrouter" && environmentKey() ? { apiKey: environmentKey() } : {}),
      transformHeaders: async headers => {
        if (signal.aborted) throw new Error("JEV request cancelled");
        assertRoute(selection, ctx);
        if (dispatched) throw new Error("Duplicate JEV dispatch refused");
        beforeDispatch();
        dispatched = true;
        return headers; // Native auth owns the contents; never retain or inspect them.
      },
    }).catch(() => { throw new Error("Native JEV request unavailable or cancelled"); });
    if (!dispatched) throw new Error("Native JEV authentication or dispatch was unavailable");
    return normalizeNativeResult(selection.route, result, performance.now() - started);
  };
  const status = (ctx: JevContext) => {
    const id = currentId(ctx);
    const owner = id ? sessionBudget(id, ctx) : undefined;
    const providerReadiness = readiness(ctx);
    const availability = !id ? "missing-session" : !active ? "disabled"
      : active.mode === "manual" ? "manual-only"
      : active.blocked ?? (active.busy ? "busy" : !remainingCalls(active.budget) ? "limit-reached"
        : providerReadiness === "missing-key" ? "missing-key" : "ready");
    return {
      enabled: active !== null, mode: active?.mode ?? "disabled",
      storage: active?.consent.decision ?? null,
      remaining: active ? remainingCalls(active.budget) : 0,
      limit: owner?.limit ?? DEFAULT_WORKFLOW_LIMIT, used: owner?.used ?? 0,
      controls: ["limit", "configure", "hints"], hintsEnabled: !!active?.hintConsent,
      availability,
      providerReadiness,
      storageRoot: active?.storageRoot ?? null,
      selectedProvider: active ? active.selection?.route.provider ?? "openrouter" : null,
      selectedModel: active ? active.selection?.route.model ?? JEV_MODEL : null,
      transport: active ? active.selection ? "pi-classifier" : "legacy-openrouter" : null,
      advisory: true,
    };
  };

  const evaluateSelected = async (value: HandoffPacket, toolCallId: string | undefined, signal: AbortSignal | undefined, ctx: JevContext): Promise<AdviceResult> => {
    const hint = toolCallId === undefined;
    const packet = prepareHandoff(value, hint ? "tool-hint" : "handoff");
    const id = currentId(ctx);
    const unavailable = (reason: string): AdviceResult => ({
      advisory: true, status: "unavailable", probability: null, reason, ...unmeasuredProvider(active?.selection),
      ...interpretJevAdvice("unavailable", null),
      remaining: active?.mode === "workflow" ? remainingCalls(active.budget) : 0,
    });
    if (!id || !active || active.mode !== "workflow")
      return unavailable("Explicit /skill-harness jev enable workflow activation is required in this Pi session.");
    const bound = active;
    const hintSignal = hint ? bound.hintConsent?.signal : undefined;
    if (hint && !hintSignal) return unavailable("Prompt hints require separate session consent.");
    const pauseHints = () => {
      const consent = bound.hintConsent;
      if (consent && consent.signal === hintSignal) {
        bound.hintConsent = undefined;
        consent.abort(JEV_HINT_FAILURE);
      }
      return unavailable("Prompt hints paused after an unavailable assessment. Enable hints to try again.");
    };
    const assertCurrent = () => {
      if (bound.selection) assertRoute(bound.selection, ctx);
      if (active !== bound || ctx.sessionManager?.getSessionId() !== bound.sessionId || bound.abort.signal.aborted || hintSignal?.aborted || signal?.aborted)
        throw new Error("Session, authorization or tool execution changed");
    };
    if (signal?.aborted) return unavailable("Tool execution was cancelled.");

    if (bound.blocked) return unavailable("Workflow advice is suppressed after an error; explicit new activation is required.");
    if (bound.busy) return unavailable("An advisory request is already in flight; no additional call was made.");
    if (hint) {
      try { assertCurrent(); } catch { return pauseHints(); }
    } else assertCurrent();
    const observe = () => hint ? undefined : observePrincipalCandidate(pi, ctx, value.candidate);
    let candidateObservation = observe();
    let evidence = verifyEvidence(value.evidenceRefs, ctx.cwd);
    const cacheKey = sha256(JSON.stringify({ hint, route: bound.selection?.route ?? null, inputSha256: packet.inputSha256, evidenceRefs: evidenceReferences(evidence), candidate: candidateObservation?.candidate ?? null }));
    const cached = bound.cache.get(cacheKey);
    if (cached) return { ...cached, remaining: remainingCalls(bound.budget), reused: true };
    if (!remainingCalls(bound.budget)) return unavailable("This session's advisory call limit is reached.");
    const abort = new AbortController();
    const cancel = () => {
      abort.abort();
      if (hint && !hintSignal?.aborted && !bound.abort.signal.aborted) pauseHints();
    };
    const signals = [bound.abort.signal, hintSignal, signal].filter((s): s is AbortSignal => s !== undefined);
    for (const s of signals) {
      if (s.aborted) cancel();
      else s.addEventListener("abort", cancel, { once: true });
    }
    bound.busy = true; // Serialize before asynchronous native credential resolution.
    const wait = <T>(operation: Promise<T>) => hint ? waitForHint(operation, abort.signal) : operation;
    let dispatched = false;
    let receipt: AdviceResult["source"];
    try {
      assertCurrent();
      let retained: ReturnType<typeof retainHandoffSource> | undefined;
      const beforeDispatch = () => {
        assertCurrent();
        candidateObservation = observe();
        evidence = verifyEvidence(value.evidenceRefs, ctx.cwd);
        const currentKey = sha256(JSON.stringify({ hint, route: bound.selection?.route ?? null, inputSha256: packet.inputSha256, evidenceRefs: evidenceReferences(evidence), candidate: candidateObservation?.candidate ?? null }));
        if (currentKey !== cacheKey) throw new Error("Selected input changed during credential resolution");
        if (!remainingCalls(bound.budget)) throw new Error("Session budget exhausted");
        if (toolCallId !== undefined) {
          const source = createHandoffSource({
            packet, sessionId: bound.sessionId, toolCallId,
            consent: bound.consent, authorization: bound.authorization, evidence, candidateObservation,
            ...(bound.selection ? { route: bound.selection.route } : {}),
          });
          retained = bound.consent.decision === "granted"
            ? retainHandoffSource(source, assertCurrent, bound.storageRoot, evidence) : undefined;
          if (retained) bound.selections.set(source.sha256, { candidate: value.candidate, inputSha256: packet.inputSha256, retained, observation: candidateObservation });
          receipt = {
            kind: source.source.kind, sha256: source.sha256, sessionId: bound.sessionId, toolCallId,
            retained: !!retained, candidateIdentity: source.source.candidateIdentity, sourceBinding: source.source.sourceBinding,
            ...(retained ? { path: retained.path } : {}),
          };
        }
        assertCurrent();
        debit(bound.budget);
        dispatched = true;
      };
      let result;
      if (bound.selection) {
        result = await wait(classify(bound.selection, packet, abort.signal, ctx, beforeDispatch));
      } else {
        const apiKey = environmentKey() ?? await wait(nativeKey(ctx));
        assertCurrent();
        if (!apiKey && hint) return pauseHints();
        if (!apiKey) return unavailable(`An OpenRouter API key could not be resolved; no call was made. ${missingKeyRemedy}`);
        beforeDispatch();
        result = await wait<Awaited<ReturnType<typeof callProvider>>>((options.provider ?? callProvider)(JEV_PROVIDER, JEV_MODEL, packet, { apiKey, signal: abort.signal }));
      }
      assertCurrent();
      if (result.status !== "answered") {
        if (hint) return pauseHints();
        bound.blocked = "provider-error";
      }
      const advice: AdviceResult = {
        advisory: true,
        status: result.status === "answered" ? "answered" : "unavailable",
        probability: result.status === "answered" ? result.probability : null,
        ...interpretJevAdvice(result.status, result.probability),
        provider: bound.selection?.route.provider ?? JEV_PROVIDER, requestedModel: bound.selection?.route.model ?? JEV_MODEL, resolvedModel: result.resolvedModel,
        ...(bound.selection ? { returnedProvider: result.returnedProvider, returnedModel: result.returnedModel, costSource: result.costSource } : {}),
        usage: result.usage, latencyMs: result.latencyMs,
        ...(result.status === "answered" ? {} : { reason: "Provider unavailable; further workflow calls require explicit new activation." }),
        remaining: remainingCalls(bound.budget), inputSha256: packet.inputSha256, source: receipt,
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
      if (hintSignal?.aborted) return unavailable(hintSignal.reason === JEV_HINT_FAILURE
        ? "Prompt hints paused after an unavailable assessment." : "Prompt hints were disabled.");
      if (!dispatched && !remainingCalls(bound.budget)) return unavailable("This session's advisory call limit is reached.");
      if (hint) return pauseHints();
      bound.blocked = "execution-error";
      return {
        advisory: true, status: "unavailable", probability: null, ...unmeasuredProvider(bound.selection),
        ...interpretJevAdvice("unavailable", null),
        reason: "Advice unavailable or cancelled; no approval is implied. Explicit new activation is required for further workflow calls.",
        remaining: remainingCalls(bound.budget), inputSha256: packet.inputSha256,
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
    let action = args.trim() || "status";
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
    const owner = sessionBudget(sessionId, ctx);
    if (/^limit(?:\s|$)/.test(action)) {
      if (!ctx.hasUI) throw new Error("Editing the JEV limit requires the parent Pi UI");
      const edit = ++epoch;
      const bound = active;
      const current = () => edit === epoch && ctx.sessionManager?.getSessionId() === sessionId && active === bound;
      let input = action.slice(5).trim();
      if (!input) {
        if (!ctx.ui.input) throw new Error("Interactive JEV limit editing is unavailable");
        const answer = await ctx.ui.input("Total paid JEV calls for this session (0 pauses new calls)", String(owner.limit));
        if (answer == null || !current()) return;
        input = answer.trim();
      }
      const limit = Number(input);
      if (!/^\d+$/.test(input) || !validCount(limit)) {
        const message = "Enter a whole number from 0 to " + Number.MAX_SAFE_INTEGER;
        if (action === "limit") { ctx.ui.notify(message, "error"); return; }
        throw new Error(message);
      }
      if (limit === owner.limit) return;
      if (bound?.mode === "workflow" && limit > owner.limit) {
        const route = bound.selection?.route;
        if (!ctx.ui.confirm) throw new Error("Raising the paid JEV limit requires interactive confirmation");
        const yes = await ctx.ui.confirm("Increase the paid JEV budget for THIS session?",
          `Change the session total from ${owner.limit} to ${limit} for ${route?.provider ?? "openrouter"} / ${route?.model ?? JEV_MODEL}. ${owner.used} calls already dispatched; up to ${Math.max(0, limit - owner.used)} remain. Manual runs, workflow advice and opted-in prompt hints share this limit.`);
        if (yes !== true || !current()) return;
      }
      updateBudget(owner, { limit, used: owner.used });
      if (bound?.mode === "workflow") bound.authorization = paidScope(sessionId, bound.selection, limit);
      ctx.ui.notify(`JEV session budget: ${owner.used} used of ${limit} total for this session.`);
      return;
    }
    if (action === "hints") {
      const bound = active;
      if (!bound || bound.mode !== "workflow") throw new Error("Enable workflow advice before enabling prompt hints.");
      const edit = ++epoch;
      if (bound.hintConsent) {
        bound.hintConsent.abort();
        bound.hintConsent = undefined;
        ctx.ui.notify("JEV prompt hints disabled.");
        return;
      }
      if (!ctx.hasUI || !ctx.ui.confirm) throw new Error("Prompt hints require native session consent");
      const yes = await ctx.ui.confirm("Enable optional JEV tool hints for THIS Pi session?",
        `For an eligible operator prompt, allow up to one metered assessment of a locally selected tool using ${bound.selection?.route.provider ?? "openrouter"} / ${bound.selection?.route.model ?? JEV_MODEL}. It shares the session budget (${owner.used} used of ${owner.limit}). Only a fixed-vocabulary intent and supported active tool name or function are sent. Raw prompts, arguments and transcripts stay out of the request. Prompt hints are advisory and create no retained tool-selection records.`);
      if (yes === true && edit === epoch && active === bound && ctx.sessionManager?.getSessionId() === sessionId) {
        bound.hintConsent = new AbortController();
        ctx.ui.notify("JEV prompt hints enabled for this workflow activation.");
      }
      return;
    }
    if (!ctx.hasUI || !ctx.ui.select)
      throw Error(
        "Interactive JEV activation requires a per-session storage answer. Use the explicit CLI storage option in noninteractive mode.",
      );
    if (action === "configure") {
      const change = ++epoch;
      const modes = ["Workflow advice — authorize a metered session budget", "Manual only — confirm each selected run"];
      const mode = await ctx.ui.select("Choose a new JEV mode for THIS Pi session. Selecting a mode revokes the current activation and prompts for fresh consent. Escape keeps it.", modes);
      if (change !== epoch || ctx.sessionManager?.getSessionId() !== sessionId) return;
      if (mode === 0 || mode === modes[0]) action = "enable workflow";
      else if (mode === 1 || mode === modes[1]) action = "enable";
      else return;
    }
    if (action === "enable" || action === "enable workflow") {
      // Ask on every enable, including re-enable. Dismissal is a decline, never inherited consent.
      clearSession();
      const activation = epoch;
      const workflow = action === "enable workflow";
      const registry = ctx.modelRegistry;
      const nativeAvailable = typeof registry?.getModelsOfType === "function" && typeof registry.classify === "function";
      let models: NativeClassifierModel[] = [];
      if (nativeAvailable) {
        try { models = registry.getModelsOfType!("classifier").filter(isNativeJevModel); }
        catch { throw new Error("Pi classifier catalog is unavailable; no JEV activation was created"); }
      }
      if (nativeAvailable && !models.length)
        throw new Error("No supported JEV classifier is registered in Pi. Configure a JEV System One model, then enable again.");
      const modelChoices = nativeAvailable
        ? models.map(model => {
            let configured = false;
            try { configured = registry!.getProviderAuthStatus?.(model.provider).configured === true; } catch { /* metadata only */ }
            return `${model.provider} / ${model.id} (${configured ? "configured in Pi" : "credentials not configured"})`;
          })
        : [`openrouter / ${JEV_MODEL} (legacy direct API; native classifiers unavailable)`];
      const selected = await ctx.ui.select("Choose the JEV provider and model for THIS session", modelChoices);
      if (activation !== epoch || ctx.sessionManager?.getSessionId() !== sessionId) return;
      const selectedIndex = typeof selected === "number" ? selected : modelChoices.indexOf(String(selected));
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= modelChoices.length) return;
      let selection: NativeSelection | null = null;
      if (nativeAvailable) {
        const model = JSON.parse(JSON.stringify(models[selectedIndex])) as NativeClassifierModel;
        selection = { model, registry: registry!, route: validateNativeRoute({ transport: "pi-classifier",
          provider: model.provider, model: model.id, api: model.api, modelSha256: nativeModelSha256(model) }) };
        assertRoute(selection, ctx);
      }
      const routeLabel = selection ? `${selection.route.provider} / ${selection.route.model} using Pi’s configured provider authentication`
        : `${JEV_MODEL} through OpenRouter using OPENROUTER_API_KEY or Pi’s configured OpenRouter credential (legacy transport)`;
      let authorization: unknown = null;
      if (workflow) {
        if (!ctx.ui.confirm) throw new Error("Workflow JEV activation requires interactive paid-scope confirmation");
        const confirmed = await ctx.ui.confirm(
          "Enable optional JEV handoff advice for THIS Pi session?",
          `Allow a session total of ${owner.limit} paid workflow calls (${owner.used} used, up to ${remainingCalls(owner)} available) on the selected route: ${routeLabel}. The coordinator may send selected candidate, stage, proposed next action, engineering uncertainty, requirements and evidence (at most 16000 characters per packet) for a fixed question about whether that next action is justified. Mechanical checks stay local. The question does not certify final acceptance or require later review to be already complete. Advice never grants approval. This is separate from your Pi subscription; no retry or fallback. Manual runs also count toward this total and require separate confirmation.`,
        );
        if (activation !== epoch || ctx.sessionManager?.getSessionId() !== sessionId || confirmed !== true) return;
        authorization = paidScope(sessionId, selection, owner.limit);
      }
      const storageRoot = resolveDataRoot({ env: options.env ?? process.env, override: options.storageHome });
      const choices = [
        "No — use JEV without retaining data for LoRA",
        "Yes — retain selected decision data for later LoRA review",
      ];
      const answer = await ctx.ui.select(
        `Store selected data from THIS session for future LoRA dataset review under ${storageRoot}? Each session has its own collection. Storage does not grant training permission; No does not change Pi native session history.`,
        choices,
      );
      if (
        activation !== epoch ||
        ctx.sessionManager?.getSessionId() !== sessionId
      )
        return;
      if (selection) assertRoute(selection, ctx);
      const granted = answer === 1 || String(answer) === choices[1];
      const consent = createStorageConsent({
        sessionId,
        decision: granted ? "granted" : "declined",
        interactionId: randomUUID(),
        recordedAt: new Date().toISOString(),
      });
      pi.appendEntry?.("skill-harness-jev-storage-choice", consent);
      active = {
        sessionId, selection, storageRoot, consent, authorization, mode: workflow ? "workflow" : "manual",
        abort: new AbortController(), budget: owner, busy: false, blocked: null, cache: new Map(), selections: new Map(), linked: new Map(),
      };
      ctx.ui.notify(
        (workflow ? `JEV workflow calls authorized for this session (${owner.used} used of ${owner.limit} total paid calls). LoRA storage ` : "JEV manual mode activated; each selected paid call still requires confirmation. LoRA storage ") +
          consent.decision +
          ` for this session only. ${consent.decision === "granted" ? `Data root: ${storageRoot}. ` : ""}Selected: ${selection ? `${selection.route.provider} / ${selection.route.model}` : `openrouter / ${JEV_MODEL} (legacy)`}. ` +
          (readiness(ctx) === "key-present"
            ? "Provider readiness: OPENROUTER_API_KEY is present; credentials and provider access have not been verified. No provider call was made."
            : readiness(ctx) === "pi-configured"
              ? `Provider readiness: ${selection?.route.provider ?? "OpenRouter"} is configured in Pi; credentials have not been resolved and provider access has not been verified. No provider call was made.`
              : selection ? "Provider credentials are not configured in Pi; no provider call was made. Configure the selected provider, then enable again with fresh session consent."
              : `Provider unavailable: OPENROUTER_API_KEY is missing or blank in this Pi process and Pi has no configured OpenRouter credential. No provider call was made. ${missingKeyRemedy}`),
      );
      return;
    }
    if (action !== "run")
      throw Error("usage: /skill-harness jev enable [workflow] | configure | limit [N] | hints | status | disable | run");
    if (!active)
      throw Error(
        "Enable JEV in this session first: /skill-harness jev enable",
      );
    const bound = active;
    if (bound.busy) throw new Error("A JEV request is already in flight");
    const assertCurrent = () => {
      if (active !== bound || ctx.sessionManager?.getSessionId() !== bound.sessionId || bound.abort.signal.aborted)
        throw Error("Session or consent changed");
      if (bound.selection) assertRoute(bound.selection, ctx);
    };
    if (!ctx.ui.input || !ctx.ui.confirm) throw Error("Interactive case selection/confirmation is unavailable");
    const cases = await ctx.ui.input("Path to explicitly curated decision cases JSON");
    if (!cases) return;
    const out = await ctx.ui.input("New local result path (existing files are never overwritten)");
    if (!out) return;
    assertCurrent();
    const flags = ["--cases", cases, "--provider", bound.selection?.route.provider ?? JEV_PROVIDER,
      "--model", bound.selection?.route.model ?? JEV_MODEL];
    const nativeOptions = bound.selection ? { nativeRoute: bound.selection.route } : {};
    let preview = "";
    await run(["preview", ...flags], { ...nativeOptions, emit: (text: string) => { preview = text; } });
    const summary = JSON.parse(preview);
    assertCurrent();
    const checkBatch = () => {
      if (!validCount(summary.count) || summary.count > remainingCalls(owner))
        throw new Error(`This batch needs ${summary.count} JEV calls; ${remainingCalls(owner)} remain in the session budget.`);
    };
    checkBatch();
    if (ctx.ui.editor) await ctx.ui.editor(bound.selection
      ? "JEV classifier inputs (Pi prepares provider requests; edits are not submitted)"
      : "Exact outbound JEV requests (review only; edits here are not submitted)", preview);
    else ctx.ui.notify(preview);
    if (!(await ctx.ui.confirm("Confirm selected JEV API calls",
      `Send these ${summary.count} questions to ${bound.selection?.route.provider ?? "openrouter"} / ${bound.selection?.route.model ?? JEV_MODEL}? This may use a metered API and counts toward the session budget (${remainingCalls(owner)} remaining).`))) return;
    let current = "";
    await run(["preview", ...flags], { ...nativeOptions, emit: (text: string) => { current = text; } });
    if (current !== preview) throw Error("Cases changed after preview; select and review them again");
    assertCurrent();
    checkBatch();
    if (bound.busy) throw new Error("A JEV request is already in flight");
    bound.busy = true;
    try {
      const beforeDispatch = () => { assertCurrent(); debit(owner); };
      let providerOptions;
      if (bound.selection) {
        const selection = bound.selection;
        providerOptions = { nativeRoute: selection.route,
          nativeProviderCall: async (example: { input: string; question: string }) => {
            const result = await classify(selection, example, bound.abort.signal, ctx, beforeDispatch);
            assertCurrent();
            return result;
          } };
      } else {
        const apiKey = environmentKey() ?? await nativeKey(ctx);
        assertCurrent();
        if (!apiKey) throw new Error(`An OpenRouter API key could not be resolved; no call was made. ${missingKeyRemedy}`);
        providerOptions = { env: { OPENROUTER_API_KEY: apiKey },
          providerCall: async (provider: string, model: string, example: { input: string; question: string }) => {
            beforeDispatch();
            const result = await (options.provider ?? callProvider)(provider, model, example, { apiKey, signal: bound.abort.signal });
            assertCurrent();
            return result;
          } };
      }
      await run(["run", ...flags, "--out", out, "--allow-remote"], {
        ...providerOptions, learningRoot: bound.storageRoot, sessionConsent: bound.consent, expectedCaseSetHash: summary.caseSetHash,
        beforeProviderCall: assertCurrent, emit: (text: string) => ctx.ui.notify(text),
      });
    } finally { bound.busy = false; }

  };
  const evaluate = (value: HandoffPacket, toolCallId: string, signal: AbortSignal | undefined, ctx: JevContext) => {
    requireIdentity(toolCallId, "Pi toolCallId");
    return evaluateSelected(value, toolCallId, signal, ctx);
  };
  const evaluateHint = (value: HandoffPacket, signal: AbortSignal | undefined, ctx: JevContext) =>
    evaluateSelected(value, undefined, signal ? AbortSignal.any([signal, AbortSignal.timeout(JEV_HINT_TIMEOUT_MS)])
      : AbortSignal.timeout(JEV_HINT_TIMEOUT_MS), ctx);
  const hintSignal = (ctx: JevContext) => {
    currentId(ctx);
    return active?.hintConsent?.signal;
  };
  return { command, status, evaluate, evaluateHint, hintSignal, linkOutcome };
}

export type JevController = ReturnType<typeof createJevController>;

/** Compatibility entry point for manual command consumers. */
export function createJevSessionHandler(pi: ExtensionAPI, run: typeof decisionMain = decisionMain) {
  return createJevController(pi, { run }).command;
}
