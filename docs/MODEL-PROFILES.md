# Model profiles and retained evidence

Local candidate, 2026-11-05; not a published release or live model qualification.

Choose the subject with `--model provider:model`, the independent judge with
`--judge provider:model`, and their requested effort with `--thinking LEVEL` and
`--judge-thinking LEVEL`. Supported argument names are `off`, `minimal`, `low`,
`medium`, `high`, `xhigh`, and `max`, matching the inspected Pi 1.5.0 parser.
This is argument support, not proof a particular provider/model or older qualified
Pi version honors every level. Pi owns model resolution. Harness forwards the
selection and never reports a requested effort as an observed effective effort.
Select available cheaper/flash models through the same Pi provider/model mechanism;
this change adds no catalog, pricing recommendation or adaptive router.

After agreeing the skill, subject and independent judge, an explicit run can use:

```sh
skill-harness run example --skills ./skills --specs ./evals \
  --model provider:subject --thinking high \
  --judge provider:judge --judge-thinking low --mode force
```

Existing judge billing opt-ins and model-call consent still apply. The Pi command
accepts the same effort flags. The `skill_check_run` tool uses `thinking` and
`judgeThinking`; `grade`, `regate` and `calibrate` use `--judge-thinking`.

Model IDs may contain colons. Legacy suffix tokens such as `provider:model:high`
remain opaque and are forwarded unchanged to Pi; historical IDs and paths are not
rewritten. A recognized legacy suffix cannot be combined with the explicit effort
flag. Legacy suffix and explicit-field profiles are deliberately distinct: Harness
does not assume they resolve equivalently. An unspecified effort is also distinct
from every explicit level. New subject paths include the explicit effort.

## Inspect before repeating a run

`diagnose` remains offline and leaves saved results unchanged. It shows the existing
criterion groups, profile/usage summary and per-scenario remedy. Preview another
profile without invoking a provider:

```sh
skill-harness diagnose RUN_DIR --skills ./skills --specs ./evals \
  --thinking low --judge-thinking high --format text
```

A subject profile change needs new answers. A judge profile change can keep the
answers but needs new judgments. A policy-only change can use `rescore`; supported
gate-only corrections use `regate`, which may need a judge for a fail-to-pass gate.
`regate` and selective `grade` require the recorded judge profile. Use a complete
saved-answer regrade to change it. For combined gate/judge changes the planner
explains both steps. A retired judge requires full migration through `grade` before
using `regate` with the new recorded profile. `grade --out NEW_DIR` preserves an
exclusive copy of the original evidence before regrading. Reused evidence is not a
new stability trial. Exact calibration reuse also includes requested judge effort.

Lift and stability compare requested profiles and recorded observed identities.
Heterogeneous judges retain their scenario/repetition/ordinal assignment; observed
subject identities retain repetition/turn and judge identities retain attempt
assignment. Differences, including known versus missing observations, conservatively
exclude comparisons. Two historical records with no observations remain readable
and comparable under their requested conditions, with unqualified effective identity
and effort. A matching request does not prove identical runtime settings.

## What the summary establishes

The existing CLI scorecard, Pi result, `diagnose` and review matrix expose the same
derived data from `results.yaml`; there is no additional report store. The review
column expands under **Evidence, profiles and usage**.

- **Requested:** selected subject/judge provider, model and explicit effort, if any.
- **Observed:** provider/model identities actually present in assistant metadata.
  Aliases may legitimately resolve differently. Effective thinking remains unknown
  because the captured Pi assistant metadata does not report it.
- **Outcomes:** all recorded verdict states, including errors, ambiguous and legacy
  not-measured outcomes; additional suspect/override flags are separate. An operation
  settling does not mean the product passed. A FAIL still requires contract/judge
  diagnosis; transport and capture errors do not establish product failure.
- **Token coverage:** separate nullable subject/judge counter subtotals and message
  coverage, including reported zeroes. Judge malformed/error replies retain their
  actual observations. Retained judge attempts use retained panel retry counts as
  their denominator, never cumulative historical call metrics. Earlier replaced
  judgments and subject retries may be absent; actual provider request totals remain
  unknown. Missing usage is not zero, and partial coverage is not a complete bill.
- **Cost:** existing subject price-table estimates stay separate. Judge cost and
  actual billed cost are not implemented, even if a provider reports other cost
  metadata. No new prices, cost savings or speed/quality gains are claimed.

When Daddy is loaded in the same Pi session, the extension optionally publishes a
bounded snapshot through `pi-daddy:dashboard-source:v1`. The producer is
`packages/pi-extension/src/dashboard.ts`, wired to `/skill-harness run`, `judge`
and the registered `skill_check_run` tool. It shows observed operation activity and
the retained summary. It does not guess a waiting reason or publish raw transcripts,
errors or file paths. Session changes close the source and discard late completion;
Daddy owns staleness/display. Absent Daddy or a broken display cannot fail evaluation.
Standalone CLI runs do not emit into another process's dashboard. Detailed evidence
remains in Harness review/diagnose, with no new grants or authority.

Per-skill, per-child and per-turn adaptive JEV model/effort selection remains later
work. These records support future evaluation without authorizing routing, paid
calls, training, provider substitution or new model choices.
