/** Marker written into an `init` template's first comment. Its presence tells
 *  `suggest` the file is an unadopted template it may overwrite without --force. */
export const TEMPLATE_SENTINEL = "skill-harness: generated template";

/** Render a commented, empty-but-valid specification.yaml for a skill. */
export function renderTemplateSpec(skillName: string): string {
  return `# ${TEMPLATE_SENTINEL} — \`suggest\` will overwrite this file while
# this line is present; delete it once you start editing by hand.
skill: ${skillName}

# How the LLM judge should role-play when grading transcripts.
judge_persona: >
  a careful, fair reviewer.

# The ship bar: what it takes to SHIP.
#   total    = scenarios counted toward the bar
#   min_pass = minimum passes required
#   no_critical_fail = a critical-id fail blocks SHIP even if min_pass is met
ship_bar:
  total: 1
  min_pass: 1
  no_critical_fail: true

# Scenario ids that block the ship if they fail (or set \`critical: true\` per scenario).
critical: []

scenarios:
  # A* = baseline capability · B* = under-pressure / adversarial
  - id: A1
    title: describe what this scenario checks
    # critical: true            # uncomment to gate the ship on this scenario
    turns:
      - "the user's first message"
      # - "a follow-up message for a multi-turn scenario"
    checklist:
      - "an observable thing the response must do"
`;
}

/** True if the text still carries the template sentinel (i.e. an unadopted template). */
export function isTemplateSpec(text: string): boolean {
  return text.includes(TEMPLATE_SENTINEL);
}

export interface DraftScenario {
  id: string;
  title: string;
  turns: string[];
  checklist: string[];
}

export interface SuggestDraft {
  judge_persona: string;
  ship_bar: { total: number; min_pass: number; no_critical_fail: boolean };
  proposed_critical: string[];
  scenarios: DraftScenario[];
}

/** Render a populated spec from an LLM draft. Strings are JSON-encoded (valid YAML
 *  flow scalars) so colons/quotes never break the file. Carries no sentinel. */
export function renderDraftSpec(skillName: string, draft: SuggestDraft): string {
  const scenarioBlocks = draft.scenarios
    .map((s) => {
      const turns = s.turns.map((t) => `      - ${JSON.stringify(t)}`).join("\n");
      const checks = s.checklist.map((c) => `      - ${JSON.stringify(c)}`).join("\n");
      return `  - id: ${s.id}\n    title: ${JSON.stringify(s.title)}\n    turns:\n${turns}\n    checklist:\n${checks}`;
    })
    .join("\n");
  const proposed = draft.proposed_critical.length
    ? `# proposed critical: [${draft.proposed_critical.join(", ")}] — move ids into \`critical: []\` below after review.`
    : `# proposed critical: (none) — mark any ship-gating scenarios in \`critical: []\` below.`;
  return `skill: ${skillName}

# REVIEW: does this judge persona fit the skill? Edit freely.
judge_persona: ${JSON.stringify(draft.judge_persona)}

# REVIEW: tune the ship bar before your first run.
ship_bar:
  total: ${draft.ship_bar.total}
  min_pass: ${draft.ship_bar.min_pass}
  no_critical_fail: ${draft.ship_bar.no_critical_fail}

${proposed}
critical: []

scenarios:
${scenarioBlocks}
`;
}

export function buildSuggestPrompt(skillName: string, skillMd: string): string {
  return `You are drafting a test specification for an agent skill named "${skillName}".
Below is its SKILL.md. Propose scenarios that check whether an agent following this
skill behaves correctly, including at least one adversarial / under-pressure case.

Return ONLY a JSON object (no prose, no markdown fences) with exactly this shape:
{
  "judge_persona": "<how a judge should role-play when grading transcripts>",
  "ship_bar": { "total": <int>, "min_pass": <int>, "no_critical_fail": true },
  "proposed_critical": ["<scenario id you think should gate the ship>", ...],
  "scenarios": [
    { "id": "A1", "title": "<short title>",
      "turns": ["<the user's message>", "<optional follow-up turns>"],
      "checklist": ["<an observable thing the response must do>", ...] }
  ]
}
Use ids A1, A2, ... for baseline scenarios and B1, B2, ... for adversarial ones.
Every scenario needs at least one turn and one checklist item.

--- SKILL.md ---
${skillMd}`;
}

/** Ids are interpolated raw into YAML (see renderDraftSpec); restrict the character
 *  set so a crafted id can never inject extra YAML keys (e.g. `critical: true`). */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

function asStringArray(v: unknown, ctx: string): string[] {
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string")) {
    throw new Error(`${ctx} must be a non-empty array of strings`);
  }
  return v as string[];
}

export function parseSuggestDraft(raw: string): SuggestDraft {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`model output is not valid JSON — ${(e as Error).message}`);
  }

  if (typeof obj.judge_persona !== "string" || !obj.judge_persona.trim()) {
    throw new Error("judge_persona must be a non-empty string");
  }
  const sb = obj.ship_bar as Record<string, unknown> | undefined;
  if (!sb || typeof sb.total !== "number" || typeof sb.min_pass !== "number") {
    throw new Error("ship_bar must have numeric total and min_pass");
  }
  const proposed = Array.isArray(obj.proposed_critical)
    ? (obj.proposed_critical.filter((x) => typeof x === "string" && SAFE_ID.test(x)) as string[])
    : [];
  if (!Array.isArray(obj.scenarios) || obj.scenarios.length === 0) {
    throw new Error("scenarios must be a non-empty array");
  }
  const scenarios: DraftScenario[] = obj.scenarios.map((raw2, i) => {
    const s = raw2 as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id.trim()) throw new Error(`scenario #${i + 1} needs a string id`);
    if (!SAFE_ID.test(s.id)) throw new Error(`scenario id \`${s.id}\` must be alphanumeric (A-Z a-z 0-9 _ -)`);
    if (typeof s.title !== "string" || !s.title.trim()) throw new Error(`scenario ${s.id} needs a title`);
    return {
      id: s.id,
      title: s.title,
      turns: asStringArray(s.turns, `scenario ${s.id} turns`),
      checklist: asStringArray(s.checklist, `scenario ${s.id} checklist`),
    };
  });

  return {
    judge_persona: obj.judge_persona,
    ship_bar: { total: sb.total, min_pass: sb.min_pass, no_critical_fail: sb.no_critical_fail !== false },
    proposed_critical: proposed,
    scenarios,
  };
}
