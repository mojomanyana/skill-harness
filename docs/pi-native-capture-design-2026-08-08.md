# pi-native capture & trace — design decisions

> Phase 0 output for
> `docs/superpowers/plans/2026-08-07-pi-native-regression-capture-program.md`.
> Everything below was **measured against pi 0.83.0 on 2026-08-08**, not inferred
> from documentation. Fixtures: `packages/adapters/test/fixtures/pi-json/`.
> Total subject spend for the whole spike: **$0.0035**, summed from pi's own
> `usage.cost` across every capture including discarded attempts.

The plan proposed five capabilities on top of one assumption — that pi's JSON mode
exposes enough structure to gate on *what the model did* rather than on what it
*said it did*. This document records what that stream actually contains, the four
places the plan was wrong about it, and the contracts fixed as a result.

## 1. The event stream

`pi --mode json` writes JSONL to stdout, one event per line. Full inventory
observed across all fixtures:

| Event | Carries | Used for |
|---|---|---|
| `session` | `id`, **`cwd`**, version | provenance — and a privacy hazard, see §5 |
| `agent_start` | — | — |
| `turn_start` / `turn_end` | `turn_end` has the assistant message + `toolResults[]` | round-trip boundaries |
| `message_start` / `message_end` | full message: `role`, `content[]`, `usage`, `stopReason` | text + tool calls |
| `message_update` | the **entire accumulated message** on every delta | nothing — skipped |
| `tool_execution_start` | `toolCallId`, `toolName`, `args` | call + argument gates |
| `tool_execution_update` | `toolCallId`, `partialResult` | nothing — skipped |
| `tool_execution_end` | `toolCallId`, `toolName`, `result`, `isError` | outcome gates |
| `agent_end` | the complete message array for the invocation | whole-transcript rebuild |
| `agent_settled` | — | terminator |

The plan named five of these (`message_end`, `tool_execution_start`,
`tool_execution_end`, `turn_end`, `agent_end`). The three it missed all matter:
`session` leaks paths, `tool_execution_update` must be skipped alongside
`message_update`, and `agent_settled` — not `agent_end` — is the real terminator.

Two further shape facts, both easy to get wrong and both now pinned by
`packages/adapters/test/pi-json-contract.test.ts`:

- **Every assistant message is emitted three times** — in `message_end`, `turn_end`
  and `agent_end`. A parser must pick exactly one source. `agent_end` alone can
  rebuild the whole invocation, which makes it the tempting choice — and also the
  one that carries thinking (§5).
- **`tool_execution_update` is tool-dependent.** `bash` streams partial output and
  emits them; `read` returns in one shot and emits none. Absence of update events
  says nothing about whether a tool ran, so no gate may key on them.

### 1.1 The stream is quadratic in output length

`message_update` re-sends the whole accumulated message on every delta. A trivial
three-tool-call run produced **52 MB** of stdout, of which **12 KB** was terminal
events — a ratio that grows with the answer.

**Decision: the adapter stream-parses and discards `*_update` events line by line.
It must never buffer pi's stdout into a string.** The existing `exec()` helper
buffers, so the JSON path needs its own streaming reader rather than reuse. This
is a correctness issue, not just performance: a long scenario would exhaust memory
mid-wave and take the run with it.

### 1.2 "turn" means round trip, not user turn

`turn_start`/`turn_end` bracket one *model round trip*. A single user prompt that
triggers one tool call produces **two** turns. The plan's Phase 1 uses "turn" to
mean a user message and its replies — the capture grouping logic and the trace
must not share the word. In the contracts, `turn` is the user-facing index and
round trips are not numbered at all.

## 2. Transcript parity — the plan's rule was wrong

Phase 2 specified traces carry "assistant text blocks excluding thinking". That is
**not** what today's adapter shows the judge.

Measured: pi's print mode (`-p`, no `--mode json`) emits **only the final
assistant message's text** — no thinking, no tool calls, no interim assistant
messages. Two candidate reconstruction rules, applied to the same captures:

