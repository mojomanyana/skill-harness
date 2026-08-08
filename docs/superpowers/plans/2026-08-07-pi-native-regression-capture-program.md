# Pi-Native Regression Capture Program — Implementation Plan

> **Status (2026-08-08):** Phase 0 complete; Phases 0–5 implemented; see the checklist at the end of this file. The roadmap
> was amended (`docs/ROADMAP.md`, Sprint 1.7) and the feasibility spike found four
> errors in this plan — see `docs/pi-native-capture-design-2026-08-08.md` §10, and
> the corrections marked **[Phase 0]** inline below. Phase 2's transcript rule in
> §4.2 is superseded; do not implement it as written.
>
> **Scope decision:** Implement all five pi-only capabilities as one incremental program: live conversation capture, objective execution traces, subagent orchestration tests, instruction coverage/affected-test selection, and confidence-aware rejudging.
>
> **For agentic workers:** Read `AGENTS.md` and `docs/ROADMAP.md` before starting. The current roadmap prioritizes Phase 2 launch/distribution, so implementation requires an explicit roadmap amendment rather than silently skipping existing work. Use checkbox (`- [ ]`) syntax below to track progress.

**Goal:** Turn real pi conversations into durable, privacy-reviewed regression scenarios and then evaluate those scenarios with structured evidence, first-class subagent checks, instruction coverage, selective iteration, and confidence-aware judging.

**Architecture:** Build one connected evidence pipeline:

```text
Live pi conversation
    ↓ capture and human review
Reusable regression scenario
    ↓ structured pi execution trace
Objective gates + semantic judge
    ↓
Coverage/affected-test selection
    ↓
Confidence-aware adjudication
```

**Key product constraints:**

- Pi remains the only subject harness.
- This is regression capture/revalidation, not model retraining or fine-tuning.
- Historical assistant text is evidence, never an exact-output oracle.
- No model or judge calls happen implicitly; all spending follows the existing confirmation rules.
- Judge ≠ subject and metered-judge refusal apply to every primary, secondary, and tie-break judgment.
- Critical and B-series ship gates remain unchanged.
- Human overrides with mandatory notes remain the durable semantic authority.
- Hidden thinking, secrets, complete system prompts, and large tool-result bodies are not persisted by default.
- Every shipped feature requires a draft post under `docs/posts/`.
- Changes touching bundled core/adapter/CLI/extension code require `npm run build:ext` and a committed `packages/pi-extension/dist/index.js`.

---

## 1. Program-wide architecture and data contracts

### 1.1 Artifact layout

```text
<skill>/tests/
├── specification.yaml
├── captures/
│   ├── CAP-001.yaml                 # reviewed pending/promoted case
│   └── .local/
│       └── CAP-001.evidence.json    # ignored local evidence
└── results/
    └── <tag>/<run>/
        ├── A1.green.txt
        ├── A1.green.trace.jsonl
        ├── A1.green.judge.txt
        ├── A1.green.judge2.txt
        ├── A1.green.judge3.txt
        └── results.yaml
```

A reviewed capture file records:

- `capture_schema: 1`
- Stable capture ID and creation timestamp
- Classification: `failure` or `good_example`
- Sanitized selected user turns
- Human-written expected behavior and editable checklist draft
- User-confirmed target kind/path (`skill` or `subagent`) and content hash
- Hashed session/range provenance rather than an absolute session path
- Subject model and git commit/status metadata when available
- Promotion status and linked scenario ID

The local evidence sidecar may retain a sanitized assistant excerpt and tool-call summaries, but must remain ignored by default. It must never contain hidden thinking or complete tool-result bodies.

### 1.2 Do not put unfinished drafts in `specification.yaml`

A pending capture is not yet a test and must not affect full runs, ship-bar totals, staleness, lift, or stability. Store it under `tests/captures/`; only append a normal scenario to `specification.yaml` after human review and explicit promotion.

This avoids adding a `draft: true` state to every runner/scorer/linter path and avoids accidentally excluding an intended scenario from release runs.

