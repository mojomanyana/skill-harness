# Decision shadow pilot

This source-only experiment compares **advisory evidence classification** by JEV
and OpenAI against independently supplied labels. It does not participate in
`skill-harness run/grade/review`, alter `results.yaml`, grant capabilities,
choose execution models, resume work, or approve integration. The supported
harness subject/judge execution remains Pi-only.

The first question is deliberately narrow: does the recorded evidence support
declaring a candidate ready for integration? The six supplied examples are
**synthetic plumbing fixtures** with mechanical labels. Results on these examples
say nothing about real-world quality, speed improvements, or review reliability.

## Run the offline demonstration

From this repository checkout, with Node >=20 (no installation or API key needed):

```bash
node experiments/decision-shadow/cli.mjs preview \
  --cases experiments/decision-shadow/examples/cases.json \
  --provider openai --model gpt-6-luna
node experiments/decision-shadow/cli.mjs preview \
  --cases experiments/decision-shadow/examples/cases.json \
  --provider jev --model typesafe/jev-1.13
mkdir -p tmp/decision-shadow
node experiments/decision-shadow/cli.mjs corpus \
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

## Optional paid provider comparison

Review the preview first. Then supply the appropriate API keys through the
process environment using your usual secret manager. Do not put keys in input
files, command arguments, Git, or this document.

These commands explicitly authorize sending the curated cases to that provider
and incur provider charges. Each issues at most one request per case, sequentially;
there are at most 100 cases. It stops at the first API/validation error without
retrying, saves completed attempts, and leaves the remaining cases missing.
A refusal is a recorded nonanswer and is not counted as correct.

```bash
node experiments/decision-shadow/cli.mjs run \
  --cases experiments/decision-shadow/examples/cases.json \
  --provider openai --model gpt-6-luna \
  --out tmp/decision-shadow/openai.jsonl --allow-remote
node experiments/decision-shadow/cli.mjs run \
  --cases experiments/decision-shadow/examples/cases.json \
  --provider jev --model typesafe/jev-1.13 \
  --out tmp/decision-shadow/jev.jsonl --allow-remote
node experiments/decision-shadow/cli.mjs score \
  --cases experiments/decision-shadow/examples/cases.json \
  --labels experiments/decision-shadow/examples/labels.json \
  --run tmp/decision-shadow/openai.jsonl \
  --run tmp/decision-shadow/jev.jsonl
```

The OpenAI Decisions endpoint requires API billing separately from a ChatGPT
subscription; Pi subscription-backed judging remains available in the ordinary
harness loop. See [OpenAI billing](https://help.openai.com/en/articles/8156167-invoice-dates-for-chatgpt-and-api-billing).

The environment keys are `OPENAI_API_KEY` and `OPENROUTER_API_KEY`. Only the two
documented provider/model pairs above are accepted. Requests use fixed HTTPS
endpoints, prohibit redirects, have a 30-second deadline and a 64 KiB response
limit. Error text excludes raw provider responses. These are transport limits,
not a monetary spending cap.

Each report states attempted, answered, refused, error, missing, labeled and
scored counts. Accuracy and Brier score use only answered, independently labeled
cases; they are null when none are scored. Coverage must accompany any comparison.
Each saved score report identifies the case-set hash, normalized label-set hash,
exact run-file hash and run timestamp. Runs with mixed resolved model versions
are refused for scoring; keep their raw local records and repeat a deliberately
selected comparison later. The fixed probability threshold is 0.5. False positives/negatives are explicit.
Latency includes the HTTP attempt; token and cost totals state reported coverage.
Unreported cost is null, never zero. This pilot does not estimate OpenAI billing.

## Curating real cases and labels

Use the two example JSON files as schema references. Cases and labels live in
separate files. `preview` returns each canonical `caseHash` for a label to bind.
A case hash covers its input, question, source reference, visibility, provenance,
and ID; changing any field invalidates its labels and predictions. Whole case-set
identity also prevents scoring a run against a different selection/order.
Duplicate, foreign, or stale IDs/hashes fail validation.

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
No private reasoning, unrecorded alternatives, or inferred approvals belong in
this corpus. Data files remain local with no automatic upload or retention job.

## LoRA boundary

`corpus` creates a local independent-label record with `trainingReady: false`.
It has no prediction-file argument. Both providers' predictions are always
marked `trainingEligible: false` and stored separately. This prevents an
accidental code path from copying teacher outputs into the label corpus; it
cannot establish the rights of manually supplied content.

TypeSafe's current terms prohibit distillation/imitation uses of its services
and output. Keep JEV outputs out of training unless TypeSafe grants a written
exception. OpenAI teacher-output use also needs a review of the applicable
agreement and target-model use; ownership of output is not blanket permission
to train any model. Neither API response is independent ground truth.
See [TypeSafe MCA §2.3](https://typesafe.ai/legal/mca) and the
[OpenAI Services Agreement](https://openai.com/policies/services-agreement/).

A later learning experiment should use independently obtained human/test labels,
documented source rights and consent, separate train/validation/test sets split
by task/repository (not near-duplicate episodes), and held-out comparisons against
a deterministic baseline. Select a base model and its license before preparing
a training format. Training, deployment, and runtime policy changes are not part
of this tool.

## Provider contracts and validation status

Contracts were checked on 2026-10-07:

- [OpenAI Decisions](https://developers.openai.com/api/reference/resources/decisions/methods/create):
  beta `POST /v1/decisions`; ordered `predicate` question, named answer with
  `probability`, or a per-question `refusal`.
- [OpenRouter Decisions](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request)
  and [JEV tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial):
  `POST /api/alpha/decisions`; keyed `noul` question/answer. No per-question
  refusal is documented, so an unexpected answer fails validation.
- Only normalized answers, reported model identity, usage, latency and sanitized
  errors are retained. Raw responses are not saved.
- Offline tests use fake transports. They check schema/identity boundaries,
  request content, errors/refusals/timeouts, partial runs, scoring and corpus
  separation. They do not qualify live API access or model quality.
- This experiment is available from the source checkout only. It adds no npm CLI
  command or extension behavior and does not change the published 0.24.2 packages.

Next live pilot: curate a small held-out set of real, independently reviewed
decisions, select the exact cases and provider call envelope, then measure
coverage, false positives, calibration and latency. Do not place a model in a
runtime validation gate based on synthetic fixtures or a single small sample.
