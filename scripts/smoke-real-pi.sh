#!/usr/bin/env bash
#
# Real-pi release smoke. SPENDS TOKENS; never run in CI.
#
# Cost ceiling: one Pi subject invocation with one blank-response retry available,
# plus an initial judge call and one saved-transcript re-grade. A Pi invocation may
# contain several provider calls in its agentic loop.
set -euo pipefail

cd "$(dirname "$0")/.."

SKILLS="scripts/smoke/skills"
SKILL="trace-smoke"
MODEL="${SMOKE_MODEL:-openai-codex:gpt-5.6-sol}"
JUDGE="${SMOKE_JUDGE:-openai-codex:gpt-5.6-terra}"
CLI="node bin/skill-harness.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1" >&2; exit 1; }

say "0 · preflight (free, offline)"
command -v pi >/dev/null || fail "pi is not on PATH"
pi --version >/dev/null 2>&1 || fail "pi is on PATH but not runnable"
echo "pi      $(pi --version)"
case "$JUDGE" in
  claude-code:*)
    command -v claude >/dev/null || fail "claude is not on PATH (the selected judge needs it)"
    claude --version >/dev/null 2>&1 || fail "claude is on PATH but not runnable"
    echo "claude  $(claude --version | head -1)"
    ;;
esac
echo "subject $MODEL"
echo "judge   $JUDGE"

LINT_STATUS=0
LINT_OUT=$($CLI lint all --skills "$SKILLS" 2>&1) || LINT_STATUS=$?
printf '%s\n' "$LINT_OUT"
[ "$LINT_STATUS" -eq 0 ] || fail "lint command failed (exit $LINT_STATUS) — clear stale smoke artifacts or fix findings before spending"
$CLI coverage "$SKILL" --skills "$SKILLS"

STAMP="$TMP/$SKILL.stamp"
: > "$STAMP"
touch -d '1 second ago' "$STAMP"

say "1 · structured extension probe (SPENDS subject + judge tokens)"
STATUS=0
$CLI run "$SKILL" --skills "$SKILLS" --model "$MODEL" --judge "$JUDGE" --mode force --label smoke-extension || STATUS=$?
[ "$STATUS" -lt 128 ] || fail "$SKILL run was killed by signal (exit $STATUS)"
[ "$STATUS" -eq 0 ] || echo "note: $SKILL run exited $STATUS; artifact assertions decide this smoke"

RESULTS="$SKILLS/$SKILL/tests/results"
[ -d "$RESULTS" ] || fail "$SKILL wrote no results tree"
RUN_DIR=$(find "$RESULTS" -maxdepth 2 -mindepth 2 -type d -newer "$STAMP" |
  awk -F/ '{ print $NF "\t" $0 }' | sort | tail -1 | cut -f2-)
[ -n "$RUN_DIR" ] || fail "$SKILL produced no new run directory"
[ -f "$RUN_DIR/results.yaml" ] || fail "$RUN_DIR has no results.yaml"
echo "run dir: $RUN_DIR"

say "1a · assert structured stream and extension argv"
TRACE=$(find "$RUN_DIR" -name '*.trace.jsonl' -print -quit)
[ -n "$TRACE" ] || fail "extension probe produced no trace — structured Pi path did not run"
node - "$TRACE" <<'NODE' || fail "extension trace assertions failed"
const fs = require("fs");
const t = JSON.parse(fs.readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)[0]);
const die = m => { console.error("FAIL: " + m); process.exit(1); };
const EXPECTED = require("./packages/core/dist/capture-trace-types.js").EXECUTION_TRACE_VERSION;
if (t.trace_version !== EXPECTED) die(`trace_version ${t.trace_version}, expected ${EXPECTED}`);
if (!t.pi_version || !t.trace_sha256) die("trace lacks Pi or digest provenance");
if (!t.tool_calls.length) die("no tool calls — subject/model availability failure, not an extension result");
const agent = t.tool_calls.find(c => c.name === "Agent");
if (!agent) die(`declared extension absent; tools were ${t.tool_calls.map(c => c.name).join(", ")}`);
if (agent.args.agent !== "plan") die(`Agent called with ${JSON.stringify(agent.args.agent)}`);
const blob = JSON.stringify(t);
if (/thinking/i.test(blob) || blob.includes("/home/")) die("private prompt/runtime data leaked into trace");
if (t.tool_calls.some(c => c.result && "content" in c.result)) die("tool-result body persisted");
if (t.changed_paths !== null) die(`changed_paths should be unobserved null, got ${JSON.stringify(t.changed_paths)}`);
console.log(`  trace v${t.trace_version} · Pi ${t.pi_version} · tools ${t.tool_calls.map(c => c.name).join(", ")}`);
NODE

say "1b · assert fresh result has no delivery production"
node - "$RUN_DIR" <<'NODE' || fail "fresh-result assertions failed"
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[2], "results.yaml"), "utf8"));
const c = r.scenarios?.[0];
const die = m => { console.error("FAIL: " + m); process.exit(1); };
if (r.schema !== 2) die(`schema=${r.schema}, expected 2`);
if (r.subject_invocations !== undefined) die("fresh result retained subject_invocations");
if (!c) die("no scenario result");
if (c.judge_verdict === "NOT-MEASURED") die("fresh run produced NOT-MEASURED");
if (c.objective?.assertions?.some(a => a.kind === "skill_delivered")) die("fresh run produced skill_delivered evidence");
if ((c.metrics?.judge_calls || 0) < 1) die("initial judge call was not recorded");
console.log("  schema 2 · no delivery observations · judge path exercised");
NODE

say "2 · grade saved transcript (SPENDS judge tokens)"
$CLI grade "$RUN_DIR" --judge "$JUDGE" || fail "grade failed"

say "3 · assert legacy-free rewrite"
node - "$RUN_DIR" <<'NODE' || fail "regrade assertions failed"
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[2], "results.yaml"), "utf8"));
const die = m => { console.error("FAIL: " + m); process.exit(1); };
if (r.schema !== 2 || r.subject_invocations !== undefined) die("grade introduced delivery evidence");
if (r.scenarios?.some(c => c.judge_verdict === "NOT-MEASURED" || c.objective?.assertions?.some(a => a.kind === "skill_delivered"))) die("grade introduced delivery verdict/evidence");
console.log("  grade preserved schema 2 without delivery evidence");
NODE

say "DONE — real structured, extension, and judge paths exercised"
echo "Artifact: $RUN_DIR"
echo "This is a smoke draw, not an efficacy measurement."
