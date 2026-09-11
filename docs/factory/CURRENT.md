# Software factory — current delivery state

Updated 2026-09-11. This is the current entry point; dated build reports and ADRs remain historical evidence.

## Identities

| Component | released source / package | merged-main CI | follow-up |
|---|---|---|---|
| skill-harness | `056217d14cf23ed7f9fc58f75e2d380722f25b1e` / 0.13.0 | [34544825922](https://github.com/mojomanyana/skill-harness/actions/runs/34544825922) PASS | [PR76](https://github.com/mojomanyana/skill-harness/pull/76): npm Pi-extension packaging |
| pi-daddy | `1eb89f2ad3db10ed3cb5433e3fa59c1cc1eb0208` / 0.23.0 | [34544821814](https://github.com/mojomanyana/pi-daddy/actions/runs/34544821814) PASS | [PR37](https://github.com/mojomanyana/pi-daddy/pull/37) declared work; [PR38](https://github.com/mojomanyana/pi-daddy/pull/38) human action keys; [PR39](https://github.com/mojomanyana/pi-daddy/pull/39) variants/thinking |
| principal-pi-skills | `3e7bc2b563b33044845d49204cc31f78f0957e1f` / 3.1.0 | [34544476255](https://github.com/mojomanyana/principal-pi-skills/actions/runs/34544476255) PASS | C05 not started |

Released, follow-up source, installed package and loaded-session identity are separate facts. In the observed continuation session, Principal 3.1.0 skills and pi-daddy 0.23.0 `grants.ts` were loaded. `skill-harness@0.13.0` was configured but has no published Pi extension resource; PR76 is ready to try from a local package, not installed-release validation.

## Six user capabilities

1. **Declare and track work — ready to try; source-live validated.** PR37 provides `pi-daddy work add` and ordinary attempt joins. One Sol child produced a visible attached attempt. Acceptance and archive coverage remained unresolved.
2. **Watch and steer in Herdr — building.** Read-only one/two-attempt views were live. PR38 replaces ordinary raw JSON with host-published labelled action keys. No production connected-host launcher or busy-child live steering proof yet.
3. **Parallel model/effort variants — building.** One bounded Sol/Terra `delegate_all` occurrence overlapped two isolated children and retained two results/attempts. PR39 exposes bounded thinking levels, ready to try but not live-validated. Three arms and primary/shadow independence remain open.
4. **Learn, compare and decide — building.** Archive, signal, retro, blind comparison and adoption primitives exist. Retained work can now derive a silent coverage case without a separate facts file; richer signals still require evidence. No authentic human blind choice or later outcome has been recorded.
5. **Useful bounded factory delivery — building.** Digest and supervised review routes exist; the first useful multi-step order remains open.
6. **Second domain and outcomes — building.** The layout fixture is synthetic. A genuine non-development workflow and elapsed outcomes remain open.

## C00–C10 register

| ID | State | Owner / next evidence |
|---|---|---|
| C00 | ready to try; release validation pending | harness PR76 plus this register and portable review inputs; fresh candidate pack/install/load passed, but no released installed package contains it |
| C01 | ready to try; live observed on source | pi-daddy PR37; exact retry/change invalidation tests and one visible occurrence |
| C02 | building; harness adapter ready to try | null facts now derive only exact retained-work coverage signals (no invented waits/deadlines/violations/prior acceptance); producer source-job join pending |
| C03 | building | pi-daddy PR38; production connected host and busy-child action receipt pending |
| C04 | building | pi-daddy PR39; thinking, three-arm and primary/shadow evidence pending |
| C05 | pending | Principal owner; current-vs-history ordinary renderer decision |
| C06 | pending | harness; requires a real case and authentic human blind choice |
| C07 | pending | pi-daddy; choose one bounded useful workload, no broad transport rewrite |
| C08 | pending | domain owner; genuine non-development data/workflow required |
| C09 | pending | integration owner; targeted transport/ownership/runner decision, not rewrite by default |
| C10 | in progress | coordinator; one status source, preserve current coworking pane and existing external heartbeat |

## Evidence index and open claims

Public review inputs are the original scope in this directory plus a whitespace-normalized portable copy of [`review-inputs/post-merge-plan-2026-09-11.md`](review-inputs/post-merge-plan-2026-09-11.md) (coordinator source SHA-256 `e04dc99b…`, recorded inside the copy) and an exact copy of [`review-inputs/independent-review-2026-09-11.txt`](review-inputs/independent-review-2026-09-11.txt) (`f81e97ff…`). Release identities from the final external register (`6d7967af…`) are reproduced in the identity table and linked CI/release records; that mutable coordination register is not copied.

PR37's first CI found a Node24 append/read race. Follow-up `a56b238` permits growth only for the append-only journal, requiring same inode, no shrink and a byte-identical prefix reread; strict artifacts retain size/mtime rejection. PR37/38/39 exact follow-up checks passed on Node22 and Node24. No merge or publication is authorized by this register.

The single overall milestone review requested changes for concurrent/crash declaration recovery, attempt finalization, dashboard action remapping, stale session environment, and the extension's undeclared `typebox` runtime. Producer follow-up heads repair the first four with red-first tests. PR76 now declares `typebox`; a clean canonical candidate was packed, installed into an empty prefix, and loaded by Pi as `[Extensions] dist`. This is candidate installed proof, not evidence about released npm 0.13.0.

Local live receipts/screenshots contain session-specific paths and are **not available on GitHub**. Publicly reviewable evidence is the red-first tests, source ADRs/session log, PR diffs and CI. Claims requiring human acceptance, blind choice, private archive access or later outcomes remain explicitly unverified rather than reconstructed.
