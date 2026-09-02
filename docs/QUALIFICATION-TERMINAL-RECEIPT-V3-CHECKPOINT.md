# Qualification terminal receipt v3 implementation checkpoint

Status: implementation in progress on `feature/qualification-terminal-receipt-v3`.

Authority: repair the qualification runner so a prospectively selected
`qualification-terminal-receipt-v3` binds the exact governed invocation-input bytes.
Historical v1/v2 receipt semantics and default selection remain unchanged.

Required v3 input binding:

- schema: `qualification-invocation-input-binding-v1`
- content type: `application/json`
- exact positive byte count
- SHA-256 over the exact stored bytes

Implementation order:

1. Add prospective receipt-version selection to the closed configuration contract.
2. Persist the prepared exact-byte binding with the governed `input.bin`.
3. Reopen without following links and verify occurrence, mode, ownership, size, and
   digest before launch claim and immediately before child creation.
4. Carry the verified binding through launch evidence into the exact durable v3
   terminal receipt.
5. Validate v3 without reinterpreting v1/v2 receipts.
6. Add non-vacuous lifecycle, mutation, compatibility, packaging, and installed-artifact tests.

No model or qualification calls are part of this product repair.
