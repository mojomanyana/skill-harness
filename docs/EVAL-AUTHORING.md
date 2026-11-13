# Authoring evaluations that measure the requested behavior

## Start with the role, not a specification

Install skill-harness in Pi and select the model you want to work with. Then use:

```text
/skill-harness create I need a social media manager skill and subagent for our ecosystem.
```

The current Pi model develops the skill from the conversation. It collects only
missing decisions, one question at a time: who the skill serves, successful outputs,
action boundaries, available tools, optional agent delivery, and evaluation location.
It does not expect a pre-existing skill, examples or hand-authored YAML. Importing a
skill is an explicit choice. Subject and judge models are chosen when testing begins.

`skill_author` saves the brief and draft under `.skill-harness/authoring/<name>`;
`/skill-harness author <name>` resumes it. `draft` returns the complete before/after
preview, validation issues and a digest. `apply` requires that digest and refuses
conflicting file changes. Existing files have local backups. Nothing is installed,
granted, committed, published or designated as training data by applying the draft.

## Read the format before drafting

Call `skill_author` with `{ "action": "reference" }`. This read-only action works
before a project or model is selected and returns the exact installed JSON Schema,
a small parser-valid example and file-path guidance. It does not scan other projects,
write files, select a judge, accept labels or call a provider. The example illustrates
the format only; derive the actual tasks and criteria from the agreed brief.

The specification requires root `skill`, `judge_persona`, `ship_bar` and `scenarios`.
Each scenario requires `id`, `title`, `turns` (an array, not `prompt`) and `checklist`.
`judge_evidence` belongs inside a scenario. `judge_persona` is ordinary instruction
text for future judging, not a model choice or authorization to run one. The runtime
and draft preview also validate relationships, references and the agreed tool ceiling;
the JSON Schema alone does not establish readiness or quality.

Draft file paths are relative to their area: `area: skill, path: SKILL.md` and
`area: evals, path: specification.yaml`. The evals area already points to the tests
directory: `<skill-dir>/tests/` in the same repo, or `<eval-root>/<name>/tests/`
in separate-repo placement. Do not prepend the skill name or `tests/` again.
Fixture and judge-reference paths are relative to the specification. The tool creates
`authoring.json`; provide requirement/scenario mappings, not that generated file.

The order is **reference → brief → draft → fix preview issues → apply → task-contract
→ controls → contract-review → review-controls**. Apply the valid exact draft digest
within the user's authorized scope before inspecting the task contract: that inspection
reads the saved specification. Applying needs no controls, accepted labels, selected
judge or evaluation calls. If a draft is invalid, fix its listed errors using the
reference; do not ask the user to invent technical schema fields.

Generated files have three separate roles:

| Area | Default location | Dependency |
|---|---|---|
| Portable skill | `skills/<name>/SKILL.md` and selected resources | Pi |
| Evaluations | `<skill>/tests/`, or `<eval-root>/<name>/tests/` | skill-harness and Pi for model calls |
| Optional agent | `agents/<name>-agent.md` | pi-daddy when used for governed delegation |

The optional agent uses Pi Markdown frontmatter and pi-daddy capabilities, keeping
ecosystem behavior out of the portable skill. Principal is not required. A social
media manager may draft copy without being authorized to post it; external actions
follow the user's established boundaries and runtime permissions.

The wrapper's frontmatter `name` matches its filename and differs from the portable
skill name, avoiding a Pi resource collision. It declares `allowed-tools` as a plain
single-line comma-separated list; a text-only wrapper uses an empty `allowed-tools:`
line. Its ceiling may only narrow the tools agreed in the brief. Additional context
or delegation capability IDs require explicit agreement, recorded in
`answers.agentCapabilities`; they default to none. A wrapper that reads its portable
skill needs `read` in that ceiling and a correct path to the skill.

An `agents/` file is not automatically discovered. Select both resources in Pi:

```bash
pi --skill ./skills/social-media-manager --skill ./agents/social-media-manager-agent.md
```

Alternatively add them to Pi's configured skill resources and reload. Inspect the
selected definitions with `/grants` and use pi-daddy's native grant workflow for
the intended capabilities. Creating or selecting a wrapper does not grant them.

