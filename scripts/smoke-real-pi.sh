#!/usr/bin/env bash
#
# Real-pi smoke test. SPENDS TOKENS. Run by hand before a release; never in CI.
#
# Everything else in this repo is tested against fixtures and fake adapters,
# which is right — they are fast, free and deterministic. But three code paths
# only exist when a real process is on the other end, and a fake adapter cannot
# exercise any of them:
#
#   1. `runStructured` — the actual spawn + streaming JSONL reader. The stream is
#      quadratic in output length (a 3-tool-call run measured 52 MB), so this is
#      the path where a buffering mistake becomes a memory failure mid-wave.
#   2. `--no-extensions --extension <path>` argv — the fixtures prove pi honours
#      it; this proves the HARNESS passes it correctly.
#   3. The live judge loop under `--auto-rejudge` — a real `claude -p` call.
#
# The scenario is built so all three run in one shot, and so that adjudication is
# guaranteed to trigger (one scenario, min_pass == total, so the single cell is
# always `ship_deciding`).
#
# Cost: 1 subject call on a cheap Fireworks model — 2 if the first turn comes back
# blank, which the harness retries once — plus up to 3 judge calls on the Claude
# subscription: one in `run`, one in `grade`'s re-judge, and one for adjudication's
# secondary opinion. Measured well under a cent of subject spend. Counted rather
# than estimated: this file asserts that spend is never implicit, so its own
# disclosure has to be right — and PUBLISHING.md quotes the same numbers.
#
set -euo pipefail

cd "$(dirname "$0")/.."

SKILLS="scripts/smoke/skills"
SKILL="trace-smoke"
# DATED pin, not the bare alias. `deepseek-v4-flash` was retired at the provider — Fireworks answers
# `404 Model not found, inaccessible, and/or not deployed`, pi reports an empty response, and the harness
# prints `R1 ERROR: model produced no response after a retry (harness timeout?) — infra, not skill
# behavior`. Which is accurate and reads exactly like a harness bug, for a reason that has nothing to do
# with the code under test. The retirement landed somewhere between 2026-08-08, when this script was
# written, and 2026-08-16; the archived runs bracket it no more tightly than that.
#
# A dated id cannot be retired out from under this script the way a floating alias can, so this buys a
# lower CHANCE of silent retirement — not a better failure when it comes. There is no model-existence
# preflight, so a withdrawn dated id 404s exactly like the alias did and reads the same way; what limits
# the damage is step 2 aborting before the judge spend, which is unrelated to the pin.
# `SMOKE_MODEL` overrides it; the only requirement is something cheap that can call tools.
MODEL="${SMOKE_MODEL:-fireworks:accounts/fireworks/models/deepseek-v4-flash-0731}"
CLI="node bin/skill-harness.js"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

say "0 · preflight (free, offline)"
command -v pi >/dev/null || fail "pi is not on PATH"
command -v claude >/dev/null || fail "claude is not on PATH (the default judge needs it)"
# `command -v` only proves a file is on PATH. A command substitution inside an `echo` argument does not
# trip `set -e`, so a pi that exists and cannot run used to print `pi     ` and carry on to spend tokens.
pi --version >/dev/null 2>&1 || fail "pi is on PATH but not runnable"
echo "pi     $(pi --version)"
echo "claude $(claude --version | head -1)"
echo "subject $MODEL"

# Runs BEFORE any spend: lint validates that the declared extension path exists,
# so a repo move fails here for free instead of after tokens are spent on a
# scenario whose subagent tool was silently absent.
$CLI lint all --skills "$SKILLS" || fail "lint found problems — fix before spending"
$CLI coverage "$SKILL" --skills "$SKILLS"

say "1 · run (SPENDS subject tokens) — exercises spawn + streaming + --extension"

# Taken BEFORE the spend so the run dir can be required to be NEW. Without it, a `run` that dies before
# writing anything leaves the newest PREVIOUS run as the selection below, and steps 2-4 then assert
# against artifacts this run never produced — the same false pass the sort fix closes, by another route.
STAMP="$(mktemp -d)/stamp"
: > "$STAMP"

