# Codex arms — Wave 0 runbook

Measures the reference corpus `../principal-pi-skills` on OpenAI-Codex models under your
own subscription, judged by Opus on your Claude subscription, comparing the corpus with
and without pi-daddy loaded as a governed-delegation extension. Wave 0 is the pilot that
proves the plumbing before any large spend. Design: `docs/superpowers/specs/2026-08-22-codex-arms-campaign-design.md`.

Run every command below from the `skill-harness` repo root. Sections 1–1d are free — no
model spend, no provider round-trip that risks a paid call. Do not skip to section 2 until
section 1's probe (1b) has printed `ok` / `exit=0`.

## 1. Preflight (free)

### 1a. Versions

```bash
pi --version
```

Expect `0.84.2` or newer. This measurement was taken against `0.84.2`.

```bash
pi --list-models
```

Confirm an `openai-codex` provider row is present, carrying `gpt-5.6-sol`, `gpt-5.6-luna`,
`gpt-5.6-terra`. (Also `gpt-5.3-codex-spark`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.5` — Wave 0
uses `gpt-5.6-sol` only.)

### 1b. The one-call probe — NOT `pi auth check`

**`pi auth check` is not a valid pre-flight gate for this campaign.** Measured
2026-08-22, it returned:

```json
{"status":"ready","provider":"openai-codex","authType":"oauth"}
```

against a token that was in fact invalidated. `pi auth check` verifies a credential
exists and refreshes; it does not verify the credential is accepted by the provider on an
actual request. Use the real probe instead — one live call, no context files, no
extensions, no skills, no session:

```bash
pi --no-context-files --no-extensions --no-skills --no-session \
   --provider openai-codex --model gpt-5.6-sol -p "Reply with exactly: ok" </dev/null; echo "exit=$?"
```

- **Live token:** prints `ok`, then `exit=0`.
- **Dead token:** `exit=1`, and stderr carries
  `Encountered invalidated oauth token for user, failing request`.

Credentials live in `~/.pi/agent/auth.json`. If the probe fails, re-authenticate before
going further — nothing past this point is worth running against a dead token.

**Do not reach for `--mode json` to diagnose this.** It is the worse diagnostic here: a
dead-token call under `--mode json` reports a generic `provider_transport_failure`
("WebSocket error") with `stopReason: "error"`, zero tokens recorded — and **exit code
0**. Text mode is what surfaces the real failure and the correct exit code.

### 1c. pi-daddy's skill root must be empty

```bash
ls ~/.pi/agent/skills
```

Must print nothing. pi-daddy reads that root *in addition to* the workspace the harness
builds, so anything sitting there is an uncontrolled variable the pi-daddy arm cannot see
around — and it refuses the run rather than measure past it.

### 1d. Free before-baseline

```bash
node bin/skill-harness.js lint all --skills ../principal-pi-skills 2>&1 | tail -1
```

Expect exactly:

```
7 skill(s), 104 finding(s), 32 note(s) (do not fail the gate)
```

That number has held across four measurements now; if it moved, something perturbed a
digest and Wave 0 should wait until you know what.

## 2. Wave 0, control arm

22 `review` scenarios × `gpt-5.6-sol:medium` × `--mode force` × `--reps 1`, no delegation
extension loaded:

```bash
node bin/skill-harness.js run review --skills ../principal-pi-skills \
  --mode force --model openai-codex:gpt-5.6-sol:medium --reps 1 --structured
```

## 3. Wave 0, pi-daddy arm

Same scenarios, same model, plus the named arm from `../principal-pi-skills/tests/arms.yaml`:

```bash
node bin/skill-harness.js run review --skills ../principal-pi-skills \
  --mode force --model openai-codex:gpt-5.6-sol:medium --reps 1 --structured --arm pi-daddy
```

That's **44 subject runs total (22 × 2 arms), ~44 judge calls** — the whole Wave 0 spend.

## 4. The four pass criteria, and how to check each

**1. Provider and thinking level confirmed (VERIFIED).** The section 1b probe confirms
the provider and credential. Installed pi 0.84.2's `parseModelPattern`
(`dist/core/model-resolver.js`, `parseModelPattern` lines 156–200 in installed 0.84.2) tries an exact model match
first, then splits on the **last** colon and accepts the suffix only when it is a valid
thinking level; strict provider selection remains strict. skill-harness splits
`provider:model` on the first colon and forwards the model remainder unchanged. Therefore
`openai-codex:gpt-5.6-terra:high` binds thinking `high`, while exact colon-bearing IDs such
as `ollama:qwen3-coder:30b` remain safe because exact matching wins first. The adapter argv
contract is pinned by `packages/adapters/test/pi.test.ts`.

**2. Cost and latency recorded.** `--structured` must be on both Wave 0 commands above, or
no subject token/cost data is written at all. Check:

```bash
grep -A6 'metrics:' <run-dir>/results.yaml
```

`input_tokens` and `subject_cost_usd` (and their siblings) must be non-null. On an
OAuth-subscription provider (this campaign's `openai-codex`), `subject_cost_usd` may
legitimately read `0` — there is no per-call metered price to attach. The check is
non-null, not non-zero; a `0` here is evidence the field was populated, not evidence
the call was free of the harness's structured path.

**3. At least one ledger spawn event.**

```bash
wc -l <run-dir>/pi-daddy.ledger.jsonl
```

(Only the pi-daddy-arm run dir has this file.) **Zero is a reportable outcome, not a
pass:** it means the arm loaded — the extension was live, the ledger file exists — but
nothing delegated, so the control/treatment comparison for this wave is vacuous. Say so
in the writeup rather than treating a present-but-empty ledger as success.

**4. A readable verdict delta.**

```bash
node bin/skill-harness.js review review --skills ../principal-pi-skills
```

Opens the review UI (model × scenario matrix) so you can read both arms' verdicts side by
side, per scenario.

## 5. What Wave 0 does not license

**The verdict delta from Wave 0 is not a finding.** It's `--reps 1` on a single model.
`lint` already reports `review/S6` and `review/S9` flipping run-to-run in this corpus with
no arm involved at all — a single-rep flip between control and pi-daddy is indistinguishable
from that same noise. Wave 0's job is to prove the plumbing works end to end (provider
reachable, tokens/cost captured, ledger wired, review UI reads both arms). Wave 1's scope
— which skills, which models, how many reps, whether the delta is worth measuring at scale
— is a separate decision made after Wave 0 lands, not before.

**The pi-daddy arm changes TWO things at once versus the control:** a spawn tool exists at
all (no spec in this corpus declares `env.extensions`, so every committed run before this
had none, and the model could only narrate delegating rather than do it), and spawning is
*governed* (an operator-authored grant ceiling, not an open tool). Any writeup must say
"governed delegation vs no delegation" — never "governance changed behaviour", since that
implies an ungoverned-delegation condition this wave never runs.

**There is no OS sandbox.** The `SandboxBackend` seam in this codebase is fake-backed —
nothing here executes model actions inside a real container or VM. The arm's
`PI_GRANTS_GRANT: "tool:read,tool:grep,tool:find,tool:ls"` and `PI_GRANTS_MAX_DEPTH: "1"`
bound the *intended* path for a cooperating model; they are not containment, and no report
from this wave may claim otherwise.

## 6. Reading a failure

A scorecard cell reading `ERROR provider failure — …` is an infrastructure failure, not a
finding about the skill. Fix the provider (start back at section 1b) and re-run that cell
— don't record it as a model FAIL. Before this classification existed, the same kind of
outage produced 44 model FAILs shaped exactly like real findings, with nothing to tell
them apart after the fact.

## 7. Two deferred decisions

Neither is Wave 0's to resolve; both have a design pointer if you pick them up later.

- **Model pinning** — spec §10, "Finding: force delivers frontmatter, and the digest says
  it cannot". In `--mode force`, `SKILL.md` frontmatter (`allowed-tools`, `tools`) is
  delivered to the model in full despite the digest code's comment claiming it never is.
  Consequence: a pin written into that document is stimulus, so writing a *measured* pin
  into it would invalidate the measurement that produced it — the pin has to live
  somewhere the model can't see (a sidecar, a mode-aware digest, or stripped frontmatter
  in force), a choice deferred past Wave 0.
- **Purging the fireworks-era results** — spec §11. 202 `results.yaml` files are
  git-tracked and recoverable from history; **8,383 of 8,388 transcripts are gitignored
  and are not** — delete them and no old run (including the one finding that currently
  wants a judge-only re-grade, `plan/A2`) can ever be re-judged. Retiring (a marker that
  makes `lint` skip old tags) gets the same clean-gate benefit without that loss; deleting
  outright is a separate, explicit call.

Full detail on both: `docs/superpowers/specs/2026-08-22-codex-arms-campaign-design.md`
(§10, §11).
