# 5 — Build guide: the self-improving factory

Implement the [one-page scope](sandbox:/workspace/scratch/de57830961a8/04-one-page-scope.md) as independently verifiable increments. Daily use becomes useful before unattended operation is qualified. Principal is the implementation workflow; its phases and evidence vocabulary are not the factory's universal contract.

**Intended location on your machine:** `/home/neman/Code/skill-harness/docs/factory/05-build-guide.md`. This document is supplied for copying there; it does not claim that path already exists. Packet briefs below use that location. Step 6 supplies the implementing-agent handoff; step 7 supplies terminal kickoff instructions.

## 1. Source baseline and existing capabilities

Source refs were refreshed on **5 September 2026**. These are inspected source identities, not proof of your installed versions or completed qualification. Product files were not edited and no model evaluations were run while preparing this guide.

| Owner and your path | Inspected main | Reuse before adding anything |
|---|---|---|
| pi-daddy — `/home/neman/Code/pi-daddy` | `f12eac37747e0a5ac7cd23542c9ac67613781371` | Deterministic grants, execution IDs, lifecycle/workflow ledgers, leases, concurrent delegation and the existing herdr dashboard plugin |
| skill-harness — `/home/neman/Code/skill-harness` | `506039c9cec194dd2d3b1fbbe52a8d7cfc38227e` | Native adapters, capture/promotion, schema-3 delivery observations and votes, screening, fixed-model comparison, stability and qualification infrastructure |
| Principal — `/home/neman/Code/principal-pi-skills` | `d42f431880ca8b2235a7656c45c9c3448dbdb659` | Generated workflow contracts, assurance state, workspace tooling, fresh evidence and review/finalization gates |

The latest inspected pi-daddy changes concern release/docs/test isolation; production control and ledger code retain the previously audited foundations. Scrum remains out of scope. Pi's agent directory is `/home/neman/.pi/agent`; do not infer its installed packages from these source checkouts.

The upstream contracts previously inspected are pi at `9841914c71a74d81abe07f751aefd271fd924e63` and herdr at `8162e26509f7b91eb8dcfd47387d43af3f348bbb`. P00 checks the actual installation against them. Keep these boundaries explicit:

- Pi's version-3 session JSONL is a conversation tree, not a complete live-event archive or an intent tree. File tails alone may not prove the active branch. Ordinary extension handlers are awaited; a monitoring hook is not automatically passive. `agent_settled` is pause eligibility, not proof of session closure.
- Herdr snapshots/subscriptions are useful observation surfaces but its bounded in-memory event buffer is not durable replay. Reconnect by resnapshotting and mark unrecoverable gaps. Avoid the `recent` read behavior that may scroll an idle terminal. RPC access to a launched pi process is not a TUI attach mechanism.
- Pi-daddy children currently default to no retained session; public delegation loses useful tool-call correlation. Its ledger references check receipts without durably preserving the complete receipt. Grants and cooperative leases do not establish OS/path containment.
- Harness's current ordinary Pi measurement rejects extension-bearing or injected runtime configurations it cannot attest. Keep `ERROR`/skipped judging until a trustworthy route exists. Prompt instrumentation inside a controlled experiment is not the daily observer.

## 2. Run rules

1. **Use the existing owners.** Control and execution changes belong to pi-daddy; archive, experiments and calibration to harness; presentation to the existing pi-daddy plugin; domain conventions to skills. New operations may extend these packages. No fourth service, standalone monitoring product or competing state store.
2. **One writer per worktree.** Use owned branches/worktrees and a named integration owner. Parallelise read-only planning/review and independent repository work. Never run parallel writers in one checkout. Cross-repo dependencies consume an explicit commit/tree and contract version, not a moving branch name.
3. **Observe externally.** No monitoring prompt, hidden session message, session-entry append, worker-context inspection or observer-driven steering. Retain outputs through execution infrastructure. Observer failure/backlog cannot block worker progress; mark gaps. Existing mandatory control logging keeps its own fail-closed rules.
4. **Separate evidence from authority.** Runtime success, task acceptance, measurement validity and adoption are separate decisions. Model judgments are advisory initially. Any later automated use needs calibrated, scoped evidence and an explicitly approved policy; no model call participates in dispatch or grants. A `SHIP` result is not publication permission.
5. **Separate model roles.** Record canonical proposer, subject and judge identities, requested/resolved settings and fresh contexts. A proposer or subject cannot judge its own candidate. The same model under an alias or in a new chat does not satisfy separation. Subjects may repeat across experiment arms, but none may be the proposer or judge. Disclose shared lineage; do not equate panel agreement with accuracy.
6. **Freeze experiments before spending.** Approve one concrete run charter covering population, variants, judge, criteria, repeats, total resources, effects, stop rules and rollback. Existing authorization covers runs inside it; ask again only for a material expansion. No model calls are implicit in an offline check. In harness, `regate` can call a judge; `capture` promotion can spend subject tokens. Retain metered-judge protections.
7. **Keep active work pinned.** Intent, skill, grants, model/effort policy and acceptance versions are fixed per order. Scope changes supersede affected acceptance. Improvements apply to new matching orders unless an explicit migration records what changed and which evidence must be renewed.
8. **Use evidence appropriate to risk.** Test observable contracts, known failures and adversarial boundaries. Run targeted checks while editing and the declared final gate after the last mutation. Do not create mirror tests or repeat full suites without a concrete reason. Record live checks separately from fixtures, simulated processes and static validation.
9. **Finish on the branch.** All briefs preselect keeping the completed branch. Do not infer merge, push, publication, production access or broad deletion approval. Preserve user changes. Each packet returns exact commands, expected/actual results, source/tree identities and evidence locations to the named integration owner. That owner serially updates `docs/factory/BUILD-REPORT.md` from an owned skill-harness workspace, linking existing assurance/archive records rather than duplicating transcripts. A pi-daddy or Principal Build must never write across its isolated writer root to update that central report.
10. **Stop only the dependent work.** A packet with missing required evidence is `BLOCKED`, never quietly weakened. Independent daily-observation work may continue while a full-stack measurement or containment gate is blocked. No dependent feature may claim the missing guarantee.

