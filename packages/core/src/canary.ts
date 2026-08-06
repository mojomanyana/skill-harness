import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessAdapter, ModelRef } from "./adapters/types.js";

/**
 * The delivery canary: one cheap probe, before any scenario runs, that the skill
 * under test actually reached the model.
 *
 * Why this exists. `--mode green` asks the harness to activate the skill, and the
 * harness can decline without saying so. Measured on pi: 0.80.x wrapped the prompt
 * with the skill body; 0.83.0 switched to progressive disclosure (only the
 * description is in context, the body loads on demand — "models don't always do
 * this", pi's own docs); and a nonexistent `--skill` path is accepted silently,
 * exit 0 with a normal answer. The reference corpus ran two full waves in that
 * state: `architect` came back 7/14, ≈ its no-skill baseline, and looked entirely
 * plausible — the only tell was a contradictory failure mix (over-ceremony AND
 * capitulation at once) that no single skill edit produces.
 *
 * What it can and cannot prove. A pass means the skill's body is *reachable* in
 * this exact invocation — which is what kills the whole silent-non-delivery class:
 * a dropped flag, a wrong path, a harness that stopped honoring the mode. It does
 * NOT prove the body entered context for every later scenario; under progressive
 * disclosure that is the model's choice per turn, and no probe can promise it. The
 * mode whose delivery needs no promise is `force` (SKILL.md as system prompt),
 * which is why `run` recommends it rather than pretending the canary is equivalent.
 *
 * Cost: exactly one subject call per run, and only when asked for (`--canary`).
 * A run that aborts here has spent one rep instead of a wave.
 */

/** Frontmatter-stripped body of a SKILL.md. */
function skillBody(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/**
 * The probe target: the longest `## ` heading in the skill's body.
 *
 * Body-only by construction — the frontmatter `description` is always in context
 * under progressive disclosure, so anything quotable from it would pass against a
 * model that never read the instructions. Longest rather than first because the
 * check is "did you see this text", and `## Overview` is guessable while
 * `## Refuse a metered judge, whatever chose it` is not.
 *
 * Null when the body has no `## ` heading: there is then nothing to ask for that a
 * plausible-sounding answer couldn't fake, and a canary that can be bluffed is
 * worse than none.
 */
export function deliveryAnchor(skillMd: string): string | null {
  const headings = [...skillBody(skillMd).matchAll(/^##[ \t]+(.+?)[ \t]*$/gm)].map((m) => m[1].trim());
  if (headings.length === 0) return null;
  return headings.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Normalize for comparison: case, whitespace runs, and markdown emphasis/backticks. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
}

export interface CanaryResult {
  /** `pass` = the anchor came back; `fail` = it did not; `skipped` = nothing safe to probe for. */
  status: "pass" | "fail" | "skipped";
  /** What the probe looked for (null when skipped). */
  anchor: string | null;
  /** Why it was skipped, or what the model said instead (trimmed) — for the log and the journal. */
  detail: string;
}

export function canaryPrompt(skillName: string, anchor: string): string {
  // Asks for every heading, not just the anchor, because that is a question a model
  // WITH the instructions answers naturally and a model without them can only
  // invent. The instruction to say NOT_AVAILABLE keeps an honest miss from looking
  // like a refusal to follow format.
  return (
    `Answer from the instructions you have loaded — do not perform any task.\n\n` +
    `List every level-2 markdown heading (lines starting with "## ") in the instructions of ` +
    `the skill named "${skillName}", verbatim, one per line, with no other text.\n` +
    `If you have no such instructions available, reply exactly: NOT_AVAILABLE\n\n` +
    `(The heading text is what matters; keep it exact.)`
  );
}

/**
 * What the model actually said, per the adapters' shared transcript convention
 * (`>>> USER:` / `<<< ASSISTANT:`). Falls back to the whole text for an adapter
 * that doesn't use the markers.
 */
function assistantReply(transcript: string): string {
  const parts = transcript.split(/^<<< ASSISTANT:\s*$/m);
  return (parts.length > 1 ? parts[parts.length - 1] : transcript).trim();
}

export interface CanaryOptions {
  adapter: HarnessAdapter;
  model: ModelRef;
  skillDir: string;
  skillName: string;
  /** Neutral cwd, same as a scenario gets — the probe must not see a repo either. */
  cwd: string;
}

/**
 * Run the probe in green mode and report whether the skill body was reachable.
 *
 * Never throws for a model-side outcome: an empty or off-format reply is a `fail`
 * with the reply in `detail`, because "the harness answered without the skill" and
 * "the model said something odd" are both reasons not to spend a wave. An adapter
 * that throws (pi missing, the skill-dir tripwire) is left to propagate — those are
 * setup errors with their own messages.
 */
export async function runDeliveryCanary(opts: CanaryOptions): Promise<CanaryResult> {
  const skillMd = readFileSync(join(opts.skillDir, "SKILL.md"), "utf8");
  const anchor = deliveryAnchor(skillMd);
  if (!anchor) {
    return {
      status: "skipped",
      anchor: null,
      detail: `${opts.skillName}/SKILL.md has no \`## \` heading to probe for — nothing a reply could prove`,
    };
  }
  const transcript = await opts.adapter.run({
    skillDir: opts.skillDir,
    model: opts.model,
    mode: "green",
    turns: [canaryPrompt(opts.skillName, anchor)],
    cwd: opts.cwd,
  });
  const ok = normalize(transcript).includes(normalize(anchor));
  return {
    status: ok ? "pass" : "fail",
    anchor,
    // The reply, not the transcript: the transcript opens with our own prompt, and a
    // failure report whose first 400 characters are the question is useless.
    detail: ok ? "" : assistantReply(transcript).slice(0, 400),
  };
}

/** The abort message for a failed canary: what was measured, and what to do instead. */
export function canaryFailure(skillName: string, result: CanaryResult, cliVersion: string | null): string {
  return (
    `delivery canary FAILED for ${skillName}: the model could not quote its own skill instructions ` +
    `(looked for the heading \`${result.anchor}\`).\n` +
    `  The skill is not reaching the model, so every scenario in this run would measure a naked ` +
    `model and score like a result. Nothing has been spent beyond this one probe.\n` +
    `  harness CLI: ${cliVersion ?? "unknown"}. On pi ≥ 0.83.0 \`--skill\` is progressive disclosure ` +
    `(description in context, body on demand) and a nonexistent path is accepted silently.\n` +
    `  Fix: re-run with \`--mode force\` (SKILL.md as the system prompt — delivery no version has made ` +
    `conditional), or check that the skill dir is the one you meant.\n` +
    `  What the model said instead: ${result.detail || "(nothing)"}`
  );
}