### 1.3 Additive scenario schema

Target shape:

```yaml
scenarios:
  - id: R1
    title: delegates authentication diagnosis
    turns:
      - "Find why authentication is failing."

    checklist:
      - explains the root cause without exposing credentials
      - integrates the planning subagent's recommendation

    covers:
      - "SKILL.md#handling-authentication"
      - "../../agents/plan.md#constraints"

    env:
      workspace: fixture:fixtures/auth-failure
      extensions:
        - ../../.pi/extensions/subagents/index.ts

    assert:
      trace:
        require_calls:
          - tool: Agent
            count: { min: 1 }
            args:
              agent: { equals: plan }
              task: { contains: authentication }
        forbid_calls:
          - tool: write
        unchanged_paths:
          - ".env"
          - "src/unrelated/**"
```

Rules:

- `assert.trace` is valid for inline and seeded scenarios.
- Existing `assert.vitest`, `assert.post_test`, `diff_contains`, and `diff_excludes` remain seeded-only.
- `env.extensions` is stimulus; changing it requires a subject rerun.
- `assert.trace` is a gate; changing it can be reevaluated from a saved trace through `regate`.
- `covers` and capture provenance are metadata and do not stale behavioral results.
- Keep `results.yaml` schema 2 with optional backward-compatible fields, projecting new states into existing verdict/suspect fields. Every results writer must preserve the new optional data.

### 1.4 Shared result projection

Objective and adjudication details are additive:

```yaml
scenarios:
  - id: A1
    judge_verdict: FAIL
    judge_reason: "two judgments disagree"
    suspect: true
    override: null
    note: ""

    objective:
      status: PASS
      trace_version: 1
      trace_sha256: "..."
      assertions:
        - kind: require_call
          status: PASS
          detail: "Agent called once with agent=plan"

    adjudication:
      state: unresolved
      trigger: non_unanimous
      judgments:
        - ordinal: 1
          judge: { provider: claude-code, model: claude-opus-4-8 }
          verdict: PASS
        - ordinal: 2
          judge: { provider: claude-code, model: claude-opus-4-8 }
          verdict: FAIL
```

Compatibility requirements:

- Missing `objective` means no trace assertions were declared, not an objective PASS.
- Missing `adjudication` means historical single-judge behavior.
- Unresolved adjudication projects to `suspect: true`, so current scoring continues to block SHIP.
- The first judge artifact remains `<id>.<mode>.judge.txt`; additional calls use `.judge2.txt` and `.judge3.txt`.

---

## 2. Phase 0 — Feasibility spike and roadmap decision

**Purpose:** Validate assumptions before changing the adapter or spec surface.

### Tasks

- [x] Decide where this program belongs in `docs/ROADMAP.md`. **[Phase 0]** Owner reprioritized on 2026-08-08: Sprint 1.7, ahead of the unstarted Phase 2 launch work.
- [x] Write a short design/ADR documenting the capture, trace, provenance, and compatibility decisions in this plan. **[Phase 0]** `docs/pi-native-capture-design-2026-08-08.md` (no `adr/` tree exists; follows the dated-topic-doc convention).
- [x] **[Phase 0]** Capture sanitized, checked-in fixtures of `pi --mode json` (`packages/adapters/test/fixtures/pi-json/`) for:
  - single-turn text response;
  - multi-turn response using `--session-dir` and `-c`;
  - one tool call;
  - parallel tool calls completing out of order;
  - tool error;
  - a representative Agent/subagent tool call.
- [x] Confirm JSON-mode transcript reconstruction is semantically equivalent to what the current print-mode adapter presents to the judge. **[Phase 0] Equivalent only for the FINAL assistant message** — §4.2's "assistant text blocks" rule is wrong and is superseded. Byte-exact parity proven on a deterministic prompt.
- [x] Confirm `pi --no-extensions --extension <path>` loads only the declared extension. **[Phase 0]** Confirmed, and it holds even under `-a` project-local trust. Zero model spend.
- [x] Confirm which subagent details are stable in tool arguments/results and document what cannot be relied on. **[Phase 0]** Design doc §4: `toolName`/`args`/`isError`/`result.details` are stable; result prose and any child-internal detail are not.
- [x] Define `CaptureCaseV1` and `ExecutionTraceV1` TypeScript interfaces before implementation. **[Phase 0]** `packages/core/src/capture-trace-types.ts`, types only.

