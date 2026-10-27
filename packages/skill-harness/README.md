# skill-harness

Create and evaluate agent skills through [Pi](https://pi.dev). Start with an
idea or an existing skill; the guided workflow helps define its behavior,
draft the skill and evaluation cases, review judge controls, and inspect results.
Authoring requires Pi with a selected model. All subject and judge calls also
run through Pi.

Fresh subject execution supports **Pi 1.0.4, 1.1.0 and 1.4.0**. Other or unavailable
versions produce execution ERROR before a subject call. Retained results remain
readable; the historical Pi 0.83.0 raw parser is not current qualification.

## Install

```bash
npm i -g skill-harness          # CLI
pi install npm:skill-harness     # CLI plus /skill-harness extension in Pi
```

The Pi package includes its extension and authoring skill. After install/update,
`/reload` makes them available in an existing supported Pi session; verify the
loaded resources rather than treating the package version as proof.

## Start with an idea

In Pi, select your model and enter:

```text
/skill-harness create I need a social media manager skill for drafting campaign proposals.
```

The installed authoring skill also lets Pi discover this workflow from a
natural-language request such as “Help me create and evaluate a social media
manager skill.” The command above starts it explicitly.

It asks one necessary question at a time, including scope, permitted tools,
and whether evals belong beside the skill or in a separate repository. It
previews proposed files before applying them and asks you to review expected
calibration labels. Generated skills can run with Pi alone; an optional
pi-daddy agent wrapper provides ecosystem delegation without making the skill
depend on pi-daddy or principal-pi-skills.

Use preflight before model runs, calibration to check the judge against
reviewed controls, and diagnosis to separate missing evidence from observed
failures. These checks do not themselves establish model quality. See
[the authoring workflow](https://github.com/mojomanyana/skill-harness/blob/main/docs/EVAL-AUTHORING.md).

## The loop

1. **list** — discover which skills have a spec.
2. **lint** — validate specs/fixtures, free (no models, no keys) — the CI gate.
3. **run** — run every scenario on `pi` (skill active), grade with an LLM judge,
   write `results.yaml`, print a scorecard.
4. **review** — open an interactive matrix UI: flip verdicts, add notes, they
   persist back to `results.yaml`.
5. **add-test** + re-`run` — add a scenario, then re-run to measure a `SKILL.md` edit.

## Commands

| command | does |
|---|---|
| `skill-harness list --skills <root>` | discovered skills + spec status |
| `skill-harness lint <skill\|all> --skills <root>` | validate specs/fixtures; CI gate, exits non-zero on findings |
| `skill-harness preflight <skill\|all> --skills <root> [--specs <root>]` | inspect eval configuration and discoverability without model calls |
| `skill-harness calibrate <manifest.json>` | validate selected calibration evidence offline |
| `skill-harness calibrate <manifest.json> --run --judge p:m --out NEW_DIR` | judge reviewed positive, negative and equivalent controls through Pi |
| `skill-harness diagnose <run-dir> --skills <root> [--specs <root>]` | inspect saved evidence and identify blockers without changing scores |
| `skill-harness run <skill\|all> --skills <root> [--model p:m ...] [--judge p:m]` | run scenarios, grade, score |
| `skill-harness grade <run-dir> [--judge p:m]` | re-grade saved transcripts — no subject re-run |
| `skill-harness rescore <run-dir>...` | re-apply current score thresholds offline |
| `skill-harness regate <run-dir>...` | re-evaluate saved objective gates |
| `skill-harness restamp <skill\|all> --skills <root> --from <ref>` | migrate matching model-visible digests |
| `skill-harness stability <skill\|all> --skills <root>` | report run-over-run verdict flips |
| `skill-harness review <skill> --skills <root> [--port N]` | serve the interactive review UI |
| `skill-harness add-test <skill> --skills <root> --id ID --title T ...` | scaffold a new scenario |
| `skill-harness init <skill> --skills <root>` | write an offline spec template |
| `skill-harness suggest <skill> --skills <root>` | draft a spec through Pi |
| `skill-harness coverage <skill\|all> --skills <root>` | report declared instruction coverage |

**Judge ≠ subject.** The judge model must differ from the model under test —
same-family grading inflates scores; `skill-harness` warns when they resemble
each other.

**`lint` and `list` are free** (pure static checks, no `pi`, no API keys);
`run` (and re-grading) spend model tokens.

## More

- Repo + full docs: https://github.com/mojomanyana/skill-harness
- Step-by-step usage: [`docs/USAGE.md`](https://github.com/mojomanyana/skill-harness/blob/main/docs/USAGE.md)
- CI Action (free spec lint on every PR): `uses: mojomanyana/skill-harness@latest` (or pin a version tag to freeze)

## Optional decision evaluation and learning data

`skill-harness decision --help` exposes the npm-installed offline fixture, comparison, selected-session import and reviewed LoRA export workflow. `/skill-harness jev enable` asks for a fresh per-session storage choice every time; declining still permits explicitly confirmed JEV calls. Storage retains selected unlabeled inputs only and never authorizes training.

The exact Pi1.0.4 OAuth subscription comparison is separate from optional metered JEV. Reports preserve grouped splits, independent labels, abstention/error coverage and model/prompt identities. Synthetic fixtures qualify plumbing only. OpenAI Decisions remains excluded. See [the npm acceptance walkthrough](https://github.com/mojomanyana/skill-harness/blob/main/docs/DECISION-LEARNING.md) and the [data contracts](https://github.com/mojomanyana/skill-harness/blob/main/experiments/decision-shadow/LEARNING-WORKFLOW.md).