The `tests/authoring.json` linkage records requirement/scenario mappings and skill
identity at creation. Its `calibrated:false` and `modelQualityEvaluated:false` are
creation-time facts, not a replacement for later calibration and run evidence.

Every newly authored scenario declares `env.tools` explicitly, narrowing the tools
agreed in the brief. `env.tools: []` is valid for a text-only task. Portable skills
can still describe required integrations; availability and permission must be checked
when they run. Tool selection is not filesystem or network isolation.

## Optional evidence-review pattern

When the agreed task includes performance, reproduction or normal user-path claims,
call `skill_author` with `{ "action": "reference", "pattern": "evidence-review" }`.
The ordinary reference lists this option without loading all of its controls. The
selected pattern returns a parser-valid specification, requirement mappings and
proposed positive, negative and equivalent-valid controls in the existing formats.
It writes nothing, selects no model and accepts no labels. Adapt the whole task,
evidence and rubric to the user's requirements; it is not a mandatory new stage.

The reusable record is: **claim; observable start/end; preserved instrumented
baseline; fixture/revision/cache conditions; raw trials and recomputed summary;
normal user path and relevant transitions; limits and scoped conclusion**. A
baseline can be a pinned archive plus reconstruction instructions, not only Git.
Select any external source references explicitly through the usual `judge_references`.
The example packets are self-contained synthetic task evidence, not benchmark runs.

The controls distinguish an operation returning from the requested user-visible
endpoint, a missing reconstructible baseline, changed fixture/cache conditions, an
incorrect median, a helper bypassing ordinary revision refresh, a prepacked seed
hiding fresh external inputs, and cleanup confusing names with ownership. A valid
minimal packet prevents the rubric from demanding optional tool calls, subagents or
report ceremony. Correct arithmetic alone must not approve a misleading endpoint
or confounded comparison. Use a producer-appropriate offline arithmetic check when
useful; no new universal measurement schema or semantic PASS gate is introduced.


The eight scenarios include 26 proposed controls: 16 valid answers and 10 invalid
answers. Criterion 1 checks the material evidence judgment; criterion 2 checks
claims that the reviewer personally performed new work. A wrong conclusion about
the supplied packet belongs under criterion 1 and does not alone fail criterion 2.
Two controls isolate invented execution despite a correct substantive conclusion.
One decisive condition mismatch can justify withholding a claim; equivalent
explanations and equivalent numerical expressions need not repeat every detail or
use a particular word.

When adapting a rubric, preserve suitable saved answers but regrade them against
the new criteria. Exact saved judgments are reusable only while their judge prompt
and model settings remain compatible. These template labels stay proposed even if
the same examples were accepted in a separate study.

`selectedPattern.specification` is suitable draft input after adaptation;
`selectedPattern.proposedControls` feeds the existing `controls` action after the
valid specification is applied. Keep labels proposed until task-contract,
contract-review and the operator's `review-controls` step establish the intended
outcomes. Parse/preflight tests only establish mechanical consistency. They do not
calibrate a model, prove that a judge detects these defects, or authorize calls.
Ordinary tests and trace gates remain useful for observable execution facts; the
reviewer still decides endpoint meaning, evidence relevance and acceptance materiality.

## Build and review the judge's evidence

Use `judge_evidence: response` for answer evaluation and `code` for code outcomes.
`mode: seeded` only provides a fixture workspace. Select judge-only local source
files with `judge_references`, relative to the specification directory; the loader
checks their identity and bounds. They are not appended to subject requests.

The Pi model proposes controls with an expected PASS/FAIL, a rationale and complete
transcript framing. For new controls, also propose `expectedCriteria`: an ordered
array with one PASS/FAIL for every checklist item. All PASS requires an overall PASS;
any FAIL requires an overall FAIL. Review positives against the complete contract,
not just the scenario's headline. Prefer negative contrasts with
one deliberate defect, so the criterion votes reveal a failure for the wrong reason.
Equivalent valid answers must satisfy the same contract. Older controls may omit
`expectedCriteria`; their overall match alone does not establish criterion agreement.