### Constraints

- A live fixture capture may spend model tokens; obtain confirmation first.
- Sanitize all checked-in JSON fixtures.
- If JSON-mode output cannot preserve transcript semantics, keep print mode for ordinary scenarios and use JSON mode only for trace-enabled scenarios.

### Exit criteria

- Pi JSON event shapes and ordering are represented by offline fixtures.
- The trace schema has a version and explicit privacy limits.
- The roadmap placement is deliberate and recorded.

---

## 3. Phase 1 — Promote a conversation to a regression

### 3.1 Product behavior

Add the pi command:

```text
/skill-harness capture
```

Workflow:

1. Refuse or wait while the agent is streaming.
2. Read only the active branch via `ctx.sessionManager.getBranch()`.
3. Group entries into logical turns: one user message followed by assistant/tool entries until the next user message.
4. Select a start turn, then an end turn.
5. Select/confirm the responsible skill or subagent prompt.
6. Mark the interaction as `failure` or `good_example`.
7. Require a natural-language description of expected behavior.
8. Convert that expectation into an initial checklist item and open an editor for correction.
9. Preview the sanitized capture, provenance, and generated YAML.
10. Offer:
   - save as a pending capture;
   - promote directly to a valid scenario;
   - cancel.
11. After promotion, optionally run only the new scenario with a full spending preview.

Use `ctx.ui.select`, `input`, `editor`, and `confirm` for the MVP. Pi exposes no public API for arbitrary mouse-highlighted transcript text, so turn-level contiguous selection is the supported contract.

### 3.2 Core implementation

**Create:**

- `packages/core/src/capture.ts`
  - Session-entry projection into logical turns
  - Safe text extraction
  - Tool-call summary extraction
  - Redaction, truncation, and capture serialization
  - Capture ID generation and promotion helpers
- `packages/core/src/spec-write.ts`
  - Shared atomic validated scenario append
  - Concurrent-modification detection
  - Formatting/comment preservation by validated append rather than whole-file YAML rewrite

**Modify:**

- `packages/core/src/index.ts` — export capture/spec-write APIs.
- `packages/cli/src/cli.ts` — refactor `cmdAddTest` to use `spec-write.ts`.
- `packages/pi-extension/src/commands.ts` — route `capture`; expand structural context/UI types.
- `packages/pi-extension/src/runner.ts` — accept `only?: string[]` and pass it to `runSkillModel`.
- `packages/pi-extension/src/index.ts` — register any capture cleanup/session lifecycle support.

### 3.3 Target detection

Candidate sources may come from:

- Skills listed in `ctx.getSystemPromptOptions().skills`;
- `read` calls targeting `SKILL.md` in the selected range;
- Agent/subagent tool calls in the selected range;
- Project `.pi/agents/*.md` files;
- Loaded context-file paths.

Detection is a convenience only. The user must confirm the target because session evidence cannot establish causal responsibility.

### 3.4 Privacy and provenance

- Hidden thinking is omitted unconditionally.
- Tool-result bodies are omitted by default; retain tool name, error state, byte count, and hash.
- Images become placeholders unless the user explicitly includes a safe description.
- Redact bearer tokens, common credential keys, private-key blocks, home-directory paths, and oversized values.
- Never persist the complete effective system prompt.
- Require preview before every write.
- Raw entry IDs may stay in `.local` evidence; the reviewed case/spec stores hashes.
- Checklist drafting is offline by default. Any optional LLM drafting requires explicit spending confirmation.

### 3.5 MVP non-goals

