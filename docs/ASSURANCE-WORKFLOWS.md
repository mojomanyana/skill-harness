# Assurance and release policy

## Critical release policy

`critical: true` and membership in top-level `critical:` are unified into one release-gating set.
For a critical scenario, the effective repetition threshold is always `1.0`: every clean repetition
must pass. This includes right-sizing counterexamples, so over-refusal and needless machinery can be
release failures. Ordinary scenarios retain their declared/default threshold.

Any judge/API/tooling `ERROR` remains `ERROR`; repetitions cannot vote it into PASS or turn it into a
behavioral FAIL. It blocks release as missing evidence. One objective failure cannot be outvoted by
other reps. A full green/force `run` that is NOT READY exits non-zero; red baselines and partial runs
do not pretend to be release gates.

## Mutation testing removed

Mutation-testing machinery was removed by explicit user instruction on 2026-09-07. This requirement
was withdrawn, not passed. Runtime validators, ordinary behavioral regression tests and historical
evidence remain.

## Cost/latency availability

Wall time and judge-call counts are available for every newly run rep. Subject input/output/cache
tokens, subject cost, tool calls, delegated-child count, and maximum concurrency come from pi JSON
traces, so today they are available for reps that use structured execution. Reports state the
coverage (`reported reps / total reps`) rather than presenting a partial sum as complete. Judge
providers currently do not expose judge token counts.

## Sandbox status

Saved per-repetition trace hashes are compared during `regate`; missing reps and changed artifacts
are refused rather than shrinking or rewriting the denominator.

No OS sandbox is claimed. Temp fixture directories and git workspaces are not containment. Core
exports a `SandboxBackend`/`withSandbox` seam with fake-backed lifecycle/diff/network-policy tests.
Until a real backend exists, reports must continue to say containment is unavailable.