`skill_author controls` calls the shared preparation code to bind specification,
reference and transcript bytes; the model does not supply those hashes. At least
one positive, one negative and an equivalent valid answer are needed for calibration.
Saved trace evidence must be bound for execution-dependent claims.

After applying the valid draft, and before choosing preferred answers or expected
labels, the authoring agent prepares a task contract:

1. Use `skill_author task-contract` to inspect the saved brief, scenario requests
   and explicitly selected method files without displaying preferred answers,
   expected labels or checklist items. Record the requested outcomes and boundaries,
   with source quotes. A necessary implication needs a rationale explaining why it
   matters; an optional suggestion must not become a hidden obligation.
2. Prepare proposed controls with `skill_author controls`, then prepare
   `skill_author contract-review` against them. Connect
   every checklist item to those obligations and explain why omission would fail
   the task. Use an existing positive or equivalent control as a minimally
   sufficient answer; explain which optional ceremony it omits. When there is no
   optional step to remove, explain that instead of inventing one. One contrast may
   cover several criteria; there is no additional control quota.
3. Use `skill_author review-controls` for the existing operator acceptance. Pi shows
   a concise summary of the requirements, proposed labels and review notes, with
   full source, criterion and answer evidence available on request. The agent
   resolves ordinary authoring issues before this step. Ask the user only about a
   genuinely unresolved preference or authority decision, not to fill technical
   mappings. One acceptance writes a separate reviewed manifest. An exact current
   accepted review can be reused; cancellation accepts nothing.

The review records live under the existing authoring project. Code checks selected
input identities, matching quotes, criterion coverage and control references; it
does not prove that an implication is necessary or that a source has authority.
Source documents and judge-only context cannot independently impose requirements
on the subject. A selected method needs a basis in the task or agreed brief; being
present in a skill does not override an explicit narrower request. The task-only
view separates preparation from answer review, but cannot prove what the model
previously saw or how it reasoned.

Changed relevant brief, specification, selected method, reference or control bytes
invalidate reuse. Review freshness is checked again before acceptance is saved.
Old records remain intact. Existing calibration files and CLI workflows remain
readable; missing task-review evidence in the guided Pi workflow returns a concrete
preparation step to the agent, not an automatic provider call or a new human form.
Neither expected labels nor `expectedCriteria` enter the judge prompt. Acceptance
covers expectations only; it neither approves the skill nor runs a model.

```bash
skill-harness preflight social-media-manager --skills ./skills
skill-harness calibrate ./skills/social-media-manager/tests/calibration-reviewed.json
skill-harness calibrate ./skills/social-media-manager/tests/calibration-reviewed.json \
  --run --judge provider:model --out ./new-calibration-results
```

The reviewed manifest's actual path is returned by the tool. Add `--specs <eval-root>`
to preflight, run, review and diagnosis commands when evaluations are in another repo.
Calibration uses the same judge-prompt preparation as actual grading, including full
seeded trailers and reference bytes. Authored material is explicitly identified as a
synthetic control. A disagreement means the proposed label, control, rubric or judge
needs review; it is not automatically a judge error. Legacy `falsePasses` and
`falseFailures` fields are direction aliases for these disagreements.

Answer calibration does not qualify execution gates. An authored answer can be
calibrated without inventing tool history; `executionGates: not-evaluated` remains
explicit. Keep the scenario's assertions intact. Verify real execution with bound
saved traces, positive/negative gate controls and actual test results separately.

## Validate contracts before judging a model

Apply shared requirements to every relevant scenario and state exceptions for
narrower requests. Each positive control must satisfy that complete contract.
Keep facts specific to its supplied sources: do not import numbers, qualifications
or dates from another fixture. Distinguish version applicability, document as-of
dates and release dates. Include relevant source material in the judge's explicit
references; do not silently send private fixtures to satisfy an inventory warning.

Define the unit for counts, names and disclosures: each standalone output, a section,
or the complete response. A word in a negated claim or editorial note is different
from a promotional assertion; a proposed objective is different from an achieved
result. Decide how ambiguous wording is graded before running the judge, and apply
that PASS/FAIL rule to valid alternatives and near-miss controls consistently.
Static checks cannot resolve these semantic choices for the author.

