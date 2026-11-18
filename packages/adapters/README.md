# @skill-harness/adapters

Harness adapters for [skill-harness](https://github.com/mojomanyana/skill-harness):
the Pi subject/judge runner, the frozen pi-daddy 0.17/v2
normalizer, and the separately pinned production ledger-v3 normalizer.

Fresh subject execution supports exact **Pi 1.0.4, 1.1.0, 1.4.0, 1.5.0 and 1.5.2**,
plus later patches of the newest qualified release in each minor, recorded as patches.
A subject whose cwd/PATH selects a different Pi than the recorded run version is refused
before spawn. Judges require an exactly qualified release until their own patch provenance
is retained. Other or unavailable versions produce execution ERROR. Retained results
remain readable; the historical Pi 0.83.0 parser is not current qualification.

Internal — use the `skill-harness` CLI. See the repo for docs.

ESM, Node ≥ 20.
