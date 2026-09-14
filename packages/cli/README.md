# @skill-harness/cli

The command surface for [skill-harness](https://github.com/mojomanyana/skill-harness) —
a test/optimize loop for agent skills: run spec'd scenarios on the `pi` harness,
LLM-judge each transcript, score against a ship bar, review, and re-run to
measure a `SKILL.md` edit.

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
| `skill-harness review <skill> --skills <root> [--port N]` | serve the interactive review UI |
| `skill-harness add-test <skill> --skills <root> --id ID --title T ...` | scaffold a new scenario |
| `skill-harness qualification prepare\|start\|status\|poll\|validate\|abort ...` | durable external-config qualification lifecycle |

## Retained learning

`skill-harness learning` opens the guided offline workflow; `learning help` documents
named retained inputs, complete quality review, scoped trust, independent labels,
separate adoption decisions and later observations. No hand-authored manifests or model calls.
The Pi package exposes the same flow as `/skill-harness learning`; connected producer registry
activation/rollback remain separately authorized operations, never a side effect of reading.
`@skill-harness/cli/learning` exports `runLearningCommand`, `runLearningWizard` and
`reviewLearningComparison` for the existing producer dashboard bridge.

[Product guide](https://github.com/mojomanyana/skill-harness/blob/main/docs/factory/PRODUCT-GUIDE.md).

## More

- Repo + full docs: https://github.com/mojomanyana/skill-harness
- Step-by-step usage: [`docs/USAGE.md`](https://github.com/mojomanyana/skill-harness/blob/main/docs/USAGE.md)