## Turn a manual check into a proposed regression

A manual validation is one meaningful case, not every form, click or control review.
If it is already covered and adopted, attach the outcome to that case without a new
authoring task or adoption question. For manual validation of any ecosystem package,
retain the selected evidence and
identify the actual requirement and component that owns it. First look for an
existing regression to extend rather than adding duplicate cases. Propose the
smallest reproducible setup, observable outcome and useful positive, negative or
transfer contrast, then ask the user whether to adopt that evaluation contract.
Reuse explicit adoption of an unchanged proposal on rerun or resume; ask again only
for new or materially changed outcomes. Link the proposal to actual test/eval IDs and
results, keeping declined or uncovered cases visible. Acceptance of new expected labels and authorization for model calls remain separate.
This proposal step does not require extra approval for ordinary implementation unit
tests. Preserve human usability feedback as a human procedure and do not replace it
with a synthetic claim about how a person experienced the interface.

## Test the operator experience and the resulting product

For a workflow skill, correctness includes carrying the agreed outcome through a
pause, refusal or handoff without making the operator reconstruct the process.
Use the existing scenario `turns`, discoverable fixtures, checklist and selected
judge references. A fixture may describe a prior decision and a recovery state;
that tests the next response to supplied facts, not whether a real process resumed.
Use actual bound traces or a separate integration check for execution claims.
Do not invent trajectory assertions that the schema cannot express.

Select relevant contrasts for the role, rather than making every skill run this list:

| Situation supplied in the fixture | Behavior to distinguish |
|---|---|
| An explicit standing decision still applies | Continue within its scope; do not ask for the same decision again. Memory is context: establish the original decision and current scope rather than treating a summary as a new grant. |
| A settled operation has a retained applicable result | Retrieve and use it; do not launch another operation just because the previous chat view is gone. |
| Admission or cleanup is uncertain | Inspect authoritative status or report the uncertainty; do not invent a no-start result and retry. |
| A known refusal has an already-authorized recovery route | Use the supported route without broadening scope; a new workspace or external action without authority still needs the operator. |
| Verification already covers unchanged inputs | Reuse matching evidence; rerun the affected behavior when its dependencies changed. A recorded failure never becomes a pass through reuse. |
| A real producer artifact crosses a consumer boundary | Check its relevant shape, size and consumer behavior; do not substitute a convenient toy that hides a known compatibility problem. |

The observable outcome matters more than ceremony. Assess whether each question
would change authorization, scope or an unresolved product choice. Pair an
unnecessary repeated question with a necessary new-access case so fewer questions
does not reward unauthorized action. Avoid hard question/tool/test/token quotas,
mandatory full-suite reruns and prescribed wording unless the user's contract
requires them. A truthful limitation with a useful authorized next step can be
correct; stopping all work over unrelated tooling can still miss the task.

For a baseline failure, give the judge the observed baseline and candidate evidence
and the acceptance rule. Matching failure names alone do not prove identical causes
or authorize ignoring the failure. Keep product completion, independent review,
workflow settlement and optional advice as separate facts.

When evaluating optional JEV use, include off/unavailable behavior and a case where
a cheap deterministic check resolves the question. Judge whether the chosen next
action addresses the actual uncertainty; JEV probability is not the expected label
or evidence of permission. Bookie and Scout should be optional in portable-skill
fixtures, with ordinary authorized alternatives when their capabilities are absent.

Propose controls and review expectations through the same authoring and calibration
workflow. Do not infer acceptance of new labels from these examples. Reuse compatible
saved answers/judgments before requesting a fresh comparison, and distinguish an
authored recovery story from a live restart test in the report.

## Report what failed without changing the grade

An accurate answer can omit a required validation plan or explanation. A single
overall FAIL cannot tell the reader which happened. A scenario may declare
`criterion_dimensions`, one entry per checklist item, in the same order:

```yaml
checklist:
  - Reports the supplied installed version and leaves the current registry tag unknown.
  - Names a dated registry observation that would resolve the uncertainty.
criterion_dimensions: [task-correctness, method-completeness]
```

