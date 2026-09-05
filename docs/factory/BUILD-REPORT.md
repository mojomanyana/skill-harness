# Factory build report

Campaign: `factory-01a071db`. Integration owner: pi session `01a071db-e946-7a6d-ba4b-f9da2aa0d3bd`; sole writer, standard inline fallback (no delegation tool exposed).
Workspace: `/home/neman/Code/factory-01a071db/skill-harness`.
Report: `/home/neman/Code/factory-01a071db/skill-harness/docs/factory/BUILD-REPORT.md`.
Branch: `principal/run-1788616831615-f2b0354b`; base `506039c9cec194dd2d3b1fbbe52a8d7cfc38227e`.
P00 run: `run-1788616831615-f2b0354b`, effective standard, source fallback assurance tool (installed Principal package absent).
Session: `/home/neman/.pi/agent/sessions/--home-neman-Code-skill-harness--/2026-09-05T13-57-12-646Z_01a071db-e946-7a6d-ba4b-f9da2aa0d3bd.jsonl`.

## Tracker

| Packet | Owner | Wave | State | Accepted source/tree or evidence | Next action |
|---|---|---|---|---|---|
| P00 | skill-harness | A | IN_REVIEW | P00-EVIDENCE.json; pinned v3 57 positives / 8 negatives | Final exact-target verification and standard review |
| P01 | pi-daddy | A | TODO | — | Check P00, then plan contract |
| P02 | pi-daddy | B | TODO | — | Check guide dependencies |
| P03 | skill-harness | B | TODO | — | Check guide dependencies |
| P04 | pi-daddy dashboard | C | TODO | — | Check guide dependencies |
| P05 | pi-daddy | C | TODO | — | Check guide dependencies |
| P06 | pi-daddy | B | TODO | — | Qualify explicit effect profile |
| P07 | skill-harness | D | TODO | — | Check guide dependencies |
| P08 | pi-daddy dashboard | D | TODO | — | Fixtures first; real casting gated |
| P09 | skill-harness | B | TODO | — | Qualify each measurement route |
| P10 | skill-harness | E | TODO | — | Check guide dependencies |
| P11 | pi-daddy | E | TODO | — | Check guide dependencies |
| P12 | skill-harness | E | TODO | — | Check exact route qualifications |
| P13 | skill-harness | F | TODO | — | Check guide dependencies |
| P14 | principal-pi-skills | C | TODO | — | Check guide dependencies |
| P15 | pi-daddy | F | TODO | — | Check effect/activation gates |
| P16 | skill-harness | G | TODO | — | Prepare bounded live demonstration |
| P17D | pi-daddy | Preferred | TODO | — | Select one justified removal |
| P17H | skill-harness | Preferred | TODO | — | Select one justified removal |
| P17P | principal-pi-skills | Preferred | TODO | — | Select one justified removal |


## Initial checkpoint — 2026-09-05T14:03Z

Owner initialized tracker. Source trees: harness 506039c (0.12.0), pi-daddy f12eac3, Principal d42f431. Harness has untracked docs/factory; pi-daddy has untracked .pi; Principal is clean. No reset, stash, historical rewrite or benchmark call. Original documents copied byte-exact by workspace snapshot. Workspace tool initially chose /tmp; cross-device git move failed, then only our workspace was moved and repaired to the durable path above. No competing writer assigned. The broad `git worktree repair` also unexpectedly recreated two missing historical `.git` pointer files. Those exact newly created pointers were subsequently removed after verifying their contents, restoring their initial absence. No historical ref, source, node_modules or evidence was removed; remaining registrations were not pruned.

P00 pending: installed-resource digests, passive pane/session join, reconnect coverage, historical-pin fixtures and review. No effect/measurement profile qualified. Proposer configuration from bash environment: openai-codex:gpt-6-astra, medium; not independent attestation. Subject/judge: not used. No new worker process yet.

## Qualification register

| Qualification | State |
|---|---|
| P06 effects | Not tested; worktrees/grants are not containment |
| P09 measurement | Not tested; no route qualified by P00 |
| P08/P12 casting | Neither fixture UI nor live comparison implemented |
| P13 trust/adoption | No policy, calibration or adoption |
| P16 complete loop | Not demonstrated |

