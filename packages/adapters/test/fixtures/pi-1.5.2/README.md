# Pi 1.5.2 transport qualification

Captured on Linux/WSL using Node 24.19.0 on November 10, 2026. The official Pi
release and its five sibling package integrity hashes are in `provenance.json`.
The native stage ran on the published CLI before the Harness allowlist changed.

| Stage | Coverage | Scripted requests |
| --- | --- | ---: |
| Native Pi | Twelve cases across baseline, skill discovery, forced instructions, successful, missing and filtered tools, schema coercion, invalid arguments, length and provider errors | 22 |
| Harness | The same twelve, a real two-turn session resume, plus a passing and a deliberately failing grading run | 36 |

The mixed grading run rejected both an incorrect answer and a missing required
tool call. It skipped the judge for the missing tool. The unit suite also removes
settlement events from the captured stream to verify incomplete traces fail closed.
All observed processes exited and the input file remained byte-identical.

The CLI ran with an empty home, synthetic credentials, cache warming disabled
and a local scripted provider. An application-level network guard restricted
its observed connections to that endpoint. This measures transport and grading
behavior. It does not measure provider authentication, real-model quality, or
automatic skill selection. JEV was not used.

To reproduce after building Harness, pass a separate npm prefix containing
`@earendil-works/pi-coding-agent@1.5.2`, this checkout, and a **new** output
directory for each stage:

```sh
node scripts/pi-qualification/capture.mjs 1.5.2 PI_PREFIX HARNESS NEW_NATIVE native
node scripts/pi-qualification/capture.mjs 1.5.2 PI_PREFIX HARNESS NEW_ADAPTER adapter
```