- Arbitrary character-level selection from the rendered transcript.
- Automatic whole-repository fixture snapshots.
- Exact-output comparison with the historical assistant response.
- Automatic causal attribution to a skill or subagent.
- Fine-tuning dataset export.

### 3.6 Tests

**Create likely tests:**

- `packages/core/test/capture.test.ts`
- `packages/core/test/spec-write.test.ts`
- `packages/pi-extension/test/capture.test.ts`

Cover:

- Active-branch projection and branch exclusion;
- multi-turn ranges;
- compaction/custom/tool entries;
- thinking omission;
- secret and path redaction;
- large-content truncation;
- cancellation at every UI step;
- duplicate scenario IDs;
- invalid merged YAML;
- concurrent spec modification;
- preview before write;
- optional run passes exactly one `only` ID and remains partial/non-SHIP.

### 3.7 Acceptance criteria

- Capture creation makes zero model calls by default.
- Cancelling leaves all files unchanged.
- A promoted scenario passes `loadSpec()`.
- No raw transcript, hidden thinking, or secret is committed automatically.
- Running the promoted case uses `--only` and cannot report SHIP.

### 3.8 Required post

- [x] `docs/posts/2026-08-08-promote-a-conversation-to-a-regression.md`

---

## 4. Phase 2 — Structured traces and objective assertions

### 4.1 Adapter contract

Extend the adapter additively:

```ts
interface HarnessAdapter {
  run(req: RunReq): Promise<string>;
  runStructured?(
    req: RunReq
  ): Promise<{ transcript: string; trace: ExecutionTrace }>;
}
```

Keep `run()` for current test doubles and compatibility. The pi adapter may share a private executor internally. Initially use `runStructured()` only when a scenario declares trace/orchestration requirements, avoiding an unintentional behavior epoch for existing tests.

### 4.2 Pi JSON execution

Use documented JSON events from:

```bash
pi --mode json ...
```

Parse:

- `message_end`
- `tool_execution_start`
- `tool_execution_end`
- `turn_end`
- `agent_end`

Trace requirements:

- Header with trace version, pi version, subject model, scenario, mode, and rep;
- assistant text blocks excluding thinking;
- tool call start/end records keyed by `toolCallId`;
- sanitized arguments;
- error state and bounded result metadata;
- workspace changed-path evidence;
- deterministic serialization and SHA-256.

### 4.3 New components

**Create:**

- `packages/core/src/execution-trace.ts`
- `packages/core/src/trace-gates.ts`
- `packages/adapters/src/pi-json.ts`

**Modify:**

- `packages/core/src/adapters/types.ts`
- `packages/adapters/src/pi.ts`
- `packages/core/src/spec.ts`
- `packages/core/src/run.ts`
- `packages/core/src/results.ts`
- `packages/core/src/sources.ts`
- `packages/core/src/regate.ts`
- `packages/core/src/lint.ts`
- `packages/core/src/report.ts`
- `packages/cli/src/serve.ts`
- Review UI assets and tests

### 4.4 Safe assertion DSL

MVP operators only:

- `equals`
- `contains`
- `starts_with`
- `ends_with`
- `matches`
- `exists`
- array `any`

No JavaScript expressions, callbacks, or executable predicates.

MVP assertions:

- Required tool call, min/max count, and argument predicates;
- Forbidden tool calls;
- Required subagent call as convenience syntax over a configured tool;
- Forbidden path arguments for built-in file tools;
- Workspace paths that must not change.

### 4.5 Evaluation semantics

1. Run subject and persist sanitized trace.
2. Evaluate objective assertions before judging.
3. Failed objective assertion → `FAIL`, zero judge calls.
4. Missing/malformed required evidence → `ERROR`, never silent fallback.
5. Passed objective gates → semantic checklist judge.
6. Store concise objective evidence in `results.yaml`.

Preserve current author ownership: a human may override a raw objective failure with a mandatory note, but the objective evidence remains visible and unchanged.

### 4.6 Source facets and regating

