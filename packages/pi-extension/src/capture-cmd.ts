import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import yaml from "js-yaml";
import {
  activeBranch,
  projectTurns,
  buildCaptureCase,
  captureToScenario,
  draftChecklist,
  redactText,
  appendScenario,
  specSha256,
  loadSpec,
  type SessionEntry,
  type LogicalTurn,
  type CaptureCaseV1,
  type CaptureTarget,
} from "@skill-harness/core";

/**
 * `/skill-harness capture` — promote a live pi conversation into a regression.
 *
 * The UI is injected rather than imported so the whole flow is testable without a
 * running agent: every prompt, every cancellation point, and the exact set of
 * files written. That matters more here than elsewhere, because the failure mode
 * this command has to avoid is *writing a secret into a committed file*, and a
 * flow that can only be exercised by hand gets exercised once.
 *
 * Zero model calls. Checklist drafting is offline; the optional post-promotion
 * run is the only thing that can spend, and it asks first.
 */

/** The subset of pi's session/UI surface this command needs. */
export interface CaptureUI {
  select(prompt: string, choices: string[]): Promise<number | null>;
  input(prompt: string, initial?: string): Promise<string | null>;
  editor(prompt: string, initial: string): Promise<string | null>;
  confirm(prompt: string): Promise<boolean>;
  say(msg: string): void;
}

export interface CaptureCtx {
  cwd: string;
  ui: CaptureUI;
  /** Entries of the CURRENT session, unresolved — `activeBranch` picks the live chain. */
  sessionEntries(): SessionEntry[];
  /** Absolute path of the session file, hashed into provenance and never stored raw. */
  sessionPath(): string;
  /** True while the agent is still producing output. */
  isStreaming(): boolean;
  /** Skill names pi currently has in context, offered as target candidates. */
  candidateSkills?(): string[];
  homeDir?: string;
  now?: () => string;
  /** Injected so a promoted case can be run immediately; omitted in tests. */
  runOnly?(skillDir: string, scenarioId: string): Promise<string>;
}

export interface CaptureResult {
  status: "cancelled" | "pending" | "promoted";
  capture?: CaptureCaseV1;
  files: string[];
  scenarioId?: string;
}

const CANCELLED: CaptureResult = { status: "cancelled", files: [] };

/** `.local/` holds unredacted-ish review evidence and must never be committed. */
const CAPTURES_GITIGNORE = "# Local review evidence for captured cases — never commit.\n.local/\n";

