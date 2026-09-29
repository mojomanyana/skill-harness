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

## Cost/latency availability

Wall time and judge-call counts are available for every newly run rep. Pi requests structured
capture by default. Subject input/output/cache-read tokens, tool calls, delegated-child count, and
maximum concurrency come from Pi JSON traces; providers may still leave counters unreported. Subject
cost is derived only for models in the dated table at
`packages/adapters/prices/model-prices.json`. Reports state coverage (`reported reps / total reps`)
rather than presenting a partial sum as complete. Judge usage is not recorded.

## Sandbox status

Saved per-repetition trace hashes are compared during `regate`; missing reps and changed artifacts
are refused rather than shrinking or rewriting the denominator.

No OS sandbox is claimed. Temp fixture directories and git workspaces are not containment. Core
exports a `SandboxBackend`/`withSandbox` seam with fake-backed lifecycle/diff/network-policy tests.
Until a real backend exists, reports must continue to say containment is unavailable.
