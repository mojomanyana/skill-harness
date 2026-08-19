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
# Cost: 1 subject call on a cheap Fireworks model, plus 3 judge calls on the
# Claude subscription — one in `run`, one in `grade`'s re-judge, and one for
# adjudication's secondary opinion. Measured well under a cent of subject spend.
# Counted rather than estimated: this file asserts that spend is never implicit,
# so its own disclosure has to be right.
#
set -euo pipefail

cd "$(dirname "$0")/.."

SKILLS="scripts/smoke/skills"
SKILL="trace-smoke"
# DATED pin, not the bare alias. `deepseek-v4-flash` was retired at the provider — Fireworks answers
# `404 Model not found, inaccessible, and/or not deployed`, pi reports an empty response, and the harness
# records `R1 ERROR: model produced no response after a retry (harness timeout?) — infra, not skill
# behavior`. Which is accurate and reads exactly like a harness bug, so the pre-publish gate had been red
# since 2026-08-08 for a reason that has nothing to do with the code under test.
#
# A dated id cannot be retired out from under this script the way a floating alias can. When it is
# eventually withdrawn the failure is at least honest: the run stops before spending anything, rather
# than after. `SMOKE_MODEL` overrides it; the only requirement is something cheap that can call tools.
MODEL="${SMOKE_MODEL:-fireworks:accounts/fireworks/models/deepseek-v4-flash-0731}"
CLI="node bin/skill-harness.js"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

say "0 · preflight (free, offline)"
command -v pi >/dev/null || fail "pi is not on PATH"
command -v claude >/dev/null || fail "claude is not on PATH (the default judge needs it)"
echo "pi     $(pi --version)"
echo "claude $(claude --version | head -1)"
echo "subject $MODEL"

# Runs BEFORE any spend: lint validates that the declared extension path exists,
# so a repo move fails here for free instead of after tokens are spent on a
# scenario whose subagent tool was silently absent.
$CLI lint all --skills "$SKILLS" || fail "lint found problems — fix before spending"
$CLI coverage "$SKILL" --skills "$SKILLS"

say "1 · run (SPENDS subject tokens) — exercises spawn + streaming + --extension"
$CLI run "$SKILL" --skills "$SKILLS" --model "$MODEL" --mode force --label smoke

# Sort on the TIMESTAMP, not the whole path. `sort | tail -1` over `<model-tag>/<timestamp>` orders by
# model tag first, so the newest run only wins when its tag happens to sort last — and tags are not
# ordered by recency at all. Renaming the model from `deepseek-v4-flash` to `deepseek-v4-flash-0731` was
# enough to break it, because `-` (0x2D) sorts before `/` (0x2F): the fresh run lost to a stale one from
# the retired model, and step 2 then asserted against an artifact the run it had just paid for did not
# produce. A gate that can validate the previous run is worse than no gate.
RUN_DIR=$(find "$SKILLS/$SKILL/tests/results" -maxdepth 2 -mindepth 2 -type d |
  awk -F/ '{ print $NF "\t" $0 }' | sort | tail -1 | cut -f2-)
[ -n "$RUN_DIR" ] || fail "no run dir was produced"
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

// Tri-state since v2: this scenario declares no `unchanged_paths` and has no
// workspace, so the honest value is `null` — "never observed". An empty array
// here would mean the parser had gone back to claiming it looked and saw nothing.
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
// The FIELD is asserted; its VERDICT is not. `grade` really did drop this field
// once, and the only thing that caught it was reading this line on a real run,
// so its absence is a failure — that is a harness defect, a rewriter losing an
// artifact it was handed.
if (!c.objective) die("the scenario declares assert.trace but results.yaml has no `objective` — a rewriter dropped it");

// Reported, not gated. This script says of itself that it is "one draw on a cheap
// model, not a measurement", and gating a release on one draw of a behavioural
// objective makes the release model-dependent by construction: whichever cheap
// model is pinned decides whether the harness may ship. It also fails toward
// noise — the current pin leaks "password" into the `plan` handoff, which is a
// true finding about that model and nothing at all about the code under test.
// The assertions above are the gate, because they are the paths that cannot flake.
if (c.objective.status === "PASS") {
  console.log("  objective: PASS (survived the re-grade ✓)");
} else {
  console.log("  objective: " + c.objective.status + " — ADVISORY, not gated (subject behaviour, not harness):");
  for (const as of c.objective.assertions) if (as.status !== "PASS") console.log("    " + as.status + " " + as.kind + ": " + as.detail);
}
' "$RUN_DIR" || fail "adjudication assertions failed"

say "DONE — all three real-pi paths exercised"
echo "The subject model's own verdict is reported above, not gated: see step 4."
echo "Artifacts left in $RUN_DIR (transcripts and traces are gitignored)."
echo "This run is NOT a benchmark: one draw on a cheap model, not a measurement."