export async function runCapture(skillDir: string, ctx: CaptureCtx): Promise<CaptureResult> {
  const ui = ctx.ui;
  const now = ctx.now ?? (() => new Date().toISOString());

  // 1. Never read a half-written conversation.
  if (ctx.isStreaming()) {
    ui.say("the agent is still streaming — let it finish, then run capture again");
    return CANCELLED;
  }

  const specPath = join(skillDir, "tests", "specification.yaml");
  if (!existsSync(specPath)) {
    ui.say(`${specPath} does not exist — run \`skill-harness init\` before capturing into this skill`);
    return CANCELLED;
  }

  // Baseline the spec NOW, before the interview.
  //
  // Hashing it just before the append would make the check meaningless: the
  // window it guards is the minutes a human spends choosing turns and writing a
  // checklist, not the microseconds around the write. An edit landing in that
  // window is exactly the case where appending blind would clobber someone.
  const baseSha256 = specSha256(readFileSync(specPath, "utf8"));

  // 2-3. Active branch only, grouped into logical turns.
  const turns = projectTurns(activeBranch(ctx.sessionEntries()), ctx.homeDir);
  if (turns.length === 0) {
    ui.say("no user turns in this session yet — nothing to capture");
    return CANCELLED;
  }

  // 4. Contiguous turn range. pi exposes no API for arbitrary highlighted text,
  // so turn-level selection is the supported contract, not a stopgap.
  const labels = turns.map((t) => turnLabel(t));
  const start = await ui.select("capture from which turn?", labels);
  if (start === null) return CANCELLED;
  const endChoices = labels.slice(start);
  const endRel = await ui.select("…through which turn?", endChoices);
  if (endRel === null) return CANCELLED;
  const end = start + endRel;

  // 5. Target. Detection is a convenience; the human confirms, because a session
  // records what happened, not what was responsible for it.
  const target = await chooseTarget(skillDir, ctx);
  if (!target) return CANCELLED;

  // 6. Classification.
  const cls = await ui.select("what is this?", [
    "failure — the agent got this wrong",
    "good_example — the agent got this right, keep it working",
  ]);
  if (cls === null) return CANCELLED;
  const classification = cls === 0 ? "failure" : "good_example";

  // 7. The expectation, in the human's words. Required: a capture with no stated
  // expectation is not reviewable, and no amount of transcript substitutes.
  const expected = await ui.input("what SHOULD it have done? (one or two sentences)");
  if (expected === null || expected.trim() === "") {
    ui.say("cancelled — a capture needs a written expectation");
    return CANCELLED;
  }

  // 8. Offline draft, always opened for correction.
  const drafted = draftChecklist(expected);
  const edited = await ui.editor(
    "checklist — one item per line; these are what the judge grades",
    (drafted.length ? drafted : [expected.trim()]).join("\n"),
  );
  if (edited === null) return CANCELLED;
  const checklist = edited.split("\n").map((l) => l.trim()).filter(Boolean);
  if (checklist.length === 0) {
    ui.say("cancelled — a capture needs at least one checklist item");
    return CANCELLED;
  }

  const capturesDir = join(skillDir, "tests", "captures");
  const existingIds = existsSync(capturesDir)
    ? readdirSync(capturesDir).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, ""))
    : [];

  const capture = buildCaptureCase({
    turns,
    range: { start, end },
    classification,
    expectedBehavior: expected,
    checklist,
    target,
    sessionPath: ctx.sessionPath(),
    created: now(),
    homeDir: ctx.homeDir,
    existingIds,
  });

  // 9. Preview before ANY write. Non-negotiable: this is the last point at which
  // a human can see what is about to land in a committed file.
  const previewYaml = yaml.dump(capture, { lineWidth: -1, noRefs: true });
  ui.say(`\n--- ${capture.id} (preview, nothing written yet) ---\n${previewYaml}---`);

  // 10. Save / promote / cancel.
  const action = await ui.select("what now?", [
    "save as a pending capture (review and promote later)",
    "promote to a scenario now",
    "cancel — write nothing",
  ]);
  if (action === null || action === 2) {
    ui.say("cancelled — no files written");
    return CANCELLED;
  }

  const files = writeCapture(capturesDir, capture, turns.slice(start, end + 1), ctx.homeDir);

  if (action === 0) {
    ui.say(`saved ${capture.id} — promote it later, or edit ${files[0]} first`);
    return { status: "pending", capture, files };
  }

  // Promote. The scenario id is the human's, not derived: it goes into a spec
  // whose ids are an author-facing naming scheme.
  const suggested = suggestScenarioId(specPath, capture.id);
  const scenarioId = await ui.input("scenario id for the spec", suggested);
  if (scenarioId === null || scenarioId.trim() === "") {
    ui.say(`kept ${capture.id} as pending — no scenario appended`);
    return { status: "pending", capture, files };
  }
  const title = await ui.input("scenario title", defaultTitle(capture));
  if (title === null || title.trim() === "") {
    ui.say(`kept ${capture.id} as pending — no scenario appended`);
    return { status: "pending", capture, files };
  }

  appendScenario({
    specPath,
    scenario: captureToScenario(capture, scenarioId.trim(), title.trim()),
    baseSha256,
  });

  const promoted: CaptureCaseV1 = { ...capture, status: "promoted", scenario_id: scenarioId.trim() };
  writeFileSync(join(capturesDir, `${capture.id}.yaml`), yaml.dump(promoted, { lineWidth: -1, noRefs: true }), "utf8");
  ui.say(`promoted ${capture.id} → scenario ${scenarioId.trim()} in ${specPath}`);

  // 11. Optional run of JUST the new scenario. This is the only spending path,
  // and it is opt-in with the cost named.
  if (ctx.runOnly && (await ui.confirm(`run scenario ${scenarioId.trim()} now? (spends subject + judge tokens for 1 scenario)`))) {
    ui.say(await ctx.runOnly(skillDir, scenarioId.trim()));
  }

  return { status: "promoted", capture: promoted, files: [...files, specPath], scenarioId: scenarioId.trim() };
}

// ------------------------------------------------------------------ helpers

function turnLabel(t: LogicalTurn): string {
  const head = t.user.replace(/\s+/g, " ").trim();
  const tools = t.toolCalls.length ? ` [${t.toolCalls.length} tool call(s)]` : "";
  return `${t.index + 1}. ${head.length > 70 ? `${head.slice(0, 70)}…` : head}${tools}`;
}

