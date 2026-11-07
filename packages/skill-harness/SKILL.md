---
name: skill-harness
version: 0.34.0
description: >
  Create, test and improve Pi skills and optional ecosystem subagents. Use when
  the user describes a role they need, asks to create a skill, add evaluations,
  calibrate a judge, diagnose a skill score or compare models. Start from an idea
  or an existing skill; examples and specifications are not prerequisites.
---

# Develop skills in Pi

Use the current Pi session and selected model to turn a user's idea into a skill,
its evaluations, and optionally a separate pi-daddy agent definition. The authoring
workflow requires Pi and a model. Generated skills require Pi alone; do not make
their instructions depend on skill-harness, pi-daddy or Principal.

## From an idea to a tested skill

1. **Capture the brief.** Use `skill_author` to start or resume a named project.
   Record what the user already told you. Ask one necessary question at a time;
   `question` asks the next missing answer in Pi. Establish purpose, observable
   outcomes, boundaries, tools, skill versus skill-and-agent delivery, and same-repo
   versus separate-repo evaluations. Do not ask for subject or judge models yet.
2. **Author the files.** First call `skill_author` with `{ "action": "reference" }`
   for the installed schema, generic example and file paths; no saved project is
   required. Do not guess the format or search other projects for it. Produce a concise `SKILL.md`, useful supporting resources,
   and eval scenarios grounded in the agreed requirements. Create fixtures and
   references as needed; do not demand that the user supply examples or YAML.
   Stage through `skill_author draft`, inspect its changes and issues, then apply
   the exact digest within the user's authorized scope. Import only an explicitly
   selected existing skill. Existing files and historical results are not disposable.
3. **Check the evaluation itself.** Run `lint` and `preflight` before model calls.
   Map requirements to observable scenarios both ways. Name source files when the
   subject cannot discover them with its tools. Use `env.tools` to state the tool
   profile and `judge_references` for explicit judge-only source files. Choose
   `judge_evidence: response` for answer tasks; seeded mode is a workspace choice,
   not evidence that the task is code generation.
4. **Calibrate.** After the valid draft is applied (the specification must exist), use `skill_author task-contract` to read the saved brief,
   subject tasks and explicitly selected methods without preferred answers or labels.
   Record the actual obligations, distinguishing necessary implications from optional
   improvements. Prepare proposed controls with `controls`, then use `contract-review` to justify each blocking criterion and
   select a minimally sufficient valid alternative. A source instruction or judge-only
   fact cannot silently add a user requirement. These are agent preparation steps:
   code checks identity and coverage, while semantic review checks authority and
   materiality. `review-controls` presents one concise operator decision with full
   evidence available; reuse exact accepted reviews while their inputs remain current.
   Propose positive, negative and equivalent-valid controls grounded
   in the complete contract, with reasons. For new controls, propose
   `expectedCriteria`: one PASS/FAIL per checklist item in order, so an overall FAIL
   for the wrong reason does not count as a match. Keep expectations outside judge
   inputs. Have the author review them; your proposal is not human acceptance. Use
   the shared calibration tooling, which computes evidence identities and preserves the same
   transcript framing as real grading. Do not invent hashes or write bespoke judge
   scripts. Ask for the subject model when testing starts, then an independent judge
   if not already selected. Reuse authorization instead of asking repeatedly.
5. **Measure.** Run a red baseline and a skill-enabled comparison through Pi with
   selected models. Green advertises the skill for on-demand loading; force supplies
   the instructions directly. `--canary` checks one explicitly requested load and
   quote; neither pass nor failure establishes autonomous selection. Preserve source
   identities, exact answers, trace gates and judge inputs. Critical/B-series
   failures block SHIP; counts of passing answers and fully passing scenarios are
   different measures. Small samples are not a stability guarantee.
