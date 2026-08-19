# The final answer is not the workflow

*Draft — owner should edit voice before publishing.*

A workflow can end with perfect prose and still have done the dangerous thing.

It can say “independent review complete” after reviewing in the writer's context. It can cite tests
run before the last edit. It can report the right Git HEAD while the uncommitted candidate tree has
changed underneath it. It can call a workspace “single writer” because a prompt said `writer:
build`, without any coordinator ever acquiring a lease.

We added trajectory assertions to skill-harness because none of those are language-quality
questions. They are event-order and identity questions.

A scenario can now assert that Build completed before exact-target evidence, that evidence is newer
than both the last source change and the last authority transition, that two review axes use distinct
context IDs, that every receipt correlates the same run/task/workspace/head/**tree**, and that Git-Ops
selected one finish choice, passed its finalize gate, persisted exact final identity, and only then
passed finish.

The evaluator asks before the LLM judge. A missing field is ERROR, not a governance pass. A decisive
objective failure cannot be voted away by prettier prose or by two successful repetitions around one
forbidden side effect.

The part I trust most is not the happy-path fixture. It is:

```bash
skill-harness mutation-test
```

It removes required events, reorders transitions, swaps workspace IDs, expires approvals, moves
evidence before source/authority/Build floors, keeps HEAD while changing the candidate tree, mutates
a superseded task, reuses a context ID, and corrupts finalization. All 15 must turn red, offline.
An assertion that has never been shown to fail is decoration.

We also added paired reference-versus-candidate runs. “Paired” means same scenario, fixture, model,
delivery, judge, and repetition plan — not that an LLM provider suddenly became deterministic.
Reports say that explicitly and keep behavior separate from tokens, tool calls, and latency. A cheaper
failing workflow is still failing.

One boundary stays deliberately unblurred. Temp directories and worktrees are not OS containment.
The sandbox interface exists; the container/bubblewrap backend does not. Initial CWD validation is
not path confinement, and a governed-child writer lease cannot exclude an unrelated process.

The upstream principal v3 scenarios and live E2E matrix were static inputs to this work. They were
not model-run here, and historical v2 score cells are not v3 evidence. Measurement starts by saying
what did not run.