function defaultTitle(capture: CaptureCaseV1): string {
  const first = capture.turns[0] ?? "captured case";
  const trimmed = first.replace(/\s+/g, " ").trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

/**
 * Offer detected candidates, but require an explicit choice.
 *
 * Candidates come from the skills pi has in context and any `.pi/agents/*.md`.
 * None of that establishes causal responsibility — the session shows what was
 * loaded, not what caused the behavior — so there is no "best guess" default.
 */
async function chooseTarget(skillDir: string, ctx: CaptureCtx): Promise<CaptureTarget | null> {
  const candidates: { label: string; kind: "skill" | "subagent"; path: string; abs: string }[] = [];

  const skillMd = join(skillDir, "SKILL.md");
  if (existsSync(skillMd)) candidates.push({ label: "SKILL.md (this skill)", kind: "skill", path: "SKILL.md", abs: skillMd });

  const agentsDir = join(ctx.cwd, ".pi", "agents");
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
      candidates.push({ label: `subagent: ${f}`, kind: "subagent", path: join(".pi", "agents", f), abs: join(agentsDir, f) });
    }
  }

  if (candidates.length === 0) {
    ctx.ui.say("no SKILL.md or .pi/agents/*.md found to attribute this to");
    return null;
  }

  const pick = await ctx.ui.select("which instructions are responsible? (your call — the session cannot prove this)", candidates.map((c) => c.label));
  if (pick === null) return null;
  const chosen = candidates[pick];
  return {
    kind: chosen.kind,
    path: chosen.path,
    content_sha256: createHash("sha256").update(readFileSync(chosen.abs, "utf8"), "utf8").digest("hex"),
  };
}

/** Next free `R<n>` id, so a promoted capture does not collide with hand-written ids. */
function suggestScenarioId(specPath: string, fallback: string): string {
  try {
    const ids = new Set(loadSpec(specPath).scenarios.map((s) => s.id));
    for (let n = 1; n < 1000; n++) {
      const candidate = `R${n}`;
      if (!ids.has(candidate)) return candidate;
    }
  } catch {
    // An unreadable spec is the append's problem to report, not this hint's.
  }
  return fallback;
}

/**
 * Write the reviewed case and its git-ignored evidence sidecar.
 *
 * The sidecar carries the assistant excerpt and tool summaries a reviewer needs
 * and the committed case deliberately omits. It is ignored via a `.gitignore`
 * written into `captures/` — a repo-level rule would depend on the consuming
 * repo remembering to add one.
 */
function writeCapture(capturesDir: string, capture: CaptureCaseV1, selected: LogicalTurn[], homeDir?: string): string[] {
  mkdirSync(join(capturesDir, ".local"), { recursive: true });

  // Rewritten unless it already ignores `.local/`. Writing only when ABSENT
  // meant a captures/.gitignore edited (or written by an older version) to
  // something that no longer covers `.local/` would leave the evidence sidecar
  // — unredacted-length assistant text and tool arguments — tracked and
  // committable. The file existing is not evidence that it ignores anything.
  const gitignore = join(capturesDir, ".gitignore");
  const existingIgnore = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  if (!existingIgnore.split("\n").some((l) => l.trim() === ".local/" || l.trim() === ".local")) {
    writeFileSync(gitignore, existingIgnore ? `${existingIgnore.replace(/\n*$/, "\n")}${CAPTURES_GITIGNORE}` : CAPTURES_GITIGNORE, "utf8");
  }

  const casePath = join(capturesDir, `${capture.id}.yaml`);
  writeFileSync(casePath, yaml.dump(capture, { lineWidth: -1, noRefs: true }), "utf8");

  const evidencePath = join(capturesDir, ".local", `${capture.id}.evidence.json`);
  writeFileSync(
    evidencePath,
    JSON.stringify(
      {
        capture_id: capture.id,
        assistant_excerpt: selected.map((t) => redactText(t.assistantText, homeDir)).join("\n---\n").slice(0, 4000),
        tool_calls: selected.flatMap((t) => t.toolCalls.map((c) => ({ name: c.name, isError: c.isError, args: c.args }))),
      },
      null,
      2,
    ),
    "utf8",
  );

  return [casePath, evidencePath, gitignore];
}
