# Decision shadow pilot

This explicitly enabled experiment compares **advisory evidence classification** by JEV
against independently supplied labels. It does not participate in
`skill-harness run/grade/review`, alter `results.yaml`, grant capabilities,
choose execution models, resume work, or approve integration. The supported
harness subject/judge execution remains Pi-only.

For a case-matched subscription baseline, use `skill-harness decision run-pi` and `compare`. The ordinary Pi-based `run/grade/review` workflow remains independent. See the [npm walkthrough](../../docs/DECISION-LEARNING.md) for the new 24-case grouped fixture packet, per-session storage choice and local LoRA preparation.

The first question is deliberately narrow: does the recorded evidence support
declaring a candidate ready for integration? The eight supplied examples are
**synthetic plumbing fixtures** with mechanical labels. Results on these examples
say nothing about real-world quality, speed improvements, or review reliability.
The positive example records review independence explicitly; separate negative
examples cover false and missing independence. Fixture labels are checked against
a deterministic readiness rule.

## Run the offline demonstration

After `npm install -g skill-harness`, with Node >=20 and the explicitly selected example files from this repository (no API key needed):

```bash
skill-harness decision preview \
  --cases experiments/decision-shadow/examples/cases.json \
  --provider jev --model typesafe/jev-1.13
mkdir -p tmp/decision-shadow
skill-harness decision corpus \
  --cases experiments/decision-shadow/examples/cases.json \
  --labels experiments/decision-shadow/examples/labels.json \
  --out tmp/decision-shadow/independent-labels.json
```

`preview` displays the exact request bodies. Only each case's `input` and
`question` go to the provider. Case IDs, hashes, source references, labels, actor
identities, and local paths are not sent. The tool does not read Pi sessions,
transcripts, credentials, runtime ledgers, or harness results to build cases.

An output path must be unused. Repeated commands should choose another path;
previous evidence is never overwritten.

## Verify selected public source captures offline

On **Linux only**, `verify-sources` binds curated cases to explicitly selected
pi-daddy **0.45.0** public captures. It makes no provider call and does not read
credentials. Use the original canonical public evidence root; captured absolute
paths must still refer to that root. This command does not scan for evidence or
support relocated archive mappings.

```bash
skill-harness decision verify-sources \
  --cases /absolute/path/cases.json \
  --sources /absolute/path/sources.json \
  --evidence-root /absolute/path/public-evidence \
  --out /absolute/path/new-verification.json
```

The source selection is a closed schema with one row per case in the same order:

```json
{
  "schema": 1,
  "kind": "decision-public-sources",
  "selections": [{
    "caseId": "your-case-id",
    "caseHash": "<canonical case SHA-256 from preview>",
    "manifest": {
      "path": "/absolute/path/public-evidence/<capture UUID>/manifest.json",
      "sha256": "<exact manifest byte SHA-256>"
    },
    "captureId": "<capture UUID>",
    "toolCallId": "<recorded tool-call ID>",
    "ordinal": 1,
    "agent": "<recorded agent>",
    "definitionId": "<observed definition SHA-256>",
    "executionId": null
  }]
}
```

Replace placeholders with exact recorded values. `executionId` is null for
`delegate_describe`; execution captures require the recorded value. Use observed
nullable identities as recorded, never inferred replacements. Each case's
`source.sha256` must equal its selected manifest hash and `source.recordId` must
be the manifest's `toolCallId`. Changing case text invalidates its selection.

The verifier supports `delegate_describe`, `delegate`, `delegate_all` and
`delegate_chain`. It checks every copied response, definition body, source
resource and available final referenced by each selected manifest, including
byte counts and SHA-256 hashes. It binds requested row identities, compares the
public runtime projection with the manifest, and binds complete final copies to
their recorded native final identities. Identity checks compare recorded fields;
they do not rerun the definition loader or derive definition IDs from copied
resources. A stopped chain or unavailable final
stays unavailable in the receipt. A successful source check does not make that
execution successful or approved.

