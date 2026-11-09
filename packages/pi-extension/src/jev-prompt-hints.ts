import { createHash } from "node:crypto";
import type { CmdCtx, ExtensionAPI } from "./commands.js";
import type { HandoffPacket } from "./jev-packet.js";
import { interpretJevAdvice, type AdviceResult, type JevController } from "./jev-session.js";

const MAX_PROMPT_LENGTH = 1200;
export const HINT_WAIT_MS = 2500;

interface ToolFit {
  tool: string;
  request: RegExp;
  intent: string;
  capability: string;
  stage: HandoffPacket["stage"];
}

// Only these literal labels can reach JEV. Never include raw prompt fragments, tool
// descriptions supplied by extensions, or the rest of the tool catalog in a packet.
const candidates: ToolFit[] = [
  { tool: "scout_research", request: /^(?:research|compare|investigate|look up|find|check)\b.*\b(?:public|online|published|official|latest|current|documentation)\b/i,
    intent: "research public information", capability: "research a public question and return a sourced brief", stage: "design" },
  { tool: "research_sources", request: /^(?:list|show|check|find)\b.*\b(?:approved|configured|available) (?:research )?sources\b/i,
    intent: "list approved research sources", capability: "list operator-approved research sources", stage: "design" },
  { tool: "bookie_search", request: /^(?:find|search|look up|locate)\b.*\b(?:bookie|saved (?:notes?|records?|decisions?)|work history)\b/i,
    intent: "search saved work records", capability: "search permitted Bookie records", stage: "design" },
  { tool: "bookie_work", request: /^(?:show|read|inspect|check|review)\b.*\bwork[ -]map\b/i,
    intent: "inspect a work map", capability: "read the selected work map and its dependencies", stage: "design" },
  { tool: "principal_handoff", request: /^(?:prepare|assemble|create)\b.*\bhandoff\b/i,
    intent: "prepare a task or review handoff", capability: "assemble a compact handoff from exact references", stage: "design" },
  { tool: "skill_author", request: /^(?:create|author|draft|build|design)\b.*\bskill\b/i,
    intent: "author a skill", capability: "prepare a skill and its evaluations for review", stage: "design" },
  { tool: "skill_check_run", request: /^(?:test|evaluate|run|check)\b.*\bskill(?:'s|s)?\b/i,
    intent: "evaluate a skill", capability: "run a skill's evaluation scenarios and return its scorecard", stage: "verification" },
  { tool: "grep", request: /^(?:search|find|locate)\b.*\b(?:occurrences?|matches|references|usages|where .+ is used)\b/i,
    intent: "find matching text in a workspace", capability: "search file contents for a pattern", stage: "design" },
  { tool: "find", request: /^(?:find|locate|list)\b.*\bfiles?\b/i,
    intent: "locate workspace files", capability: "find files by name or pattern", stage: "design" },
  { tool: "read", request: /^(?:open|read|inspect|summarize|show)\b.*(?:\b(?:file|readme|changelog)\b|\.[a-z0-9]{1,6}\b)/i,
    intent: "inspect a local file", capability: "read a selected file", stage: "design" },
  { tool: "edit", request: /^(?:edit|update|change|fix|replace|rename)\b.*\b(?:file|function|method|variable|readme|changelog)\b/i,
    intent: "make a targeted source edit", capability: "apply a selected change to an existing file", stage: "implementation" },
];

interface Selection {
  fit: ToolFit;
  previousIntent?: string;
  cues: string[];
}

function candidateFor(text: string, active: readonly string[], previous?: ToolFit): Selection | undefined {
  // Hints cover short direct requests. Ambiguous, negative and quoted/embedded
  // requests abstain instead of silently losing the operator's constraints.
  if (!text || text.length > MAX_PROMPT_LENGTH || /[\x00-\x1f\x7f"“”<>\x60]|^\s*[!/#>@]|https?:\/\/|\b(?:not|never|without|avoid|instead|except|no|don't|don’t|unless|only if)\b/i.test(text)) return;
  const direct = text.trim().replace(/^(?:(?:can|could|would) you (?:please )?|please |I'd like you to |I want you to )/i, "");
  if (/\b(?:that|those|it|them)\b/i.test(direct)) {
    if (!previous) return;
    let tool: string | undefined;
    if (/^(?:check|find|look up) (?:the )?(?:official )?(?:docs|documentation) for (?:that|it)[.!?]?$/i.test(direct) &&
        ["skill_author", "skill_check_run", "edit", "scout_research"].includes(previous.tool)) tool = "scout_research";
    if (/^(?:open|read|inspect) that file[.!?]?$/i.test(direct) && previous.tool === "find") tool = "read";
    const fit = candidates.find(row => row.tool === tool && active.includes(row.tool));
    if (fit) return { fit, previousIntent: previous.intent, cues: [] };
    return;
  }
  const matches = candidates.filter(row => row.request.test(direct));
  if (matches.length !== 1 || !active.includes(matches[0].tool)) return;
  const cues = [
    [/\b(?:current|latest)\b/i, "current information requested"],
    [/\b(?:official|published)\b/i, "published source requested"],
    [/\bcompar(?:e|ison)\b/i, "comparison requested"],
    [/\bread[ -]only\b/i, "read-only inspection requested"],
  ] as const;
  return { fit: matches[0], cues: cues.filter(([pattern]) => pattern.test(direct)).map(([, label]) => label) };
}

function packetFor(selection: Selection): HandoffPacket {
  const row = selection.fit;
  return {
    candidate: row.tool,
    stage: row.stage,
    requirements: ["Operator request category: " + row.intent + ".",
      selection.previousIntent && "The request refers to the immediately preceding task category: " + selection.previousIntent + ".",
      ...selection.cues].filter(Boolean).join(" "),
    evidence: "Pi currently exposes " + row.tool + " to the acting agent. Its supported capability is to " + row.capability + ".",
    nextAction: "Consider " + row.tool + " to " + row.capability + ".",
    uncertainty: "Given only this request category and capability, would this tool help with the requested task? Its availability alone does not establish task fit or permission.",
  };
}

function promptDigest(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

interface PendingHint extends Selection {
  digest: string;
  consent: AbortSignal;
  receivedAt: number;
}

function matchesDeliveredPrompt(messages: unknown[], pending: PendingHint): boolean {
  // Pi can append custom context after a submitted/queued user message. Check
  // only the new user message; never use contents from custom/tool/history entries.
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 8); i--) {
    const message = messages[i] as { role?: string; timestamp?: number; content?: unknown } | null;
    if (message?.role === "custom") continue;
    if (message?.role !== "user" || typeof message.timestamp !== "number" || message.timestamp < pending.receivedAt) return false;
    const blocks = message.content;
    const text = typeof blocks === "string" ? blocks
      : Array.isArray(blocks) && blocks.length === 1 && blocks[0]?.type === "text" ? blocks[0].text : undefined;
    return typeof text === "string" && text.length <= MAX_PROMPT_LENGTH && promptDigest(text) === pending.digest;
  }
  return false;
}

function scoreLabel(probability: number) {
  const percent = Math.floor(probability * 1000) / 10;
  if (probability > 0.9 && percent === 90) return ">90%";
  return String(percent) + "%";
}

type HintController = Pick<JevController, "hintSignal" | "evaluateHint">;

async function boundedEvaluation(controller: HintController, pending: PendingHint, ctx: CmdCtx) {
  const timeout = new AbortController();
  const signal = AbortSignal.any([pending.consent, timeout.signal, ...(ctx.signal ? [ctx.signal] : [])]);
  if (signal.aborted) return;
  let cancel!: () => void;
  const aborted = new Promise<undefined>(resolve => { cancel = () => resolve(undefined); });
  signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => timeout.abort(), HINT_WAIT_MS);
  try {
    return await Promise.race([aborted, controller.evaluateHint(packetFor(pending), signal, ctx)]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

export function registerJevPromptHints(pi: ExtensionAPI, controller: HintController) {
  // A newer submission supersedes an undelivered suggestion. A repeated model
  // request or tool round cannot spend again because the match is consumed first.
  let pending: PendingHint | undefined;
  let previous: Pick<PendingHint, "fit" | "consent"> | undefined;
  const reset = () => { pending = undefined; previous = undefined; };
  pi.on("session_start", reset);
  pi.on("session_switch", reset);
  pi.on("session_shutdown", reset);
  pi.on("session_tree", reset);
  pi.on("session_fork", reset);
  pi.on("input", (event, ctx) => {
    const preceding = previous;
    reset();
    if (event.source !== "interactive" || !ctx.hasUI || event.images?.length || typeof event.text !== "string") return;
    const consent = controller.hintSignal(ctx);
    if (!consent || consent.aborted) return;
    const selection = candidateFor(event.text, pi.getActiveTools?.() ?? [], preceding?.consent === consent ? preceding.fit : undefined);
    if (selection) pending = { digest: promptDigest(event.text), ...selection, consent, receivedAt: Date.now() };
  });
  pi.on("context", async (event, ctx) => {
    const current = pending;
    if (!current || !matchesDeliveredPrompt(event.messages, current)) return;
    reset();
    const stillEnabled = () => !current.consent.aborted && controller.hintSignal(ctx) === current.consent && !ctx.signal?.aborted;
    const toolActive = () => pi.getActiveTools?.().includes(current.fit.tool) === true;
    if (!stillEnabled() || !toolActive()) return;
    previous = { fit: current.fit, consent: current.consent };
    const answer: AdviceResult | undefined = await boundedEvaluation(controller, current, ctx);
    if (!stillEnabled() || !toolActive()) return;
    const recommendation = interpretJevAdvice(answer?.status ?? "unavailable", answer?.probability ?? null).recommendation;
    if (!answer || recommendation === "unavailable") {
      ctx.ui.notify("JEV tool hint unavailable. Continuing with the normal tool choice.", "info");
      return;
    }
    const score = scoreLabel(answer.probability!);
    if (recommendation !== "yes") {
      ctx.ui.notify("JEV withheld the tool hint for " + current.fit.tool + " (" + score + " estimated fit).", "info");
      return;
    }
    const content = "Optional JEV tool hint: " + current.fit.tool + " can " + current.fit.capability +
      " (" + score + " estimated fit" + (answer.reused ? ", reused assessment" : "") +
      "). Use your own judgment and the existing tool permissions.";
    ctx.ui.notify(content, "info");
    return { messages: [...event.messages, { role: "custom", customType: "skill-harness-jev-hint",
      content, display: false, timestamp: Date.now() }] };
  });
}