### Assurance used to build the factory

These are Principal's real implementation profiles, not new factory states. [The current feature contract](https://github.com/mojomanyana/principal-pi-skills/blob/d42f431880ca8b2235a7656c45c9c3448dbdb659/prompts/principal-feature.md) accepts `/principal-feature --assurance lean|standard|critical`. Read the effective profile and shipped event contract; never fabricate assurance event fields.

| Profile | Use here | Required behavior |
|---|---|---|
| `lean` | Tiny, reversible navigation/text cleanup only | Smallest appropriate change and fresh targeted verification |
| `standard` | Non-authoritative views, candidate nomination, conventions | Verifiable slices, one writer, review, adjudicated findings and fresh evidence |
| `critical` | Authority, containment, evidence validity, acceptance and adoption boundaries | Owned isolated worktree; independent fresh plan critique; real immutable task packets; separate fresh specification and quality reviews per scoped task; fresh whole-change review and tree-bound gates |

Critical work with consequential design choices needs the concrete design/validation/rollback/abort decision required by Principal before Build. The guide is the requirement baseline, not approval of an unseen implementation. Prepare that decision fully before asking. One concrete wave design may cover several named packets and their boundaries; reuse that approval within its scope rather than asking again per packet. Missing required isolation or fresh review returns `BLOCKED_CRITICAL_ASSURANCE`; do not downgrade because it is inconvenient. Principal's fresh-context controls do not by themselves prove the additional model separation required here. Keep its two-repair-round bound during implementation; factory recovery limits remain domain/work-order policy.

## 3. Work waves and gates

Dependencies in the packet entries are authoritative. A wave is a useful delivery milestone, not permission to ignore dependencies or run overlapping writers.

| Wave | Packets, in dependency order | Gate you can inspect |
|---|---|---|
| A — Establish facts | P00, P01 | Actual installation/refs recorded; versioned generic contract and authority rules reviewed |
| B — Capture and limits | P02; P03; P06 and P09 can start their independent investigations | Correct joins, retained receipts and explicit coverage; supported/blocked containment and measurement boundaries identified |
| C — Useful daily view | P04, P05, P14 | Read-only status and deliberate steering demonstrated; current acceptance separated from historical failures |
| D — Detect and ask | P07, P08 | Defects and exemplars arise without notes; at most five pause-time questions; uncertainty retained |
| E — Run investigations | P10, P11, P12 | Archive-only retro; approved scenarios and frozen variants; isolation, measurement and independence gates pass for every qualified arm |
| F — Controlled improvement | P13, P15 | Recomputable trust; scoped adoption and rollback; deterministic bounded dispatch and reserved decisions |
| G — Demonstrate the loop | P16 | Live daily case → independent comparison → decision → later outcome; bounded factory order; second domain |
| Preferred follow-up | P17D, P17H, P17P, independently | One justified simplification per owner where evidence supports removal; retained obligations and provenance |

**Gate discipline:** P06 must pass for the exact effect boundary before unattended or effectful variant execution. P09 records separately named route qualifications; a dependency on P09 means the exact route used must pass, not that every proposed route is supported. An extension-free skill experiment may proceed on its qualified route while the full-stack route stays BLOCKED; it cannot qualify the extension-bearing factory. A fixture-only pass does not qualify a live integration. No silent automatic grant/acceptance expansion is an exit criterion.

## 4. Work packets

Every brief below inherits sections 1–3 and its complete packet entry. Start in the owner repository. The controller reads this guide before binding Build to an isolated writer root, then passes the applicable authority in its task packet; Build does not read or write outside that root. The implementing planner must resolve exact existing files, narrow the change and produce real Done commands before Build. New feature command names are deliberately not invented here; the packet's completion report must give exact reproducible commands or dashboard actions with expected results.

### P00 — Record the real baseline and capability matrix

**Owner:** skill-harness. **Assurance:** standard. **Dependencies:** none.

**Expected behavior:** Record actual clean/dirty worktrees, main/PR/installed package identities, resolved pi/herdr binaries and relevant protocol capabilities. Distinguish repository source, installed artifact and observed runtime. Inspect current local instructions and source before using a command. Test passive observation and pause detection with a disposable session; record unsupported cases instead of assuming TUI attachment or replay.

**Deliverables:** A compact baseline/compatibility section in `BUILD-REPORT.md`; selected verification commands and costs; source-to-installation mapping; explicit unresolved measurement/containment requirements. Reuse existing package scripts and qualification records. Do not rerun historical benchmark waves merely to establish versions.

**Done when you can verify:** Every loaded package resolves to a path and identity; a disposable session and herdr pane can be matched without sending it a status prompt; a reconnect produces either recovered facts or a visible gap. Your dirty changes remain intact. Existing schema fixtures are checked at their declared producer pin, separately from current-main integration.

> /principal-feature --assurance standard Complete P00 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Record actual installed and source identities, passive observation capabilities, exact offline gates and unresolved boundaries. Use disposable observations only; preserve working changes and historical evidence. Make no subject/judge evaluation calls. Keep the completed branch.

### P01 — Version the generic work and intent contract

**Owner:** pi-daddy. **Assurance:** critical. **Dependencies:** P00.

**Expected behavior:** Add versioned goal/node/obligation records with dependencies, intent revisions, ownership, permitted effects and acceptance references. Attach execution occurrences and delegations without confusing repeated logical child IDs with unique attempts. Correlate session/branch, tool call, task/workspace, artifact, definition and configuration identities. Preserve declared-versus-observed provenance. Acceptance is valid only for the exact intent/artifact/policy revisions it covers. Caller metadata cannot confer authority.

**Deliverables:** Producer-owned schemas/builders, compatibility rules, deterministic projections and fixtures. Extend the existing ledger contract deliberately; do not relabel changed semantics as unchanged v3. Publish the compatibility change for P03 rather than hand-editing a consumer copy.

**Done when you can verify:** Two attempts and N variants attach to one obligation without double-counting progress; a changed artifact or obligation supersedes acceptance; duplicate delivery is idempotent; missing parents, invalid dependencies and forged authority are rejected or explicitly unresolved. A non-development contract uses the same machinery without Principal constants.

