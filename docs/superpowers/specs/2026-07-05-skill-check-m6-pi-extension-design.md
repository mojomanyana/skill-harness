# skill-check v2 — Milestone 6: pi-extension package (design)

**Status:** approved (brainstormed 2026-07-05).
**Master design:** `docs/superpowers/specs/2026-07-03-skill-check-framework-design.md` (migration path step 6). Steps 1–5 (restructure, results-v2/journal, workspace/scheduler, misfire/reps, UI) are complete and merged; step 7 (`action/` + docs) follows M6.

## Goal

Package skill-check as a **pi extension** so a user can run, judge, and review skills from *inside* a pi session, and — the headline capability — expose a `skill_check_run` **tool** so the model can validate a skill it just edited within the same session ("edit → validate" loop). Installable via `pi install git:github.com/mojomanyana/skill-check`.

## Verified: pi's extension API (the master design's top risk, now closed)

Read from the installed pi docs (`@earendil-works/pi-coding-agent/docs/extensions.md`, `packages.md`). pi's extension API fully supports the milestone; the design's stated fallback ("prompt-template + CLI") is **unnecessary and dropped**.

- **Extensions** are TypeScript modules, default-exporting a factory `(pi: ExtensionAPI) => void | Promise<void>`, loaded via **jiti (no compile step)**.
- **`pi.registerCommand(name, { description, handler(args, ctx) })`** → slash commands. `args` is the remainder string after `/name`.
- **`pi.registerTool({ name, label, description, parameters, execute(toolCallId, params, signal, onUpdate, ctx) })`** → LLM-callable tools; `parameters` is a **typebox** schema; `onUpdate(...)` streams progress; `execute` returns `{ content: [...], details }`.
- **Streaming to the session:** `ctx.ui.notify(msg, level)`, `ctx.ui.setStatus(key, text)`, `ctx.ui.setWidget(key, lines)`; `ctx.mode`/`ctx.hasUI` guard TUI-only calls; `ctx.cwd` is the session working dir.
- **Packaging:** root `package.json` `"pi": { "extensions": [...], "skills": [...] }` + `"keywords": ["pi-package"]`. `pi install git:...` clones the repo and runs `npm install` (**not** a build). pi **provides** `@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui`, `typebox` — declare these as `peerDependencies: "*"` and do **not** bundle them. Our own `@skill-check/*` packages must be bundled.

## Architecture

**In-process** (chosen over shell-out): the extension imports `@skill-check/core` (+ `@skill-check/adapters`) and calls their functions directly, passing a `log` callback that routes to the pi session UI. This gives real streaming, a single source of truth, and no fragile stdout parsing.

### New package: `packages/pi-extension`

| Unit | Responsibility |
|---|---|
| `src/index.ts` | Default-export `(pi: ExtensionAPI) => {}`. Registers the `/skill-check` command and the `skill_check_run` tool. No heavy work at factory time (per pi guidance: defer resources to handlers). |
| `src/commands.ts` | The `/skill-check` subcommand dispatcher (`run` / `judge` / `review`) — arg parsing + calling core, streaming via `ctx.ui`. |
| `src/tool.ts` | The `skill_check_run` tool definition (typebox params + `execute` streaming via `onUpdate`). |
| `src/runner.ts` | Thin shared glue: resolve a skill dir from arg-or-`cwd`, build the `log`→UI adapter, invoke `runSkillModel`/regrade/`serveReview` from core, shape the scorecard result. Depends only on `@skill-check/core` + `@skill-check/adapters`. |

**Build/packaging:** `esbuild` bundles `src/index.ts` → a single self-contained ESM `dist/index.js` with `@skill-check/*` inlined and `@earendil-works/*`+`typebox` marked **external**. The **built `dist/index.js` is committed** to the repo (VCS artifact) so `pi install git:` needs no build step. Root `package.json` adds:

```json
"keywords": ["pi-package"],
"pi": {
  "extensions": ["packages/pi-extension/dist/index.js"],
  "skills": ["./SKILL.md"]
}
```

The conversational **SKILL.md front door already at the repo root (`./SKILL.md`) ships alongside** the extension (front door for agents without the extension). **Caveat:** adding a `pi` manifest *replaces* pi's convention auto-discovery, so the `skills` entry is **required** — omitting it would silently drop the existing front door that `pi install` currently loads. `packages/pi-extension/package.json` declares `peerDependencies` on the pi packages + `typebox` (`"*"`), and dev-deps on `esbuild` + the workspace `@skill-check/*` packages (for the bundle build).

### Components

