# init + suggest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two CLI commands — `init` (free, offline: write a commented template spec) and `suggest` (LLM-drafts a spec from a skill's `SKILL.md`) — so a stranger gets a runnable `tests/specification.yaml` without hand-authoring YAML.

**Architecture:** A new `packages/core/src/scaffold.ts` owns all spec *rendering* (template + draft) plus the LLM prompt/parse helpers, so it is testable without the CLI or a live model. Thin command wrappers in `packages/cli/src/cli.ts` do resolution, collision checks, and (for `suggest`) call `adapter.judge`. Every render is validated through the existing `parseSpec` before any disk write.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Node ≥ 20, vitest, js-yaml. Monorepo packages `@skill-harness/core`, `@skill-harness/cli`, `@skill-harness/adapters`.

## Global Constraints

- Node ≥ 20; ESM throughout — import local modules with `.js` specifiers even from `.ts`.
- No new `SKILL_CHECK_*`-prefixed names (ROADMAP rule 5).
- Do not break the `specification.yaml` schema (`packages/core/src/spec.ts`); every rendered spec MUST pass `parseSpec`.
- Never paywall/gate the run→grade→review loop; `init`/`suggest` are free-tier commands (`init` spends nothing; `suggest` spends model tokens like `run`).
- `suggest` default model: `claude-code:claude-opus-4-8` (subscription via `claude -p`, no metered key). `adapter.judge` already special-cases the `claude-code` provider.
- Feature is not "done" until a launch-post draft exists in `docs/posts/` (ROADMAP rule 2).
- After changing `packages/cli` or `packages/core` source, regenerate the committed pi-extension bundle (`npm run build:ext`) and commit it if it changed — `packages/pi-extension` has a `bundle.test.ts` guard that fails on a stale bundle.

---

## File Structure

- **Create** `packages/core/src/scaffold.ts` — `TEMPLATE_SENTINEL`, `renderTemplateSpec`, `isTemplateSpec`, `SuggestDraft`/`DraftScenario` types, `renderDraftSpec`, `buildSuggestPrompt`, `parseSuggestDraft`.
- **Modify** `packages/core/src/index.ts` — export `./scaffold.js`.
- **Create** `packages/core/test/scaffold.test.ts` — unit tests for the renderers + parser.
- **Modify** `packages/cli/src/cli.ts` — `cmdInit`, `cmdSuggest`, dispatch cases, `HELP`, imports, `DEFAULT_SUGGEST_MODEL`.
- **Create** `packages/cli/test/init-cmd.test.ts`, `packages/cli/test/suggest-cmd.test.ts`.
- **Modify** `README.md`, `docs/USAGE.md`, `AGENTS.md` — document both commands.
- **Create** `docs/posts/2026-07-06-suggest.md` — launch-post draft.
- **Modify** `docs/ROADMAP.md` — check off the two Sprint 1.1 tasks.

Verify commands referenced below:
- Core tests: `npm test -w @skill-harness/core -- <file>` (or run all: `npm test`).
- CLI tests: `npm test -w @skill-harness/cli -- <file>`.
- Typecheck: `npm run typecheck`.

---

### Task 1: `scaffold.ts` — template renderer + sentinel detector

**Files:**
- Create: `packages/core/src/scaffold.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/scaffold.test.ts`

**Interfaces:**
- Consumes: `parseSpec(text, file)` from `./spec.js`.
- Produces:
  - `export const TEMPLATE_SENTINEL = "skill-harness: generated template"`
  - `export function renderTemplateSpec(skillName: string): string`
  - `export function isTemplateSpec(text: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/scaffold.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { parseSpec } from "../src/spec.js";
import { renderTemplateSpec, isTemplateSpec, TEMPLATE_SENTINEL } from "../src/scaffold.js";

describe("renderTemplateSpec", () => {
  test("produces a spec that parses, named for the skill, carrying the sentinel", () => {
    const text = renderTemplateSpec("my-skill");
    const spec = parseSpec(text, "tests/specification.yaml");
    expect(spec.skill).toBe("my-skill");
    expect(spec.scenarios.length).toBeGreaterThan(0);
    expect(text).toContain(TEMPLATE_SENTINEL);
    expect(isTemplateSpec(text)).toBe(true);
  });

  test("isTemplateSpec is false once the sentinel line is gone", () => {
    const edited = renderTemplateSpec("my-skill").replace(/^#.*\n#.*\n/, "");
    expect(edited).not.toContain(TEMPLATE_SENTINEL);
    expect(isTemplateSpec(edited)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @skill-harness/core -- scaffold`
