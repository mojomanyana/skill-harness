# @skill-harness/core

The engine behind [skill-harness](https://github.com/mojomanyana/skill-harness):
skill-authoring drafts and previews, spec parsing, eval preflight, selected judge
references, calibration, run orchestration, grading, scoring, and result diagnosis.

Most users should install `skill-harness` in Pi, select a model, and start with
`/skill-harness create <idea>`. Authoring requires Pi and its selected model;
generated skills require only Pi. A pi-daddy wrapper is optional. Evaluation
files can live with the skill or in a separate repository.

The CLI exposes `preflight`, offline `calibrate` validation, explicit
`calibrate --run --judge ...`, and `diagnose`. Core helpers preserve selected
references and reviewed calibration expectations without treating them as a
model-quality score. See
[EVAL-AUTHORING.md](https://github.com/mojomanyana/skill-harness/blob/main/docs/EVAL-AUTHORING.md)
and [JUDGE-EVIDENCE.md](https://github.com/mojomanyana/skill-harness/blob/main/docs/JUDGE-EVIDENCE.md).

Run `skill-harness --help` to see the exact Pi releases qualified by your installed
Harness. Judges require a listed release. See [Pi qualification](https://github.com/mojomanyana/skill-harness#pi-qualification)
for compatible subject versions, strict mode and how the Harness records the version used.

ESM, Node ≥ 20.