> /principal-feature --assurance critical Implement P01 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Extend pi-daddy's existing ledger/builders with skills-agnostic versioned intent, unique execution joins and revision-bound acceptance. Preserve provenance and authority separation; supply compatibility fixtures and independently checkable negative cases. Keep the branch.

### P02 — Retain governed executions and their native identities

**Owner:** pi-daddy. **Assurance:** critical. **Dependencies:** P01.

**Expected behavior:** Governed launch records the actual child session/output locations, public tool-call identity, execution parentage, pinned task/definition/configuration and terminal outcome. Preserve available structured output and complete check receipts for external retention. A digest/reference without retained receipt bytes must be reported as missing evidence. Root TUI joins use verified herdr/session data; unknown active branches stay unknown.

No monitoring extension, injected status message or extra worker turn. Control records remain small; transcript content goes to the agreed harness archive boundary. Optional observation output may drop with explicit coverage loss rather than backpressure. Required control receipts keep their existing failure semantics.

**Deliverables:** Changes at existing public delegation, spawn/executor and receipt seams; session/receipt location manifest; lifecycle and interrupted-run fixtures; documented retention handoff.

**Done when you can verify:** Concurrent children with reused logical names still resolve to different sessions/attempts; parallel tool completions match their calls. A normal completion and killed child retain the evidence actually produced. Stopping the observer does not add session entries or prevent worker completion. Missing receipt content is not represented as evidence-complete or accepted; runtime completion remains a separate fact.

> /principal-feature --assurance critical Implement P02 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Retain governed child sessions, available structured output and full check receipts through existing execution infrastructure; expose exact native joins. Preserve control logging and mark observation loss without delaying workers. Do not add monitoring prompts or worker hooks. Keep the branch.

### P03 — Build the external archive and honest coverage projection

**Owner:** skill-harness. **Assurance:** critical. **Dependencies:** P01 and P02.

**Expected behavior:** Restartable external ingestion reads files/streams/ledgers and creates content-addressed source references, parser/contract versions, coverage intervals and observed settings. Preserve branch ancestry and source bytes subject to the approved redaction/retention policy. Redacted evidence cannot masquerade as exact replay. No archive credential exposure through candidate export. Reuse native adapters; retain original facts alongside normalization.

**Deliverables:** Archive manifest/reader within harness, idempotent ingestion/checkpointing, retention/access controls, producer-contract update through the existing vendoring route, fixtures for incomplete/reordered records. Preserve historical selectors and records.

**Done when you can verify:** Replay identical timestamps, reused child IDs, out-of-order completions, duplicate events, a partial trailing line, branch ambiguity and an observer restart. Joins remain correct; unresolved branches/gaps remain visible; duplicates do not create outcomes. Deleting retained content produces missing evidence, not fabricated recovery. Producer/consumer fixtures match exact pins.

> /principal-feature --assurance critical Implement P03 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Extend harness adapters with external archival, durable joins, explicit coverage and safe content retention. Preserve source provenance and historical formats. Prove restart, partial-record, branch, missing-content and contract-compatibility behavior without any worker interaction. Keep the branch.

### P04 — Present read-only current and overall status

**Owner:** pi-daddy, existing herdr dashboard plugin. **Assurance:** standard. **Dependencies:** P01 and P03.

**Expected behavior:** Show intended obligations and attached execution attempts, including unstarted work. Separate runtime, acceptance and coverage/freshness. Counts refer to one scope revision; process exit zero is not accepted work. Include check evidence, current obstacle and a short deterministic narrative with source references. Status remains useful with models unavailable. Reconnect resnapshots; an observation gap never becomes invented continuity.

**Deliverables:** Pure projection/render changes in the current plugin and read-only status surface, representative fixtures, accessible status labels and empty/stale/error views. The dashboard is not another mutable authority store.

**Done when you can verify:** In a controlled idle fixture, repeated status reads leave session bytes, worker message counts and control ledgers unchanged; in a live run, no writes are attributable to those reads. Three obligations with two accepted and one exited-but-unaccepted display exactly that. Changed scope and missing evidence appear correctly. Disconnecting a model provider does not remove status; a socket gap is visibly stale/partial.

> /principal-feature --assurance standard Implement P04 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md in the existing pi-daddy herdr plugin. Show intent, runtime, acceptance and coverage separately with a factual narrative and evidence links. Prove status reads have no session/control side effects and remain available without models. Keep the branch.

### P05 — Steer from the intent tree through explicit control

**Owner:** pi-daddy, including its dashboard controls. **Assurance:** critical. **Dependencies:** P01, P02 and P04.

**Expected behavior:** Authorized actions revise scope, reprioritise nodes, select a recorded alternative, pause new dispatch or request cancellation. Validate expected revision and authority; log request, decision, application and outcome. Ordinary steering waits for the verified safe boundary. Cancellation is a distinct deliberate action. A stale UI request cannot overwrite a newer decision; an ambiguous transport acknowledgement cannot prove application.

**Deliverables:** Deterministic control handlers and dashboard action routing using verified pi/herdr mechanisms; receipt/reconciliation model; replay/race fixtures. Status code never calls these handlers automatically.

**Done when you can verify:** Submit a revision while a child is busy: record pending direction, then one application at the supported boundary. Replay it and prove no duplicate effect. Submit a stale revision and see rejection. Observe/status never generates steering. If the runtime cannot prove a safe targeted route, that route remains BLOCKED rather than falling back to uncorrelated terminal typing.

> /principal-feature --assurance critical Implement P05 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Add authorized, revision-checked tree steering with durable request/application receipts and safe-boundary behavior. Keep observation separate. Prove duplicate, stale, busy-session and ambiguous-transport cases; do not invent a TUI attach API. Keep the branch.

### P06 — Enforce the supported effect boundary and aggregate limits

**Owner:** pi-daddy. **Assurance:** critical. **Dependencies:** P01 and P02.