## P00 baseline and compatibility — 2026-09-05

**Implemented:** factual baseline/report only; no product behavior, generated contract, skill, agent configuration or historical verdict changed. Planning inputs copied byte-exact from the user's untracked documents. `P00-EVIDENCE.json` retains exact identities and raw-log digests; logs live in `/home/neman/Code/factory-01a071db/evidence/` (local, not published). Disposable artifacts live in the sibling `disposable/`; the exact pinned producer clone is `producer-v3/`.

### Source is not installation

| Component | Observed source HEAD / tree | Installed / active |
|---|---|---|
| harness 0.12.0 | `506039c9cec194dd2d3b1fbbe52a8d7cfc38227e` / `aaca6fbddde0cec12f0a394777aef64618b0d262` | No pi package installed; source CLI built only in owned workspace |
| pi-daddy 0.22.0 | `f12eac37747e0a5ac7cd23542c9ac67613781371` / `701c1a479c455c8f8c9f53f5ae0cc667c8369671` | Not installed/loaded; `.pi/grants*` files alone do not load governance |
| Principal 3.0.1 | `d42f431880ca8b2235a7656c45c9c3448dbdb659` / `676740b571e500b1514c66c3caea7f7c4a2dc491` | No configured package or agent definitions; seven local copied skills are exposed |
| pi 0.84.2 | Guide upstream ref `9841914c71a74d81abe07f751aefd271fd924e63` is NOT attested by installed manifest | `/home/neman/.nvm/versions/node/v26.7.0/lib/node_modules/@earendil-works/pi-coding-agent`; CLI SHA-256 `840d1e8e689ed9e4937bcb00b9a810e02a8567d9afb10a47097f11ca93ea1521` |
| herdr 0.8.2 | Guide upstream ref `8162e26509f7b91eb8dcfd47387d43af3f348bbb` is NOT attested by installed binary | `/home/neman/.local/bin/herdr`; SHA-256 `976150a14d490c94b243ea2e1a7eb2dfb67f12e36b182db90936f6728e6aecf4`; server reports 0.8.2, protocol 20, compatible |

All three source mains equal freshly fetched `origin/main`; `gh pr list --state open` returned `[]` for each. Read-only remote refresh is network I/O, not an offline gate or model call. Original dirty states: harness `?? docs/factory/`, pi-daddy `?? .pi/`, Principal clean. Registered historical and prunable worktrees are inventoried, not adopted. The old live-looking pi-daddy worktree at `/var/tmp/pi-daddy-timeout-20m/ppw-QN1zvH` was not inspected for content or taken over.

Pi's installed sibling modules pi-ai, pi-agent-core, pi-client, pi-protocol, pi-tui and pi-telemetry all report 0.84.2. Their resolved paths and manifest hashes are in `P00-EVIDENCE.json`; no gitHead is recorded, so no byte-to-upstream-build equivalence is claimed. This is a package/resource inventory, not a runtime module-load attestation or an inventory of every transitive npm dependency. `PI_OFFLINE=1 pi list` returns `No packages installed.` Global settings contain defaults only; no package entry, local extension or prompt directory is configured. Exposed tools are read/bash/edit/write plus the parallel wrapper, not `delegate` or `subagent`.

Principal routing reconciles as follows: source `AGENTS.md` and `prompts/principal-feature.md` permit the source assurance-tool fallback and standard inline phases on tool absence. Build/review/debug/architect/git-ops copied skill hashes match current source. Local plan lacks the newer critical-only contract; local decide lacks classification/confirmation additions. Neither was silently overwritten. This standard run used the local inline Plan contract and source controller; source-native definition digests do not prove the two copied skill artifacts were current. Critical successors must load and bind current contracts explicitly, and require genuinely fresh governed critique/review contexts. No self-review will be relabeled independent.

### Passive observation and pause capability

