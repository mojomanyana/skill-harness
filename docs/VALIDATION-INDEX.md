# Validation index

Evidence inventory as of 2026-11-13. Each row answers a different question; these
results must not be pooled into an ecosystem score or generalized to new versions.
No broad quality, speed or cost advantage over plain Pi has been established here.

## Public, inspectable records

| Record | Identity and location | What it establishes | Limits |
| --- | --- | --- | --- |
| Harness release checks | [0.35.4 release](https://github.com/mojomanyana/skill-harness/releases/tag/v0.35.4), source `0607dd98756f34877c7676e99efb596d45f41336`, [CI run](https://github.com/mojomanyana/skill-harness/actions/runs/43425029949) | Release-source tests, contract checks and package construction | Not a current-model comparison or a pass for a later candidate |
| Pi 1.5.2 transport | [Fixture README](../packages/adapters/test/fixtures/pi-1.5.2/README.md), [provenance](../packages/adapters/test/fixtures/pi-1.5.2/provenance.json) | Official Pi CLI and Harness adapter, successful/error/filtered tools, grading, multi-turn resume and observed process settlement | Scripted local replies, synthetic credentials; no real-provider authentication, autonomous skill selection or model quality |
| Older qualified transport | [1.0.4](../packages/adapters/test/fixtures/pi-1.0.4/), [1.1.0](../packages/adapters/test/fixtures/pi-1.1.0/), [1.4.0](../packages/adapters/test/fixtures/pi-1.4.0/), [1.5.0](../packages/adapters/test/fixtures/pi-1.5.0/) | Retained version-specific behavior; current-version CI supplements these records | A newer passing version does not rewrite or replace an older capture |
| Principal historical model evaluations | [Evaluation repository at its retained revision](https://github.com/mojomanyana/principal-pi-skills-evals/tree/bd3f047a80a8899d0d0e6576c4d128ca9a7a0876) | Inspectable scenarios, identities and recorded model results | Historical package/model/rubric scope; not a score for current Principal or the daily-use batch |
| Evidence-review authoring reference | [Authoring guidance](EVAL-AUTHORING.md), `skill_author reference` with `pattern: "evidence-review"` in Harness 0.35.4 | Eight example scenarios and 26 proposed controls are available to authors | Not observed model answers, accepted labels, calibrated judgments or a passing evaluation |

The current-Pi CI job in [the workflow](../.github/workflows/ci.yml) repeats the
existing capture procedure on Pi 1.5.2 using only a loopback scripted provider.
It retains qualification summaries and logs. Its result applies to the commit
tested by that job; adding the job is not itself a passing result. Existing
contract-producer pins and older-version fixture checks remain unchanged.

## Privately retained acceptance, summarized without publishing transcripts

These records informed the implementation. Their raw evidence is **not publicly
available in this repository**, so a public reader cannot independently replay
these claims from the table. They are not substituted for public CI or a matched
model comparison. Original failures, repaired candidates and old scores remain
separate.

| Record | Retained identity | Reported result and boundary |
| --- | --- | --- |
| Queue order and customer update, completed 2026-11-13 | Pi 1.5.2; Daddy candidate `6ec9a75`; Harness candidate `e8bbbd2`; Bookie 0.3.1; Scout 0.2.2; Principal 4.15.1. Final archive SHA-256 `5dc00952b483d40960ff7d34cc52eefa621b761046585a3fb656cc7782ce1809` | Luna/high built the change and draft; Astra/medium found an empty-queue defect and approved its repair in a separate review. Existing API/browser evidence was reused only for unchanged behavior. Real Pi/Bookie save/new-session recall preserved the audience, open date and exact draft using a deterministic coordinator. No additional fresh-model recall or unaided human-usability result is claimed. No deployment or customer message. |
| Harness 0.35.4 delivery, 2026-11-13 | Source `0607dd98756f34877c7676e99efb596d45f41336`; exact package/archive records retained by the maintainer | Public-install bytes matched canonical archives, and native Pi 1.5.2 load/reload plus optional-reference lookup passed. The reference remained proposed; no labels, provider calls or new quality scores were created. Public source CI is linked above; installed-byte receipts are private. |

The queue-order run kept JEV off. Sampled child-process memory does not establish
whole-host health; observed tokens do not establish billed cost. Its use of saved
evidence demonstrates bounded reuse in that run, not a general efficiency claim.

## Current daily-use batch: separate qualification

Seven operator-approved regression groups cover managed memory lookup and recent
notes, truthful result limits, required child-tool availability, grouped exact-set
permissions, paused-memory explanations, selected-package resource locations and
current-Pi compatibility. Their source changes and new check results must be
recorded at their own final identities before they are described as passing.

The batch makes no model or JEV calls. It does not qualify arbitrary extension/MCP
tool delivery to children, folder migration, shared retrieval, nested token-cost
aggregation or general superiority over another harness. Unsupported tools must
be explained before launching an incomplete child.

## Reuse rules

- Reuse an existing result only where candidate, relevant inputs, scope and
  environment still apply. Record why unchanged behavior is covered.
- A changed source, fixture, rubric or provider boundary needs the check relevant
  to that change; a successful archive hash is not behavioral validation.
- Keep compatibility, objective execution, semantic judgment, human usability,
  performance and billing claims separate. Unknown measurements stay unknown.
- Proposed regression scenarios and authored labels need their respective
  operator acceptance. Neither accepts a model result or grants paid calls.
- Retain failures and superseding repairs; never rewrite an old score to make the
  latest release appear qualified.
