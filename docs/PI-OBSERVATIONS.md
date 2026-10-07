# Pi evidence boundaries

The adapter captures one JSON event stream per Pi invocation and records its reported version. Legacy 0.83 fixtures remain regression evidence for their own version; they do not establish compatibility with 1.0.4.

For Pi 1.0.4, a message ending is insufficient to establish completion. The parser waits for `agent_settled`, checks that observed calls have completed, and records the latest assistant's stop reason separately from visible text. Later empty, aborted, error or length-ended messages cannot promote an earlier successful answer. A new agent cycle invalidates earlier settlement. Defective, duplicate or unmatched tool records make absence assertions unavailable.

| Observation | Meaning and limit |
|---|---|
| `final_text` | Full visible text of the latest assistant message, with normal redaction. Thinking is omitted. Pi 1.0.4 preserves surrounding whitespace. This is delivery evidence, not a byte-exact private session archive. |
| `final_status` | `complete`, `error`, `aborted` or `incomplete` under the Pi 1.0.4 settlement contract. Absent in legacy traces; absence does not imply complete. |
| `tool_calls` | Observed parent tool executions, correlated by tool-call ID. Arguments are sanitized and tool result bodies are replaced by byte count/hash plus bounded redacted details. |
| `delegated_children` | Legacy persisted name for the number of requested Agent tasks recognized in parent arguments. It does not prove children were launched, which body they ran, or that they settled. |
| `max_concurrency` | Maximum outstanding parent tool calls. One fan-out call may launch several children. This value is not active-child concurrency. |
| `require_subagents` | Parent selection and handoff argument assertion only. Actual child execution needs a matched producer receipt; none is inferred from prose or arguments. |
| `changed_paths` | Workspace observations captured independently of messages. Null means unavailable. |
| Usage | Subject usage only where reported; judge usage remains unavailable. Cost coverage is partial. |

Failed or unproven Pi 1.0.4 delivery is recorded as an execution failure independently of provider transport diagnostics. A settled error/abort, missing settlement, malformed capture or nonzero process exit produces ERROR before judging, including ungated scenarios. Its harness-owned transcript preamble preserves that status for later grading. Failed dependent turns stop. The existing one-retry policy for empty responses remains unchanged. A successful settled retry supersedes earlier transient transport diagnostics. Legacy version handling remains separate.
No child receipt adapter is added until a concrete assertion has a qualified producer with execution identity. The removed generic trajectory assertion language stays removed. Raw private sessions are not uploaded or retained by this adapter. Normalized traces and redacted transcripts use the existing per-run retention rules; reports must distinguish these from raw execution and artifact evidence.

Use the existing saved-evidence operations: stimulus changes need `run`, rubric changes `grade`, policy changes `rescore`, gates changes `regate`. The latter can spend judge tokens on a fail-to-pass transition. Original evidence and human overrides remain intact.

Qualification fixtures under `packages/adapters/test/fixtures/pi-1.0.4/` were captured from the actual Pi 1.0.4
CLI using an in-process scripted provider, Node 26.7.0 on Linux x64. They cover success, terminal error, nested
error propagation, automatic retry and a successful-looking boundary followed by an error. Every process exited
zero. Provenance pins fixture bytes; generated cwd/package path prefixes were sanitized, visible text whitespace
and Unicode separators were retained. These establish adapter event handling, not remote provider behavior or
pi-daddy child identity. The capture source lives in pi-daddy's `test-integration/pi-sdk` qualification package.