- Add `assert.trace` to the `gates:` digest.
- Add any trace-producing environment changes to `stimulus:`.
- Extend `regate` to read saved trace artifacts.
- If a run predates trace artifacts, report that a subject rerun is required rather than pretending `regate` can answer.
- Preserve overrides, notes, and adjudication metadata during regating.

### 4.7 Explicit limitations

- A tool trace proves the registered tool and arguments, not arbitrary operating-system behavior.
- Bash strings are not a sound filesystem audit. A strong path policy must forbid bash or use actual workspace-change assertions.
- Writes outside the isolated workspace are not observable and must never be claimed as covered.

### 4.8 Tests

- Parser validation for every legal/illegal predicate;
- pure evaluator tests with synthetic traces;
- JSONL parser fixtures including parallel completion order;
- transcript reconstruction parity;
- trace failure skips judge;
- missing trace becomes ERROR;
- path normalization/traversal cases;
- `regate` pass→fail and fail→pass behavior/call counts;
- result round-trips through `grade`, `rescore`, `regate`, and review saves;
- existing seeded gates remain unchanged.

### 4.9 Acceptance criteria

- Objective gates use structured JSON events, never regexes over prose.
- Thinking and full tool outputs never appear in trace artifacts.
- Gate failures make no judge call.
- Old scenarios continue to use their current execution behavior until deliberately migrated.

### 4.10 Required post

- [x] `docs/posts/2026-08-08-assert-the-trace-not-the-story.md`

---

## 5. Phase 3 — First-class subagent orchestration tests

### 5.1 Product contract

An orchestration scenario tests three layers independently:

1. **Selection:** parent called the expected subagent/tool.
2. **Handoff:** call arguments included required context and excluded forbidden material.
3. **Integration:** parent final answer used the child result correctly, judged by the normal checklist.

`system_prompt_file` remains the isolated subagent test mechanism. An orchestration scenario tests the parent and must not combine with `system_prompt_file`.

### 5.2 Controlled extension loading

Add resolved extension paths to `RunReq`. Pi invocation must use:

```bash
pi --no-extensions --extension <declared-path> ...
```

Only explicitly declared extensions load. Hash extension files/trees, referenced subagent prompts, and orchestration configuration as stimulus.

### 5.3 Generic normalizers

Do not assume one universal subagent extension. Support known shapes through normalizers:

- Single: `{ agent, task, cwd }`
- Parallel: `{ tasks: [...] }`
- Chain: `{ chain: [...] }`

The spec declares the tool name (`Agent`, `subagent`, etc.). Unknown extensions can still use generic trace call/argument assertions.

MVP relies on the parent tool call for selection/handoff evidence. Deeper child traces are capability-detected and must not be required unless the extension exposes a documented stable structure.

### 5.4 Capture integration

When a captured range contains an Agent/subagent call, offer to prepopulate, subject to user confirmation:

- expected tool/agent name;
- required task text;
- forbidden task text;
- expected call count.

### 5.5 Implementation touchpoints

- `packages/core/src/spec.ts` — parse/validate `env.extensions` and orchestration constraints.
- `packages/core/src/adapters/types.ts` — explicit extension paths.
- `packages/adapters/src/pi.ts` — `--no-extensions --extension ...` argv.
- `packages/core/src/sources.ts` — extension/prompt stimulus hashes.
- `packages/core/src/trace-gates.ts` — subagent normalizers/evaluation.
- `packages/core/src/lint.ts` — paths exist, incompatible fields rejected.
- `packages/core/src/capture.ts` — prepopulation from selected trace.
- Review inspector — selection, handoff, child error/status evidence.

### 5.6 Tests

- Adapter argv proves only declared extensions load;
- deterministic fake subagent extension for integration tests;
- single/parallel/chain synthetic traces;
- wrong agent;
- omitted required context;
- included forbidden context;
- child error;
- missing/unknown result details;
- correct selection/handoff with semantically bad parent integration;
- edited extension/prompt creates stimulus staleness;
- existing `system_prompt_file` behavior remains intact.

### 5.7 Acceptance criteria

