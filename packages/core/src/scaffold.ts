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
