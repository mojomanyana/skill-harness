#!/usr/bin/env bash
#
# Real-pi release smoke. SPENDS TOKENS; never run in CI.
#
# Schema-v3 delivery provenance deliberately fails closed when arbitrary subject
# extensions share Pi's process. One run therefore cannot truthfully prove both
# extension argv wiring and authenticated prompt delivery. This script uses two:
#
#   1. extension probe: structured JSONL + declared extension, expected delivery
#      ERROR and zero judge calls;
#   2. delivery probe: extension-free authenticated observation + live initial,
#      re-grade, and adjudication judge calls.
#
# Cost ceiling: two Pi subject invocations, each with one blank-response retry
# available, plus up to three ChatGPT-subscription judge calls on the delivery
# probe. A Pi invocation may contain several provider calls in its agentic loop.
set -euo pipefail

cd "$(dirname "$0")/.."

SKILLS="scripts/smoke/skills"
EXTENSION_SKILL="trace-smoke"
DELIVERY_SKILL="delivery-smoke"
MODEL="${SMOKE_MODEL:-openai-codex:gpt-5.6-luna}"
JUDGE="${SMOKE_JUDGE:-openai-codex:gpt-5.6-sol}"
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
for skill in "$EXTENSION_SKILL" "$DELIVERY_SKILL"; do
  $CLI coverage "$skill" --skills "$SKILLS"
done

# Run one smoke skill and bind RUN_DIR to the directory made by this invocation.
run_smoke() {
  local skill="$1" label="$2" stamp="$TMP/$skill.stamp" results status=0
  : > "$stamp"
  touch -d '1 second ago' "$stamp"
  $CLI run "$skill" --skills "$SKILLS" --model "$MODEL" --judge "$JUDGE" --mode force --label "$label" || status=$?
  [ "$status" -lt 128 ] || fail "$skill run was killed by signal (exit $status)"
  [ "$status" -eq 0 ] || echo "note: $skill run exited $status; artifact assertions decide this smoke"

  results="$SKILLS/$skill/tests/results"
  [ -d "$results" ] || fail "$skill wrote no results tree"
  RUN_DIR=$(find "$results" -maxdepth 2 -mindepth 2 -type d -newer "$stamp" |
    awk -F/ '{ print $NF "\t" $0 }' | sort | tail -1 | cut -f2-)
  [ -n "$RUN_DIR" ] || fail "$skill produced no new run directory"
  [ -f "$RUN_DIR/results.yaml" ] || fail "$RUN_DIR has no results.yaml"
  local recorded
  recorded=$(sed -n 's/^model: *//p;/^model:/q' "$RUN_DIR/results.yaml" | tr -d "\"")
  [ "$recorded" = "$MODEL" ] || fail "$RUN_DIR records model $recorded, expected $MODEL"
  echo "run dir: $RUN_DIR"
}

say "1 · extension probe (SPENDS subject tokens)"
run_smoke "$EXTENSION_SKILL" smoke-extension
EXTENSION_RUN="$RUN_DIR"

say "1a · assert structured stream and extension argv"
TRACE=$(find "$EXTENSION_RUN" -name '*.trace.jsonl' -print -quit)
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

say "1b · assert extension provenance fails closed before judging"
node - "$EXTENSION_RUN" <<'NODE' || fail "extension delivery assertions failed"
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[2], "results.yaml"), "utf8"));
const c = r.scenarios?.[0];
const die = m => { console.error("FAIL: " + m); process.exit(1); };
if (!c) die("no scenario result");
const delivered = c.objective?.assertions?.find(a => a.kind === "skill_delivered");
if (delivered?.status !== "ERROR") die(`skill_delivered=${delivered?.status}, expected ERROR`);
const prompts = (r.subject_invocations || []).map(i => i.prompt);
if (!prompts.length || prompts.some(p => p.status !== "ERROR")) die("extension observations were not all ERROR");
if (!prompts.every(p => /unauthenticated.*extensions|extensions.*unauthenticated/i.test(p.error || ""))) die("ERROR does not name the extension trust boundary");
if ((c.metrics?.judge_calls || 0) !== 0) die(`judge_calls=${c.metrics?.judge_calls}, expected 0`);
if (c.rep_judgments?.some(p => p.judgments?.length)) die("extension probe retained a judge vote");
console.log("  expected unauthenticated extension delivery ERROR · judge calls 0");
NODE

say "2 · authenticated delivery probe (SPENDS subject + judge tokens)"
run_smoke "$DELIVERY_SKILL" smoke-delivery
DELIVERY_RUN="$RUN_DIR"

say "2a · assert extension-free prompt delivery"
node - "$DELIVERY_RUN" <<'NODE' || fail "authenticated delivery assertions failed"
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[2], "results.yaml"), "utf8"));
const c = r.scenarios?.[0];
const die = m => { console.error("FAIL: " + m); process.exit(1); };
if (!c) die("no scenario result");
const delivered = c.objective?.assertions?.find(a => a.kind === "skill_delivered");
if (delivered?.status !== "PASS") die(`skill_delivered=${delivered?.status}, expected PASS`);
const prompts = (r.subject_invocations || []).map(i => i.prompt);
if (!prompts.length || prompts.some(p => p.status !== "PASS")) die("not every authenticated observation is PASS");
if (!prompts.every(p => p.contract_occurrences === 1 && p.raw_sha256 && p.normalized_sha256)) die("prompt digest/occurrence evidence incomplete");
if ((c.metrics?.judge_calls || 0) < 1) die("initial judge call was not recorded");
console.log(`  authenticated delivery: PASS · ${prompts.length} provider request(s)`);
NODE

say "3 · grade --auto-rejudge (SPENDS judge tokens)"
$CLI grade "$DELIVERY_RUN" --judge "$JUDGE" --auto-rejudge || fail "grade failed"

say "4 · assert live adjudication and evidence carry"
node - "$DELIVERY_RUN" <<'NODE' || fail "adjudication assertions failed"
const fs = require("fs"), path = require("path"), yaml = require("js-yaml");
const r = yaml.load(fs.readFileSync(path.join(process.argv[2], "results.yaml"), "utf8"));
const c = r.scenarios?.[0], a = c?.adjudication;
const die = m => { console.error("FAIL: " + m); process.exit(1); };
if (!a || !Array.isArray(a.judgments) || a.judgments.length < 2) die("no live second-opinion adjudication recorded");
const delivered = c.objective?.assertions?.find(x => x.kind === "skill_delivered");
if (delivered?.status !== "PASS") die("grade dropped or changed authenticated delivery evidence");
if (!a.judgments.every(j => Array.isArray(j.criteria) && j.criteria.length === c.criterion_count)) die("adjudication criterion evidence incomplete");
console.log(`  ${a.state} · ${a.trigger} · ${a.judgments.length} judgments · delivery carried PASS`);
NODE

say "DONE — real structured, extension, authenticated-delivery, and judge paths exercised"
echo "Extension artifact: $EXTENSION_RUN"
echo "Delivery artifact:  $DELIVERY_RUN"
echo "These are smoke draws, not efficacy measurements."
