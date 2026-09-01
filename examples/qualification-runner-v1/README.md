# qualification-runner-v1 inert example

This example exercises the durable runner with a local fake executable. It opens no
network connection and invokes no model. Its fake repositories, fake model names,
all-repeated digests, and `counts_as_measurement: false` make it unsuitable for a
qualification packet or measurement identity.

Generate an external, schema-valid test configuration and request:

```bash
OUT="$(mktemp -d)"
node examples/qualification-runner-v1/make-example.mjs "$OUT"
export PI_CODING_AGENT_DIR="$OUT/oauth-agent"
node bin/skill-harness.js qualification prepare \
  --spool "$OUT/spool" --config "$OUT/configuration.json" --request "$OUT/request.json"
node bin/skill-harness.js qualification start --spool "$OUT/spool" --id inert-calibration-1
node bin/skill-harness.js qualification poll \
  --spool "$OUT/spool" --id inert-calibration-1 --wait-ms 10000
node bin/skill-harness.js qualification validate --spool "$OUT/spool"
```

`status` is read-only. `poll` observes the same invocation and never starts another
process. `abort --reason <bounded-id>` writes a durable abort request and terminates
the recorded process group when it is still the same process occurrence.

Production configurations use `mode: production`, exact `openai-codex` provider
names, `chatgpt-oauth`, real commit/tree/package digests, and source-built executable
digests. Do not turn this fixture into one by replacing a few strings: packet pins and
private stimuli belong to the external qualification coordinator. The generated
configuration explicitly selects `qualification-oauth-directory-policy-v2`; its
`oauth-agent/` contains inert test metadata, not a usable credential.
