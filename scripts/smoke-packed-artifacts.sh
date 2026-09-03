#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/skill-harness-packed-smoke-XXXXXX")
trap 'rm -rf "$WORK"' EXIT
ARTIFACTS="$WORK/artifacts"
PREFIX="$WORK/install"
EXAMPLE="$WORK/qualification"
VERSION=$(node -p "require('$ROOT/package.json').version")

cd "$ROOT"
npm run release:pack -- --output "$ARTIFACTS"
npm install --prefix "$PREFIX" --no-package-lock --ignore-scripts \
  "$ARTIFACTS/skill-harness-core-${VERSION}.tgz" \
  "$ARTIFACTS/skill-harness-adapters-${VERSION}.tgz" \
  "$ARTIFACTS/skill-harness-cli-${VERSION}.tgz" \
  "$ARTIFACTS/skill-harness-${VERSION}.tgz"

CLI="$PREFIX/node_modules/.bin/skill-harness"
"$CLI" --version
"$CLI" mutation-test
"$CLI" lint principal-v3-pack --skills "$ROOT/examples"
node "$ROOT/examples/qualification-runner-v1/make-example.mjs" "$EXAMPLE"
PI_CODING_AGENT_DIR="$EXAMPLE/oauth-agent" "$CLI" qualification prepare \
  --spool "$EXAMPLE/spool" --config "$EXAMPLE/configuration.json" --request "$EXAMPLE/request.json"
PI_CODING_AGENT_DIR="$EXAMPLE/oauth-agent" "$CLI" qualification validate --spool "$EXAMPLE/spool"
echo "packed-artifact smoke passed (four installed tarballs; no model or judge calls)"