1. Real disposable TUI `w14:p3` was launched with `--offline --no-extensions --no-skills --no-prompt-templates --no-context-files --no-tools --no-approve --session .../disposable/idle.jsonl --name factory-p00-idle`, no initial prompt. `herdr pane get`, `pane process-info` and `pane read --source visible` matched cwd, process and title; UI displayed $0 and 0% context. Herdr status remained `unknown`, not a closing-pause proof. `herdr integration status` reports pi integration **not installed**. Pi defers session-file creation until an assistant message; no observer appended entries to manufacture persistence. TUI runtime UUID/leaf remains unknown. `ctrl+d` ended that owned disposable pane; a later launch against its retired ID failed `pane_not_found`. A FIFO write then timed out without a reader. Neither operation was replayed ambiguously: process/pane state was reconciled, a new owned pane was created, and nonblocking FIFO writes were used.
2. Real disposable RPC process PID 8212 in pane `w14:p4` supplied session `01a071e5-a7c0-7031-a939-cc7b09dbeac0`, path `/home/neman/Code/factory-01a071db/disposable/rpc-idle.jsonl`. The saved `rpc-idle.sh` gives exact launch flags. Only RPC `get_state` and `get_session_stats` were sent, twice; these are read-only protocol requests, **not prompts, worker turns or worker-context reads**. No `get_messages`, status prompt, hidden message, hook or steering command was used. The RPC replies match exactly before/after: zero user/assistant/tool messages, zero tokens/cost, no streaming/compacting/pending messages, same session identity. Process/cwd/pane receipts correlate the actual RPC session to the pane. The session file stayed absent, consistently with installed `session-manager.js:_persist`.
3. Each `herdr pane get w14:p4` opens a new socket connection. After observer disconnect/reconnect the resnapshot recovered the same pane/process facts; RPC state was unchanged. **Coverage gap:** there was no continuous subscription and no claim about intervening lifecycle events. Herdr API protocol 20 exposes snapshots/events, but bounded buffer durability/replay was not live stress-tested. No `recent` scroll-affecting read was used. Raw schema captured at `/tmp/factory-01a071db-herdr-schema.json` is a discovery aid, not retained replay evidence.
4. Scope: nonstreaming empty RPC session state is observable; busy→settled retry behavior and actual session closure were **not** exercised. Installed RPC docs/source expose `agent_settled`; that is pause eligibility, not closure. RPC here is a launched-process route, **not an attach API for the TUI**. No observer extension was installed. The RPC PID was stopped with SIGTERM only after verifying its identity/cwd; shell recovery was observed, then only owned pane `w14:p4` was closed. No test worker/pane remains active.

The zero-call RPC route satisfies P00's disposable pane/session match; unsupported TUI pause/leaf and historical replay paths remain explicit. It does not qualify P02, P04, P05 or P09 integration guarantees.

### Exact verification and costs

All below ran from the owned harness workspace on Node v26.7.0 / npm 12.0.2. All test subjects/judges were fixtures/fakes; zero evaluation calls. Logs are retained under the evidence directory named above. No `run`, `grade`, `regate`, `compare`, `suggest`, canary, capture promotion or qualification launch command was invoked.

| Command | Expected / actual | Evidence / class |
|---|---|---|
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | cached dependency install, exit 0 / exit 0 | `npm-ci.log`; local setup, no network |
| same command in `../producer-v3` | cached exact-pin dependencies / exit 0 | `producer-ci.log`; local setup |
| `npm run build` | compile / exit 0 | `build.log`; static |
| `npm run typecheck` | types valid / exit 0 | `typecheck.log`; static |
| `node scripts/check-pi-daddy-v3-contract.mjs` | byte/digest parity and negative control / exit 0 | `v3-contract.log`; frozen fixtures |
| `node scripts/check-pi-daddy-contract.mjs` | historical v2 parity and negative control / exit 0 | `v2-contract.log`; frozen fixtures |
| `npm run verify:pi-daddy-v3-contract -- /home/neman/Code/factory-01a071db/producer-v3` | exact producer accepted / **57 positives, 8 fail-closed mutations**, 5 builder-generated fixtures reproduced; exit 0 | `v3-builders.log`; real builders, no worker model |
| `npm test -- packages/adapters/test/pi-daddy-contract.test.ts packages/adapters/test/pi-daddy-v3-contract.test.ts` | contract tests pass / **34/34**, 2 files | `contract-tests.log`; fixtures |
| `npm test` | general baseline / **1 failed, 1605 passed, 25 skipped** | `full-suite.log`; missing sibling provenance checkout, not product drift |
| `PRINCIPAL_PI_SKILLS_CHECKOUT=/home/neman/Code/principal-pi-skills PI_DADDY_CHECKOUT=/home/neman/Code/factory-01a071db/producer-v3 npm test` | correct provenance resolution / **1 failed, 1605 passed, 25 skipped** | `full-suite-qualified-env.log`; unrelated `/proc/16186` ENOENT below |
| `PRINCIPAL_PI_SKILLS_CHECKOUT=/home/neman/Code/principal-pi-skills PI_DADDY_CHECKOUT=/home/neman/Code/factory-01a071db/producer-v3 npm test -- packages/core/test/recorded-provenance.test.ts` | confirm environment remedy / 2 passed | `provenance-corrected.log`; positive and unresolved-commit negative |
| `npm test -- packages/core/test/qualification-runner.test.ts -t 'refuses a tie-break before accounting unless the first two clean votes split'` | isolate remaining failure / 1 passed, other cases skipped | `qualification-isolated.log`; simulated process, **not a green full suite** |