**Expected behavior:** First identify and demonstrate an enforceable execution profile within the existing product and available runtime facilities. Then bind launches to immutable destinations/authority, isolate allowed effects and reserve resources across the whole order and its experiments. A restricted non-shell execution profile is valid if its limitations are explicit. Naming a worktree or limiting tool names does not contain arbitrary bash.

Account for descendants, retries, shadows, concurrent reservations and interrupted execution. Report measured usage and unknown cost separately. A hard money cap requires an enforceable bound/reservation; post-hoc billing alone cannot provide it. Deny unsupported profiles before launch. Resolve or exclude shared-root/different-lease-store ownership, mutable routing destinations and start/log/lease-loss ordering hazards before claiming those paths supported.

**Deliverables:** Concrete boundary design with scope/abort/rollback, implemented supported profile, aggregate accounting and ownership reconciliation, adversarial probes under `docs/probes/`, explicit capability matrix. No new external product may be introduced to make the claim true.

**Done when you can verify:** An adversarial disposable worker cannot write outside its allowed root, change its routing authority or use denied effect channels. Two submissions cannot spend the same allowance. Cancellation, controller restart, lost ownership and late receipts cannot duplicate or resurrect effects. Unsupported paths fail before launch. If available facilities cannot enforce a useful profile, mark this packet BLOCKED with the exact missing primitive; retain daily mode.

> /principal-feature --assurance critical Implement P06 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Prove and implement one explicit effect boundary in pi-daddy, immutable destinations and aggregate order/experiment limits. Test escape, split ownership, reservation races, cancellation and restart. Do not treat grants or CWD as containment; return BLOCKED for unsupported enforcement. Keep the branch.

### P07 — Nominate defects and exemplars with an initial calibration queue

**Owner:** skill-harness; pi-daddy remains owner of operational facts and policy enforcement. **Assurance:** standard. **Dependencies:** P03 and P04.

**Expected behavior:** Deterministic detectors consume retained/current structural facts: repeated equivalent attempts without progress, overdue declared checkpoints, conflicts with recorded intent, reopened accepted work and economical accepted examples. Domain conventions distinguish expected waits/retries/intermediate failures. Missing evidence is a coverage issue, not automatically a worker defect. Semantic interpretation is an asynchronous advisory hypothesis over a frozen snapshot.

Start new detector versions silent. A bounded calibration sample can be reviewed at pauses; ordinary amber/question visibility requires an explicit exposure policy. Deduplicate incidents; do not mistake several alerts from one incident for independent evidence. Record detector version, applicable population, evidence, proposed interpretation and unresolved label. Extend capture's case model beyond only skill/subagent targets.

**Deliverables:** Versioned candidate/case records, representative deterministic detectors, duplicate grouping, initial silent/calibration policy and immutable dispositions: confirmed defect, expected behavior, exemplar, uncertain/skip. No automatic promotion or causal attribution from a label.

**Done when you can verify:** Replays produce a repeat-without-progress candidate and an exemplar with no `/note`; declared wait, expected red→green and changed requirement are distinguishable negative controls. Missing coverage stays unknown. Reprocessing does not multiply incidents. Silent versions create reviewable calibration records without interrupting work or surfacing uncontrolled alerts.

> /principal-feature --assurance standard Implement P07 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Build archive-driven structural candidates for defects and exemplars, deduplicate them and retain independent human dispositions. Start silent with bounded calibration review; keep semantic cause advisory and missing evidence explicit. Prove positive and expected-behavior controls without manual notes. Keep the branch.

### P08 — Present pause-time debriefs and blind choice cards

**Owner:** pi-daddy, existing herdr dashboard plugin. **Assurance:** standard. **Dependencies:** P04 and P07; consume P12's finalized comparison records when available.

**Expected behavior:** At verified suitable closing pauses, present at most five short evidence cards; do not trigger on every `agent_end`. A blind-choice question included in that debrief consumes one of the five slots. Defer if the work/session boundary is uncertain, the user leaves or the budget is exhausted. Skips remain unresolved. Labels submit explicit user decisions to harness; viewing never writes to workers. Manual notes are optional.

Add a blind comparison view consuming a frozen anonymized manifest: randomized opaque variant labels, relevant artifact/evidence, quality choice first, cost/configuration reveal afterward. Permit ties, none acceptable and insufficient evidence. Prevent identity leakage through filenames, metadata and captions where feasible; disclose unavoidable clues. This view can be developed with fixtures, but real casting acceptance waits for P12.

**Deliverables:** Debrief/weekly queue, explicit label actions, blind/reveal UI states, accessibility and pause/reconnect fixtures in the existing plugin. Persist decisions in the owning harness records, not a separate dashboard ledger.

**Done when you can verify:** Seven pending incidents yield no more than five questions; a retry-followed-by-settle does not end the session prematurely. Closing/reopening retains unanswered cards. An unselected card cannot become agreement. Blind choices are recorded before model/cost reveal, and neither view sends any worker messages.

> /principal-feature --assurance standard Implement P08 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md in the existing dashboard plugin. Add non-interrupting pause-time debriefs capped at five, durable unresolved cards and a blind quality-before-cost comparison view. Preserve ownership of learning decisions in harness. Exercise retry, disconnect, skip and reveal states. Keep the branch.

### P09 — Qualify delivery measurement and evaluator independence

**Owner:** skill-harness. **Assurance:** critical. **Dependencies:** P00; P02/P06 for any governed full-stack measurement route.

**Expected behavior:** Preserve schema-3 delivery/verdict consistency and objective-before-judge ordering. Resolve canonical role identities and requested/actual model/effort settings; reject alias-based self-judging before subject spend. Unknown resolution remains explicitly unsupported for claims depending on it.

Demonstrate an attributable delivery route for the extension-bearing subjects the factory needs, with an independently justified trust boundary. An allowlist or self-attesting event from an untrusted extension is not a solution. Do not remove the current extension/runtime-injection rejection merely because positive runs are inconvenient. Existing synchronous prompt capture is controlled-experiment instrumentation; it must never become the daily observer or be represented as zero-overhead observation.

**Deliverables:** Supported measurement matrix and threat model; verified role/setting receipts; versioned evidence validation; positive delivery demonstrations and corrupted/forged negative controls. Preserve historical schema semantics and the separate frozen qualification-runner contract.

