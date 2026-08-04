#!/usr/bin/env bash
# Record demo.sh to assets/demo.gif, headless — no display, no screen capture, no
# interactive terminal. Rebuilds the README's GIF from scratch in about a minute.
#
#   ./assets/demo/record.sh                      # -> assets/demo.gif
#   SKILLS=/path/to/skills ./assets/demo/record.sh
#
# Pipeline:
#   script(1)  runs demo.sh under a real pty and logs output + real inter-write delays
#   script2cast.mjs  converts that pair into an asciicast v2 file
#   agg        renders the cast to GIF
#
# Nothing about the timing is synthesised: the delays are what the commands
# actually took, which is why the recording needs a pty rather than a pipe.
#
# agg is fetched as a prebuilt binary rather than built. Building it (or
# asciinema, or vhs) needs a Rust toolchain with `edition2024`; the prebuilt
# release binary sidesteps that entirely.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COLS="${COLS:-110}"
ROWS="${ROWS:-24}"
AGG_VERSION="${AGG_VERSION:-v1.9.0}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/sh-rec-XXXX")"
trap 'rm -rf "$WORK"' EXIT

# ── agg ──────────────────────────────────────────────────────────────────────
AGG="${AGG:-}"
if [[ -z $AGG ]]; then
  if command -v agg >/dev/null; then
    AGG=agg
  else
    AGG="$WORK/agg"
    echo "fetching agg $AGG_VERSION (prebuilt; no Rust toolchain needed)…" >&2
    # musl build: no glibc version coupling, so it runs on anything x86_64-linux.
    curl -fsSL -o "$AGG" \
      "https://github.com/asciinema/agg/releases/download/$AGG_VERSION/agg-x86_64-unknown-linux-musl"
    chmod +x "$AGG"
  fi
fi

# ── record ───────────────────────────────────────────────────────────────────
# stty inside the pty rather than COLUMNS/LINES: the programs ask the tty, and a
# non-interactive parent would otherwise leave it at 80x24 and wrap the output
# differently than the cast header claims.
#
# `sleep && printf '\033[?25l'` is what holds the final frame: script's timing log
# records writes, so a silent sleep adds no time to the cast. The escape hides the
# cursor, which also stops it blinking over the last frame.
echo "recording demo.sh at ${COLS}x${ROWS}…" >&2
script --logging-format classic \
  --log-timing "$WORK/timing.log" --log-out "$WORK/out.log" -q \
  -c "stty cols $COLS rows $ROWS; $ROOT/assets/demo/demo.sh; sleep 2.6; printf '\033[?25l'" \
  </dev/null >/dev/null

node "$ROOT/assets/demo/script2cast.mjs" \
  "$WORK/timing.log" "$WORK/out.log" "$WORK/demo.cast" "$COLS" "$ROWS"

"$AGG" --font-size 16 --theme asciinema --idle-time-limit 1.5 \
  "$WORK/demo.cast" "$ROOT/assets/demo.gif" 2>/dev/null

echo "wrote $ROOT/assets/demo.gif ($(du -h "$ROOT/assets/demo.gif" | cut -f1))" >&2
