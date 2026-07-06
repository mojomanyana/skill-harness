# Design: `init` + `suggest` — spec scaffolding

> Phase 1 · Sprint 1.1 of `docs/ROADMAP.md`. Removes the #1 onboarding killer
> (spec-writing friction). `suggest` is flagged as the single most important task
> of the phase. Produced 2026-07-06.

## Goal

A stranger points skill-harness at a skill and gets a runnable `specification.yaml`
without hand-authoring YAML from scratch:

- `init <skill>` — free, offline, static. Writes a commented template spec.
- `suggest <skill>` — spends model tokens. Reads the skill's `SKILL.md` and
  LLM-drafts a populated spec for the human to review before the first run.

Two separate commands (not `init --draft`) to keep an honest free-vs-metered cost
split, mirroring the repo's existing `lint`/`list` (free/static) vs `run`/`grade`
(tokens + creds) boundary.

## Non-goals

- Env-var rename `SKILL_CHECK_*` → `SKILL_HARNESS_*` (separate Sprint 1.1 task).
- Red-vs-green lift column, fresh-machine timing (Sprint 1.2).
- No auto-run: `suggest` never invokes `run`. The author reviews first.

## Architecture

### Shared renderer — `packages/core/src/scaffold.ts` (new)

The one thing both commands share is *rendering a `specification.yaml`*. Isolate it
in core so it is testable without the CLI or an LLM:

- `renderTemplateSpec(skillName: string): string`
  A commented, empty-but-valid spec: one example scenario `A1`, every field
  (`judge_persona`, `ship_bar`, `critical`, scenario `turns`/`checklist`/`mode`/
  `critical`) explained inline in comments. Used by `init`. Its **first line is a
  sentinel comment** (see "Template sentinel" below) that marks the file as an
  unadopted template.

- `renderDraftSpec(skillName: string, draft: SuggestDraft): string`
  Renders the *same file shape*, populated from a validated draft object:
  - `judge_persona` and `ship_bar` carry a leading `# REVIEW:` marker.
  - The proposed critical set is emitted as a **comment**, not live:
    `# proposed critical: [A1] — move ids into critical: [] below after review`.
    `critical: []` is written live-empty so nothing the model guessed can silently
    gate a ship (AGENTS.md rule 2: a critical-id fail blocks SHIP).
  - Each scenario rendered with its turns + checklist.
  - Does **not** carry the template sentinel — a drafted spec is "real", so a
    second `suggest` will not silently overwrite it.

### Template sentinel

`renderTemplateSpec` emits a fixed first line:

```
# skill-harness: generated template — `suggest` will overwrite this file while
# this line is present; delete it once you start editing by hand.
```

A stable substring of it (e.g. `skill-harness: generated template`) is the
detection token. `suggest` uses its presence to decide whether a spec is an
unadopted template (safe to overwrite) or real work (refuse without `--force`).
The line is a plain YAML comment, so it never affects `parseSpec`.

- `SuggestDraft` type (in `scaffold.ts` or alongside): the structured shape the LLM
  must return — `{ judge_persona, ship_bar {total,min_pass,no_critical_fail},
  proposed_critical: string[], scenarios: [{id,title,turns[],checklist[]}] }`.

Both renderer outputs MUST pass `parseSpec` before any disk write (reusing the
validate-before-write pattern `add-test` already uses in `cli.ts`).

### Commands — thin wrappers in `packages/cli/src/cli.ts`

Dispatch: add `case "init": return cmdInit(args);` and
`case "suggest": return cmdSuggest(args);` to the switch in `main`. Add both to
`HELP`.

## `cmdInit` — free, static, offline

```
skill-harness init <skill> --skills <root> [--force]
```

1. `resolveSkill(root, target)` → skill dir. Error on unknown skill/root.
2. Compute `tests/specification.yaml` path. If it exists and no `--force`:
   error `"<path> exists — edit it, or pass --force to overwrite"`.
3. `mkdir -p` the `tests/` dir; write `renderTemplateSpec(skillName)`.
4. Print next step: `"wrote template <path> — fill it in, or run
   \`skill-harness suggest <skill>\` to LLM-draft it."`

No adapter, no model, no keys. Safe to run anytime (like `lint`/`list`).