**Done when you can verify:** A supported governed subject supplies complete attributable request evidence. Missing, replayed, reordered, truncated or forged observations, changed extension bytes and misresolved settings cannot yield a qualified result. Known incorrect delivery is `NOT-MEASURED`; untrusted/missing instrumentation is `ERROR`; neither enters the efficacy denominator or triggers a judge. Alias-conflicting proposer/subject/judge configurations fail before spending.

If no truthful full-stack route exists within the allowed owners, report the precise BLOCKED boundary. Extension-free experiments may remain useful; they do not satisfy the blocked full-stack gate. Negative-path implementation alone is not positive qualification.

> /principal-feature --assurance critical Implement P09 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Preserve delivery-error semantics and prove a trustworthy supported measurement route, including actual configuration and canonical proposer/subject/judge separation. Reject forged or incomplete evidence and self-judging before spend. Never bypass extension restrictions or reuse experiment hooks for daily monitoring. Keep the branch; report unsupported full-stack qualification as BLOCKED.

### P10 — Turn the archive into approved, testable investigations

**Owner:** skill-harness. **Assurance:** critical. **Dependencies:** P03 and P07; P09 before model-backed evaluation; P06 if execution uses its restricted profile.

**Expected behavior:** Run a weekly frontier retro against an immutable archive snapshot through an enforced read-only surface inside existing tooling. Deny arbitrary bash, raw herdr socket access, filesystem/session/grant mutation and network access beyond the deliberately authorized model transport. “Read only” in a prompt or an empty cwd is insufficient. A deterministic supervisor persists advisory output; the retro itself does not change production or its own authority.

Each hypothesis carries supporting cases, alternatives, target population, proposed intervention, prediction, downside, disproof, resource limits and rollback condition. User acceptance authorizes the investigation only. Promote sanitized confirmed evidence into a scenario with expected behavior, then freeze evaluation before editing. Preserve privacy preview/approval or an explicitly approved export policy; never automatically commit transcript secrets. Weekly scheduling lives within existing harness/pi-daddy operation, not a separate scheduler product.

**Deliverables:** Hypothesis ledger/lifecycle, bounded archive reader, idempotent weekly selection, accepted-case promotion and evaluation-freeze receipts, links into existing capture/spec-write/screen functions.

**Done when you can verify:** The retro can cite archived evidence but cannot mutate a skill, session or grant. One approval creates exactly one bounded investigation and linked scenario; rejection changes no source. An edited rubric, judge policy or held-out fixture invalidates the frozen comparison rather than improving its score retroactively. Screening remains exploratory when populations differ.

> /principal-feature --assurance critical Implement P10 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Add an enforced archive-only weekly retro and hypothesis-to-scenario lifecycle using existing harness capabilities. Separate approving an investigation from adopting a change, preserve sanitization approval and freeze evaluation before edits. Prove denied writes and idempotent decisions. Keep the branch.

### P11 — Execute bounded parallel variants and shadows

**Owner:** pi-daddy. **Assurance:** critical. **Dependencies:** P01, P02 and P06; P10's approved experiment contract for real investigations.

**Expected behavior:** Extend governed delegation with one experiment identity, pinned common inputs and explicit per-variant model, effort, skill/prompt/configuration differences. Reuse the existing per-call fan-out limit; larger N must use bounded waves rather than bypass it. Reserve total experiment resources, not just per-child resources. Give writers separate destinations and prevent mutable-output/effect contamination.

N=2 shadowing runs an isolated alternative without making primary completion depend on the shadow or its judge. Preserve existing `delegate_all` wait-for-all/cancellation semantics; add durable controller ownership of shadow lifetime, result retention, cancellation and restart inside pi-daddy. Returning early from an untracked promise is not a shadow execution path. Preserve equivalent starting inputs. If concurrent equivalence/isolation cannot be achieved, do a later replay and label it honestly. Cancelled, timed-out and unsupported variants remain visible; no automatic extra variants outside the charter.

**Deliverables:** Experiment-aware delegation/receipts, aggregate reservations, frozen variant materialization and output ownership, shadow/replay mode and stop/restart reconciliation.

**Done when you can verify:** N=2 and N=3 produce separate artifacts under one manifest. A shadow cannot alter primary context, files or external state; a stalled shadow does not delay the primary. Simultaneous variants cannot exceed reservations. A restarted experiment cannot duplicate effects. Requested and observed configuration are distinguishable.

> /principal-feature --assurance critical Implement P11 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Extend existing governed fan-out with experiment identity, frozen inputs, isolated variants, aggregate limits and non-blocking N=2 shadows. Preserve the per-call cap and label replay honestly. Demonstrate contamination, budget-race and restart controls. Keep the branch.

### P12 — Compare interventions and build conditional casting evidence

**Owner:** skill-harness. **Assurance:** critical. **Dependencies:** P09, P10 and P11; P08 for the final human blind-choice demonstration.

**Expected behavior:** Reuse fixed-model skill comparison without weakening its same-subject/judge/scenario/noncandidate-input invariants. Add a separate declared comparison family for model/effort and other explicit intervention axes. Changing several axes tests the combined package; do not attribute the result to one variable. Include frozen boundary/held-out cases and repeated runs appropriate to observed instability.

Apply objective/delivery eligibility first. Then independently grade randomized anonymized outputs; record human or calibrated advisory quality choices before revealing configuration/cost. Preserve per-criterion votes and denominators; partial runs never become successful completed comparisons. Changes to model grading, harness scoring/evidence validation or control policy require fixed independent reference outcomes and negative controls. An edited evaluator cannot establish correctness solely by producing better scores.

Casting rows identify station contract/task class/risk, applicable versions, measured acceptance and escapes, cost/latency, sample sizes, uncertainty and revalidation conditions. Sparse, unmatched or unmeasured data cannot create a default. Keep quality eligibility distinct from the cheapest eligible option.

**Deliverables:** Frozen comparison manifests, independent role/configuration records, objective and blind choice evidence, complete/incomplete outcomes and scoped casting table. Existing history remains readable.

