import { Type } from "typebox";
import type { ExtensionAPI } from "./commands.js";
import type { JevContext, JevController } from "./jev-session.js";
import { requireIdentity, type HandoffPacket } from "./jev-packet.js";
import type { EvidenceRef } from "./jev-evidence.js";

const nullableNumber = Type.Union([Type.Number(), Type.Null()]);
const nullableString = Type.Union([Type.String(), Type.Null()]);
const evidenceRefsSchema = Type.Array(Type.Object({
  path: Type.String({ minLength: 1, maxLength: 4096 }), sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
}, { additionalProperties: false }), { minItems: 1, maxItems: 8, description: "Explicit local files, at most 2 MiB each. Bytes are hash-verified and frozen only with storage consent; local paths and file contents are not automatically sent to JEV. File hashes do not prove narrative truth or independence." });
const adviceOutput = Type.Union([
  Type.Object({
    advisory: Type.Literal(true), status: Type.Literal("linked"), path: Type.String(), sha256: Type.String(),
    selectionSha256: Type.String(), inputSha256: Type.String(), reused: Type.Boolean(),
    independence: Type.Literal("unassessed"), trainingEligible: Type.Literal(false), exportEligible: Type.Literal(false), labelStatus: Type.Literal("unlabeled"),
  }, { additionalProperties: false }),
  Type.Object({
    enabled: Type.Boolean(), mode: Type.Union([Type.Literal("disabled"), Type.Literal("manual"), Type.Literal("workflow")]),
    storage: Type.Union([Type.Literal("granted"), Type.Literal("declined"), Type.Null()]),
    remaining: Type.Integer({ minimum: 0 }), availability: Type.String(),
    providerReadiness: Type.Union([Type.Literal("key-present"), Type.Literal("missing-key")]), advisory: Type.Literal(true),
  }, { additionalProperties: false }),
  Type.Object({
    advisory: Type.Literal(true), status: Type.Union([Type.Literal("answered"), Type.Literal("unavailable")]),
    probability: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
    provider: Type.String(), requestedModel: Type.String(), resolvedModel: nullableString,
    usage: Type.Object({ inputTokens: nullableNumber, outputTokens: nullableNumber, costUsd: nullableNumber }, { additionalProperties: false }),
    latencyMs: nullableNumber, reason: Type.Optional(Type.String()), remaining: Type.Integer({ minimum: 0 }),
    inputSha256: Type.Optional(Type.String()), reused: Type.Optional(Type.Boolean()),
    source: Type.Optional(Type.Object({
      kind: Type.String(), sha256: Type.String(), sessionId: Type.String(), toolCallId: Type.String(),
      retained: Type.Boolean(), path: Type.Optional(Type.String()), candidateIdentity: Type.String(), sourceBinding: Type.String(),
    }, { additionalProperties: false })),
  }, { additionalProperties: false }),
]);

export function createJevAdviceTool(controller: JevController) {
  return {
    name: "jev_advice",
    label: "JEV decision advice",
    description: "Check free session-local JEV status, evaluate a selected engineering next action for its current stage, or link later local engineering evidence without a provider call. Evaluation requires explicit /skill-harness jev enable workflow activation. Probability never grants approval or replaces tests/review. Select only relevant public or already-redacted evidence; never send secrets, transcripts, reviewer verdicts or hidden reasoning.",
    promptGuidelines: [
      "Use action=status to discover whether JEV workflow advice is enabled. Call evaluate only for a concrete unresolved engineering judgment after deterministic checks; name stage, nextAction and uncertainty. Skip calls that merely ask whether required files, tests or reviews exist.",
      "JEV evaluates the proposed next action, not final acceptance. Do not require future independent review to be complete before asking whether to proceed to it. Do not call for every feature or retry unavailable advice.",
      "Keep advice out of independent review inputs. After independently obtained test/review evidence is available, optional link-outcome freezes its explicit local references for later curation. Matching file hashes and caller-provided candidate identities are not independently validated labels or export permission.",
    ],
    parameters: Type.Object({
      action: Type.Union([Type.Literal("status"), Type.Literal("evaluate"), Type.Literal("link-outcome")]),
      candidate: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Reported candidate identity; when available Principal observes and matches it in this session and workspace, otherwise it remains caller-claimed. For link-outcome it must match the retained selection exactly." })),
      stage: Type.Optional(Type.Union([Type.Literal("design"), Type.Literal("implementation"), Type.Literal("verification")])),
      nextAction: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Concrete next engineering action being considered." })),
      uncertainty: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Unresolved engineering judgment that could change that action; not a missing mechanical check." })),
      requirements: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Requirements relevant to this decision, before seeing independent review or JEV outcomes." })),
      evidence: Type.Optional(Type.String({ minLength: 1, maxLength: 16000, description: "Selected decision-time evidence. Complete outbound JSON is limited to 16000 characters." })),
      evidenceRefs: Type.Optional(evidenceRefsSchema),
      selectionSha256: Type.Optional(Type.String({ pattern: "^[a-f0-9]{64}$", description: "source.sha256 returned by evaluate in this activation; required only for link-outcome." })),
    }, { additionalProperties: false }),
    outputSchema: adviceOutput,
    async execute(id: string, params: unknown, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: JevContext) {
      requireIdentity(id, "Pi toolCallId");
      if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error("Invalid jev_advice parameters");
      const p = params as Record<string, unknown>;
      const required = p.action === "status" ? ["action"]
        : p.action === "link-outcome" ? ["action", "selectionSha256", "candidate", "evidenceRefs"]
        : ["action", "candidate", "stage", "nextAction", "uncertainty", "requirements", "evidence"];
      const allowed = p.action === "evaluate" ? [...required, "evidenceRefs"] : required;
      if (Object.keys(p).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(p, key)))
        throw new Error("jev_advice accepts only its documented fields; evaluate requires stage, nextAction and uncertainty");
      let details;
      if (p.action === "status") details = controller.status(ctx);
      else if (p.action === "evaluate") {
        const { action: _action, ...packet } = p;
        details = await controller.evaluate(packet as unknown as HandoffPacket, id, signal, ctx);
      } else if (p.action === "link-outcome") {
        details = controller.linkOutcome(p.selectionSha256 as string, p.candidate as string, p.evidenceRefs as EvidenceRef[], id, signal, ctx);
      } else throw new Error("jev_advice action must be status, evaluate or link-outcome");
      // Codemode and direct tool calls share the session-bound consent/accounting controller.
      return { content: [{ type: "text" as const, text: JSON.stringify(details) }], details, structuredContent: details };
    },
  };
}

export function registerJevAdvice(pi: ExtensionAPI, controller: JevController) {
  pi.registerTool(createJevAdviceTool(controller));
}
