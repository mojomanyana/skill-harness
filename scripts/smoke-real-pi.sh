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
# Cost: 1 pi invocation on a cheap Fireworks model — 2 if the first turn comes back
# blank, which the harness retries once — plus up to 3 judge calls on the Claude
# subscription: one in `run`, one in `grade`'s re-judge, and one for adjudication's
# secondary opinion. One invocation is not one model call: the agentic loop inside it
# calls the model once per tool round, and the archived runs show two tool calls, so
# budget three. Measured well under a cent of subject spend either way. Counted rather
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

# Runs BEFORE any spend, and one finding is the reason: `fixture` proves the declared extension path
# exists, so a repo move fails here for free instead of after tokens are spent on a scenario whose
# subagent tool was silently absent. That one still fails closed.
#
# `stale` is a different animal and must NOT block. It means an OLD LOCAL run predates the current
# spec — and those runs are gitignored, so they are never published, which is the only thing staleness
# exists to prevent. It is also unclearable in general: `lint` checks the newest run of EVERY model tag,
# and the retired model's tag can never receive another run, so one spec edit would leave this script
# permanently unrunnable. Clear them by deleting `tests/results/` if you want a quiet preflight; note
# `regate` is NOT free here, since a gate verdict that flips costs a judge call.
LINT_OUT=$($CLI lint all --skills "$SKILLS" 2>&1) || true
printf '%s\n' "$LINT_OUT"
BLOCKING=$(printf '%s\n' "$LINT_OUT" | grep '^✗' | grep -v ': stale — ' || true)
[ -z "$BLOCKING" ] || fail "lint found problems — fix before spending"
STALE=$(printf '%s\n' "$LINT_OUT" | grep -c ': stale — ' || true)
[ "$STALE" = "0" ] ||
  echo "note: stepped over $STALE stale finding(s) — old local runs predate the spec, not a spend-safety problem"
$CLI coverage "$SKILL" --skills "$SKILLS"

say "1 · run (SPENDS subject tokens) — exercises spawn + streaming + --extension"

# Taken BEFORE the spend so the run dir can be required to be NEW. Without it, a `run` that dies before
# writing anything leaves the newest PREVIOUS run as the selection below, and steps 2-4 then assert
# against artifacts this run never produced — the same false pass the sort fix closes, by another route.
STAMP_DIR=$(mktemp -d)
trap 'rm -rf "$STAMP_DIR"' EXIT
STAMP="$STAMP_DIR/stamp"
: > "$STAMP"
# Backdated deliberately. `find -newer` is strictly greater and filesystem mtimes are coarse — measured
# 4 ms ticks on ext4 here, 1 s on drvfs/NFS — so a run dir created in the same tick as the stamp would be
# excluded. That direction fails closed (it reports "no new run dir" rather than adopting a stale one),
# but only after the tokens are gone, and a TMPDIR coarser than the repo truncates the stamp DOWNWARD,
# which is the direction that could admit a dir created just before this script started.
touch -d '1 second ago' "$STAMP"