## `cmdSuggest` — spends tokens, needs one model

```
skill-harness suggest <skill> --skills <root> [--model prov:model] [--force]
```

Default model: `claude-code:claude-opus-4-8` (drafts on the Claude subscription via
`claude -p`, no metered key — `adapter.judge` already special-cases the
`claude-code` provider). Override with `--model prov:model`.

1. `resolveSkill` → skill dir. Read `<dir>/SKILL.md`; error if missing.
2. Collision check: overwrite without `--force` if the target is **absent** or
   still carries the **template sentinel** (a freshly-`init`'d, unadopted template).
   Refuse (asking for `--force`) if the file exists and lacks the sentinel — i.e. a
   hand-edited spec or a spec `suggest` already drafted. This makes the natural
   `init` → glance → `suggest` flow work with no flag, while never clobbering real
   work. `--force` overwrites regardless.
3. Build the drafting prompt: the SKILL.md text + instructions to return **JSON**
   matching `SuggestDraft` (scenarios with turns/checklist, proposed critical ids,
   ship_bar, judge_persona). JSON parses far more reliably than freeform YAML and
   lets us own the YAML formatting + review markers.
4. Call `adapter.judge({ model, prompt, cwd })` where `cwd` is a neutral dir (avoid
   repo-context bleed, consistent with grading).
5. Parse the JSON → build the draft object → `renderDraftSpec` → `parseSpec` to
   validate. **On unparseable JSON or invalid spec: retry the LLM once**, appending
   the specific error to the prompt. If it still fails, write nothing and report.
6. Write the file. Print: `"drafted N scenarios → review <path> (especially the
   proposed critical set), then \`skill-harness run <skill>\`"`. Never auto-runs.

## Error handling

- Unknown skill / missing `SKILL.md` → actionable error naming the path.
- Model not on PATH / no creds → pass the adapter error through with a hint to try
  `--model <other-provider:model>`.
- LLM returns junk twice → no partial write; suggest `init` for a manual template.
- Every disk write is gated behind a successful `parseSpec`.

## Testing (vitest, matching existing patterns)

`packages/core` — `scaffold.test.ts`:
- `renderTemplateSpec(name)` round-trips through `parseSpec` (valid spec).
- `renderDraftSpec(name, draft)` round-trips; asserts `critical: []` is live-empty,
  the proposed set appears as a comment, `# REVIEW:` markers are present, and the
  output does **not** contain the template sentinel.
- `renderTemplateSpec` output contains the sentinel; `renderDraftSpec` does not.

`packages/cli` — command tests with a **stub adapter** injected (same seam as
`cmdGrade`'s `adapterOverride`; the stub's `judge` returns canned JSON):
- `suggest`: happy path writes a valid spec; invalid-JSON-then-valid retry succeeds;
  invalid-twice writes nothing; overwrites a sentinel-bearing template with no
  `--force`; refuses a sentinel-less (hand-edited/already-drafted) spec without
  `--force`; `--force` overwrites regardless.
- `init`: writes template; refuses on collision; `--force` overwrites; creates
  `tests/` if absent.

## Ships-with-a-post (ROADMAP rule 2)

Draft `docs/posts/2026-07-06-suggest.md`: "from SKILL.md to a graded spec in one
command" — the onboarding-friction story, `suggest` → review → `run`. Draft only;
owner edits voice. Feature is not "done" until this draft exists.

## Files touched

- `packages/core/src/scaffold.ts` (new) + export from `packages/core/src/index.ts`
- `packages/core/test/scaffold.test.ts` (new)
- `packages/cli/src/cli.ts` — `cmdInit`, `cmdSuggest` (both accept an optional
  `adapterOverride` for tests, like `cmdGrade`), dispatch, HELP
- `packages/cli/test/*` — command tests
- `packages/pi-extension` — regenerate the committed esbuild bundle
  (`npm run build:ext`) and commit it, since the bundled core/cli source changed;
  the `bundle.test.ts` guard fails otherwise
- `docs/USAGE.md`, `README.md`, `AGENTS.md` — document the two commands
- `docs/posts/2026-07-06-suggest.md` (new) — launch post draft
- `docs/ROADMAP.md` — check off the two tasks with date + commit