**1. `/skill-check` command (single command, CLI-mirroring subcommand dispatch):**
- `run [skill] [--model p:m]... [--reps N] [--mode red|green|force]` — resolve skill (arg else scan `ctx.cwd` upward for `tests/specification.yaml`), call `runSkillModel` (shared `runPool` fan-out), stream per-scenario verdicts (`ctx.ui.setStatus`/`notify`), end with the scorecard + failed-transcript paths.
- `judge [run-dir]` — regrade saved transcripts (core's regrade path), stream verdicts, rewrite `results.yaml`.
- `review [skill]` — start `serveReview` in-process (returns `{ port }`), `notify` the URL, register a `session_shutdown` handler to close the server. (A long-lived Node http server in-process does not block pi's event loop.)

**2. `skill_check_run` tool:** typebox params `{ skill?: string, model?: string, reps?: number, mode?: "red"|"green"|"force" }`. `execute(id, params, signal, onUpdate, ctx)` resolves the skill, runs `runSkillModel`, streams progress via `onUpdate`, returns the scorecard (per-scenario verdict, grade %/letter, ship, failed-transcript paths) as text `content` the model can read. `promptGuidelines`: "Use skill_check_run after editing a skill to validate it against its scenarios."

**3. Streaming seam:** reuse core's existing `log: (line: string) => void` parameter (already threaded through `runSkillModel`/`runRep`). The extension supplies a `log` that calls `ctx.ui.setStatus`/`notify` (commands) or `onUpdate` (tool). No change to core's public API.

**4. Nested-pi safety:** the runner drives `runSkillModel`, whose pi adapter spawns child `pi` processes as test subjects. Add `--no-extensions` to the adapter's subject **and** judge invocations (`packages/adapters/src/pi.ts`) so subject/judge pi processes don't recursively load skill-check. Verify `--no-extensions` still honors `--skill` (green mode) — pi's help states explicit `-e` paths survive `--no-extensions`; the adapter uses `--skill`, which is a separate discovery axis, so this must be smoke-verified.

## Interfaces (contracts)

- `resolveSkillDir(cwdOrArg: string): string` (runner) — returns the skill directory containing `tests/specification.yaml`, or throws a clear error.
- `runViaExtension(opts, log): Promise<Scorecard>` (runner) — wraps `runSkillModel`; `Scorecard` = `{ skill, model, grade: {pct, letter, ship}, scenarios: {id, verdict, suspect}[], failedTranscripts: string[] }` (no absolute paths beyond the run dir the user needs).
- Command handler: `(args: string, ctx: ExtensionCommandContext) => Promise<void>`.
- Tool `execute`: returns `{ content: [{type:"text", text}], details: Scorecard }`.

## Testing

- **Unit (no real pi, no real subject runs):** a **fake `ExtensionAPI`** records `registerCommand`/`registerTool`/`on` calls; tests invoke the captured handlers with a **fake `ctx`** (recording `ui.*` calls) and an **injected fake harness adapter** (the same seam M5a added for hermetic serve/grade tests) so no `pi` subprocess spawns. Assert: correct core calls, streamed lines, scorecard shape, skill-resolution errors, arg parsing (`run foo --reps 2`).
- **`resolveSkillDir`** unit tests (arg, cwd-scan, not-found).
- **Bundle smoke (build seam):** after `esbuild` build, assert `dist/index.js` is a single file, imports no `@skill-check/*` (all inlined), and leaves `@earendil-works/*`+`typebox` external.
- **Manual smoke (documented in the plan, run once):** `pi -e packages/pi-extension/src/index.ts` in a session at the golden fixture → `/skill-check run` streams verdicts + scorecard; the `skill_check_run` tool is callable; `pi install <local path>` then a fresh session loads the extension. This is the "verify pi API at implementation start" step the master design mandates.

## Non-goals (M6)

- npm publish / `files`/`repository`/version-pinning polish — that's M7 (first-publish). M6's install path is `pi install git:` from the committed bundle.
- The `action/` GitHub Action + consumer docs — M7.
- Watch mode / long-running daemon — explicitly later (master design non-goals).
- New harnesses — pi remains the only one.
- Changing the CLI, core scoring, the review UI, or results schema — M6 only *adds* the extension package (+ the one `--no-extensions` adapter change).

## Risks

- **Committed build artifact** (`dist/index.js` in VCS) — accepted; the price of zero-build `pi install git:`. The plan includes a spike that verifies `pi install <local path>` end-to-end before broad work.
- **pi API version drift** — pinned via `peerDependencies` on `@earendil-works/pi-coding-agent`; the manual smoke catches breakage.
- **`--no-extensions` vs `--skill` interaction** on child pi — must be smoke-verified early (could otherwise break green-mode subject runs).
- **esbuild bundling of core** (ESM, `js-yaml` dep) — verify the bundle runs; `js-yaml` inlines fine, `node:*` stays external.
