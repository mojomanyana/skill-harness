# Quickstart verification — 2026-08-04

ROADMAP Sprint 1.1: *"Fresh-machine quickstart run-through; fix everything >10 min.
Metric: ≤10 min."* Rule 6: verify on a fresh machine/temp dir before claiming an
onboarding task complete.

Measured on Linux (WSL2), Node v24.14.0, npm 11.9.0, `pi` 0.80.2, warm npm cache.

## Result: 41 seconds from zero to a graded skill — **from a git clone**

| step | time |
|---|---|
| `git clone --depth 1` | 1s |
| `npm install` | 2s |
| `npm run build` | 1s |
| `list` → `init` → `lint` | 1s |
| `run --mode red` (2 scenarios) | 19s |
| `run --mode green` (2 scenarios) | 17s |
| **total** | **~41s** |

Subject `fireworks:accounts/fireworks/models/deepseek-v4-flash`, judge
`claude-code:claude-opus-4-8` (Claude subscription, no metered key), against the
bundled `golden-skill` fixture copied into a temp skills root.

Nothing in the source path needs fixing for the ≤10 min metric. It has ~14x
headroom, and a slower model or a bigger spec still leaves room.

## The blocker: the npm path does not work at all

The measurement above is the **clone** path. The README's quickstart — and what a
stranger who finds the project actually does — is `npm i -g skill-harness`. That
installs `0.1.2`, the current registry `latest`, and:

```
$ skill-harness init greeter --skills ./skills
unknown command: init          # exit 1

$ skill-harness suggest greeter --skills ./skills
unknown command: suggest       # exit 1
```

`init` and `suggest` landed after 0.1.2 was published and are only in the
unpublished 0.2.0. So an npm user has no scaffolding at all and must hand-write
`tests/specification.yaml` — which the roadmap itself calls "the #1 onboarding
killer", and which is precisely why those two commands were built.

The published version's review UI is also non-functional (see the
`fix(review)` PR — the inline script never parsed in any released version).

**So: ≤10 min is verified for source installs and unverified-in-practice for npm
installs, until 0.2.0 is published.** Publishing is the single highest-leverage
onboarding fix available right now; it needs no code. See `PUBLISHING.md`.

## Side finding: the fixture skill has zero lift

Worth recording, because it is the exact failure mode the new lift column exists
to surface, and it turned up on the first real run:

```
GRADE: A (100%) — 2/2 — SHIP
LIFT:  no measured effect (2 passed without the skill too)
```

`golden-skill` says "always greet the user by name". `deepseek-v4-flash` greets by
default, so both scenarios pass with the skill switched **off**. Read alone, the
`A`/`SHIP` looks like proof the skill works. It is proof the model is polite.

That's a fixture, so nothing is broken — but it's a clean, reproducible
demonstration for the lift post and a candidate for the 30s demo GIF: the grade
and the lift line disagreeing on the same screen is the whole argument in one
frame.

## Reproduce

```bash
git clone --depth 1 https://github.com/mojomanyana/skill-harness && cd skill-harness
npm install && npm run build
mkdir -p /tmp/qs/skills && cp -r packages/core/test/fixtures/golden-skill /tmp/qs/skills/
rm -rf /tmp/qs/skills/golden-skill/tests/results
node bin/skill-harness.js run golden-skill --skills /tmp/qs/skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-flash \
  --judge claude-code:claude-opus-4-8 --mode red
node bin/skill-harness.js run golden-skill --skills /tmp/qs/skills \
  --model fireworks:accounts/fireworks/models/deepseek-v4-flash \
  --judge claude-code:claude-opus-4-8 --mode green
```

Costs two `pi` invocations plus two judge calls per mode.
