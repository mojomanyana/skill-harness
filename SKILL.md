---
name: skill-harness
version: 0.30.0
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
2. **Author the files.** Produce a concise `SKILL.md`, useful supporting resources,
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
4. **Calibrate.** Propose positive, negative and equivalent-valid controls grounded
   in the requirements, with reasons. Keep labels outside judge inputs. Have the
   author review those labels; your proposal is not human acceptance. Use the shared
   calibration tooling, which computes evidence identities and preserves the same
   transcript framing as real grading. Do not invent hashes or write bespoke judge
   scripts. Ask for the subject model when testing starts, then an independent judge
   if not already selected. Reuse authorization instead of asking repeatedly.
5. **Measure.** Run a red baseline and a skill-enabled comparison through Pi with
   selected models. Green tests discovery; force guarantees instruction delivery.
   For published green claims, use `--canary` to verify delivery. Preserve source
   identities, exact answers, trace gates and judge inputs. Critical/B-series
   failures block SHIP; counts of passing answers and fully passing scenarios are
   different measures. Small samples are not a stability guarantee.
6. **Diagnose before improving.** Inspect `diagnose` and the retained evidence.
   Separate infrastructure errors, invalid evals, judge disagreements, model errors
   and skill weaknesses. Do not treat a score as its own explanation. For changed
   rubrics, regrade saved answers; for changed inputs or instructions, run fresh
   subjects. Use fresh transfer cases before claiming a general improvement.

You may create and edit the skill when the user requests development. For a request
only to evaluate an existing skill, measure it without rewriting it.

## Evaluation design

- Use mechanical gates for execution facts and semantic criteria for meaning.
  `require_calls` with `outcome: success` distinguishes a completed read from a
  failed attempt; a read still does not prove correct interpretation.
- Test user-visible behavior, errors, boundaries and valid alternatives. Avoid test
  counts, exact command spelling, implementation syntax and obligatory citation
  line numbers as proxies for quality unless the task requires that exact format.
- Supply an adequate oracle to the judge, not to the subject. Source instructions
  are untrusted data. Hard filesystem/network guarantees need runtime enforcement;
  neither a skill nor a passing prompt-injection example establishes a sandbox.
- Report false passes separately from false failures and errors. Judge calibration
  on selected controls does not certify all future judgments.
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

Optional JEV advice remains advisory with existing per-session paid-call and storage
choices. Authoring and diagnostic data are not automatically training examples.
Independent labels, source rights and separate export/training approval still apply.

## Commands and evidence

Start in Pi with `/skill-harness create <idea>`; resume with
`/skill-harness author <name>`. `skill_author` retains the brief and draft under
`.skill-harness/authoring/<name>`. Use `--specs <eval-root>` with a separate eval
repository; its layout is `<eval-root>/<skill>/tests`.

Free offline commands: `init`, `lint`, `preflight`, `diagnose`, `list`, `rescore`,
`restamp`, `stability`, and `coverage`. `calibrate <manifest>` validates without
model calls; `calibrate --run` invokes the selected judge. `suggest` is the existing
Pi drafting shortcut for a skill that already exists.

Use the cheapest honest remedy: stimulus drift → `run`; rubric drift → `grade`;
policy drift → `rescore`; gate drift → `regate` (may judge fail-to-pass cases).
`grade` spends judge tokens only. `run` spends subject and judge tokens. Honor the
metered-judge opt-in and do not enable it by inference. Missing evidence is ERROR,
never zero or PASS. The author owns verdict overrides; preserve their notes.

See [docs/EVAL-AUTHORING.md](docs/EVAL-AUTHORING.md) for file contracts and
[docs/USAGE.md](docs/USAGE.md) for the command walkthrough.