# `run` is itself a release gate: it exits 1 whenever the scorecard does not SHIP
# (`releaseExitCode`, packages/cli/src/cli.ts, asserted in packages/cli/test/run-tuning.test.ts), and
# `--mode force` is a scored mode. That is deliberate and correct for CI. It is NOT this script's gate,
# and left bare under `set -e` it WAS the whole gate: one draw of a cheap subject model deciding whether
# the harness assertions ran at all. Any non-SHIP verdict — an objective needle, or merely two judges
# disagreeing — killed the script here, silently, with no `fail()` line, before the three real-pi paths
# this file exists to exercise had been touched. Deferred and reported; the assertions below are the gate.
RUN_STATUS=0
$CLI run "$SKILL" --skills "$SKILLS" --model "$MODEL" --mode force --label smoke || RUN_STATUS=$?
# The status is deliberately NOT diagnosed here. `run` exits non-zero for a release verdict
# (`releaseExitCode`), for every throw in `main()` — pi missing, an unreadable spec, a judge refusal —
# and for a signal (137 the OOM killer, 143 SIGTERM), and nothing at this layer can tell them apart.
# Naming "the scorecard did not SHIP" would be a guess dressed as a diagnosis. A signal is different in
# kind: it means the run was cut short, so there is no complete artifact worth asserting against.
[ "$RUN_STATUS" -lt 128 ] || fail "run was killed by a signal (exit $RUN_STATUS) — not asserting against a partial run"
[ "$RUN_STATUS" -eq 0 ] ||
  echo "note: run exited $RUN_STATUS — cause unknown at this layer, see its output above; continuing, the assertions below are the gate"

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
# `run` creates the run dir BEFORE the subject call and writes `results.yaml` LAST, so "dir exists,
# scorecard does not" is the normal shape of any crash, OOM or timeout — and the journal write bumps the
# dir mtime, so `-newer` selects it. Without this guard the `sed` below aborts the script under
# `pipefail` with `sed: can't read …` and no FAIL: line: the exact defect the `$RESULTS` guard above
# exists to prevent, two lines later.
RESULTS_YAML="$RUN_DIR/results.yaml"
[ -f "$RESULTS_YAML" ] || fail "run dir $RUN_DIR has no results.yaml — run died before writing its scorecard"
# `q` after the match instead of `head -1`: `head` closing the pipe early makes `find`/`sed` exit 141
# under `pipefail`, which aborts with no message at all.
RUN_MODEL=$(sed -n 's/^model: *//p;/^model:/q' "$RESULTS_YAML" | tr -d "\"'")
[ -n "$RUN_MODEL" ] || fail "results.yaml in $RUN_DIR records no model — truncated mid-write"
[ "$RUN_MODEL" = "$MODEL" ] || fail "run dir $RUN_DIR records model $RUN_MODEL, not the pinned $MODEL"
echo "run dir: $RUN_DIR"

say "2 · assert the trace artifact is real"
TRACE=$(find "$RUN_DIR" -name "*.trace.jsonl" -print -quit)
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

// Distinguish "the model said nothing" from "the extension did not load" BEFORE blaming the loader.
// A withdrawn or unavailable model produces a trace with no tool calls at all, and this script used to
// accuse path #2 of the three it exists to prove — which is exactly the misdiagnosis the model pin
// above is about, arriving by a different route.
if (t.tool_calls.length === 0) die("the trace records no tool calls at all — the model returned nothing (a retired or unavailable model reads exactly like this); this is not an extension-loading failure");

const agent = t.tool_calls.find((c) => c.name === "Agent");
if (!agent) die("the declared extension did not load: tool calls were recorded (" + t.tool_calls.map((c) => c.name).join(", ") + ") but no Agent among them");
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

say "2b · assert the objective gate — BEFORE any judge spend"
# Ordering is the point. `grade` CARRIES the objective, it never recomputes it (`regrade.ts`, and
# `packages/core/test/field-roundtrip.test.ts` pins it: "a re-judge does not re-evaluate trace gates").
# So the verdict asserted here is already final the moment `run` finishes, and checking it after step 3
# bought two judge calls to re-confirm something written to disk minutes earlier. In a file that asserts
# spend is never implicit, that was implicit spend.
node -e '
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const die = (m) => { console.error("FAIL: " + m); process.exit(1); };
const r = yaml.load(fs.readFileSync(path.join(process.argv[1], "results.yaml"), "utf8"));
const c = (r.scenarios || [])[0];
if (!c) die("results.yaml records no scenarios");
if (!c.objective) die("the scenario declares assert.trace but results.yaml has no `objective` — a rewriter dropped it");

