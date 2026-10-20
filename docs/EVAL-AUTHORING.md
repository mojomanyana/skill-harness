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

## Build and review the judge's evidence

Use `judge_evidence: response` for answer evaluation and `code` for code outcomes.
`mode: seeded` only provides a fixture workspace. Select judge-only local source
files with `judge_references`, relative to the specification directory; the loader
checks their identity and bounds. They are not appended to subject requests.

The Pi model proposes controls with an expected PASS/FAIL, a rationale and complete
transcript framing. `skill_author controls` calls the shared preparation code to
bind specification, reference and transcript bytes; the model does not supply those
hashes. At least one positive, one negative and an equivalent valid answer are needed
for calibration. Saved trace evidence must be bound for execution-dependent claims.

`skill_author review-controls` shows the scenario questions, checklist, selected
reference text, proposed answers and rationales in Pi. One explicit acceptance writes
a separate reviewed manifest, preserving the proposal. Cancellation leaves labels
unaccepted. Changed controls or source references invalidate the review. This accepts
labels only; it neither approves the skill nor calls a model.

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
hashes, expected labels, requests and replies. Conflicting historical verdicts stop
automatic reuse rather than selecting a favorable answer. A partial calibration is
reported as partial. Selective regrades keep the recorded judge and preserve untouched
results; changing the judge requires regrading the entire recorded set. Changed
subject inputs remain stale even if their saved answers are rejudged.

Before accepting controls, check all fixture facts against all criteria: relevant
goals/voice documents, conflicting values and version/date applicability belong in
the judge's explicit references. Do not silently send private fixtures to the judge
to satisfy an inventory warning. Document deliberate exclusions. Clarify whether
counts and formatting apply to each output or the entire plan. Positive controls
must satisfy the complete contract, including reasonable alternative wording and
internal preparation steps when allowed. Static checks cannot decide these semantics.

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