Reads use held directory descriptors, no-follow traversal, ordinary-file checks,
bounded reads and end-of-read/path stability checks. Symlinks, path traversal,
special files, foreign/reused copy paths and missing/tampered copies fail.
Limits per invocation are 256 unique files, 128 MiB total, 64 MiB per file, and
1 MiB per manifest. Repeated selections share the same verified closure. Original
resource paths are metadata only: they are never opened. Raw source bytes,
including a BOM when present, are hashed without conversion; structured JSON
must be valid UTF-8 without a BOM. These checks do not authenticate evidence
against a hostile process running as the same user.

The new, exclusive output receipt contains identities, copied references,
observed availability, limits and exact selection/case-set hashes, without
copying case questions, inputs or source text. It explicitly leaves approval,
task acceptance, decision-time availability, redaction and rights **not assessed**.
Both `trainingReady` and `trainingEligible` remain false. Input fidelity and
whether excerpts were available at the decision point need separate review;
source hashes cannot establish either. The receipt is not a runtime gate,
provider request, label or training grant, and it does not change `preview`,
`run`, `score` or `corpus` behavior.

## Optional paid JEV evaluation

Review the preview first. Then supply the OpenRouter API key through the
process environment using your usual secret manager. Do not put keys in input
files, command arguments, Git, or this document.

The `run --allow-remote` command sends the curated cases to JEV and incurs
provider charges; `score` remains offline. The run issues at most one request per case, sequentially;
there are at most 100 cases. It stops at the first API/validation error without
retrying, saves completed attempts, and leaves the remaining cases missing.
Unexpected answer types are errors and are not counted as correct.

```bash
skill-harness decision run \
  --cases experiments/decision-shadow/examples/cases.json \
  --provider jev --model typesafe/jev-1.13 \
  --out tmp/decision-shadow/jev.jsonl --allow-remote
skill-harness decision score \
  --cases experiments/decision-shadow/examples/cases.json \
  --labels experiments/decision-shadow/examples/labels.json \
  --run tmp/decision-shadow/jev.jsonl
```

The environment key is `OPENROUTER_API_KEY`. Only the documented
JEV provider/model pair above is accepted. Requests use a fixed HTTPS
endpoint, prohibit redirects, have a 30-second deadline and a 64 KiB response
limit. Error text excludes raw provider responses. These are transport limits,
not a monetary spending cap.

Each report states attempted, answered, refused, error, missing, labeled and
scored counts. Accuracy and Brier score use only answered, independently labeled
cases; they are null when none are scored. Coverage must accompany any comparison.
Each saved score report identifies the case-set hash, normalized label-set hash,
exact run-file hash and run timestamp. Runs with mixed resolved model versions
are refused for scoring; keep their raw local records and repeat a deliberately
selected comparison later. Only the selected model alias or a valid dated snapshot is accepted.
The fixed probability threshold is 0.5. False positives/negatives are explicit.
Latency includes the HTTP attempt; token and cost totals state reported coverage.
Unreported cost is null and is not estimated. Token counts must be safe
nonnegative integers; overflowing totals fail explicitly. Latency means are
computed without an intermediate sum that could overflow.

## Curating real cases and labels

Use the two example JSON files as schema references. Cases and labels live in
separate files. `preview` returns each canonical `caseHash` for a label to bind.
A case hash covers its input, question, source reference, visibility, provenance,
and ID; changing any field invalidates its labels and predictions. Whole case-set
identity also prevents scoring a run against a different selection/order.
Duplicate, foreign, or stale IDs/hashes fail validation. Imported runs must
follow the selected case order as a sequential prefix, with any error last.
Contradictory status/error fields and unsupported JEV refusal records are
rejected; a valid interrupted prefix or header-only run remains inspectable.

Input files must be valid UTF-8 without a BOM. The recorded run-file hash
identifies the exact accepted JSONL bytes, including whitespace.