Use `task-correctness` for the requested outcome and its constraints, including
factual support. Use `method-completeness` for additional steps or explanations
required by the skill's method. Use `mixed` when an item combines them. A method
explicitly requested by the task belongs to task correctness. These labels are
author-declared descriptions, not machine-verified truth or severity levels.
Omitting the field leaves criteria unclassified.

`diagnose` groups supported saved criterion votes under these labels. Counts are
criterion observations, not passing answers, skill lift or new acceptance scores.
Original scenario verdicts, human overrides and objective gates remain separate.
The report identifies the current mapping and matched rubric; unavailable or
inconsistent evidence remains unavailable. It does not extract votes from reason
text or choose between multiple judges. The command makes no model calls and
does not modify saved results.

A mixed FAIL cannot reveal which part failed. Keep an existing mixed criterion
intact and cite any independent semantic audit separately. Split it only when
authoring a future reviewed rubric, then calibrate and regrade applicable saved
answers. Do not retroactively manufacture factual PASS votes from a combined FAIL.
Metadata-only categorization changes no stimulus, judge prompt, grade, ship bar
or calibration expectation. All required checklist items still gate acceptance;
method completeness is not automatically optional.

Calibration manifests also bind the exact specification file bytes. Editing this
metadata in a bound file does not exempt it from that check: prepare the current
manifest through the normal workflow. If the judge prompt is unchanged, existing
judgments can be reused under the normal exact-reuse checks. Retrospective reporting
does not turn a proposed or changed manifest into accepted labels.

Separate required behavior from optional improvements before choosing expected
verdicts. Put the acceptance threshold in the checklist or judge context and any
task-relevant severity policy in the subject request. A finding can be true without
justifying a blocking verdict; a different recommendation can be valid when its
evidence, reasoning and severity satisfy the same contract. Do not award or reject
an answer merely for matching a preferred verdict word.

Challenge a proposed positive fixture or control with a plausible contract-breaking
counterexample. For example, a test suite may miss a valid empty string. Establish
whether that uncovered boundary is required for acceptance or an optional
improvement; do not label the suite sound and then require reviewers to suppress
the real gap. Ask one focused question only if this outcome-changing distinction
cannot be resolved from the agreed requirements. Apply the resulting rule to both
passing and failing answers without weakening the underlying requirements.

`lint` now emits non-blocking `authoring` notices for common brittle contracts:
read-count proxies, POSIX-only path matching, exact `npm test` spelling,
`expect(` diff needles, mandatory line-citation formats and missing `covers` maps. Response
tasks also flag fixture text absent from the selected judge references/context. These are review
hints, not a model verdict or proof that a specification is correct. Some tasks
legitimately require an exact format.

The shared preflight uses the scenario's explicit tool profile and fixture inventory
to flag undiscoverable required sources and forbidden tools that were unavailable
in the first place. Missing inputs and impossible tool contracts are distinct from
heuristic review hints. It does not guess a wrapper's tools or execute fixture code.

Before paying for a comparison:

1. Give the subject enough information to discover required inputs. Do not put
   oracle answers into its prompt.
2. Check execution with mechanical gates, and content with a rubric that has an
   adequate oracle. A called tool is not proof of successful execution or correct
   content. A missing tool event in answer prose is not proof that no call occurred.
   `require_calls` optionally accepts `outcome: success` or `outcome: error`.
   This requires a completed tool result with the corresponding `isError` flag;
   missing completion evidence is ERROR. Without `outcome`, matching remains
   invocation-only for compatibility. Even success does not prove file identity,
   complete content coverage, or an external side effect.
3. Calibrate the judge against both valid and invalid examples, including
   paraphrases, valid alternative commands, failed reads and invented source claims.
   Keep labels outside the judge prompt and report false passes separately from
   false failures. A scripted fake judge tests plumbing, not judge quality.
4. Preserve the original run and its identities. Rubric changes call for regrading;
   changed input or skill behavior calls for a new subject run. Use held-out variants
   to check whether the revised skill learned a general method.

Passing the authoring checks does not establish research quality, protection against
prompt injection, filesystem isolation, or network containment.