- **Rule A** — every assistant text block, thinking excluded (as the plan wrote it).
- **Rule B** — the final assistant message's text only.

Rule B reproduces print mode exactly. On a deterministic prompt (`"Reply with
exactly the word: pong"`) run both ways, Rule B matched print-mode stdout byte for
byte after the `.trim()` the adapter already applies. Rule A did not match: models
emit text blocks *alongside* tool calls in interim messages, and those would be
concatenated in.

That divergence is not cosmetic. Feeding the judge interim narration ("Let me read
that file…") that the transcript has never contained would move verdicts on
scenarios nobody edited — a silent behavior epoch of exactly the kind
`docs/force-epoch-2026-08-06.md` exists to prevent.

**Decision: `ExecutionTraceV1.final_text` is the final assistant message only.**
The plan's §4.2 wording is superseded.

**Decision: `runStructured()` is used only by scenarios that declare trace
assertions,** as the plan already required. Parity is proven, but proven on a
handful of fixtures — it does not justify silently re-executing the whole corpus
through a different code path.

## 3. Parallel tool calls — correlate by id, never by position

pi executes tool calls batched in one assistant message **concurrently**. Three
`bash` calls sleeping 6s/1s/3s:

```
START SLOW → START FAST → START MID → END FAST → END MID → END SLOW
```

Starts in issue order, ends in **completion** order. `toolCallId` is the only
sound correlation key; a parser pairing the nth start with the nth end is wrong
whenever a scenario uses parallelism at all.

`ExecutionTraceV1` therefore records `issueIndex` and `completionIndex`
separately. Count and argument assertions read issue order; anything reasoning
about sequencing must say which order it means.

Worth noting for fixture maintenance: `gpt-oss-20b` **cannot** produce this shape —
it ignores an explicit batching instruction and emits one call per round trip. The
parallel fixture required `deepseek-v4-flash`. A future re-capture on a weak model
would silently lose the coverage.

## 4. Subagent evidence — what is and is not stable

Captured through a deterministic fake `Agent` extension
(`packages/adapters/test/fixtures/fake-subagent-extension.ts`) that spawns nothing
and calls no model, because an orchestration scenario tests the *parent*.

**Stable, safe to gate on:**

- `toolName` — the registered tool name (`Agent`), declared by the spec.
- `args` on `tool_execution_start` — verbatim, exactly as the model emitted them.
  This is the whole basis for selection ("did it call `plan`?") and handoff ("did
  the task text carry the required context?").
- `isError` on `tool_execution_end`.
- `result.details` — a tool's structured return value survives **verbatim** into
  the event. This is the one channel an extension can deliberately expose as
  contract.

**Not stable, must not be gated on:**

- Prose inside `result.content` — that is an extension's formatting choice, and
  gating on it makes a test that breaks on rewording.
- Anything about the child's internal execution. pi emits no nested trace for a
  subagent; the child is opaque. Deeper evidence is capability-detected per
  extension, never assumed.
- Argument *shape*. `{agent, task}` is this extension's convention, not pi's.
  Normalizers per known shape, with generic call/argument assertions as the
  fallback, as the plan already specified.

## 5. Privacy — the concrete leaks

Three real leaks found in the raw stream, all now sanitized in the fixtures:

1. **`session.cwd`** — the absolute workspace path, i.e. a home directory and a
   username.
2. **Tool-result bodies** — a failing `read` returned
   `ENOENT: ... access '/abs/path/to/file'`. Error strings embed absolute paths
   even when the arguments were relative.
3. **Thinking blocks** — present in `message_end`, `turn_end` **and** `agent_end`.

**Decision: dropping thinking is an explicit filter at all three sites**, not a
consequence of reading whichever field was convenient. A parser refactor that
switches from `message_end` to `agent_end` must not be able to reintroduce it.

**Decision: tool-result bodies are never persisted** — only `bytes`, `sha256`,
`isError`, and small `details`. A gate needing content asserts on the workspace
instead, which is also the only claim the evidence supports (§7).

The fixtures deliberately **retain** thinking blocks: they are parser *inputs*, and
a fixture with no thinking gives the redaction test nothing to bite on.

## 6. Extension isolation — confirmed, in the stronger form

Plan §5.2 assumed `pi --no-extensions --extension <path>` loads only the declared
extension. Tested with load-time stderr markers, which costs **no model call at
all** because extensions load during startup (`--help` is enough):

| Invocation | Loaded |
|---|---|
| `pi --help` in a dir with `.pi/extensions/sneaky.ts` | nothing — project-local extensions are untrusted by default |
| `pi -a --help` | the discovered extension |
| `pi -a --no-extensions --extension <declared>` | **only the declared one** |

Isolation holds even with `-a` project-local trust active, which is stronger than
the plan assumed. Today's adapter already passes `--no-extensions`, so current runs
are already isolated; Phase 3 only adds `--extension`.

## 7. Limits this evidence does not reach

Restating the plan's §4.7, now with the measurements behind it:

- A trace proves **a registered tool was called with given arguments**. It proves
  nothing about what that tool then did to the machine.
- `bash` command strings are not a filesystem audit. A path policy that means
  anything must forbid `bash` outright or assert on observed workspace changes.
- Writes outside the isolated workspace are not observable and are never claimed.
- pi reports real `usage.cost` per message. Recorded for **spend disclosure only**
  — never as a grading input.

## 8. Compatibility

- `ExecutionTraceV1` and `CaptureCaseV1` both carry explicit versions, and both
  record `pi_version`. pi's event stream is not a stable public contract; a reader
  must refuse an artifact it does not understand rather than misread it.
- `results.yaml` stays **schema 2**. `objective` and `adjudication` are additive
  and optional; absent means "not declared" and "historical single judge"
  respectively — never a passing gate.
- Pending captures stay under `<skill>/tests/captures/`, out of
  `specification.yaml`, so they cannot touch ship-bar totals, staleness, lift, or
  stability before a human promotes them.
- New spec fields land in `sources.ts` facets so `lint` names the cheapest honest
  remedy: `assert.trace` is a **gate** (`regate`, free); `env.extensions` is
  **stimulus** (`run`, costs tokens); `covers` is metadata and stales nothing.

## 9. Phase 0 exit criteria

| Criterion | Status |
|---|---|
| pi JSON event shapes and ordering represented by offline fixtures | ✅ 7 fixtures + print-mode parity pair |
| Trace schema versioned with explicit privacy limits | ✅ `packages/core/src/capture-trace-types.ts` |
| Roadmap placement deliberate and recorded | ✅ `docs/ROADMAP.md`, Sprint 1.7 |
| JSON-mode reconstruction parity confirmed | ✅ §2 — and the plan's rule corrected |
| Explicit-extension loading confirmed | ✅ §6 |
| Stable subagent detail documented | ✅ §4 |
| `CaptureCaseV1` / `ExecutionTraceV1` defined | ✅ types only, no behavior |

No release post is required for Phase 0: it is a spike and ships no user-facing
feature. The post obligation (roadmap rule 2) attaches from Phase 1's
`/skill-harness capture` onward.

## 10. Corrections to the plan, in one place

1. **§4.2 transcript rule** — "assistant text blocks excluding thinking" →
   **final assistant message only**. Rule A breaks print-mode parity (§2).
2. **§4.2 event list** — add `session` (privacy), `tool_execution_update` (skip),
   `agent_settled` (real terminator) (§1).
3. **§4.2 implicitly assumes buffered stdout** — the stream is quadratic and must
   be parsed incrementally (§1.1).
4. **"turn" is overloaded** — pi's turn is a round trip, the plan's is a user
   message (§1.2).

None of these change the program's shape or its phase order. They change what
Phase 2 must implement, and they were all cheaper to find now than after the
parser existed.