- Wrong selection and bad handoff fail objectively.
- Parent integration is graded independently.
- Nested model spending is disclosed before execution; exact cost is not falsely bounded.
- Auto-discovered extensions cannot contaminate the scenario.

### 5.8 Required post

- [x] `docs/posts/2026-08-08-testing-the-parent-not-just-the-subagent.md`

---

## 6. Phase 4 — Instruction coverage and affected-test selection

### 6.1 Coverage model

Use scenario-local references:

```yaml
covers:
  - "SKILL.md#core-principle"
  - "../../agents/plan.md#scope-control"
```

MVP coverage unit: Markdown heading section. Later enhancement: stable explicit markers such as:

```markdown
<!-- skill-harness:rule scope-control -->
```

Coverage means “declared linkage,” not proof that the behavior is fully tested. UI/report wording must preserve that distinction.

### 6.2 Commands

```bash
skill-harness coverage <skill|all> --skills <root> [--strict]
skill-harness affected <skill> --skills <root> [--base <git-ref>]
skill-harness run <skill> --skills <root> --affected --base <git-ref>
```

Add equivalent pi extension subcommands for coverage display and affected-run confirmation.

### 6.3 Coverage behavior

Report:

- covered sections;
- uncovered sections;
- broken/stale references;
- scenarios mapped to each section;
- pending captured cases associated with a section.

Uncovered sections are informational by default. `--strict` is explicit opt-in for a CI gate.

### 6.4 Affected selection algorithm

1. Read `git diff --unified=0 <base>`.
2. Map changed line ranges to Markdown sections.
3. Reverse the scenario `covers` map.
4. Union all mapped scenarios with:
   - every critical scenario;
   - every B-series scenario;
   - scenarios whose fixture, post-test, trace gate, extension, subagent prompt, or stimulus changed according to source facets.
5. If mapping is missing, ambiguous, or a file is replaced wholesale, conservatively select all active scenarios.
6. Print a reason for every selected scenario.

An affected run uses the existing `only` path, remains partial, and cannot produce SHIP. A full run is still required to clear skill-wide staleness before publishing.

### 6.5 New components

- `packages/core/src/instruction-coverage.ts`
- `packages/core/src/affected.ts`

Modify:

- `packages/core/src/spec.ts`
- `packages/core/src/sources.ts`
- `packages/core/src/lint.ts`
- `packages/cli/src/cli.ts`
- `packages/pi-extension/src/commands.ts`
- `SKILL.md`, `README.md`, and `docs/USAGE.md`

### 6.6 Tests

- ATX and Setext heading extraction;
- headings inside fences ignored;
- duplicate heading disambiguation;
- renamed/stale headings;
- git hunk to section mapping;
- reverse coverage lookup;
- critical/B-series union;
- changed fixture/gate/extension union;
- conservative all-scenarios fallback;
- `--strict` exit behavior;
- affected execution remains partial/non-SHIP.

### 6.7 Acceptance criteria

- Coverage and affected analysis are free/offline.
- An unmapped or ambiguous edit never produces an under-inclusive confident test set.
- Every selected scenario has an explainable reason.

### 6.8 Required post

- [x] `docs/posts/2026-08-08-which-instructions-have-no-test.md`

---

## 7. Phase 5 — Confidence-aware automatic rejudging

### 7.1 Spending authorization

Extra judge calls occur only when:

- CLI receives explicit `--auto-rejudge`; or
- the pi extension presents a call-count/cost preview and the user confirms.

A spec may configure triggers, but spec configuration alone never authorizes spending.

### 7.2 Triggers

- `ambiguous`: `JUDGE-AMBIGUOUS` or unparseable/conflicting conclusion.
- `contradictory`: overall verdict conflicts with parsed per-item judgments/misfire checks.
- `non_unanimous`: first-wave subject reps include both PASS and FAIL.
- `ship_deciding`: counterfactually flipping the cell changes SHIP/NOT READY, including min-pass, critical, and B-series gates.

### 7.3 Adjudication flow