Historical v3 producer is exactly `4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`, tree `7c006bff213142634f0f911ba9bd6add363ecaae`, 0.21.1; schema SHA-256 `64e3d875e74bc32fa43fb96892605548259cd16f6ed6678646d73cc56280c511`. Clone made locally with `git clone --no-hardlinks --no-checkout /home/neman/Code/pi-daddy .../producer-v3`, then detached at the pin. Verifier checked cleanliness both before and after. Current-main 0.22.0 was never passed to this immutable-pin verifier. v2 stays separately pinned to `c364a6717e3d5e369ecd3298b9cbb595eb94d9b2`; no producer/consumer re-pin occurred.

**Unresolved suite boundary:** Node 26's `readdirSync('/proc', {withFileTypes:true})` raised ENOENT at `packages/core/src/qualification-process.ts:135` while a process disappeared. The failing test passed in isolation; this suggests timing sensitivity but does not prove root cause or repair. No qualification source was changed. Do not cite P00 as a fully green general suite. Exact P00 gates are inventory preservation, empty-RPC observation, frozen contract fixtures and report consistency; unrelated full-suite failures remain historical facts, not silently cleared.

### Unqualified boundaries and successor readiness

- No OS/path/network containment or hard aggregate budget exists merely because a workspace/grant is named. P06 must prove an exact supported effect profile; unrestricted bash remains an escape primitive.
- `promptCaptureIsTrusted` still requires zero extensions and no runtime injection. Missing/untrusted measurement is ERROR; known incorrect delivery is NOT-MEASURED; neither is efficacy FAIL or judge-eligible. No positive delivery route, evaluator canonical independence, OAuth usability, calibrated precision or adoption was established.
- Current pi-daddy `planSpawn` uses `--no-session` absent explicit sessionFile; public delegation ignores `_toolCallId`; retained check-receipt bytes remain an open producer boundary. These are static source findings, not observations of a governed child in this session.
- No consequential design was approved by inference. User authorization covers P00 disposable setup/read-only probes and branch retention, not merge/push/publish, installing packages, benchmark charters or unseen authority/effect designs.
- P01 is next by guide dependency; P09 can begin its independent investigation after P00 acceptance. Both require separate **critical** runs. P02/P06/full-stack P09 remain downstream-gated. P03 and later packets are not ready. Owner sessions/source writers must be rooted in their repository workspaces; read-only roles must not become writers.

## Resume paste

```text
Resume campaign factory-01a071db as integration owner in /home/neman/Code/factory-01a071db/skill-harness. Read docs/factory/BUILD-REPORT.md, 06-implementing-agent-handoff.md and full P00/run rules in 05-build-guide.md there. Reconcile branch principal/run-1788616831615-f2b0354b, native run run-1788616831615-f2b0354b, recorded session and actual processes before writes. Continue P00 disposable observation and pinned-contract checks; preserve canonical checkout changes and historical evidence. No subject/judge calls, merge, push or publish. Keep the branch. Do not create another tracker or writer.
```
