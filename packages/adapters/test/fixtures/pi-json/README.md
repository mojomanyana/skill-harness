# `pi --mode json` event fixtures

Offline captures of pi's JSON event stream, recorded 2026-08-08 against **pi 0.83.0**
for the Phase 0 feasibility spike of
`docs/superpowers/plans/2026-08-07-pi-native-regression-capture-program.md`.

They exist so the trace parser can be built and tested without spending tokens, and
so a pi upgrade that changes the event shape fails a test instead of silently
degrading a gate.

## What each fixture is

| File | Shape it pins | Subject model |
|---|---|---|
| `single-turn.jsonl` | plain text answer, no tools | `gpt-oss-20b` |
| `tool-call.jsonl` | one successful `read` call | `gpt-oss-20b` |
| `tool-error.jsonl` | failing `read` — `isError: true` | `gpt-oss-20b` |
| `multi-turn-turn1.jsonl` / `multi-turn-turn2.jsonl` | `--session-dir` + `-c` continuity | `gpt-oss-20b` |
| `parallel-out-of-order.jsonl` | 3 `bash` calls in one message, completing out of issue order | `deepseek-v4-flash` |
| `sequential-tool-calls.jsonl` | the same prompt on a weak model — one call per round trip; also the only fixture carrying `tool_execution_update` | `gpt-oss-20b` |
| `subagent-call.jsonl` | an `Agent` tool call via an explicitly declared extension | `deepseek-v4-flash` |
| `parity-print-mode.txt` | print-mode stdout for the same prompt as `single-turn.jsonl` | `gpt-oss-20b` |

`parallel-out-of-order.jsonl` needed `deepseek-v4-flash`: `gpt-oss-20b` ignores an
explicit instruction to batch tool calls and emits one per round trip, which does not
exercise the out-of-order path at all. `sequential-tool-calls.jsonl` is that failed
attempt, kept deliberately — a gate asserting on call *order* must still behave on a
model that serializes, and it is the only capture with streaming tool updates.

Two shape facts the tests pin, both easy to get wrong:

- **`tool_execution_update` is tool-dependent.** `bash` streams partial output and
  emits them; `read` returns in one shot and emits none. Absence proves nothing about
  whether a tool ran.
- **Every assistant message appears three times** — in `message_end`, `turn_end` and
  `agent_end`. A parser must pick one source; reading two doubles the transcript.

`subagent-call.jsonl` was produced with a **deterministic fake** `Agent` extension that
spawns nothing and calls no model — an orchestration fixture must exercise the parent's
selection and handoff, and a real child would add nondeterminism and spend to a test
about the parent.

## Deliberate choices

**Streaming `*_update` events are mostly stripped.** `message_update` re-sends the
entire accumulated message on every delta, so the raw stream is quadratic in output
length — the 3-tool-call run above produced **52 MB**, of which 12 KB was terminal
events. `single-turn.jsonl` and `tool-call.jsonl` each retain two small `*_update`
events on purpose, so a parser test exercises the skip path rather than assuming the
events are absent.

**Thinking blocks are retained.** These are parser *inputs*, not trace artifacts. The
rule that hidden thinking never reaches a persisted trace is enforced by the parser,
and a fixture with no thinking in it gives that test nothing to bite on.

**Sanitized:** workspace paths → `/WORKSPACE`, home paths → `/HOME`, session UUIDs →
a fixed zero UUID. Timestamps, token usage, and cost are left intact — they are
ordering/provenance evidence and carry nothing sensitive.

## Regenerating

Re-capture only when pi's event contract is suspected to have changed; it costs real
tokens — though not many: every capture in this directory, including the discarded
attempts, totalled **$0.0035** of subject spend (summed from pi's own `usage.cost`).
Record the new pi version in the table and re-run the contract tests before trusting
a diff.
