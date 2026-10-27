# @skill-harness/cli

The command surface for [skill-harness](https://github.com/mojomanyana/skill-harness) —
a test/optimize loop for agent skills: run spec'd scenarios on the `pi` harness,
LLM-judge each transcript, score against a ship bar, review, and re-run to
measure a `SKILL.md` edit. Subject, judge, and spec-drafting model calls all run
through Pi.

Most users should install the `skill-harness` meta-package (`npm i -g
skill-harness`) instead of this package directly.

Fresh subject execution supports **Pi 1.0.4, 1.1.0 and 1.4.0**. Other or unavailable
versions produce execution ERROR before a subject call. Retained results remain
readable; the historical Pi 0.83.0 raw parser is not current qualification.

## Install

```bash
npm i -g @skill-harness/cli
```

## Create a skill in Pi

Install the `skill-harness` Pi package, select a model, then use
`/skill-harness create <your idea>`. Authoring runs in Pi and asks one necessary
question at a time; the standalone CLI does not substitute a direct model API.
The workflow previews a skill, optional pi-daddy wrapper, and evals in the same
or a separate repository before applying files. Generated skills need only Pi;
the wrapper is optional and principal-pi-skills is not required.

The CLI supports the subsequent offline preflight, reviewed judge calibration,
scenario execution and saved-result diagnosis. See
[EVAL-AUTHORING.md](https://github.com/mojomanyana/skill-harness/blob/main/docs/EVAL-AUTHORING.md)
for the complete workflow and its evidence limits.

## Commands

| command | does |
|---|---|
| `skill-harness list --skills <root>` | discovered skills + spec status |
| `skill-harness lint <skill\|all> --skills <root>` | validate specs/fixtures; CI gate |
| `skill-harness preflight <skill\|all> --skills <root> [--specs <root>]` | inspect eval configuration and discoverability offline |
| `skill-harness calibrate <manifest.json>` | validate selected calibration evidence offline |
| `skill-harness calibrate <manifest.json> --run --judge p:m --out NEW_DIR` | judge reviewed controls through Pi; preserve a new result directory |
| `skill-harness diagnose <run-dir> --skills <root> [--specs <root>]` | inspect saved evidence without changing historical scores |
| `skill-harness run <skill\|all> --skills <root> [--model p:m ...] [--judge p:m]` | run scenarios, grade, score |
| `skill-harness grade <run-dir> [--judge p:m]` | re-grade saved transcripts |
| `skill-harness rescore <run-dir>...` | re-apply current score thresholds offline |
| `skill-harness regate <run-dir>...` | re-evaluate saved objective gates |
| `skill-harness restamp <skill\|all> --skills <root> --from <ref>` | migrate matching model-visible digests |
| `skill-harness stability <skill\|all> --skills <root>` | report run-over-run verdict flips |
| `skill-harness review <skill> --skills <root> [--port N]` | serve the interactive review UI |
| `skill-harness add-test <skill> --skills <root> --id ID --title T ...` | scaffold a new scenario |
| `skill-harness init <skill> --skills <root>` | write an offline spec template |
| `skill-harness suggest <skill> --skills <root>` | draft a spec through Pi |
| `skill-harness coverage <skill\|all> --skills <root>` | report declared instruction coverage |

## More

- Repo + full docs: https://github.com/mojomanyana/skill-harness
- Step-by-step usage: [`docs/USAGE.md`](https://github.com/mojomanyana/skill-harness/blob/main/docs/USAGE.md)

## Optional decision evaluation and learning data

`skill-harness decision --help` exposes the npm-installed offline fixture, comparison, selected-session import and reviewed LoRA export workflow. `/skill-harness jev enable` asks for a fresh per-session storage choice every time; declining still permits explicitly confirmed JEV calls. Storage retains selected unlabeled inputs only and never authorizes training.

The exact Pi1.0.4 OAuth subscription comparison is separate from optional metered JEV. Reports preserve grouped splits, independent labels, abstention/error coverage and model/prompt identities. Synthetic fixtures qualify plumbing only. OpenAI Decisions remains excluded. See [the npm acceptance walkthrough](https://github.com/mojomanyana/skill-harness/blob/main/docs/DECISION-LEARNING.md) and the [data contracts](https://github.com/mojomanyana/skill-harness/blob/main/experiments/decision-shadow/LEARNING-WORKFLOW.md).