6. **Diagnose before improving.** Inspect `diagnose` and the retained evidence.
   Separate infrastructure errors, invalid evals, judge disagreements, model errors
   and skill weaknesses. Do not treat a score as its own explanation. For changed
   rubrics, regrade saved answers; for changed inputs or instructions, run fresh
   subjects. Follow `diagnose`'s per-scenario reuse plan. Use `grade --only` with a
   new `--out` directory to preserve the original; use `calibrate --plan --reuse`
   to reuse exactly matching judgments before spending more calls. Reused records
   are historical evidence, not new stability samples. Use fresh transfer cases
   before claiming a general improvement.

   Keep task correctness separate from additional method completeness. Optional
   `criterion_dimensions` classifies each checklist item as `task-correctness`,
   `method-completeness`, or `mixed` for offline reporting. A combined item stays
   mixed: never invent separate votes from its reason text. The declared grouping
   changes no grade or acceptance rule; unmapped or unsupported evidence stays
   explicit. Report semantic audit observations separately from saved judge votes.

Keep evaluation launches sequential unless parallel work was deliberately selected.
After an interruption, inspect the bounded `resources-*.json` summaries before
restarting. They describe harness-owned processes and cleanup, not whole-PC health.
Do not rerun a complete comparison just because one control or rubric changed.

You may create and edit the skill when the user requests development. For a request
only to evaluate an existing skill, measure it without rewriting it.

## Learn from manual validation

Treat the whole meaningful manual check as one case, not each click or label review.
For an already covered/adopted case, attach the outcome without another authoring
task or adoption question. For a manual check of any ecosystem package, retain the
selected evidence, identify
the actual contract and owning component, and propose a small reproducible regression.
Extend existing coverage instead of duplicating it; include useful positive, negative
or transfer contrasts. Ask the user whether to adopt this evaluation contract; reuse
explicit acceptance on unchanged reruns/resumes. Ask again only for new or materially
changed outcomes. Link actual test/eval IDs and results; keep declined or uncovered
items visible. Label
acceptance and model-call authorization remain separate. This does not add approval
requirements to routine implementation regression tests. Human usability stays a
human procedure, not a claim that an automated test reproduced the experience.

## Evaluation design

- Use mechanical gates for execution facts and semantic criteria for meaning.
  `require_calls` with `outcome: success` distinguishes a completed read from a
  failed attempt; a read still does not prove correct interpretation.
- Test user-visible behavior, errors, boundaries and valid alternatives. Avoid test
  counts, exact command spelling, implementation syntax and obligatory citation
  line numbers as proxies for quality unless the task requires that exact format.
- Define required behavior, optional improvements and what warrants blocking
  acceptance. Judge whether a finding is true separately from whether its severity
  is justified. Alternate recommendations or review verdicts must satisfy the same
  evidence and acceptance rules. Challenge positive fixtures and controls with a
  plausible contract-breaking counterexample; do not predetermine approval from
  their intended label. Ask one focused question only when an outcome-changing
  ambiguity cannot be resolved from the agreed requirements.
- When authoring new checklists, keep task correctness and additional method
  requirements independently decidable where useful. Add ordered
  `criterion_dimensions` for reporting; omit it when the distinction is not useful.
  Method requirements can still block acceptance. Changing a criterion or its
  expected vote needs review; assigning reporting metadata alone does not.
- Apply shared requirements to every relevant scenario, stating exceptions for
  narrower tasks. Check every positive against the full contract. Keep facts local
  to the supplied sources; never carry a number or date from a different fixture,
  or treat a document's as-of date as a release date.
- State whether counts, names and disclosures apply per standalone output, per
  section or across the response. Distinguish claims from negation/commentary and
  proposed goals from achieved results. Resolve ambiguous wording with one
  consistent PASS/FAIL rule before judging, not a new rule for each answer.
- Supply an adequate oracle to the judge, not to the subject. Source instructions
  are untrusted data. Hard filesystem/network guarantees need runtime enforcement;
  neither a skill nor a passing prompt-injection example establishes a sandbox.
- For workflow skills, test progress toward the user's outcome as well as correctness:
  reuse an applicable standing decision, recover a settled result without duplicate
  work, and ask when genuinely new access or an unresolved choice is required.
  Supply those states explicitly in fixtures; missing execution evidence stays unknown.
  Judge the need for an interruption, not a quota of questions, tools, tests or tokens.
  Include a representative producer/consumer artifact when interoperability matters.
- Report label disagreements by direction, separately from execution errors. Review
  the label, control and rubric before calling a disagreement a judge error.
  Calibration on selected controls does not certify all future judgments.