// Every non-PASS is gated, ERROR included. The SPEC is what makes that honest: its only content needle
// is a sentinel no model can emit, so the needle cannot fail on a draw — see specification.yaml. What
// remains IS subject behaviour in part (the delegation itself), so a failure here is read, not assumed:
// the detail line says which assertion went red.
//
// ERROR matters most: it means the gate could not evaluate its own evidence — a trace-digest mismatch
// (`regate` compares the saved trace against the hash the run recorded), an unreadable trace, or the
// handoff text being redacted or truncated before the leak check could run. All three are harness
// faults, and `regate` can emit ERROR with an EMPTY assertions array, which is normal for the
// missing-trace case rather than a second defect.
const assertions = c.objective.assertions || [];
if (c.objective.status !== "PASS") {
  for (const as of assertions) if (as.status !== "PASS") console.error("    " + as.status + " " + as.kind + ": " + as.detail);
  if (c.judge_reason) console.error("    judge_reason: " + c.judge_reason);
  die("objective " + c.objective.status);
}
// `status` is derived as worst-of-assertions, so a rewriter that recomputes it wrongly would show up
// here and nowhere else — a PASS standing over a failed assertion is the shape to catch.
const bad = assertions.filter((as) => as.status !== "PASS");
if (bad.length) die("objective says PASS but carries " + bad.length + " non-PASS assertion(s): " + JSON.stringify(bad));
console.log("  objective: PASS · " + assertions.length + " assertion(s): " + assertions.map((as) => as.kind).join(", "));
' "$RUN_DIR" || fail "objective assertions failed"

say "3 · grade --auto-rejudge (SPENDS judge tokens) — exercises the live judge loop"
$CLI grade "$RUN_DIR" --auto-rejudge || fail "grade failed"

say "4 · assert adjudication actually ran"
node -e '
const fs = require("fs"), path = require("path");
const yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[1], "results.yaml"), "utf8"));
const die = (m) => { console.error("FAIL: " + m); process.exit(1); };
const c = (r.scenarios || [])[0];
if (!c) die("results.yaml records no scenarios");
if (!c.adjudication) die("no adjudication recorded — the trigger did not fire");
const a = c.adjudication;
if (!Array.isArray(a.judgments)) die("adjudication recorded no judgments array");
if (a.judgments.length < 2) die("only " + a.judgments.length + " judgment(s): no second opinion was taken");
// Gated, not noted. The header states this trigger is guaranteed by construction — one scenario,
// min_pass == total, so the single cell is always ship_deciding — which makes a different trigger a
// claim about the harness, not a curiosity.
if (a.trigger !== "ship_deciding") die("triggered on " + a.trigger + ", not ship_deciding — the guarantee stated in this script header (one scenario, min_pass == total) no longer holds");
console.log("  state: " + a.state + " · trigger: " + a.trigger + " · " + a.judgments.length + " judgments");
for (const j of a.judgments) console.log("    #" + j.ordinal + " " + j.judge.provider + ":" + j.judge.model + " " + j.verdict + (j.suspect ? " (misfired)" : ""));
if (a.state === "unresolved" && !c.suspect) die("unresolved must set suspect:true — that is what blocks SHIP");
// The objective was already gated in step 2b. What step 4 adds is the CARRY invariant: `grade` must
// hand the field through untouched. It really did drop it once — found by a real run while 1,036 tests
// passed — and since `grade` does not re-evaluate trace gates, any change across step 3 is a rewriter
// mangling evidence rather than a new verdict. "Survived the re-grade" was the old wording here and it
// was wrong: nothing re-grades it.
if (!c.objective) die("`grade` dropped `objective` from results.yaml — the field `run` wrote is gone");
if (c.objective.status !== "PASS") die("`objective` changed to " + c.objective.status + " across `grade`, which carries trace gates rather than re-evaluating them — a rewriter mangled it");
console.log("  objective: PASS, carried intact across the re-grade ✓");
' "$RUN_DIR" || fail "adjudication assertions failed"

say "DONE — all three real-pi paths exercised"
echo "Artifacts left in $RUN_DIR (transcripts and traces are gitignored)."
echo "This run is NOT a benchmark: one draw on a cheap model, not a measurement."
