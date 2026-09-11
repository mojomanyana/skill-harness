# Factory transport and ownership decision

Status: 2026-09-11 continuation decision; no rewrite approved.

## Decision

**Keep the existing Codex producer transport for the currently qualified paths, and simplify only after an exact same-requirements replacement passes.** Pi's installed `AgentSession` route is already used to prove extension hooks, isolated role/session identity and effective context. It does not by itself replace the producer path's original whole-schedule reservations, OAuth-only credential snapshot, fixed ChatGPT endpoint, no fallback/retry, bounded SSE validation, per-attempt accounting, cancellation ownership and acknowledged settlement.

A replacement experiment must satisfy that list on the same request profile before code is removed. Line count or provider convenience is not evidence. Conversely, attestation/accounting layers must not be duplicated in new variant/order controllers; they should call the existing owner/permit/transport ports.

## Responsibility map

- pi-daddy: deterministic dispatch/grants, resource owner, ordinary/experiment cancellation, work ledger, Herdr host/action UI.
- skill-harness: archive bytes/checkpoints, signal/case derivation, model retro, comparison/judging, adoption evidence.
- Principal: domain workflow and assurance presentation; no factory-specific core vocabulary.
- Herdr: terminal placement/visibility only; no acceptance or model accounting.

Two comparison families remain intentional: fixed digest experiments qualify deterministic controller semantics; model/effort intervention runs measure model outputs. They must share resource ownership and display projections, not collapse their meanings.

## Portability findings

Current producer CI runs Node 22.19 and 24 on supported GitHub Linux and is green on the repaired heads; no current workflow uses the earlier reported Ubuntu 26.04 preview label. Bubblewrap remains a declared prerequisite only for the digest profile. Environment limitations stay separate from code defects.

Follow-up: prototype Pi-native transport behind the existing ports, compare guarantees and failure receipts, then decide removal. No broad rewrite is authorized by this record.
