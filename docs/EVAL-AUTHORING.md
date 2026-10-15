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
seeded trailers and reference bytes. It separates false passes, false failures and
infrastructure errors, and never turns an unrun control into a failure.

## Validate contracts before judging a model

`lint` now emits non-blocking `authoring` notices for common brittle contracts:
read-count proxies, POSIX-only path matching, exact `npm test` spelling,
`expect(` diff needles, and mandatory line-citation formats. These are review
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