Expected: FAIL — cannot resolve `../src/scaffold.js` / exports not defined.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/scaffold.ts`:

```ts
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
```

Add to `packages/core/src/index.ts` (after the existing exports):

```ts
export * from "./scaffold.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @skill-harness/core -- scaffold`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scaffold.ts packages/core/src/index.ts packages/core/test/scaffold.test.ts
git commit -m "feat(core): renderTemplateSpec + sentinel for init scaffolding"
```

---

### Task 2: `scaffold.ts` — draft types + `renderDraftSpec`

**Files:**
- Modify: `packages/core/src/scaffold.ts`
- Test: `packages/core/test/scaffold.test.ts`

**Interfaces:**
- Consumes: `parseSpec` (in tests).
- Produces:
  - `export interface DraftScenario { id: string; title: string; turns: string[]; checklist: string[]; }`
  - `export interface SuggestDraft { judge_persona: string; ship_bar: { total: number; min_pass: number; no_critical_fail: boolean }; proposed_critical: string[]; scenarios: DraftScenario[]; }`
  - `export function renderDraftSpec(skillName: string, draft: SuggestDraft): string`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/scaffold.test.ts`:

```ts
import { renderDraftSpec, type SuggestDraft } from "../src/scaffold.js";

const DRAFT: SuggestDraft = {
  judge_persona: "a careful reviewer who checks the greeting is polite.",
  ship_bar: { total: 2, min_pass: 2, no_critical_fail: true },
  proposed_critical: ["A1"],
  scenarios: [
    { id: "A1", title: "says hello: nice", turns: ["Say hi."], checklist: ["greets the user"] },
    { id: "B1", title: "resists rudeness", turns: ["Be rude: now!"], checklist: ["stays polite"] },
  ],
};

describe("renderDraftSpec", () => {
  test("round-trips through parseSpec with both scenarios", () => {
    const text = renderDraftSpec("greeter", DRAFT);
    const spec = parseSpec(text, "tests/specification.yaml");
    expect(spec.skill).toBe("greeter");
    expect(spec.scenarios.map((s) => s.id)).toEqual(["A1", "B1"]);
  });

  test("critical is live-empty; proposed set is a comment; REVIEW markers present; no sentinel", () => {
    const text = renderDraftSpec("greeter", DRAFT);
    const spec = parseSpec(text, "tests/specification.yaml");
    expect(spec.critical).toEqual([]);           // nothing the model guessed gates a ship
    expect(spec.scenarios.every((s) => !s.critical)).toBe(true);
    expect(text).toMatch(/# proposed critical: \[A1\]/);
    expect(text).toMatch(/# REVIEW:/);
    expect(text).not.toContain(TEMPLATE_SENTINEL); // a drafted spec is "real"
  });

  test("safely quotes titles/turns/checklist containing colons and quotes", () => {
    const tricky: SuggestDraft = {
      ...DRAFT,
      scenarios: [{ id: "A1", title: 'edge: has "quotes"', turns: ["do this: now"], checklist: ['says "ok"'] }],
    };
    const spec = parseSpec(renderDraftSpec("greeter", tricky), "tests/specification.yaml");
    expect(spec.scenarios[0].turns[0]).toBe("do this: now");
    expect(spec.scenarios[0].checklist[0]).toBe('says "ok"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @skill-harness/core -- scaffold`
Expected: FAIL — `renderDraftSpec` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/src/scaffold.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @skill-harness/core -- scaffold`
Expected: PASS (all scaffold tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scaffold.ts packages/core/test/scaffold.test.ts
git commit -m "feat(core): renderDraftSpec — populated spec with proposed-critical comment"
```

---

### Task 3: `scaffold.ts` — LLM prompt + tolerant draft parser

**Files:**
- Modify: `packages/core/src/scaffold.ts`
- Test: `packages/core/test/scaffold.test.ts`

