# Shared archive access and operational consent

`createArchiveAccess(directory, policy, permissions)` and `openArchiveAccess(directory)` add an opt-in durable read policy across investigation, fact, Principal payload/lifecycle and reviewed-export paths. This is broader than the earlier exporter-only lease. It is **not** physical erasure, authentication, protection from a malicious same-UID operator, or a replacement meaning for old archive APIs.

## Policy and consent

A policy fixes archive root, ID, expiry, purposes, maximum calls and returned-byte budget. Exact policy-digest permission precedes creation. Archive-local registration binds that policy ID to one directory and exact input: renaming/copying an owner cannot refill it, and changing its expiry requires a distinct explicitly approved policy, not a silent overwrite.

`previewConsent({manifestId,purpose,expiresAt})` gives the exact consent digest. `consent(grant,[digest],now)` requires that permission, a declared purpose, and expiry no later than policy expiry. Consent is specific to actual manifest identity and purpose. Ambiguous overlapping active grants refuse rather than choosing one. `previewRevocation(id)` / `revoke(id,[digest],now)` records irreversible revocation of that grant. The old grant cannot be revived by replaying approval. New consent is a separately approved record.

All access operations keep a durable clock floor, including expiry denials; reopen cannot rewind it. Reads reserve a call and byte ceiling before fetching bytes. Pending claims retain their reservation; there is no automatic retry/refill. Settled byte accounting counts returned bytes, not OS read bandwidth. CAS prevents competing owners from overspending; expiry/revocation/consent and byte limits are checked at the governed call boundary. There is no hard deadline guarantee for a blocked filesystem syscall. Authentic time/consent and trustworthy storage are host responsibilities, not facts inferred from strings or digests.

## Actual consumers and legacy boundary

- `createArchiveReadCapability` accepts optional `access:{directory,purpose}`. Existing local call/duration/representation limits remain, and reconstructing that wrapper cannot reset the shared policy budget.
- `createPrincipalPayloadPort` accepts an optional governed route. Retain does not grant read permission. The replay's explicit fixture host maps its already scoped output permission to the newly retained manifest before readback; other callers must supply their own genuine consent.
- `ReviewedExportPolicy.access` uses the shared policy for both preview and export reads, in addition to the exporter's exact preview approval and its own expiry. Source paths and unrecognized private data still require actual review/redaction; no exhaustive privacy claim is made.
- `readFixedOrderFacts` consumes only an exact, consented `factory-order-readback` source matching independently supplied producer/scope/obligation pins. Actual exhaustion produces failure facts; absent checkpoint times, acceptance, human presence and unknown node states are not invented. It is a specific operational adapter, not a universal fact oracle.

The replay now uses one owner per domain for all four purposes, and the dashboard's facts come through that consented adapter before the original producer policy/checkpoint path. It invokes actual6212b9 original-child cancellation and goal/obligation successor application: a real fixed Node child is cancelled through its retained original port, its original caller settles, duplicates do not abort again, and actual append-only successor selection leaves scope and old source prefix intact without carrying acceptance. This is a fixture transport, not live Pi/model/TUI qualification. Source6212b9 is a local candidate until separately published; the pin does not assert remote availability.

**Old APIs remain explicit:** raw `readArchiveSource`, an unconfigured read capability, old payload ports/exporters and the pinned producer's legacy reads keep their old semantics. Their existence is tested after policy expiry: bytes remain available to the trusted operator. Governed routes do not claim to revoke every possible filesystem/raw-reader path. No campaign, archive, native ledger, transcript or old export is deleted. Broader mandatory storage-service enforcement/erasure would require a separately authorized boundary, not a fabricated tombstone.

## Existing CLI

`archive access --state /absolute/private/owner --request request.json` uses the existing bounded operator envelope `{operation,input,authority}`. Supported operations: `create`, `inspect`, `preview-consent`, `consent`, `preview-revocation`, `revoke`, `facts`. Consent/revoke inputs include `now`; `facts` includes `manifestId`, fixed `purpose`, independent `expected` source/scope pins and `now`. No raw-read or automatic export command is exposed here. An inert worker cannot invoke this CLI. These operator permissions are not authenticated human approvals by themselves.

Original overall CHANGES-REQUESTED and live qualification limits remain unchanged.
