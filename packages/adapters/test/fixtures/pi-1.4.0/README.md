# Pi 1.4.0 transport qualification

These are actual Pi 1.4.0 JSON captures against a scripted loopback provider,
recorded on Linux/WSL with Node 24.19.0. `provenance.json` binds the six exact
published Pi packages, capture source and retained artifacts. The native captures
were checked before adding 1.4.0 to the candidate allowlist; the adapter capture
then exercised that candidate. Its package metadata was still 0.32.1 at capture
time. The qualification is included in the Harness 0.32.2 source candidate;
publication is verified separately.

The native matrix covers red, green and force; successful and missing-file reads;
denied write and unavailable MCP calls; explicitly selected extension tools and
the same extension filtered out; actual provider-error and output-length finals.
All runs use an empty HOME/config, synthetic credentials and an explicit tool
profile. An ambient extension that throws if loaded is deliberately excluded.
Green proves description discovery without silently delivering the skill body;
it does not prove autonomous skill selection.

The supported Harness adapter repeats the matrix, resumes two distinct turns,
and runs clean/mixed synthetic specs through the CLI. A failing objective gate
skips judging; a wrong scripted answer reaches the judge and fails; a successful
control ships. Those grades are plumbing controls, not skill or model scores.
The source fixture remains unchanged and all observed child processes exit.

Provider-error, tool-error and length captures are native, not hand-authored
events. Contract-test mutations removing settlement or a tool completion are
explicitly synthetic incomplete-evidence regression controls.

## Reproduce

Install exact `@earendil-works/pi-coding-agent@1.4.0` into an isolated prefix and
build this Harness checkout. With Node >=22.19.0, use unused output paths:

```sh
node packages/adapters/test/fixtures/pi-1.4.0/capture.mjs /path/to/pi-prefix /path/to/harness /path/to/new-native native
node packages/adapters/test/fixtures/pi-1.4.0/capture.mjs /path/to/pi-prefix /path/to/harness /path/to/new-adapter adapter
```

`network-guard.mjs` restricts child network APIs to the scripted loopback
endpoint and retains per-process attempts. This is an application-level fixture
guard, **not OS containment**. No real provider, user credentials, subscription
authentication, real MCP server, governed Daddy child, price, latency or model
quality is qualified here. Other Pi versions remain refused unless separately
qualified. Existing 1.0.4/1.1.0 records and the legacy 0.83.0 parser are unchanged.
