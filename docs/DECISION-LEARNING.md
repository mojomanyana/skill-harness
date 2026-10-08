# Decision evaluation and reviewed learning data

Install the published CLI with `npm install -g skill-harness` and the Pi extension with `pi install npm:skill-harness`. Run `/reload` after updating Pi packages. All commands below ship in npm; a source checkout is unnecessary.

## Session storage choice

In Pi, run `/skill-harness jev enable`. Every enable asks whether to retain this session's explicitly selected decision inputs/questions for future LoRA dataset review. **No** is the default and still enables JEV. A cancelled prompt means No. Enabling again asks again; startup, reload and a different session clear activation. An older unanswered prompt cannot restore permission after disabling or a newer choice.

`/skill-harness jev run` asks for a curated cases file and a new output path, shows the outbound requests, and asks before the selected metered JEV call. `/skill-harness jev status` shows this session's choice; `/skill-harness jev disable` stops further calls and retention. Existing local files remain available for deliberate review/removal. There is no background transcript collector, private-reasoning extraction or automatic model training.

The standalone `skill-harness decision run` command asks the same storage question on an interactive terminal. Noninteractive invocations require `--storage yes|no`; `--session-id ID` may bind an explicitly known session. A choice is never inherited. Successful activation writes a consent receipt alongside the new result; a Yes also writes a `.learning.json` copy containing only selected case inputs/questions and their public source identifiers, with `labelStatus: unlabeled` and `trainingEligible: false`. Result predictions remain research evidence under either choice; No prevents the extra learning-data copy. Session consent is checked again immediately before retention and each remote call.

JEV uses its separately metered API and requires explicitly selected cases plus `--allow-remote`. OpenAI Decisions is excluded. The subscription baseline below executes through Pi and cannot switch to a paid provider. Neither model output nor consent grants runtime permissions or approval.

## Concrete offline acceptance example

Choose new output directories for every experiment:

```bash
skill-harness decision fixtures --out ./decision-fixtures
skill-harness decision validate-experiment --cases ./decision-fixtures/cases.json --experiment ./decision-fixtures/experiment.json
skill-harness decision export-learning --cases ./decision-fixtures/cases.json --experiment ./decision-fixtures/experiment.json --labels ./decision-fixtures/labels.json --label-evidence ./decision-fixtures/label-evidence.json --consents ./decision-fixtures/consents.json --mode fixture-demo --out ./decision-export
python3 ./decision-export/train-lora.py --export ./decision-export --check-export-only
```

Expected: 24 synthetic cases across six separate task families, frozen 12/4/8 train/validation/test splits, independent deterministic label receipts and a validated eight-file export. The export includes local training instructions/configuration/dependency pins. It explicitly refuses training on synthetic fixture data. These checks need no provider key or model call. Evidence/label-file verification and the qualified execution path currently require Linux.

## Optional subscription comparison

Qualified execution requires exact Pi **1.0.4**, Node >=22.19, Linux and an existing `openai-codex` OAuth subscription login. Supply the canonical installed Pi package directory and an available exact model. The example uses the model selected for this delivery; it is not a general model recommendation.

```bash
skill-harness decision preview-pi --cases ./decision-fixtures/cases.json --experiment ./decision-fixtures/experiment.json --model openai-codex:gpt-6.1-sol --thinking medium --split test
skill-harness decision run-pi --cases ./decision-fixtures/cases.json --experiment ./decision-fixtures/experiment.json --model openai-codex:gpt-6.1-sol --thinking medium --split test --pi-package /absolute/installed/@earendil-works/pi-coding-agent --out ./pi-test.jsonl --allow-subscription
skill-harness decision compare --cases ./decision-fixtures/cases.json --experiment ./decision-fixtures/experiment.json --labels ./decision-fixtures/labels.json --label-evidence ./decision-fixtures/label-evidence.json --run ./pi-test.jsonl --out ./comparison.json
```

If the CLI runs on Node20, add `--pi-node /absolute/node-22.19-or-newer`. Each case uses a fresh in-memory SDK session with no tools, extensions, skills, project context, compaction or agent retries. The worker verifies the actual OAuth subscription route, resolved model, settled final answer and native message identity. It records only the JSON answer, identities, hashes and reported usage; it never saves native reasoning or estimates subscription cost. The harness does not retry a failed case or substitute models/providers. Pi's SDK may use its own same-provider transport fallback.

Repeat `--run` in `compare` to compare up to eight immutable runs. Reports show all selected coverage and the common independently labeled, answered cases separately; errors, abstentions, false positives/negatives, Brier score, fixed calibration bins and measured latency remain visible. Each arm records actual model identity, thinking, selected split and prompt/worker hashes when available. Older JEV records are marked `experimentBound:false`; they do not acquire a frozen-manifest claim retroactively. A single synthetic run qualifies plumbing, not production quality or speed.

## Extend with reviewed real-session examples

After opting in for the relevant session, select only public decision-time input fragments. Use `skill-harness decision import-session --cases ONE_CASE.json --selection SELECTION.json --consent CONSENT.json --entry EXPERIMENT_ENTRY.json --out NEW_RECEIPT.json`. The importer binds exact public-capture bytes/tool-call identity and reconstructed excerpts, applies explicit redaction and emits a receipt without retaining the removed values. It never scans private sessions. The curator must establish the session-to-artifact association, decision-time availability, redaction and rights; receipt structure cannot authenticate those assertions.

Add independently authored human/test labels with exact label receipts, then freeze a new experiment manifest before comparisons or tuning. Keep related task/repository variants, lineage and sessions together; the validator rejects cross-split exact/formatting duplicates and shared sources. Semantic near-duplicates still need review. Supply current session consent for export; duplicate consent states refuse, and a supplied decline excludes that session. A library cannot discover a withheld revocation or recall previously copied files.

Use `export-learning --mode reviewed-data` with the same explicit file flags shown above. Exclusions explain missing labels, review, rights, approval or split assignment. Training eligibility requires eligible real data in all three splits and separate local-training rights/approval; storage alone is insufficient. JEV/model predictions and AI review conclusions never become human/test ground truth.

Actual training is a later, separately configured operation: choose locally available safe weights, exact model revision and file hashes, license review, architecture-specific LoRA modules and an approved export digest. The bundled Python script defaults to validation, disables remote loading and refuses fixtures. No adapter is trained, deployed, selected or granted workflow authority by this delivery. Evaluate a future adapter against independent held-out labels and the deterministic baseline before use.

Detailed schemas and boundaries: [learning workflow](../experiments/decision-shadow/LEARNING-WORKFLOW.md), [provider and public-capture contracts](../experiments/decision-shadow/README.md).
