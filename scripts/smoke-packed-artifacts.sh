#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/skill-harness-packed-smoke-XXXXXX")
trap 'rm -rf "$WORK"' EXIT
ARTIFACTS="$WORK/artifacts"
PREFIX="$WORK/install"
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
"$CLI" lint delivery-smoke --skills "$ROOT/scripts/smoke/skills"
echo "packed-artifact smoke passed (four installed tarballs; no model or judge calls)"