**Done when you can verify:** Changing a fixed-model comparison's subject is still rejected. The separate N-variant path records ties/none/unknown and missing arms honestly. A cheaper failing candidate loses eligibility despite lower cost. Blinding survives the emitted artifact metadata or discloses the limitation. One shadow win creates evidence, not an automatic routing rule.

> /principal-feature --assurance critical Implement P12 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Preserve existing fixed-model comparison invariants and add separate, frozen intervention/casting comparisons with independent blind grading. Retain all eligibility, vote, cost and uncertainty evidence; prevent partial runs, cheap failures or one shadow win from becoming defaults. Keep the branch.

### P13 — Calibrate trust and record scoped adoption

**Owner:** skill-harness; pi-daddy consumes authorized activation records in P15. **Assurance:** critical. **Dependencies:** P07, P08, P10 and P12.

**Expected behavior:** Recompute precision per detector/adjudicator version and population from independent confirmed outcomes. Show correct positives/resolved positive predictions, unresolved counts, sample size and uncertainty. For adjudicators, separate approval and rejection reliability. Sample unflagged work to detect misses; separate tuning cases from calibration/held-out cases. Corrections append history rather than rewriting prior predictions.

Implement silent/ask/retire with explicit minimum-evidence/confidence/attention policy chosen before promotion. Missing policy keeps the component silent/advisory. Agreement alone is insufficient. Provider, prompt, population or rubric changes require revalidation rather than automatic inheritance.

Adoption binds the hypothesis, frozen experiment, exact candidate, supported scope, authorization, activation boundary, rollback and later production outcomes. A confirmed escaped defect links back to the original acceptance. A rollback recommendation is advisory; execution requires the recorded user choice or pre-authorized deterministic rollback rule. No calibration result expands grants.

Define lean measures within comparable populations: first-pass acceptance means acceptance without a repair attempt; an escape is a confirmed defect discovered after acceptance, excluding changed requirements. Show recovery work, decision wait and stakeholder question counts alongside quality. Missing observations stay outside claimed complete denominators. Do not optimize a universal agent score or raw alert count.

**Deliverables:** Auditable calibration reports/policy records, human adoption receipts, applicability/expiry handling, trial/rollback linkage and read model for the existing dashboard.

**Done when you can verify:** An independent fixture with 8 confirmed correct and 2 incorrect positive predictions shows 8/10, with 3 unresolved predictions displayed separately—not 8/13 or 11/13. Zero resolved calls produces unknown precision. An alias/model revision cannot inherit trust silently. A changed candidate cannot reuse adoption approval; later failure links to its original hypothesis and a recorded rollback decision.

> /principal-feature --assurance critical Implement P13 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Add recomputable scoped detector/adjudicator calibration and silent/ask/retire policies, then bind adoption and rollback to exact evidence and authorization. Preserve unknowns, independent calibration and later escapes. Prove denominator, revision, stale-approval and no-authority-expansion cases. Keep the branch.

### P14 — Map Principal conventions and correct current verdict meaning

**Owner:** principal-pi-skills. **Assurance:** critical, because machine-readable assurance semantics may change. **Dependencies:** P01 and P03; integrate the displayed result with P04.

**Expected behavior:** Map native Principal task/workspace/context/evidence/finalization records into generic work identities while preserving the native contract and its authority. Workers should not repeatedly narrate status to feed the archive. Reuse the documented host-integration seam; do not introduce a second Principal controller. Other skill sets can declare different stations and evidence.

Correct the current report projection that aggregates every historical exit code into one verdict. An expected red receipt followed by fresh qualifying evidence must not remain a permanent failure merely because the red receipt exists. Preserve genuine unresolved failure, missing/stale evidence and superseded candidates as distinct states. Derive current applicability from existing authoritative records; a status read must not invoke the mutating `gate` command. Version changed machine semantics and preserve original historical statements.

**Deliverables:** Minimal convention/adapter documentation, necessary shared-template changes and generated outputs, versioned report semantics and native-to-generic fixtures. Edit `contracts/*.md.tmpl` where behavior is generated, then regenerate; do not hand-edit generated copies.

**Done when you can verify:** An ordinary Principal run maps into the generic tree without generic control, archive or view contracts requiring `build`, `review` or `red`; only the named Principal adapter interprets that vocabulary. Expected red→green with fresh required evidence, unresolved final failure, empty evidence and changed artifact each produce the correct distinct current state. Historical bytes/verdicts remain intact. Generation, installation and packaging checks pass. Changed model-visible instructions need independent harness evidence before behavioral adoption.

> /principal-feature --assurance critical Implement P14 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Map Principal's existing assurance into generic factory conventions and correct current-report applicability without rewriting history or weakening native gates. Edit generator sources, regenerate and demonstrate red-to-green, final failure, empty evidence and superseded artifacts. Keep the branch.

### P15 — Dispatch bounded factory orders and apply authorized changes

**Owner:** pi-daddy. **Assurance:** critical. **Dependencies:** P01, P02, P05, P06 and P13; P14 for the Principal-backed demonstration.

**Expected behavior:** A model may draft a charter/plan; authorized scope becomes structured, versioned intent. Validate obligations, dependency eligibility, permitted effects, grants, resources, recovery and reserved decisions deterministically. Reject unresolved authority instead of having a model interpret it on the control path. Use objective acceptance or already-produced evidence allowed by an explicitly authorized frozen policy; otherwise wait for the designated human decision.

Execute through existing delegation infrastructure. Reserve before launch; reconcile start/finish/restart without double effects. Expected local failure may use a bounded authorized recovery. Exhaustion stops new affected dispatch, scope/effect changes return to the stakeholder, and independent authorized nodes may continue. Logging/ownership loss uses the declared fail-closed policy.

Validate adoption receipts against the trusted authorization source and exact candidate, scope and evaluation revisions; caller-declared metadata cannot activate a policy. Apply approved changes to subsequent matching orders. Explicit migration or rollback records govern exceptions. No synchronous model is needed to compute the next allowed control action.

**Deliverables:** Charter validator, deterministic dispatch/reconciliation, escape matrix, approval/activation boundary and inspectable control receipts, integrated into pi-daddy rather than a new scheduler product.

