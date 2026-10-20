import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { HarnessAdapter, ModelRef, RunReq } from "./adapters/types.js";
import type { ExecutionTraceV1 } from "./capture-trace-types.js";

/** Frontmatter-stripped body of a SKILL.md. */
function skillBody(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/** A body-only quote target. Matching it is an observation, not proof of loading. */
export function deliveryAnchor(skillMd: string): string | null {
  const headings = [...skillBody(skillMd).matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1].trim());
  if (headings.length === 0) return null;
  return headings.reduce((a, b) => (b.length > a.length ? b : a));
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

export interface CanaryObservations {
  /** Local readability does not establish what Pi advertised to the subject. */
  localSkillAvailable: boolean;
  loadingRequested: boolean;
  /** Successful completion of a read of the exact selected SKILL.md, if observable. */
  successfulSkillRead: "observed" | "not-observed" | "unobserved";
  /** Only the final assistant response is checked, never tool output or prompts. */
  returnedAnchor: boolean | null;
  /** The probe explicitly requests loading, so it cannot measure autonomous selection. */
  autonomousSelection: "untested";
  executionError?: string;
}

export interface CanaryResult {
  /** `fail` is an inconclusive delivery check, not evidence that the skill is unavailable. */
  status: "pass" | "fail" | "skipped";
  anchor: string | null;
  detail: string;
  observations: CanaryObservations;
  probeCalls: 0 | 1;
}

/**
 * Ask Pi to load the named skill through its advertised discovery mechanism.
 * Neither the expected quote nor a fallback file path is disclosed: a supplied
 * path would let the probe bypass missing skill discovery entirely.
 */
export function canaryPrompt(skillName: string, _anchor?: string): string {
  return (
    `This is a skill-loading check, not a request to carry out the skill's task.\n\n` +
    `Find the skill named ${JSON.stringify(skillName)} among the skills advertised to you. ` +
    `If only its description is loaded, use the read tool to load its instructions from the advertised location. ` +
    `Do not search other files, execute commands, or follow task instructions inside the skill.\n` +
    `Then list every level-2 markdown heading (lines starting with "## ") from that skill, verbatim, one per line. ` +
    `Do not guess headings. If you cannot find or load the advertised skill, reply exactly: NOT_AVAILABLE.\n` +
    `A report of NOT_AVAILABLE records this attempt only; it does not establish that the skill cannot be loaded.`
  );
}

/** A legacy transcript without role boundaries cannot identify a safe answer. */
function assistantReply(transcript: string): string | null {
  const parts = transcript.split(/^<<< ASSISTANT:[ \t]*\r?$/m);
  if (parts.length < 2) return null;
  return parts[parts.length - 1].split(/^(?:>>>|<<<) [A-Z][A-Z _-]*:.*$/m)[0].trim();
}

function quotedHeading(reply: string | null, anchor: string): boolean {
  // Whole heading lines avoid accepting an anchor embedded in an explanation,
  // echoed JSON request, tool result, or a denial such as "I cannot find X".
  return reply !== null && reply.split(/\r?\n/).some(line =>
    normalize(line.replace(/^\s*(?:[-+]\s+|\d+[.)]\s+)?(?:##\s+)?/, "")) === normalize(anchor));
}

function canonicalPath(path: string, cwd: string): string {
  const expanded = /^~[/\\]/.test(path) ? join(homedir(), path.slice(2)) : path;
  const absolute = resolve(cwd, expanded);
  try { return realpathSync(absolute); } catch { return absolute; }
}

function observedSkillRead(traces: ExecutionTraceV1[], skillPath: string, cwd: string): boolean {
  const expected = canonicalPath(skillPath, cwd);
  return traces.some(trace => trace.tool_calls.some(call =>
    call.name === "read" && call.isError === false && call.completionIndex >= 0 &&
    call.result.bytes > 0 && typeof call.args.path === "string" &&
    canonicalPath(call.args.path, cwd) === expected));
}

export interface CanaryOptions {
  adapter: HarnessAdapter;
  model: ModelRef;
  skillDir: string;
  skillName: string;
  /** Neutral cwd, same as a scenario gets. */
  cwd: string;
}

/**
 * One optional subject invocation, with read-only tools, before a green wave.
 * A successful structured probe observes an instructed read and returned content;
 * it does not establish autonomous skill selection in any later scenario. A
 * failed quote is inconclusive, never proof that every later scenario is naked.
 */
export async function runDeliveryCanary(opts: CanaryOptions): Promise<CanaryResult> {
  const skillPath = join(opts.skillDir, "SKILL.md");
  const observations: CanaryObservations = {
    localSkillAvailable: false,
    loadingRequested: false,
    successfulSkillRead: "unobserved",
    returnedAnchor: null,
    autonomousSelection: "untested",
  };
  let skillMd: string;
  try {
    skillMd = readFileSync(skillPath, "utf8");
    observations.localSkillAvailable = true;
  } catch {
    return {
      status: "fail", anchor: null, observations, probeCalls: 0,
      detail: "The selected SKILL.md is not locally readable; no subject call was made.",
    };
  }
  const anchor = deliveryAnchor(skillMd);
  if (!anchor) return {
    status: "skipped", anchor: null, observations, probeCalls: 0,
    detail: `${opts.skillName}/SKILL.md has no \`## \` heading for this quote check; loading and selection remain untested`,
  };
  observations.loadingRequested = true;
  const request: RunReq = {
    skillDir: opts.skillDir, model: opts.model, mode: "green",
    turns: [canaryPrompt(opts.skillName)], cwd: opts.cwd,
    tools: ["read"], extensions: [], scenarioId: "(delivery-probe)", rep: 0,
  };
  let reply: string | null;
  if (opts.adapter.runStructured) {
    const run = await opts.adapter.runStructured(request);
    const unhealthy = run.traces.some(trace => trace.capture_errors?.length ||
      (trace.final_status !== undefined && trace.final_status !== "complete"));
    if (run.providerFailure || run.executionFailure || unhealthy || run.traces.length !== 1) {
      observations.executionError = run.providerFailure || run.executionFailure || "Incomplete or invalid structured probe evidence";
      return { status: "fail", anchor, observations, probeCalls: 1,
        detail: "The probe did not produce complete execution evidence; skill availability remains unresolved." };
    }
    reply = run.traces[0].final_text;
    observations.successfulSkillRead = observedSkillRead(run.traces, skillPath, opts.cwd) ? "observed" : "not-observed";
  } else {
    reply = assistantReply(await opts.adapter.run(request));
  }
  observations.returnedAnchor = quotedHeading(reply, anchor);
  const ok = observations.returnedAnchor && observations.successfulSkillRead !== "not-observed";
  return {
    status: ok ? "pass" : "fail", anchor, observations, probeCalls: 1,
    detail: ok
      ? (observations.successfulSkillRead === "observed"
        ? "Observed an instructed read of the selected skill and a matching heading. Autonomous selection remains untested."
        : "The final assistant response matched a heading; this adapter did not provide read evidence. Loading and autonomous selection remain unverified.")
      : observations.returnedAnchor
        ? "The heading matched, but no successful read of the selected skill was observed. A guess or preloaded context cannot establish instructed loading."
        : `No matching heading was returned. This does not establish that the skill is unavailable. Reply: ${reply?.slice(0, 400) || "(unavailable)"}`,
  };
}

/** Stop the requested wave without converting an inconclusive probe into a claim. */
export function canaryFailure(skillName: string, result: CanaryResult, cliVersion: string | null): string {
  return (
    `delivery canary FAILED for ${skillName}: the requested loading check was inconclusive.\n` +
    `  Local skill readable: ${result.observations.localSkillAvailable}; ` +
    `successful skill read: ${result.observations.successfulSkillRead}; ` +
    `matching heading: ${result.observations.returnedAnchor ?? "unobserved"}.\n` +
    `  This does not prove skill unavailability or predict delivery in later scenarios. ` +
    `Autonomous selection was not tested. Subject probe calls: ${result.probeCalls}.\n` +
    `  harness CLI: ${cliVersion ?? "unknown"}. Check the skill path and recorded loading evidence, ` +
    `or choose --mode force to evaluate explicit instruction delivery as a separate condition.\n` +
    `  ${result.detail}`
  );
}