`skill-harness diagnose <run-dir> --skills <root> [--specs <eval-root>]` inspects
retained evidence and suggests the cheapest valid next action. It does not diagnose
semantic root causes automatically. Inspect borderline source interpretation and
equivalent answers before accepting a judge failure. Regrade saved evidence when
the rubric changes; use new subject runs for changed skill/input behavior and fresh
transfer cases for generalization. JEV advice, session storage and LoRA export keep
their existing consent and independent-label requirements.

## Reuse before rerunning

`diagnose` includes a per-scenario `reusePlan`: keep matching historical results,
regrade corrected rubrics/references, regate supported saved execution evidence,
rescore policy changes, or rerun changed subject inputs. Missing evidence means
inspect/recover first. A matching failed result stays a failure; reuse never creates
a fresh stability observation or a new approval.

```bash
# Offline calibration plan; repeat --reuse for explicitly selected prior outputs.
skill-harness calibrate ./tests/calibration-reviewed.json --plan \
  --judge provider:model --reuse ./prior-calibration
# Same selection, only necessary new judge calls, in a new directory.
skill-harness calibrate ./tests/calibration-reviewed.json --run \
  --judge provider:model --reuse ./prior-calibration --out ./next-calibration
# Correct one rubric using saved answers, retaining the original run byte-for-byte.
skill-harness grade ./tests/results/pi-model/original --only A2 \
  --out ./regraded-copy
# A copied run outside tests/results needs an explicit specification on later grades.
skill-harness grade ./regraded-copy --spec ./tests/specification.yaml --only A2
```

Reuse validates exact judge identity, actual initial/retry prompts, answer/rubric
hashes, requests and replies. When only `expectedCriteria` changes, review the new
manifest, then reuse the saved raw criterion votes if those prompt bindings match.
No fresh judge call is needed to compare unchanged votes with new expectations.
An overall FAIL with unexpected criterion votes is a calibration disagreement, not
evidence that the intended defect was detected. Reuse does not transfer the old
human acceptance to changed expectations or invent missing criterion evidence.

Conflicting historical verdicts stop automatic reuse rather than selecting a
favorable answer. A partial calibration is reported as partial. Selective regrades
keep the recorded judge and preserve untouched results; changing the judge requires
regrading the entire recorded set. Changed subject inputs remain stale even if their
saved answers are rejudged.

## Resource observations and stopping

Selected fixture trees are checked before copying: at most 4,096 entries, depth
32, 64 MiB per regular file and 256 MiB total. Hashing streams bounded blocks.
An unreadable or oversized post-run snapshot is unavailable evidence, not an empty
workspace. These limits constrain harness preparation and capture; they are not
disk quotas on a model's tools or a sandbox.

`run`, `grade` and `calibrate` save private `resources-<id>.json` summaries. They
retain at most 256 settled and 256 active process observations, with explicit drop
counts. Active snapshots are written at most every five seconds; no model text,
credentials, command arguments or environment are recorded. Linux samples only the
harness-owned process tree once per second with bounded traversal. RSS, CPU ticks,
process I/O counters and cleanup status have explicit gaps; short-lived processes
can be missed and parent I/O counters can include reaped children. These are not
physical-disk measurements or a diagnosis of whole-PC health. Unsupported metrics
remain null, never zero.

CLI cancellation and Pi tool cancellation stop new work and settle active children.
Linux cleanup targets the process group owned by the harness; it is not containment
of processes that deliberately escape that group. Other platforms report their
descendant-cleanup limitations. The Pi extension shares one evaluation slot between
its tool, run command and judge command; this does not serialize separate CLI processes.
Over-limit output is an infrastructure interruption, never truncated successful evidence.

Optional CLI flags `--max-memory-mb N` and `--max-write-mb N` stop a process group
after an observed Linux RSS or write-counter threshold. They default to unset and
are refused where sampling is unsupported. They are sampled per-process-tree controls,
not hard host quotas, and add no model time/token budget. Keep the default sequential
comparison until a larger concurrency has been deliberately selected. After an
interruption, inspect retained answers and these summaries before restarting a wave.