**Done when you can verify:** A disposable multi-node order advances without manual turn steering, pauses a branch after exhausted recovery and returns one reserved product decision. Independent work continues. Restart does not repeat an effect; stale/forged adoption cannot activate a candidate. With model transport disabled, the controller still reports and computes eligible actions; it does not pretend the worker can generate new work offline.

> /principal-feature --assurance critical Implement P15 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md. Add deterministic charter-based dispatch, bounded recovery and restart reconciliation using existing pi-daddy execution. Validate authorized adoption and pin active orders. Demonstrate reserved decisions, independent progress, exhausted allowance, forged activation and no duplicate effects. Keep the branch.

### P16 — Demonstrate the complete loop in two domains

**Owner:** skill-harness; consumes pinned candidate builds from pi-daddy and Principal. **Assurance:** critical. **Dependencies:** P01–P15 for the claimed complete experience; all required gate results recorded.

**Expected behavior:** Exercise one real daily work case and one bounded factory order under a concrete approved live-run charter. Detect both a candidate defect and an exemplar without a note, obtain a pause-time disposition, promote a case, freeze/evaluate a candidate with distinct roles, and record the evidence-backed decision. If the hypothesis loses or measurement fails, retain that honest outcome. Test adoption/rollback mechanics with labeled fixtures where a real candidate has not earned adoption; do not manufacture an efficacy success.

Repeat the contract path with a small non-development skill fixture, such as comparing building-layout options against a supplied brief. Its stations and evidence must differ from Principal's. This demonstrates interchangeability, not professional certification or a new architecture product.

**Deliverables:** Reproducible demonstration instructions and exact pins, separate static/simulated/live results, evidence links, at most five debrief questions, blind comparison and casting view, bounded-order/exception replay, acceptance-versus-coverage screenshots or fixtures. Put the fixtures in harness; add no fourth repo.

**Done when you can verify:** From a case card, follow original work → confirmed observation → frozen scenario → candidate/configurations → independent comparison → decision → later observation or explicit pending follow-up. See one unmeasured/rejected control without a false green verdict. Watch a real bounded order return a reserved decision. Run the second vocabulary without editing factory core. Later outcomes remain pending until actually observed; whole-factory claims wait for the live evidence they require.

> /principal-feature --assurance critical Complete P16 from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md using pinned candidate builds and an explicitly bounded live-run charter. Demonstrate the real daily-learning path and bounded factory order, then a distinct non-development vocabulary. Separate fixture proof from live measurements; preserve rejected, unmeasured and pending outcomes. Keep the branch.

### P17D — Preferred pi-daddy simplification pilot

**Owner:** pi-daddy. **Assurance:** standard minimum; critical if affecting control, authority or acceptance. **Dependencies:** P12 and the affected packet gates; P16 before a campaign-wide success claim.

**Expected behavior:** Select one supported removal hypothesis: an unused layer, redundant projection, duplicated test obligation or obsolete current-navigation document. Inventory consumers and the obligation preserved. Prefer simplifying a touched area over an unrelated repository sweep. Keep historical probes and ADR provenance; archive navigation is different from erasing evidence.

**Deliverables:** One baseline/candidate removal manifest, surviving obligations, comparison and maintenance/complexity delta, updated links and package contents. If evidence rejects removal, keep the existing behavior and record the result.

**Done when you can verify:** The identified production mutation or behavior remains caught by an independent surviving check; supported runtime/control behavior remains unchanged; stale navigation is removed without broken references. The result reports what was removed and what still protects its obligation, not just lower line count.

> /principal-feature --assurance standard Execute P17D from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md as one measured pi-daddy removal hypothesis. Inventory consumers and preserved obligations, compare behavior and keep historical evidence. Escalate to critical before changing authority/control boundaries. Retain the original if the comparison does not support removal. Keep the branch.

### P17H — Preferred harness simplification pilot

**Owner:** skill-harness. **Assurance:** standard minimum; critical if changing evidence, scoring or eligibility. **Dependencies:** P12 and the affected packet gates.

**Expected behavior:** Select one redundant implementation/check or obsolete product-document path. Separate historical evidence and frozen contracts from current guidance. Reconcile stale publication/session guidance against verified source; do not rewrite old results to make the current release look qualified. Evaluator changes require independent reference cases and cannot grade themselves into success.

**Deliverables:** One removal/correction hypothesis, reader/consumer inventory, preserved measurement obligations, before/after verification and updated canonical navigation. Keep required generated adapters and the committed extension bundle synchronized.

**Done when you can verify:** Historical results still load with their original meaning; corrupted/missing evidence still fails its gate; current documentation points to one applicable instruction path. Removing an evaluation check is supported by an independently demonstrated equivalent, not a green suite that stopped testing the risk.

> /principal-feature --assurance standard Execute P17H from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md as one measured harness simplification. Preserve frozen contracts and historical results, reconcile current guidance and prove surviving measurement obligations. Escalate evidence/scoring changes to critical and use independent reference checks. Keep the branch.

### P17P — Preferred Principal simplification pilot

**Owner:** principal-pi-skills. **Assurance:** standard minimum; critical if changing assurance obligations. **Dependencies:** P12 and P14.

**Expected behavior:** Test one shorter instruction, removed handoff/delegation, redundant test or obsolete documentation path while retaining its acceptance obligation. Generated skill/agent forms are intentional outputs, not presumed duplicates. A model-visible reduction needs matched independent harness evidence; a passing packaging suite alone cannot establish equivalent behavior.

**Deliverables:** One removal hypothesis, template/source change and regeneration where applicable, word/package/maintenance delta and rollback candidate. Model-visible instruction/workflow changes require a fixed-model comparison with boundary cases; non-model-visible navigation/docs use consumer, link, package and obligation checks.

**Done when you can verify:** Applicable generation, install and packaging checks remain correct; changed model-visible behavior meets the frozen acceptance bar in the tested population. Current docs distinguish historical scores from current evidence. If the shorter workflow loses a required outcome, it is not adopted. Pure navigation cleanup spends no model tokens unless a specific model-visible effect is demonstrated.

