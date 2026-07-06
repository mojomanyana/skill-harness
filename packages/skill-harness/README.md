# skill-harness

A portable **test / optimize loop for agent skills**, driven from [pi](https://pi.dev).
Point it at a repo of skills, and for any skill with a `tests/specification.yaml`
spec it will run each scenario, LLM-judge the transcript, score it against a ship
bar, and open an interactive review UI so you can measure a `SKILL.md` edit.

## Install

```bash
npm i -g skill-harness
```

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
| `skill-harness run <skill\|all> --skills <root> [--model p:m ...] [--judge p:m]` | run scenarios, grade, score |
| `skill-harness grade <run-dir> [--judge p:m]` | re-grade saved transcripts — no model re-run |
| `skill-harness review <skill> --skills <root> [--port N]` | serve the interactive review UI |
| `skill-harness add-test <skill> --skills <root> --id ID --title T ...` | scaffold a new scenario |

**Judge ≠ subject.** The judge model must differ from the model under test —
same-family grading inflates scores; `skill-harness` warns when they resemble
each other.

**`lint` and `list` are free** (pure static checks, no `pi`, no API keys);
`run` (and re-grading) spend model tokens.

## More

- Repo + full docs: https://github.com/mojomanyana/skill-harness
- Step-by-step usage: [`docs/USAGE.md`](https://github.com/mojomanyana/skill-harness/blob/main/docs/USAGE.md)
- CI Action (free spec lint on every PR): `uses: mojomanyana/skill-harness@v1`
