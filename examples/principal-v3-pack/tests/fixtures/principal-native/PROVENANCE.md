# Principal native fixture provenance

Generated from the read-only sibling checkout at principal-pi-skills commit
`e438a60516ca941c39c74bb3f62a7f2ba2b36f87` (unmerged Wave 1 branch head).

```bash
OUT=examples/principal-v3-pack/tests/fixtures/principal-native
TMP=$(mktemp -d)
SCRIPT=/home/neman/Code/principal-pi-skills/scripts/assurance-state.mjs
mkdir -p "$OUT/assurance"
node "$SCRIPT" init --state-dir "$TMP" --workflow feature \
  --run-id principal-v3-pack-fixture \
  --request 'Fix one typo in a comment. Keep this standard and right-sized.'
node "$SCRIPT" event --state-dir "$TMP" --run-id principal-v3-pack-fixture \
  --json '{"type":"risk_classified","level":"tiny","reason":"tiny reversible documentation correction"}'
cp "$TMP/runs/principal-v3-pack-fixture/events.jsonl" "$OUT/assurance/events.jsonl"
rm -rf "$TMP"
```

`assurance/events.jsonl` SHA-256:
`5297f64e7a1f360e37dcde42cb5682f295fcfd0934ad9c5c70e1eeb9db7fc542`.
The CLI supplied sequence, timestamp, run identity, and digest-chain fields; do not hand-edit it.

The governed-spawn scenario does not use a canned success event: the selected arm writes its
per-repetition ledger directly to `<workspace>/pi-daddy/events.jsonl`, which the
`pi-daddy-ledger-v3` adapter normalizes before V3-16 evaluates `child_started
{attributes.state: "starting"}`. Missing ledger evidence cannot become a pass.

The six seeded agent definitions were copied byte-for-byte from principal-pi-skills
`e438a60516ca941c39c74bb3f62a7f2ba2b36f87` with:

```bash
cp /home/neman/Code/principal-pi-skills/agents/*.md \
  examples/principal-v3-pack/tests/fixtures/agents/
```
