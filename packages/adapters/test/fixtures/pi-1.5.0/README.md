# Pi 1.5.0 transport qualification

Native published Pi 1.5.0 captures, recorded 2026-11-04 on Linux/WSL with Node
24.19.0. The exact native matrix passed before the candidate qualification
allowlist changed. The supported adapter then repeated the matrix, two-turn
resume and clean/mixed CLI grading controls. Pi 1.4 captures remain unchanged.

The matrix covers red/green/force delivery, successful/missing reads, denied
write and MCP names, selected/filtered extension tools, provider-error and
output-length finals. Added Pi1.5 JSON Schema controls verify numeric-string
and single-value array coercion, plus rejection before execution of invalid
arguments. Native tooling uses the published bundled CLI.

All model replies are scripted controls through one loopback HTTP endpoint.
Empty HOME/config and the retained network guard exclude ambient credentials
and extensions. This is not OS containment, real model quality, subscription
authentication or autonomous skill selection. No real provider was called.

`provenance.json` binds package identities, capture sources and retained outputs.
Reproduce with new output paths after building this checkout:

```sh
node packages/adapters/test/fixtures/pi-1.5.0/capture.mjs PI_PREFIX HARNESS NEW_NATIVE native
node packages/adapters/test/fixtures/pi-1.5.0/capture.mjs PI_PREFIX HARNESS NEW_ADAPTER adapter
```

Other versions remain unqualified until separately measured. Native errors and
missing-settlement synthetic controls retain their distinct provenance.