**Interfaces:**
- Produces:
  - `export function buildSuggestPrompt(skillName: string, skillMd: string): string`
  - `export function parseSuggestDraft(raw: string): SuggestDraft` — extracts the outermost `{…}` (tolerates prose / ```json fences), `JSON.parse`s it, validates shape; throws `Error` on any problem.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/scaffold.test.ts`:

```ts
import { buildSuggestPrompt, parseSuggestDraft } from "../src/scaffold.js";

const GOOD_JSON = JSON.stringify({
  judge_persona: "a fair reviewer.",
  ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
  proposed_critical: ["A1"],
  scenarios: [{ id: "A1", title: "t", turns: ["hi"], checklist: ["greets"] }],
});

describe("buildSuggestPrompt", () => {
  test("embeds the skill name and SKILL.md and asks for JSON", () => {
    const p = buildSuggestPrompt("greeter", "# Greeter\nsay hi");
    expect(p).toContain("greeter");
    expect(p).toContain("say hi");
    expect(p).toMatch(/JSON/);
  });
});

describe("parseSuggestDraft", () => {
  test("parses clean JSON", () => {
    const d = parseSuggestDraft(GOOD_JSON);
    expect(d.scenarios[0].id).toBe("A1");
    expect(d.proposed_critical).toEqual(["A1"]);
  });

  test("tolerates markdown fences and surrounding prose", () => {
    const wrapped = "Sure! Here you go:\n```json\n" + GOOD_JSON + "\n```\nHope that helps.";
    expect(parseSuggestDraft(wrapped).scenarios.length).toBe(1);
  });

  test("throws when there is no JSON object", () => {
    expect(() => parseSuggestDraft("I cannot help with that.")).toThrow(/no JSON object/);
  });

  test("throws on a malformed shape (scenario missing turns)", () => {
    const bad = JSON.stringify({
      judge_persona: "x", ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
      proposed_critical: [], scenarios: [{ id: "A1", title: "t", checklist: ["c"] }],
    });
    expect(() => parseSuggestDraft(bad)).toThrow(/turns/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @skill-harness/core -- scaffold`
Expected: FAIL — `buildSuggestPrompt` / `parseSuggestDraft` not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `packages/core/src/scaffold.ts`:

```ts
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
    ? (obj.proposed_critical.filter((x) => typeof x === "string") as string[])
    : [];
  if (!Array.isArray(obj.scenarios) || obj.scenarios.length === 0) {
    throw new Error("scenarios must be a non-empty array");
  }
  const scenarios: DraftScenario[] = obj.scenarios.map((raw2, i) => {
    const s = raw2 as Record<string, unknown>;
    if (typeof s.id !== "string" || !s.id.trim()) throw new Error(`scenario #${i + 1} needs a string id`);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @skill-harness/core -- scaffold`
Expected: PASS (all scaffold tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scaffold.ts packages/core/test/scaffold.test.ts
git commit -m "feat(core): buildSuggestPrompt + tolerant parseSuggestDraft"
```

---

### Task 4: `cmdInit` — the free, offline command

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/test/init-cmd.test.ts`

**Interfaces:**
- Consumes: `renderTemplateSpec`, `parseSpec`, `resolveSkill`, `flagStr`, `DiscoveredSkill` (`.name`, `.dir`, `.hasSpec`, `.specPath`).
- Produces: `export async function cmdInit(args: Args): Promise<void>`; dispatch `case "init"`.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/init-cmd.test.ts`:

```ts
import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, isTemplateSpec } from "@skill-harness/core";
import { cmdInit } from "../src/cli.js";

const tmps: string[] = [];
function tmpRoot() {
  const d = mkdtempSync(join(tmpdir(), "sh-init-"));
  tmps.push(d);
  return d;
}
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

/** Make <root>/<skill>/ with a SKILL.md but no spec yet. */
function skillRoot(name = "greeter") {
  const root = tmpRoot();
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "SKILL.md"), "# Greeter\nsay hi", "utf8");
  return { root, specPath: join(root, name, "tests", "specification.yaml") };
}
function args(root: string, name: string, extra: Record<string, string | true> = {}) {
  return { _: [name], flags: { skills: root, ...extra }, multi: {} };
}