1. Complete all first-wave judgments.
2. Compute triggers from the complete wave.
3. Rejudge the same saved transcript for triggered cells/reps.
4. Agreement → `confirmed`.
5. Disagreement → `unresolved` unless an explicitly authorized third call exists.
6. A clean two-of-three majority → `tie_broken`.
7. Suspect, ambiguous, or malformed judgments do not count as clean votes.
8. Remaining disagreement projects to `suspect: true` and blocks SHIP.
9. Human override plus mandatory note resolves the semantic state while retaining all raw judgments.

For non-unanimous rep cells, rejudge the relevant saved transcripts under one documented policy; do not selectively rejudge only the rep that would change the headline.

### 7.4 CLI flags

```text
--auto-rejudge
--secondary-judge <provider:model>
--tie-break-judge <provider:model>
```

If no secondary judge is supplied, the second call may use the primary judge as an independent draw. Every configured judge must independently pass:

- `assertJudgeAllowed` metered policy;
- judge ≠ subject checks;
- explicit metered opt-in where applicable.

Print the maximum possible second/third call count before execution. The extension must use a confirmation dialog.

### 7.5 New component

- `packages/core/src/adjudication.ts`
  - trigger classification;
  - counterfactual ship-decision calculation using existing score rules;
  - vote collapse;
  - compatibility projection to verdict/reason/suspect;
  - journal records and call counts.

Modify:

- `packages/core/src/run.ts`
- `packages/core/src/regrade.ts`
- `packages/core/src/reps.ts`
- `packages/core/src/results.ts`
- `packages/core/src/score.ts`
- `packages/core/src/journal.ts`
- `packages/cli/src/cli.ts`
- `packages/cli/src/serve.ts`
- `packages/pi-extension/src/commands.ts`
- Review UI assets

Reuse one adjudication engine from `run`, `grade`, and review rejudge paths; do not implement three collapse policies.

### 7.6 Review UI

- Show all judgments side by side.
- Add an unresolved-adjudication queue.
- Display trigger and judge identities.
- Keep raw artifacts accessible.
- Preserve mandatory override notes.
- Never render unresolved as a clean PASS or FAIL.

### 7.7 Tests

- all four trigger classes;
- exact min-pass/critical/B-series ship counterfactuals;
- two-judge agreement/disagreement;
- three-judge tie break;
- malformed/suspect votes excluded;
- unresolved always blocks SHIP;
- human override audit behavior;
- no extra calls without explicit enablement;
- metered secondary/tie-break refusal;
- judge≈subject checks for every judge;
- exact call counts;
- `run`/`grade`/review parity;
- legacy single-judge result migration/reading;
- new fields survive every result writer.

### 7.8 Acceptance criteria

- No automatic token spend without explicit authorization.
- Unresolved judge disagreement cannot SHIP.
- Existing human ownership and objective/critical/B-series gates remain intact.

### 7.9 Required post

- [x] `docs/posts/2026-08-08-when-one-judge-is-not-enough.md`

---

## 8. Recommended PR sequence

Keep PRs small enough to review and release independently:

1. [x] Roadmap decision, ADR, and sanitized pi JSON fixtures. (2026-08-08)
2. [x] Shared atomic scenario writer; refactor `add-test` onto it. (2026-08-08)
3. [x] Capture projection, redaction, and pending-case format. (2026-08-08)
4. [x] Pi capture UI and extension `only` support. (2026-08-08)
5. [x] Structured pi JSON trace parser and artifact format. (2026-08-08)
6. [x] Trace assertion schema/evaluator and core run integration. (2026-08-08)
7. [~] Trace-aware `regate` and review-UI surfacing done (2026-08-08); lint/scorecard surfacing still open.
8. [x] Controlled-extension subagent orchestration scenarios. (2026-08-08)
9. [x] Coverage parser/report and capture mapping. (2026-08-08)
10. [x] Affected-test selection and `run --affected`. (2026-08-08)
11. [x] Adjudication engine and results model. (2026-08-08)
12. [x] Rejudge CLI, extension confirmation, and review UI. (2026-08-08)

