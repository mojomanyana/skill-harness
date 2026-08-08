# Testing the parent, not just the subagent

*Draft — owner edits voice.*

If your agent delegates, you have two things that can be wrong and only one of
them is usually tested.

The subagent's own prompt is easy to test — point the harness at
`agents/plan.md`, run it single-shot, grade the output. `skill-harness` has done
that for a while with `system_prompt_file`.

What nobody tests is the **parent**: did it delegate at all? To the right
subagent? Did the handoff carry the context the child needed — and *not* carry
the credential it shouldn't have? A perfect subagent invoked with a task
description missing the error message is a broken system, and every test you have
says both halves are fine.

This release makes the parent testable.

## Three layers, graded separately

```yaml
scenarios:
  - id: R1
    title: delegates authentication diagnosis
    turns:
      - "Find why authentication is failing."
    checklist:
      - integrates the planning subagent's recommendation

    env:
      extensions:
        - ../../.pi/extensions/subagents/index.ts

    assert:
      trace:
        require_subagents:
          - tool: Agent
            agent: plan
            task_contains: ["authentication"]
            task_excludes: ["password"]
```

- **Selection** — did the parent call `plan`? Objective.
- **Handoff** — did the task text carry `authentication` and withhold `password`?
  Objective, and reported as two separate assertions, because "forgot the
  context" and "leaked the secret" send you to different places in the prompt.
- **Integration** — did the parent's final answer actually *use* what came back?
  That stays with the checklist judge, because it is a semantic question and
  pretending otherwise would be the whole failure mode of this tool.

A scenario can pass selection and handoff objectively and still fail on
integration. That combination is the interesting one, and there is a test for it.

## Only the extensions you name

An orchestration scenario is worthless if the subagent tool comes from whatever
the developer happened to have installed. So `env.extensions` is **closed**, not
additive: the adapter passes `--no-extensions` plus one `--extension` per
declared path, and nothing discovered loads.

We measured that rather than assuming it. On pi 0.83.0 that flag pair loads
exactly the declared extension — and it holds even with `-a` project-local trust
active, which is stronger than we had any right to expect. The test cost nothing
at all: extensions load during startup, so `pi --help` with a load-time marker
answers the question without a model call.

A declared extension that doesn't exist is a hard error before pi is spawned. It
has to be — pi would start happily, the `Agent` tool would simply not exist, and
the scenario would grade a model that never had the option to delegate.

## Extensions are stimulus. Assertions are gates.

This distinction decides what a change costs you, and it's worth being precise
about because the two look similar in the YAML.

Editing `assert.trace` changes only what we *conclude* from evidence already on
disk — so `regate` re-answers it for free. Editing an **extension** changes what
the model could *do*, so the old transcripts describe a different agent, and only
a re-run can honestly answer. The staleness gate is told this, and lint names the
right remedy for each.

Extension **contents** are hashed, not just their paths. Editing your subagent
tool changes what the test measured without changing a character of the spec —
which is exactly the drift the staleness gate exists to catch, and exactly the
kind that otherwise goes unnoticed for months.

## What is not assumed

There is no universal subagent extension, so nothing pretends there is.

`require_subagents` normalizes three argument shapes seen in the wild — single
`{agent, task}`, parallel `{tasks: [...]}`, chain `{chain: [...]}` — and the spec
declares the tool name, because pi has no standard one. Anything unrecognized
returns *nothing* rather than a guess: inventing an `agent` field from an
unfamiliar shape would produce a confident assertion about something nobody
wrote. Unknown extensions still work with plain `require_calls`.

And the child stays opaque. pi emits no nested trace for a subagent, so evidence
stops at the parent's call. Anything deeper is capability-detected per extension,
never assumed.

## The fixture calls no model

The orchestration fixture is a deterministic fake `Agent` that spawns nothing and
returns a canned report. That is not laziness — an orchestration scenario tests
the parent's *choices*, and a real child would add nondeterminism and token spend
to a test that never asks anything of it.

It also means `require_subagents` is fully tested for free, on every CI run.