describe("cmdInit", () => {
  test("writes a parseable template carrying the sentinel", async () => {
    const { root, specPath } = skillRoot();
    await cmdInit(args(root, "greeter"));
    expect(existsSync(specPath)).toBe(true);
    const text = readFileSync(specPath, "utf8");
    expect(parseSpec(text, specPath).skill).toBe("greeter");
    expect(isTemplateSpec(text)).toBe(true);
  });

  test("refuses to overwrite an existing spec without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "hand-written: do not clobber", "utf8");
    await expect(cmdInit(args(root, "greeter"))).rejects.toThrow(/--force/);
    expect(readFileSync(specPath, "utf8")).toBe("hand-written: do not clobber");
  });

  test("--force overwrites", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "old", "utf8");
    await cmdInit(args(root, "greeter", { force: true }));
    expect(isTemplateSpec(readFileSync(specPath, "utf8"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @skill-harness/cli -- init-cmd`
Expected: FAIL — `cmdInit` not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/cli.ts`:

1. Extend the `node:fs` import to add `mkdirSync`, `writeFileSync`:

```ts
import { readFileSync, existsSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
```

2. Extend the `@skill-harness/core` import to add the scaffold names:

```ts
  renderTemplateSpec, isTemplateSpec, renderDraftSpec, buildSuggestPrompt, parseSuggestDraft,
```

3. Add the command (place it next to `cmdAddTest`):

```ts
export async function cmdInit(args: Args): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness init <skill> --skills <root> [--force]");
  const skill = resolveSkill(root, target);
  const force = flagStr(args, "force") !== undefined;
  if (skill.hasSpec && !force) {
    throw new Error(`${skill.specPath} exists — edit it, or pass --force to overwrite`);
  }
  const text = renderTemplateSpec(skill.name);
  parseSpec(text, skill.specPath); // guard: the template must always be valid
  mkdirSync(dirname(skill.specPath), { recursive: true });
  writeFileSync(skill.specPath, text, "utf8");
  console.log(`wrote template ${skill.specPath} — fill it in, or run \`skill-harness suggest ${skill.name}\` to LLM-draft it.`);
}
```

4. Add a dispatch case in `main`'s switch (after `case "add-test"`):

```ts
    case "init": return cmdInit(args);
```

5. Add to `HELP` (after the `add-test` line):

```
  init   <skill>     --skills <root> [--force]     scaffold a commented template spec (free, offline)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @skill-harness/cli -- init-cmd`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/test/init-cmd.test.ts
git commit -m "feat(cli): init — scaffold a commented template spec"
```

---

### Task 5: `cmdSuggest` — LLM-drafted spec

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Test: `packages/cli/test/suggest-cmd.test.ts`

**Interfaces:**
- Consumes: `buildSuggestPrompt`, `parseSuggestDraft`, `renderDraftSpec`, `isTemplateSpec`, `parseSpec`, `resolveSkill`, `parseModelRef`, `getAdapter`, `HarnessAdapter`; Node `mkdtempSync`, `rmSync`, `tmpdir`.
- Produces: `export async function cmdSuggest(args: Args, adapterOverride?: HarnessAdapter): Promise<void>`; dispatch `case "suggest"`; `const DEFAULT_SUGGEST_MODEL = "claude-code:claude-opus-4-8"`.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/test/suggest-cmd.test.ts`:

```ts
import { describe, test, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSpec, renderTemplateSpec, type HarnessAdapter } from "@skill-harness/core";
import { cmdSuggest } from "../src/cli.js";

const GOOD_JSON = JSON.stringify({
  judge_persona: "a fair reviewer.",
  ship_bar: { total: 1, min_pass: 1, no_critical_fail: true },
  proposed_critical: ["A1"],
  scenarios: [{ id: "A1", title: "says hi", turns: ["Say hi."], checklist: ["greets the user"] }],
});

/** An adapter whose judge returns queued replies in order. */
function fakeAdapter(replies: string[]): HarnessAdapter {
  let i = 0;
  return {
    name: "pi",
    available: async () => true,
    run: async () => "",
    judge: async () => replies[Math.min(i++, replies.length - 1)],
  };
}

const tmps: string[] = [];
function tmpRoot() { const d = mkdtempSync(join(tmpdir(), "sh-suggest-")); tmps.push(d); return d; }
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

function skillRoot(name = "greeter") {
  const root = tmpRoot();
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "SKILL.md"), "# Greeter\nsay hi", "utf8");
  return { root, specPath: join(root, name, "tests", "specification.yaml") };
}
function args(root: string, name: string, extra: Record<string, string | true> = {}) {
  return { _: [name], flags: { skills: root, ...extra }, multi: {} };
}