Prefer separate minor releases for each user-facing feature instead of waiting for all five to complete.

---

## 9. Program-wide validation

Run after every implementation PR:

```bash
npm run build:ext
npm test
npm run typecheck
node bin/skill-harness.js lint all --skills packages/core/test/fixtures
git status --short
```

Also require:

- Pi extension bundle freshness test;
- extension/core version lockstep test;
- offline adapter JSON fixtures;
- result round-trip tests for `grade`, `rescore`, `regate`, override save, and review rejudge;
- a disposable real-pi smoke test before each release, with spending confirmed;
- committed regenerated `packages/pi-extension/dist/index.js` whenever bundled source changes.

Do not treat a live smoke test result as a canonical benchmark unless it was deliberately configured, reviewed, and committed under the normal project rules.

---

## 10. Principal risks and mitigations

| Risk | Mitigation |
|---|---|
| Pi JSON event shape changes | Version traces, parse fixtures, record pi version, fail closed when required evidence disappears. |
| Capture leaks secrets/source | Mandatory preview, aggressive default redaction, local evidence ignored, no thinking/full tool output. |
| Raw conversation is not reproducible | Human edits stimulus/expectation; pending case until promoted; no exact-output oracle. |
| Old harness ignores new spec fields | Document minimum harness version, use existing harness-version downgrade tripwire, lint new fields, release additively. |
| Trace claims exceed evidence | Explicitly limit path/tool claims; never infer shell/syscall/network behavior. |
| Subagent extensions differ | Generic call assertions plus capability-specific normalizers; explicit extension/tool declaration. |
| Affected set misses regressions | Always union critical/B-series; ambiguous or unmapped changes select all. |
| Coverage creates false confidence | Call it declared coverage, not proof; report unmapped sections. |
| Rejudging multiplies cost | Explicit opt-in, preflight maximum calls, metered refusal, maximum three judgments. |
| New fields get dropped by rewriters | Round-trip tests across every command and review-server write path. |
| Draft cases alter ship grades | Keep pending captures outside `specification.yaml` until explicit promotion. |

---

## 11. Explicit non-goals

- Harnesses other than pi.
- Retraining or fine-tuning models.
- Exact-output snapshot tests for assistant prose.
- Arbitrary mouse-highlight extraction from pi's transcript.
- Automatic causal attribution to a skill/subagent.
- Automatic full-repository fixture capture.
- Whole-machine filesystem, syscall, network, or credential auditing.
- Hosted dashboards or SaaS.
- Automatic natural-language discovery of every instruction rule.
- Removing human review or permitting judge consensus to bypass objective, critical, or B-series evidence.

---

## 12. Next-session handoff

Start here in a future session:

1. Read `AGENTS.md`, this plan, and `docs/ROADMAP.md` completely.
2. Confirm whether the owner wants to amend the current roadmap now or queue this after Phase 2 launch work.
3. Begin only Phase 0; do not implement all five features at once.
4. Validate pi JSON-mode and explicit-extension assumptions using sanitized offline fixtures before changing the adapter.
5. Keep capture MVP turn-based and zero-token by default.
6. Do not add unfinished capture scenarios to the main spec.

**Current implementation status (2026-08-08):** Phase 0 is done — roadmap amended
(Sprint 1.7), design recorded in `docs/pi-native-capture-design-2026-08-08.md`,
seven sanitized pi JSON fixtures plus a print-mode parity pair in
`packages/adapters/test/fixtures/pi-json/`, a deterministic fake subagent
extension beside them, and `CaptureCaseV1`/`ExecutionTraceV1` fixed as types-only
in `packages/core/src/capture-trace-types.ts`. No adapter, spec, runner, or CLI
behavior has changed, and no release post exists (a spike ships no feature).

**Start Phase 1 here.** Read the design doc's §10 corrections first — two of them
change what Phase 2 must build, and one (the quadratic stream) is a memory bug
that will not show up in a unit test.
