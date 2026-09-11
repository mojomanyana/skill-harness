# Software factory — current delivery state

Updated 2026-09-11. This is the current entry point; dated build reports and ADRs remain historical evidence.

## Identities

| Component | released source / package | merged-main CI | follow-up |
|---|---|---|---|
| skill-harness | merged `1fde8fc2376395fcec67d18bf4ec0926e16ed480` / 0.14.0 candidate | [34590964083](https://github.com/mojomanyana/skill-harness/actions/runs/34590964083) PASS | PR76 merged; release verification in progress |
| pi-daddy | merged `7b06a83851866f47bcf670b16bf7db6c648a72b6` / 0.24.0 candidate | [34589845100](https://github.com/mojomanyana/pi-daddy/actions/runs/34589845100) PASS | PR37→38→39 merged in order |
| principal-pi-skills | merged `b64580809000be56c605d994e1c0799a1af9e503` / 3.2.0 candidate | [34582213603](https://github.com/mojomanyana/principal-pi-skills/actions/runs/34582213603) PASS | PR41 merged; release verification in progress |

Released, merged source, candidate package, installed package and loaded-session identity are separate facts. Published baselines remain skill-harness 0.13.0, pi-daddy 0.23.0 and Principal 3.1.0 until registry verification completes. The merged candidates above are not yet released identities.

## Six user capabilities

1. **Declare and track work — ready to try; source-live validated.** PR37 provides `pi-daddy work add` and ordinary attempt joins. One Sol child produced a visible attached attempt. Acceptance and archive coverage remained unresolved.
2. **Watch and steer in Herdr — candidate validated.** PR38 adds `/grants host <fresh-id>|stop`, exact labelled pause/resume/refresh actions and the private dashboard socket. Live evidence paused new dispatch while an owned child continued, refused a later child, resumed, refreshed attempts in place and reconnected two dashboard clients.
3. **Parallel model/effort variants — candidate validated.** PR39 retains explicit requested thinking and adds opt-in primary return while preserving wait-for-all. A three-variant live run returned the primary 13.763s before its late shadow terminal event, then `/grants variants` and Work-v4 showed complete execution-lifetime accounting. Child provider usage counts are not retained, so the planned response ceiling is not claimed as measured/enforced accounting; provider-internal reasoning is also not claimed.
4. **Learn, compare and decide — ready for a human quality choice.** One observed stale-attempt case now traverses the existing confirmed-case, weekly-retro, intervention-run and blind-card paths with a frozen zero-call hypothesis and two actual objective-qualified outputs. Quality choice, reveal, adoption and later outcome remain null.
5. **Useful bounded factory delivery — validated for read-only review.** A two-step governed chain inspected real source, handed its finding to a dependent decision step, found a mechanically reproduced defect and returned an advisory decision. Writable effect profiles remain unsupported.
6. **Second domain and outcomes — building.** The layout fixture is synthetic. A genuine non-development workflow and elapsed outcomes remain open.

## C00–C10 register

| ID | State | Owner / next evidence |
|---|---|---|
| C00 | candidate-installed validated; released-install validation pending | merged PR76 packages the extension and exact-source dashboard bridge; earlier candidate pack/install loaded `[Extensions] dist` and started a real source-host bridge, while canonical 0.14.0 release verification is in progress |
| C01 | ready to try; live observed on source | pi-daddy PR37; exact retry/change invalidation tests and one visible occurrence |
| C02 | ready to try | harness commit `127b349` derives only exact retained-work coverage signals; current attempt events contain no deadlines/checkpoints, covered artifacts, prior acceptance or reopen evidence, so richer facts remain absent |
| C03 | candidate validated | pi-daddy PR38; production host, busy-child pause/new-dispatch refusal/resume, same-host refresh and socket reconnect observed |
| C04 | candidate validated | pi-daddy PR39; three arms, primary-return independence and final original-owner accounting observed; requested effort is not internal-reasoning proof |
| C05 | ready to try | Principal PR41 makes current applicability the ordinary human view and preserves `human-legacy` |
| C06 | real comparison ready; response pending | confirmed retained case + frozen hypothesis + two objective-qualified blind outputs; authentic quality choice/reveal/adoption remain absent |
| C07 | validated, narrow profile | bounded Sol→Terra read-only chain found a real retry defect and returned a reserved decision; writable effect/recovery profiles remain unsupported |
| C08 | pending | domain owner; genuine non-development data/workflow required |
| C09 | decision recorded | [TRANSPORT-DECISION.md](TRANSPORT-DECISION.md): retain current producer path until same guarantees pass; responsibility map and current CI portability recorded; no broad rewrite |
| C10 | reconciled; release execution active | this status source + [DAILY-USE.md](DAILY-USE.md); five feature PRs merged after final approval; released install, human choice, second domain and later outcomes remain distinct |

## Evidence index and open claims

Public review inputs are the original scope in this directory plus a whitespace-normalized portable copy of [`review-inputs/post-merge-plan-2026-09-11.md`](review-inputs/post-merge-plan-2026-09-11.md) (coordinator source SHA-256 `e04dc99b…`, recorded inside the copy) and an exact copy of [`review-inputs/independent-review-2026-09-11.txt`](review-inputs/independent-review-2026-09-11.txt) (`f81e97ff…`). Release identities from the final external register (`6d7967af…`) are reproduced in the identity table and linked CI/release records; that mutable coordination register is not copied.

PR37's first CI found a Node24 append/read race. Follow-up `a56b238` permits growth only for the append-only journal, requiring same inode, no shrink and a byte-identical prefix reread; strict artifacts retain size/mtime rejection. PR37/38/39 exact follow-up checks passed on Node22 and Node24 and all five reviewed PRs are merged. Publication is separately authorized and must follow `PUBLISHING.md`.

The single overall milestone review requested changes for concurrent/crash declaration recovery, attempt finalization, dashboard action remapping, stale session environment, and the extension's undeclared `typebox` runtime. Producer follow-up heads repair the first four with red-first tests. PR76 now declares `typebox`; a clean canonical candidate was packed, installed into an empty prefix, and loaded by Pi as `[Extensions] dist`. This is candidate-installed proof, not yet evidence about released npm 0.14.0.

Local live receipts/screenshots contain session-specific paths and are **not available on GitHub**. Publicly reviewable evidence is the red-first tests, source ADRs/session log, PR diffs and CI. Claims requiring human acceptance, blind choice, private archive access or later outcomes remain explicitly unverified rather than reconstructed.