describe("cmdSuggest", () => {
  test("happy path writes a valid drafted spec", async () => {
    const { root, specPath } = skillRoot();
    await cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]));
    const spec = parseSpec(readFileSync(specPath, "utf8"), specPath);
    expect(spec.scenarios[0].id).toBe("A1");
    expect(spec.critical).toEqual([]); // proposed critical stays a comment
  });

  test("invalid JSON then valid JSON succeeds on retry", async () => {
    const { root, specPath } = skillRoot();
    await cmdSuggest(args(root, "greeter"), fakeAdapter(["not json at all", GOOD_JSON]));
    expect(existsSync(specPath)).toBe(true);
  });

  test("invalid twice writes nothing and throws", async () => {
    const { root, specPath } = skillRoot();
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter(["nope", "still nope"]))).rejects.toThrow(/could not get a valid spec/);
    expect(existsSync(specPath)).toBe(false);
  });

  test("overwrites a sentinel-bearing template without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, renderTemplateSpec("greeter"), "utf8");
    await cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]));
    expect(readFileSync(specPath, "utf8")).toMatch(/# proposed critical/);
  });

  test("refuses a sentinel-less (hand-edited) spec without --force", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "skill: greeter\njudge_persona: mine\nship_bar: {total: 1, min_pass: 1}\ncritical: []\nscenarios:\n  - id: A1\n    title: t\n    turns: [\"hi\"]\n    checklist: [\"greets\"]\n", "utf8");
    const before = readFileSync(specPath, "utf8");
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]))).rejects.toThrow(/--force/);
    expect(readFileSync(specPath, "utf8")).toBe(before);
  });

  test("--force overwrites a hand-edited spec", async () => {
    const { root, specPath } = skillRoot();
    mkdirSync(join(root, "greeter", "tests"), { recursive: true });
    writeFileSync(specPath, "skill: greeter\njudge_persona: mine\nship_bar: {total: 1, min_pass: 1}\ncritical: []\nscenarios:\n  - id: Z9\n    title: t\n    turns: [\"hi\"]\n    checklist: [\"greets\"]\n", "utf8");
    await cmdSuggest(args(root, "greeter", { force: true }), fakeAdapter([GOOD_JSON]));
    expect(parseSpec(readFileSync(specPath, "utf8"), specPath).scenarios[0].id).toBe("A1");
  });

  test("errors when the model produces no output", async () => {
    const { root } = skillRoot();
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter(["[judge error: claude exited 127] not found"]))).rejects.toThrow(/no output|--model/);
  });

  test("errors when SKILL.md is missing", async () => {
    const root = tmpRoot();
    mkdirSync(join(root, "greeter"), { recursive: true }); // no SKILL.md
    await expect(cmdSuggest(args(root, "greeter"), fakeAdapter([GOOD_JSON]))).rejects.toThrow(/SKILL\.md/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @skill-harness/cli -- suggest-cmd`
Expected: FAIL — `cmdSuggest` not exported.

- [ ] **Step 3: Write minimal implementation**

In `packages/cli/src/cli.ts`:

1. Add Node imports for the neutral cwd (extend the existing `node:os`/add one). Add near the top imports:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
```

(If a `node:fs` import line already lists names, merge `mkdtempSync`, `rmSync` into it instead of adding a second line.)

2. Add the default model constant next to `DEFAULT_JUDGE`:

```ts
const DEFAULT_SUGGEST_MODEL = "claude-code:claude-opus-4-8";
```

3. Add the command (next to `cmdInit`):

```ts
export async function cmdSuggest(args: Args, adapterOverride?: HarnessAdapter): Promise<void> {
  const root = flagStr(args, "skills", process.cwd())!;
  const target = args._[0];
  if (!target) throw new Error("usage: skill-harness suggest <skill> --skills <root> [--model prov:model] [--force]");
  const skill = resolveSkill(root, target);

  const skillMdPath = join(skill.dir, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    throw new Error(`${skillMdPath} not found — suggest drafts from the skill's SKILL.md`);
  }
  const skillMd = readFileSync(skillMdPath, "utf8");

  const force = flagStr(args, "force") !== undefined;
  if (skill.hasSpec && !force && !isTemplateSpec(readFileSync(skill.specPath, "utf8"))) {
    throw new Error(`${skill.specPath} already has real content — pass --force to overwrite`);
  }

  const model = parseModelRef(flagStr(args, "model", DEFAULT_SUGGEST_MODEL)!);
  const adapter = adapterOverride ?? getAdapter("pi");
  const cwd = mkdtempSync(join(tmpdir(), "sh-suggest-cwd-"));
  try {
    const basePrompt = buildSuggestPrompt(skill.name, skillMd);
    let text: string | null = null;
    let count = 0;
    let lastErr = "";
    for (let attempt = 0; attempt < 2 && text === null; attempt++) {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nYour previous reply was rejected: ${lastErr}. Return corrected JSON only.`;
      const raw = await adapter.judge({ model, prompt, cwd });
      if (!raw.trim() || raw.startsWith("[judge error")) {
        throw new Error(`model ${model.provider}:${model.model} produced no output — ${raw.trim() || "is it installed and authenticated?"} (try --model fireworks:...)`);
      }
      try {
        const draft = parseSuggestDraft(raw);
        const candidate = renderDraftSpec(skill.name, draft);
        parseSpec(candidate, skill.specPath); // validate before writing
        text = candidate;
        count = draft.scenarios.length;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
      }
    }
    if (text === null) {
      throw new Error(`could not get a valid spec from the model after 2 attempts (${lastErr}) — try \`skill-harness init ${skill.name}\` for a manual template`);
    }
    mkdirSync(dirname(skill.specPath), { recursive: true });
    writeFileSync(skill.specPath, text, "utf8");
    console.log(`drafted ${count} scenario(s) → ${skill.specPath}`);
    console.log(`review it (especially the proposed critical set), then \`skill-harness run ${skill.name} --skills ${root}\``);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
```

4. Add dispatch case in `main`'s switch:

```ts
    case "suggest": return cmdSuggest(args);
```

5. Add to `HELP` (after the `init` line):

```
  suggest <skill>    --skills <root> [--model prov:model] [--force]  LLM-draft a spec from SKILL.md (spends tokens)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @skill-harness/cli -- suggest-cmd`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck + full test sweep**

Run: `npm run typecheck && npm test`
Expected: no type errors; all packages green.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/test/suggest-cmd.test.ts
git commit -m "feat(cli): suggest — LLM-draft a spec from SKILL.md, validate before write"
```

---

### Task 6: Docs, launch-post draft, bundle refresh, roadmap check-off

**Files:**
- Modify: `README.md`, `docs/USAGE.md`, `AGENTS.md`, `docs/ROADMAP.md`
- Create: `docs/posts/2026-07-06-suggest.md`
- Modify (regenerate): `packages/pi-extension/dist/index.js` (only if `build:ext` changes it)

- [ ] **Step 1: Document both commands in AGENTS.md**

In `AGENTS.md`, under the `## Commands` fenced block, add two lines below `add-test`:

```
init  <skill> --skills root [--force]                    scaffold a commented template spec (free, offline)
suggest <skill> --skills root [--model prov:model] [--force]  LLM-draft a spec from the skill's SKILL.md (spends tokens)
```

Then extend the "Cost split" note so an agent knows `suggest` spends tokens like `run`:

> `init`/`lint`/`list` are free static/offline commands. `run`/`grade`/**`suggest`** spend model tokens (suggest defaults to `claude-code:claude-opus-4-8`, no metered key) — confirm the skill + model with the user before running `suggest`.

- [ ] **Step 2: Document the onboarding flow in docs/USAGE.md and README.md**

In `docs/USAGE.md`, add a short "Scaffolding a spec" section before the `list` step:

```markdown
## Scaffolding a spec

New skill with no spec? Two ways to get a `tests/specification.yaml`:

- `skill-harness init <skill> --skills <root>` — writes a commented template to fill in. Free, offline.
- `skill-harness suggest <skill> --skills <root>` — reads the skill's `SKILL.md` and LLM-drafts scenarios, a checklist, and a *proposed* critical set for you to review. Spends model tokens; defaults to `claude-code:claude-opus-4-8` (no metered key if the `claude` CLI is signed in). Override with `--model prov:model`.

`suggest` never marks scenarios critical for you and never auto-runs — review the draft (especially the proposed critical set commented at the top), then `run`.
```

In `README.md`, add `init` and `suggest` to the command list/quickstart alongside `run`/`lint`.

- [ ] **Step 3: Write the launch-post draft**

Create `docs/posts/2026-07-06-suggest.md`:

```markdown
# From SKILL.md to a graded spec in one command

Writing the first `specification.yaml` is the biggest thing standing between
"I have a skill" and "I know my skill works." skill-harness now closes that gap:

    skill-harness suggest my-skill --skills ./skills

It reads your skill's own `SKILL.md`, drafts scenarios (baseline **and**
under-pressure), a checklist per scenario, a ship bar, and a *proposed* critical
set — then hands it back for you to review. Nothing it guesses can gate a ship:
the critical set lands as a comment, not a live setting, and it never auto-runs.
Prefer to start from scratch? `skill-harness init my-skill` writes a commented
template instead.

By default `suggest` drafts on your Claude subscription (`claude-code:claude-opus-4-8`)
— no metered API key. Then the usual loop: review → `run` → grade → measure.

[screenshot / asciinema: suggest → review → run]

_(draft — owner edits voice before posting)_
```

- [ ] **Step 4: Regenerate the pi-extension bundle if stale**

Run: `npm run build:ext`
Then: `git status --short packages/pi-extension`
- If `dist/index.js` changed, it must be committed (the `bundle.test.ts` guard fails on a stale bundle).
Run: `npm test -w @skill-harness/pi-extension`
Expected: PASS (bundle guard green).

- [ ] **Step 5: Check off the roadmap tasks**

In `docs/ROADMAP.md`, Sprint 1.1, mark the two tasks done with today's date + the branch/PR:

```markdown
- [x] `skill-harness init <skill>` — scaffold ... (2026-07-06, feat/init-suggest)
- [x] `skill-harness suggest <skill>` ... (2026-07-06, feat/init-suggest)
```

- [ ] **Step 6: Full verification sweep**

Run: `npm run typecheck && npm test`
Expected: no type errors; all packages green (including the pi-extension bundle guard).

- [ ] **Step 7: Commit**

```bash
git add README.md docs/USAGE.md AGENTS.md docs/ROADMAP.md docs/posts/2026-07-06-suggest.md packages/pi-extension
git commit -m "docs: document init + suggest, add launch-post draft, check off Sprint 1.1"
```

---

## Self-Review

**Spec coverage:**
- Two separate commands (free `init` / metered `suggest`) → Tasks 4, 5. ✓
- `init` refuse-if-exists + `--force` → Task 4 tests. ✓
- Shared `scaffold.ts` renderer producing the same file shape → Tasks 1–2. ✓
- `suggest` JSON-then-render-then-validate with one retry → Task 5 impl + tests. ✓
- Default `claude-code:claude-opus-4-8`, `--model` override → Task 5. ✓
- No-key/no-output failure surfaced with a hint → Task 5 test "no output". ✓
- Proposed critical set as a comment; `critical: []` live-empty; `# REVIEW:` markers → Task 2 tests. ✓
- Template sentinel; `suggest` overwrites sentinel-bearing, refuses sentinel-less → Tasks 1, 5 tests. ✓
- Validate-before-write on every disk write → `parseSpec` in Tasks 4, 5. ✓
- Ships-with-a-post → Task 6 Step 3. ✓
- pi-extension bundle refresh guard → Task 6 Step 4. ✓
- Docs (README/USAGE/AGENTS) + roadmap check-off → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; the post draft is intentionally marked draft (owner edits voice) — that is a deliverable, not a plan gap.

**Type consistency:** `SuggestDraft`/`DraftScenario` defined in Task 2, consumed unchanged in Tasks 3 and 5. `renderTemplateSpec`, `renderDraftSpec`, `isTemplateSpec`, `buildSuggestPrompt`, `parseSuggestDraft`, `TEMPLATE_SENTINEL` names are identical across definition (Tasks 1–3) and use (Tasks 4–5). Command signatures `cmdInit(args)` and `cmdSuggest(args, adapterOverride?)` match their test call sites and the `cmdGrade` precedent. `flagStr(args, "force") !== undefined` boolean-flag idiom matches `cmdAddTest`'s `--critical` handling.
