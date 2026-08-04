#!/usr/bin/env bash
# A one-take ~30s demo of the skill-harness loop, for screen recording.
#
# Costs nothing and needs no provider credentials: every command here is one of
# the free/offline ones (`list`, `lint`, `rescore`), and the grade movement at the
# end comes from runs that are already committed rather than from a fresh run.
#
#   ./assets/demo/demo.sh                     # 1.2s beat between steps
#   DEMO_DELAY=0 ./assets/demo/demo.sh        # no pauses (for testing)
#   SKILLS=/path/to/skills ./assets/demo/demo.sh
#
# Requires `skill-harness` on PATH (npm i -g skill-harness) and a skills repo to
# point at. Defaults to a sibling checkout of principal-pi-skills, which it only
# ever reads — the failing-lint step operates on a throwaway copy under $TMPDIR.
set -uo pipefail

SKILLS="${SKILLS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/../principal-pi-skills}"
DELAY="${DEMO_DELAY:-1.2}"
HARNESS="${HARNESS:-skill-harness}"

if [[ ! -d $SKILLS ]]; then
  echo "no skills repo at $SKILLS — set SKILLS=/path/to/skills" >&2
  exit 1
fi
if ! command -v "$HARNESS" >/dev/null; then
  echo "$HARNESS not on PATH — npm i -g skill-harness, or set HARNESS=./node_modules/.bin/skill-harness" >&2
  exit 1
fi

SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT

beat() { [[ $DELAY == 0 ]] || sleep "$DELAY"; }

# Echo the command the way a person would type it, then run it. stdin is closed
# from /dev/null throughout: `pi` hangs waiting on a tty otherwise, and while
# none of these three commands invoke pi, the habit belongs in anything copied
# from here.
say() { printf '\n\033[1;32m$\033[0m %s\n' "$*"; beat; }

# ── 1. what is even testable here? ───────────────────────────────────────────
say "skill-harness list --skills ."
"$HARNESS" list --skills "$SKILLS" </dev/null
beat

# ── 2. the free offline gate: green, then a one-character typo ───────────────
say "skill-harness lint all --skills .        # free, offline, no models"
"$HARNESS" lint all --skills "$SKILLS" </dev/null
beat

cp -r "$SKILLS/git-ops" "$SCRATCH/"
mkdir -p "$SCRATCH/skills"
mv "$SCRATCH/git-ops" "$SCRATCH/skills/git-ops"
FIX="$SCRATCH/skills/git-ops/tests/fixtures/A9"
mv "$FIX/_uncommitted" "$FIX/_uncommited"

say "mv fixtures/A9/_uncommitted fixtures/A9/_uncommited   # drop one 't'"
beat
say "skill-harness lint all --skills ."
"$HARNESS" lint all --skills "$SCRATCH/skills" </dev/null
echo "                                          exit status: $?"
beat

# ── 3. the grade, from runs already on disk ─────────────────────────────────
GITOPS_RUNS="$SKILLS/git-ops/tests/results/pi-fireworks-accounts-fireworks-models-deepseek-v4-pro"
BEFORE="$GITOPS_RUNS/2026-08-03T15-55-57-859Z"
AFTER="$GITOPS_RUNS/2026-08-04T15-14-56-904Z"

if [[ -d $BEFORE && -d $AFTER ]]; then
  say "skill-harness rescore <run-before-the-A9-fix>   # no models, saved reps"
  "$HARNESS" rescore "$BEFORE" </dev/null
  beat
  say "skill-harness rescore <run-after-the-A9-fix>"
  "$HARNESS" rescore "$AFTER" </dev/null
  beat
else
  echo "(skipping the rescore beat — those two git-ops runs aren't in $SKILLS)" >&2
fi

printf '\n\033[1;36m  skill-harness — the TDD loop for Agent Skills\033[0m\n\n'