# `run` is itself a release gate: it exits 1 whenever the scorecard does not SHIP
# (`releaseExitCode`, packages/cli/src/cli.ts, asserted in packages/cli/test/run-tuning.test.ts), and
# `--mode force` is a scored mode. That is deliberate and correct for CI. It is NOT this script's gate,
# and left bare under `set -e` it WAS the whole gate: one draw of a cheap subject model deciding whether
# the harness assertions ran at all. Any non-SHIP verdict — an objective needle, or merely two judges
# disagreeing — killed the script here, silently, with no `fail()` line, before the three real-pi paths
# this file exists to exercise had been touched. Deferred and reported; the assertions below are the gate.
RUN_STATUS=0
$CLI run "$SKILL" --skills "$SKILLS" --model "$MODEL" --mode force --label smoke || RUN_STATUS=$?
[ "$RUN_STATUS" -eq 0 ] ||
  echo "note: run exited $RUN_STATUS (the scorecard did not SHIP) — continuing; the assertions below are the gate"

# Three separate ways this used to validate the wrong run, every one of them a false pass:
#
#   1. `sort | tail -1` over `<model-tag>/<timestamp>` orders by model tag FIRST, and tags are not
#      ordered by recency. Renaming the model to `deepseek-v4-flash-0731` was enough to break it, since
#      `-` (0x2D) sorts before `/` (0x2F): the fresh run lost to a stale one from the retired model.
#      Fixed by keying the sort on the timestamp component alone.
#   2. Newest-on-disk is not the same as the run just made. `-newer "$STAMP"` ties the selection to THIS
#      invocation, which matters now that a non-SHIP `run` no longer aborts above.
#   3. Nothing compared the artifact to `$MODEL`, so a dir from another `SMOKE_MODEL` could be adopted.
#
# The timestamp key is load-bearing on the run dir keeping its fixed-width UTC format (`runDirFor`),
# where lexicographic order is chronological order. Move to offsets or unpadded fields and (1) returns.
RESULTS="$SKILLS/$SKILL/tests/results"
# `find` on a missing path exits non-zero and `pipefail` would abort the assignment below with find's
# error instead of this one, so the friendly message needs its own check.
[ -d "$RESULTS" ] || fail "no results tree at $RESULTS — run wrote nothing"
RUN_DIR=$(find "$RESULTS" -maxdepth 2 -mindepth 2 -type d -newer "$STAMP" |
  awk -F/ '{ print $NF "\t" $0 }' | sort | tail -1 | cut -f2-)
[ -n "$RUN_DIR" ] || fail "step 1 produced no new run dir (run exited $RUN_STATUS) — nothing to assert against"
RUN_MODEL=$(sed -n 's/^model: *//p' "$RUN_DIR/results.yaml" | head -1 | tr -d "\"'")
[ "$RUN_MODEL" = "$MODEL" ] || fail "run dir $RUN_DIR records model $RUN_MODEL, not the pinned $MODEL"
echo "run dir: $RUN_DIR"

say "2 · assert the trace artifact is real"
TRACE=$(find "$RUN_DIR" -name "*.trace.jsonl" | head -1)
[ -n "$TRACE" ] || fail "no .trace.jsonl artifact — runStructured did not run, so the scenario silently used the unstructured path"
echo "trace: $TRACE ($(wc -c < "$TRACE") bytes)"

# The three properties a fake adapter can never prove.
node -e '
const fs = require("fs");
const t = JSON.parse(fs.readFileSync(process.argv[1], "utf8").split("\n").filter(Boolean)[0]);
const die = (m) => { console.error("FAIL: " + m); process.exit(1); };

// Read from the source of truth, not a literal. A hardcoded 1 here failed the
// smoke run purely because the format legitimately moved to 2 — a release gate
// that cries wolf on its own version bump trains you to ignore it.
const EXPECTED = require("./packages/core/dist/capture-trace-types.js").EXECUTION_TRACE_VERSION;
if (t.trace_version !== EXPECTED) die("trace_version " + t.trace_version + ", expected " + EXPECTED);
if (!t.pi_version) die("no pi_version recorded — provenance is the whole point of the field");
if (!t.trace_sha256) die("no trace_sha256 — regate identifies saved evidence by this hash");

