# Actual Principal/archive/dashboard connectors

The replay pins Principal `dda608492cc63a2837b0a06225d82be1f75783af` and producer `f6f10b0f6a9f4a1f5afd44afdb1c22c71edcce4d`. Separate source-clean copies are required; old pins/proofs remain historical evidence. No installation, live model evaluation, deployment or native campaign acceptance is involved.

## Principal payload and lifecycle

`createPrincipalPayloadPort(archiveRoot, archiveId)` implements the actual Principal v1 retain/read port using the existing harness archive. It stores exact binary/empty bytes, binds a manifest to the canonical origin digest, checks archive identity and exact receipt/readback, and enforces a1MiB maximum plus the requested read bound. `readArchiveSource` now optionally accepts a byte ceiling, checked against the verified manifest **before** object reading; existing callers keep the8MiB default. An archive ID is a host declaration, not authentication. The Principal assembler owns source-path permission checks; the archive port never opens caller source paths or grants itself consent.

The replay invokes the actual Principal host assembler with a separately supplied fixture permission for its actual retained-order output. It retains the exported lifecycle, re-reads the native projection using the assembler's exact canonical binding serialization, and consumes the archive readback against that source pin and the producer export digest. Acquisition from a pinned producer and re-read source establishes this fixture's byte boundary, not independent human or deployment authority. An initial noncanonical binding reserialization correctly failed the source pin; that red remains retained.

The new generic lifecycle emits retirement and exact payload receipts. The old association-v3 `generic_retirement:unbound` field is deliberately unchanged; neither namespace retires P01 work or approves a campaign. Failed native check bytes remain failed and retained. Missing payloads are not replaced with assurance receipt text.

## Actual producer dashboard ports

The replay compiles the producer's37 exact public harness1c02194 fixture bodies with the existing TypeScript library, then invokes the actual artifact loader and branded dashboard host. No package lifecycle runs. The loader's empty fixture archive is unused: the host uses the **existing replay archive, trust policy, case batch and blind record**, not duplicate stores.

Actual fixed-order readback supplies scoped exhaustion facts; it does not invent checkpoint times, presence, live model observations or acceptance. A denied observation records the producer's durable denial, not an effect. An independently allowlisted new request ingests the configured facts through the real policy/checkpoint path. Refresh does not mutate the tip; reopen reads the acknowledged state. Presence stays null and attention is not refilled. No socket/TUI deployment or original-controller identity is synthesized.

## Duration-governed reviewed export

`createReviewedArchiveExport` / `openReviewedArchiveExport` require an exact policy permission before creating an export owner. Policy fixes source manifests, a byte bound, explicit literal redactions, destination and expiry. Preview reads actual bounded archive bytes, strictly decodes UTF-8, applies the declared redactions and refuses recognized remaining credential patterns without returning raw content. This is **not exhaustive secret or PII discovery**: unknown sensitive content needs explicit operator review/rules.

A separate permission for the exact preview digest is mandatory before writing. Source/preview drift, a rewound clock, expiry, missing approval, reused claims and non-private destinations fail closed. Export claims precede exclusive writes, file/directory sync and byte readback. Partial effects remain retained and are never automatically retried. Clock observations—including expiry denials—are durable.

Duration is a cooperative access lease on **this export route**, not physical erasure, revocation of already exported bytes, or denial of every other raw archive API. No historical file is deleted. Output is labelled `reviewed-view-not-authority` with original and exported hashes; redacted embedded evidence is not represented as a still-valid native proof. The replay supplies explicit fixture review permission and redacts its real workspace path. That is actual code execution, not authenticated human consent.

Remaining boundaries: authentic host/consent/fact sources; broader fact scheduling and producer revision/cancellation paths assigned to their sole owner; global storage lifetime/erasure and hostile same-UID/OS deadline guarantees; live/installation/model qualification. Original overall CHANGES-REQUESTED is preserved.
