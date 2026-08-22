# The spawn that only said "starting"

*Draft. Findings from Wave 0 of the pi-daddy arms campaign, 2026-08-22.*

We added an arms axis to skill-harness so the same scenarios could be measured with and
without pi-daddy, the capability-governance extension, loaded. Wave 0 was the pilot: one
skill (`review`, 22 scenarios), one model (`openai-codex:gpt-5.6-terra:high`), `--mode
force`, three reps per scenario, both arms. 132 subject executions, 132 judge calls.

The scorecards came back identical.

```
control   GRADE: A (95%) — 21/22 — NOT READY (gated: 1 critical fail)
pi-daddy  GRADE: A (95%) — 21/22 — NOT READY (gated: 1 critical fail)
```

A per-cell comparison found **zero differing cells**. The obvious writeup is "governance
changed nothing", and it would have been wrong.

## What the ledger said

The arm declares `PI_GRANTS_LEDGER: "<run-dir>/pi-daddy.ledger.jsonl"`, and the harness
counts its lines into `results.yaml` as `ledger_events`. The control recorded `0`. The arm
recorded `2`:

```json
{"event":"capability_decision","ts":"2026-08-22T23:16:49.451Z","parentId":"d0",
 "childId":"d0.1","depth":1,"agentType":"principal-review","executor":"herdr", …}
{"event":"child_lifecycle","ts":"2026-08-22T23:16:49.459Z","childId":"d0.1",
 "state":"starting","executor":"herdr"}
```

A delegation was requested, authorised, and started. Then nothing. No completion event, no
refusal, no error. The child said `starting` and never spoke again.

Five minutes later, to the second:

```
2026-08-22T23:21:43.702Z  empty-response-retry D2
```

That is the harness's 300-second adapter timeout. pi had hung waiting on a child that never
returned. The retry ran, passed, and the cell scored PASS — which is exactly why the two
arms' verdicts are identical. The delegation didn't change the outcome because it never
produced one.

## Three things that had to be true to see this at all

**The ledger had to be recorded, not just written.** pi-daddy's ledger is a `*.jsonl` file
in the run directory, and `*.jsonl` is gitignored. Had the count not been lifted into
`results.yaml`, the committed artifact would have shown two arms with identical verdicts and
nothing else — and "governance is inert on this skill" would have been the whole finding.
Zero and two are the difference between *nothing happened* and *something started and
vanished*, and only one of those is a bug.

**Zero had to be a value, not an absence.** `countLedgerEvents` returns `0` when the file
does not exist. If a missing ledger had recorded nothing at all, the control arm and a
broken arm would look the same in the record.

**The wave had to survive the hang.** `--structured` routes every scenario through
`runStructured`, which throws on a timeout; the scenario pool is fail-fast. Before this
branch, that single 300-second hang would have unwound the entire run — no `results.yaml`,
and all 65 already-completed reps discarded. It became one rep's retry instead. The fix was
found in review, not in testing, and it paid for itself the first time it ran live.

## What Wave 0 does and does not license

It shows the axis works: the arm loads, seeds six definitions, registers `delegate`,
`delegate_all` and `delegate_chain`, and authorises a spawn of `principal-review` at depth 1.
Every one of those was unverified before this run.

It does **not** show that governance leaves behaviour unchanged. Governance never got to act.
One delegation was attempted in 66 reps and it hung. Reporting "no measurable difference"
without that caveat would be reporting a broken measurement as a null result — the exact
failure this project keeps writing about.

It also produces the first cost numbers this corpus has ever recorded, because until
`--structured` existed nothing populated them:

| | control | pi-daddy | Δ |
|---|---|---|---|
| subject input tokens | 87,660 | 123,088 | **+40%** |
| cache-read | 235,008 | 344,576 | +47% |
| wall time | 24.1 min | 29.7 min | +23% |
| tool calls | 21 | 28 | +7 |

Roughly 35,000 extra input tokens per 22-scenario wave, for a delegation surface the model
used once and got nothing back from. Most of the wall-clock delta is the hang itself.

## The failure that was already predicted

One cell failed: `S6`, 1/3 on the control and 0/3 under the arm, the same way both times —
handing over a rewrite when the scenario's whole point is recommending the original stay as
it is. `S6` is not news. `lint` already reports it flipping in 2 of 2 comparable run-to-run
steps on the fireworks-era runs. A cell with no stable history failing on a new model is not
evidence about the model, and the remedy is more reps on that cell, not a spec edit.

It is worth noticing what would have happened had `S6` gone the other way. A single flip to
PASS under the arm, on a cell known to be unstable, would have read as pi-daddy *improving*
the skill. One draw against a majority.

## Next

The delegation path needs to complete before a second wave means anything. The spawn used
`executor: "herdr"`, and the harness runs pi headless — `-p`, `--no-session`, no tty. A
child that reports `starting` and never finishes under those conditions is the thing to
chase, and it is a pi-daddy question, not a harness one.

Until then, five more skills would buy five more copies of an unmeasurable result.