> /principal-feature --assurance standard Execute P17P from /home/neman/Code/skill-harness/docs/factory/05-build-guide.md as one measured Principal simplification. Preserve acceptance obligations and generated forms; edit templates and regenerate where applicable. Use independent fixed-model evaluation for model-visible changes and consumer/link/package checks for other cleanup. Escalate assurance changes to critical. Keep the branch and reject unsupported removals.

## 5. Verification and source entry points

These commands exist in the inspected sources. Recheck them in P00 before use. They are a menu of applicable gates, not an instruction to run every suite for every packet. Dependencies/runtime setup and exact kickoff belong to step 7. Feature-specific demonstrations added by the packets must appear in `BUILD-REPORT.md` with their actual commands or UI actions and expected outputs.

| Run from | Existing checks | When they matter |
|---|---|---|
| `/home/neman/Code/principal-pi-skills` | `npm run generate:check`, `npm run test:unit`, `npm run test:install`, `npm run check:pack`, `npm run lint:skills`; `npm test` runs the complete sequence | Templates, assurance/report semantics, install/package compatibility. After template edits run `npm run generate` before checking. |
| `/home/neman/Code/pi-daddy/packages/pi-daddy` | `npm test`, `npm run typecheck`, `npm run test:integration:ci`, `npm run test:integration`, `npm run test:smoke` | Select unit/type gates and relevant real-pi/herdr integration. Verify model-triggering environment variables first; the inspected default integration path needs no model call when `PI_GRANTS_IT_MODEL` is unset. |
| Same pi-daddy package | `npm run test:mutation`, `npm run contracts:generate` | Mutation tests only in an isolated clean candidate checkout: they mutate sources. Generate when producer contracts change; then deliberately update the consumer pin. |
| `/home/neman/Code/skill-harness` | `npm run build`, `npm run typecheck`, `npm test`; `npm test -- <actual relevant test paths>` for focused cases | Core, adapters, comparison, archive and calibration changes. Resolve paths from current source. |
| Same harness root | `npm run build:ext`, `npm run check:ext` | Regenerate/verify the committed extension bundle when bundled core/CLI changes. |
| Same harness root | `node scripts/check-pi-daddy-v3-contract.mjs`; `npm run verify:pi-daddy-v3-contract -- <clean checkout at the declared producer pin>` | Contract parity and real production-builder fixtures, after required build. **Do not pass current pi-daddy main to an immutable historical-pin verifier.** |

The inspected harness v3 contract pin is `4a9524394ca995fd74ed9bbb836dc4e73cda3b8c`. Read the actual `PINNED.json` and use its clean exact checkout. Any new producer version needs deliberate schema/pin/generator updates; never hand-edit the generated adapter. Historical-pin compatibility and current-candidate integration are separate checks.

Existing `mutation-test` in harness covers trajectory assertion classes, not all trace/archive/calibration claims. Existing `judge-agreement` measures agreement, not precision. `screen`, stability and static checks cannot replace a controlled causal comparison. `run`, `compare`, `grade`, `suggest`, possible `regate` judging and capture promotion need the authorized model configuration; do not label them free.

| Packet area | Existing source seams to inspect first |
|---|---|
| pi-daddy contract/identity | `packages/pi-daddy/src/correlation.ts`, `ledger-events.ts`, `workflow-facts.ts`, `ledger-v3-validation.ts`; `packages/pi-daddy/contracts/ledger/` |
| Launch/receipts/fan-out | `packages/pi-daddy/src/spawn.ts`, `delegate.ts`, `run-child.ts`, `run-herdr.ts`, `check-runner.ts`, `fanout.ts`; `packages/pi-daddy/extensions/delegation.ts`, `run-delegation.ts`, `execute-child.ts` |
| View/control/effects | `packages/pi-daddy/src/dashboard-projection.ts`, `dashboard-render.ts`, `dashboard-herdr.ts`, `workspace-lease.ts`, `routing-authority.ts`; `packages/pi-daddy/extensions/grants-command.ts`; `packages/pi-daddy/herdr-plugin/` |
| Harness archive/cases | `packages/adapters/src/pi-json.ts`, `trajectory.ts`; `packages/core/src/execution-trace.ts`, `capture.ts`, `capture-trace-types.ts`, `spec-write.ts`, `journal.ts`; `packages/pi-extension/src/capture-cmd.ts` |
| Measurement/comparison/trust | `packages/adapters/src/pi.ts`, `prompt-provenance.ts`, `prompt-capture-extension.ts`; `packages/core/src/run.ts`, `results.ts`, `comparison.ts`, `screen.ts`, `adjudication.ts`, `vote-panel.ts`, `judge-agreement.ts` |
| Principal conventions/reporting | `contracts/workflows.md.tmpl` and other contract templates; `scripts/assurance-state.mjs`, `scripts/snapshot-workspace.mjs`; `schemas/`; `docs/ASSURANCE.md` |

For pi-daddy, current implementation guidance is in `CLAUDE.md`, `docs/SPEC.md`, `docs/WORKING-RULES.md` and the latest `docs/SESSION-LOG.md`; there is no repo `AGENTS.md` in the inspected tree. Keep current behavior in SPEC, decisions in dated ADR additions and measurements with their real source identities. Harness and Principal have their own `AGENTS.md`. Resolve conflicts against actual source and session authorization rather than blindly treating an old session note as current truth.

## 6. What completion means

For each packet, provide four distinct statements: **implemented behavior**, **verification performed**, **supported operating scope**, and **remaining blocked/pending evidence**. Include the exact commit/tree, dependency pins, assurance receipt and independently repeatable Done demonstration. A reviewer must be able to reproduce the claimed outcome without relying on the implementing agent's narration.

The factory is ready for daily use when passive visibility and bounded debriefs work on real sessions. It is ready for a particular autonomous profile only when its effect, budget, authority, restart and acceptance gates pass. It is self-improving within a stated population only when a real hypothesis has completed the evidence/decision/follow-up loop; a polished dashboard or synthetic fixture alone cannot establish that.

The next document is the implementing-agent handoff. It will reference these packet IDs and gates rather than duplicate or silently revise them.