- Keep counterexamples symmetric: equivalent valid answers should receive the same
  treatment. Do not repair only the failed cell while overlooking the same issue in
  a passing cell. Avoid task-specific rules added merely to make a benchmark pass.

## Ecosystem integration

For an ecosystem subagent, keep the portable skill and the pi-daddy definition
separate. Use `<skill>-agent.md` with a matching distinct frontmatter name and a
plain explicit `allowed-tools` list (an empty line means no tools). Capabilities
must fit the brief's tools and explicitly agreed `agentCapabilities`; do not add
context or delegation authority by inference. Select the wrapper as a Pi skill
resource; an `agents/` file alone is not discovered. Use native governed
delegation. Availability is not a grant. Preserve operation and
candidate identity, native final and cleanup evidence; never bypass a refused
delegation by launching another child through a shell. Principal workflows are
optional. A social-media role does not itself authorize posting or account changes.

Optional `jev_advice` can assess one consequential evidence choice after ordinary
checks: reuse matching evidence, retrieve selected project context through Bookie,
research a public gap with Scout, or run a targeted check. State one proposed action
and the uncertainty it could resolve; do not score every alternative or add a call
per tool or turn. Skip advice for cheap obvious steps, unavailable tools, permissions,
identity checks and duplicate detection. Off or unavailable advice does not stop the
ordinary authorized workflow. A probability grants no authority or acceptance.

Existing session paid-call and storage choices still apply. Bookie save/retrieval
permission is not permission to send private memory to JEV; select only public or
already-redacted evidence. Authoring and diagnostic data are not automatically
training examples. Independent labels, source rights and separate export/training
approval still apply. See [decision advice](docs/DECISION-LEARNING.md#choosing-a-useful-next-action).

## Selected lessons and improvement proposals

When Bookie is loaded, `skill_improvement` can turn one explicitly selected lesson
into a proposal for an existing `skill_author` project. Supply its exact context or
producer reference, the proposed change, when it applies, when it does not apply,
and when it should be reconsidered. Bookie checks the current project and destination
before returning a bounded excerpt. Harness stores its digest and reference, not the
raw excerpt. No background memory search or automatic skill installation occurs.

Proposals stay under `.skill-harness/authoring/<name>/improvements/`. Identical input
is reused; inspection returns metadata and target-currentness, not protected lesson
text. Re-resolve the selected source before using a stored proposal. A source digest
is evidence identity, not acceptance. Continue the existing draft, calibration,
comparison and explicit adoption workflow. Reuse saved answers or judgments only
when their exact dependencies still match. Nothing is designated for training.

If Bookie is missing or refuses the source, this tool records nothing. Ordinary
authoring from the user's supplied idea continues without Bookie, Daddy or Principal.
Generated skills still need only Pi and their declared tools.

## Commands and evidence

Start in Pi with `/skill-harness create <idea>`; resume with
`/skill-harness author <name>`. `skill_author` retains the brief and draft under
`.skill-harness/authoring/<name>`. Use `--specs <eval-root>` with a separate eval
repository; its layout is `<eval-root>/<skill>/tests`.

Free offline commands: `init`, `lint`, `preflight`, `diagnose`, `list`, `rescore`,
`restamp`, `stability`, and `coverage`. `calibrate <manifest>` validates without
model calls; `calibrate --run` invokes the selected judge. `suggest` is the existing
Pi drafting shortcut for a skill that already exists.

`expectedCriteria` is optional for older controls. When only those expectations
change, review the new manifest and compare saved raw criterion votes through
calibration reuse. Exact judge-prompt bindings must match; expectation-only changes
do not require fresh model calls. Authored calibration is not execution evidence.

Use the cheapest honest remedy: stimulus drift → `run`; rubric drift → `grade`;
policy drift → `rescore`; gate drift → `regate` (may judge fail-to-pass cases).
`grade` spends judge tokens only. `run` spends subject and judge tokens. Honor the
metered-judge opt-in and do not enable it by inference. Missing evidence is ERROR,
never zero or PASS. The author owns verdict overrides; preserve their notes.

See [docs/EVAL-AUTHORING.md](docs/EVAL-AUTHORING.md) for file contracts and
[docs/USAGE.md](docs/USAGE.md) for the command walkthrough.