A source reference identifies one exact observed record by SHA-256 and record ID.
For actual Principal/pi-daddy evidence, use only explicitly matching recorded
task/execution/candidate identities. Do not join by timestamp, similar names, or
assumed intent. Keep the original private evidence locally and retain its exact
candidate identity. Missing identities remain unavailable.

The caller curates and redacts `input` before creating a case. `public` and
`redacted` are caller assertions, not a secret scanner or verified access grant.
For a prospective decision, include only evidence available at that decision
point. Put later repair/outcome information in the separately curated label
evidence; otherwise the experiment leaks its answer.

Labels accept only `human` or `test` provenance, an actor, an evidence digest,
and an explicit independence assertion. The program validates structure and
identity, **not** the truth, independence, existence, or legal rights of those
sources. Do not relabel a provider prediction as a human/test finding. Keep
changed labels in a new versioned file with the previous version retained.
An independent AI audit remains outcome evidence, not a `human` or `test`
label. Keep cases unlabeled until appropriate independent labels exist. Keep
related attempts and repairs in the same task group for any later split, and
record task-group and decision-boundary metadata in a separate local experiment
manifest; the current case parser does not validate that metadata.
No private reasoning, unrecorded alternatives, or inferred approvals belong in
this corpus. Data files remain local with no automatic upload or retention job.

## LoRA boundary

`corpus` creates a local independent-label record with `trainingReady: false`.
It has no prediction-file argument. JEV predictions are always
marked `trainingEligible: false` and stored separately. This prevents an
accidental code path from copying teacher outputs into the label corpus; it
cannot establish the rights of manually supplied content.

The TypeSafe terms reviewed on 2026-10-07 prohibit distillation/imitation uses of its services
and output. Keep JEV outputs out of training unless TypeSafe grants a written
exception. A provider prediction is not independent ground truth.
See [TypeSafe MCA §2.3](https://typesafe.ai/legal/mca).

The packaged `export-learning` workflow now prepares independent-label train/validation/test data and a local training script/configuration. It requires documented rights, current storage consent and separate export/training approvals. The [learning contract](LEARNING-WORKFLOW.md) describes exact schemas and refusal conditions. Export never trains or deploys an adapter or changes runtime policy.

## Provider contracts and validation status

Contracts were checked on 2026-10-07:

- [OpenRouter Decisions](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)
  and [JEV tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial):
  `POST /api/alpha/decisions`; keyed `noul` question/answer. No per-question
  refusal is documented, so an unexpected answer fails validation.
- Only normalized answers, reported model identity, usage, latency and sanitized
  errors are retained. Raw responses are not saved.
- Offline tests use fake transports. They check schema/identity boundaries,
  request content, errors/timeouts, partial runs, scoring and corpus
  separation. They do not qualify live API access or model quality.
- Commands ship under `skill-harness decision`; `/skill-harness jev enable [workflow]|run|status|disable` supplies explicit session activation. The source CLI remains a development shim after `npm ci && npm run build`.

Next live pilot: curate a small held-out set of real, independently reviewed
decisions, select the exact cases and provider call envelope, then measure
coverage, false positives, calibration and latency. Do not place a model in a
runtime validation gate based on synthetic fixtures or a single small sample.

Workflow handoff selections use the distinct `skill-harness-selected-decision-v2` (historical `skill-harness-selected-handoff-v1` remains unchanged) receipt described in the [npm walkthrough](../../docs/DECISION-LEARNING.md#optional-workflow-handoff-advice). It binds actual SDK session/tool IDs to selected bytes but does not authenticate original source claims, redaction or rights. `verify-sources` does not accept it as a pi-daddy public capture, and it is not eligible for current reviewed-data import/export.

Current workflow decisions name stage, next action and engineering uncertainty. Exact input.txt preserves outbound input bytes. Optional local evidence references and free same-activation link-outcome records freeze hash-verified files; candidate identity is runtime-observed only when the optional same-session Principal bridge verifies it, otherwise caller-claimed; evidence independence remains unassessed. Provider responses and APPROVE text never become labels automatically. See the npm walkthrough for the explicit limits.