const agent = t.tool_calls.find((c) => c.name === "Agent");
if (!agent) die("the declared extension did not load: no Agent tool call in the trace");
if (agent.args.agent !== "plan") die("Agent called with agent=" + JSON.stringify(agent.args.agent));

// Privacy limits, verified against a REAL stream rather than a fixture.
const blob = JSON.stringify(t);
if (/thinking/i.test(blob)) die("thinking leaked into the persisted trace");
if (blob.includes("/home/")) die("a home path leaked into the persisted trace");
if (t.tool_calls.some((c) => c.result && "content" in c.result)) die("a tool-result body was persisted");

// Tri-state since v2: `null` is "never observed", `[]` is "observed, nothing changed". This scenario
// declares no `unchanged_paths`, and THAT is the short-circuit in run.ts — not the absence of a
// workspace, which `createWorkspace` allocates even for `workspace: none`. An empty array here would
// mean the parser had gone back to claiming it looked and saw nothing.
if (t.changed_paths !== null) die("changed_paths should be null (never observed), got " + JSON.stringify(t.changed_paths));

console.log("  trace_version " + t.trace_version + " · pi " + t.pi_version);
console.log("  tool calls: " + t.tool_calls.map((c) => c.name).join(", "));
console.log("  Agent handoff: " + JSON.stringify(agent.args.task).slice(0, 90));
console.log("  cost_usd: " + t.cost_usd);
console.log("  no thinking, no home paths, no result bodies ✓");
' "$TRACE" || fail "trace assertions failed"

say "3 · grade --auto-rejudge (SPENDS judge tokens) — exercises the live judge loop"
$CLI grade "$RUN_DIR" --auto-rejudge

say "4 · assert adjudication actually ran"
node -e '
const fs = require("fs"), path = require("path");
const yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[1], "results.yaml"), "utf8"));
const die = (m) => { console.error("FAIL: " + m); process.exit(1); };
const c = r.scenarios[0];
if (!c.adjudication) die("no adjudication recorded — the trigger did not fire");
const a = c.adjudication;
if (a.judgments.length < 2) die("only " + a.judgments.length + " judgment(s): no second opinion was taken");
if (a.trigger !== "ship_deciding") console.log("  note: triggered on " + a.trigger + " (expected ship_deciding)");
console.log("  state: " + a.state + " · trigger: " + a.trigger + " · " + a.judgments.length + " judgments");
for (const j of a.judgments) console.log("    #" + j.ordinal + " " + j.judge.provider + ":" + j.judge.model + " " + j.verdict + (j.suspect ? " (misfired)" : ""));
if (a.state === "unresolved" && !c.suspect) die("unresolved must set suspect:true — that is what blocks SHIP");
// Asserted, not just printed. `grade` really did drop this field, and the only thing that caught it
// was reading this line on a real run — so it is a failure rather than a note.
if (!c.objective) die("the scenario declares assert.trace but results.yaml has no `objective` — a rewriter dropped it");

// Every non-PASS is gated, ERROR included, and the SPEC is what keeps that honest: it carries no needle
// that only the subject model can satisfy, so a red line here is a claim about the HARNESS. `ERROR`
// especially — it means the gate could not evaluate its own evidence (a gates-digest mismatch, an
// unreadable trace, redaction eating the text it was about to search), which is the strongest reason to
// stop rather than a reason to shrug. The paths differ from step 2 on purpose: selection resolves
// through `normalizeSubagentCall` over the merged trace, where step 2 reads `args.agent` off the first
// turn, so a merge or redaction regression shows up HERE and nowhere else in this script.
if (c.objective.status !== "PASS") {
  const failed = (c.objective.assertions ?? []).filter((as) => as.status !== "PASS");
  for (const as of failed) console.error("    " + as.status + " " + as.kind + ": " + as.detail);
  die("objective " + c.objective.status + (failed.length ? "" : " with no failing assertion recorded — itself a defect signature"));
}
console.log("  objective: PASS (survived the re-grade ✓)");
' "$RUN_DIR" || fail "adjudication assertions failed"

say "DONE — all three real-pi paths exercised"
echo "Artifacts left in $RUN_DIR (transcripts and traces are gitignored)."
echo "This run is NOT a benchmark: one draw on a cheap model, not a measurement."
