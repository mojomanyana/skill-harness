# Validation index

Current reproducible CI checks for `skill-harness` targeting Pi >= 1.6.1 and
`pi-daddy` `record-v1` (`1.1.3`).

## Public, inspectable checks

| Check | Identity and location | What it establishes | Limits |
| --- | --- | --- | --- |
| Pi 1.6.1 scripted transport | `scripts/pi-qualification/capture.mjs` in [CI workflow](../.github/workflows/ci.yml) | Official Pi 1.6.1 CLI and Harness adapter: red/green/force delivery, successful/error/filtered tools, schema coercion, grading, multi-turn resume and observed process settlement | Scripted local replies, synthetic credentials; no real-provider authentication, autonomous skill selection or model quality |
| `pi-daddy` record-v1 contract | `contracts/pi-daddy/ledger-record/v1/PINNED.json` & `scripts/vendor-pi-daddy-record-v1-contract.mjs` | Byte-exact record-v1 envelope and governance-event schema conformance against pinned `pi-daddy@1.1.3` | Contract shape and integrity checks only; not runtime governance qualification |
| Build, unit & bundle tests | `npm run build`, `npm test`, `npm run check:ext`, `npm run typecheck`, `npm run smoke:packed` | Core engine, Pi adapter, CLI, Pi extension bundle freshness, and packed npm archive smoke checks | Does not spend live model tokens |
| Dogfood lint | `dogfood-lint` in [CI workflow](../.github/workflows/ci.yml) | Composite action lint against golden fixtures and real-pi smoke specs | Structural spec lint only |
