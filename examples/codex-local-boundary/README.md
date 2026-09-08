# Local Codex boundary conformance

Build using existing dependencies, then run `node examples/codex-local-boundary/probe.mjs /absolute/new/evidence-directory` on an already provisioned Linux host. The command creates private evidence and refuses an existing destination. It makes **zero provider calls** and does not install anything.

Unlike the portable unit tests, this explicitly invokes installed bubblewrap/prlimit and a fixed Node child. It connects that child frame to actual host-owned request-file writes, synthetic output, objective gating, opaque judge inputs, split-only tie-break and durable panel readback. Missing namespace/runtime prerequisites fail; nothing is silently skipped.

This is not a model-effect qualification or an actual SDK HTTP/SSE exchange. All model IDs/policy lineages/votes in the proof are fixture declarations; no real credentials or signing authority are loaded. See [the boundary and remaining blockers](../../docs/CODEX-LOCAL-BOUNDARY.md).
