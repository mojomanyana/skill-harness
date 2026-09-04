# Pinned pi-daddy ledger-v3 consumer contract

This directory pins the production `ledgerVersion: 3` contract from:

```text
repository  mojomanyana/pi-daddy
commit      4a9524394ca995fd74ed9bbb836dc4e73cda3b8c
tree        7c006bff213142634f0f911ba9bd6add363ecaae
version     0.21.1
```

This pinned commit is reachable from pi-daddy's merged `main` at merge commit
`62e9d027514e9fc6d689d505d7ef733a07f1470c`. Both commits resolve to tree
`7c006bff213142634f0f911ba9bd6add363ecaae`, and their full diff is empty.

`PINNED.json` maps every byte-vendored artifact to its producer path and SHA-256.
`pi-daddy-README.md` is the producer's contract text. Positive fixtures are not
hand-authored here: pi-daddy commits them from
`packages/pi-daddy/scripts/generate-ledger-v3-contract.ts`, which drives its production
`buildRecord`, lifecycle, lease, receipt, and workflow-fact builders. The real-builder
verifier independently rebuilds that producer and reproduces the fixtures.

Deterministic checks, after dependencies are installed:

```bash
node scripts/vendor-pi-daddy-ledger-v3-contract.mjs \
  /clean/pi-daddy 4a9524394ca995fd74ed9bbb836dc4e73cda3b8c --check
npm run build
node scripts/check-pi-daddy-v3-contract.mjs
npm run verify:pi-daddy-v3-contract -- /clean/pi-daddy
```

The generated runtime schema is
`packages/adapters/src/pi-daddy-ledger-v3.ts`; never edit it directly. Re-pinning means
adding an authoritative commit/tree/version to the vendor script and regenerating from
the producer Git object, not copying a dirty working tree.

The source selector is `pi-daddy-ledger-v3`. It accepts only explicit v3 records. The
historical `pi-daddy-v1` selector remains unversioned 0.17 plus frozen ledger v2. An
unknown version or a v2-shaped event stamped v3 fails closed; v3 is never stripped and
reinterpreted as v2.

This is schema/normalization conformance, not producer signer authenticity, remote
attestation, containment, or proof that a workflow behaved correctly.
