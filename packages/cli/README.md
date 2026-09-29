# @skill-harness/cli

The command surface for [skill-harness](https://github.com/mojomanyana/skill-harness) —
a test/optimize loop for agent skills: run spec'd scenarios on the `pi` harness,
LLM-judge each transcript, score against a ship bar, review, and re-run to
measure a `SKILL.md` edit. Subject, judge, and spec-drafting model calls all run
through Pi.

Most users should install the `skill-harness` meta-package (`npm i -g
skill-harness`) instead of this package directly.

## Install

```bash
npm i -g @skill-harness/cli
```

## Commands

| command | does |
|---|---|
| `skill-harness list --skills <root>` | discovered skills + spec status |
| `skill-harness lint <skill\|all> --skills <root>` | validate specs/fixtures; CI gate |
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
