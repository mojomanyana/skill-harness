# Software factory: post-merge continuation plan

> Portable copy captured 2026-09-11 from the coordinator-owned source at SHA-256 `e04dc99b037d890bf89b0666f263b41e88fd91469ae6b9b1cf2ea2f8c9620d8e`; trailing Markdown spaces were normalized for the repository whitespace gate. The Windows source was not modified.

Campaign: `factory-01a071db`
Prepared: 11 September 2026
Status: continuation started 11 September 2026 in the existing Sol Pi/Herdr session. See [current delivery status](../CURRENT.md) for progress and user-visible milestones; no new live milestone is yet claimed validated.
Merge authority: the user alone. This document does not approve any PR or authorize merging.

## 1. Purpose and outcome

Finish the user-facing software factory promised in the original scope. Existing components must become a usable daily workflow: declare an outcome, execute work, watch and steer through herdr, capture evidence without monitoring prompts, detect useful learning cases, compare configurations, make an evidence-backed decision, and observe later outcomes.

The highest-priority user requirements include **parallel sessions with different models and thinking levels**, a **usable pi-daddy dashboard in herdr**, and coworking in the existing Pi/herdr environment. A successful two-call review or a synthetic replay does not fulfill those requirements.

This plan combines the prior coordinator gap inventory with the user's supplied independent review. It distinguishes confirmed source findings, reported findings requiring verification, missing live evidence, and optional architecture choices. It is not a claim that every primitive is correct or that every review recommendation should be implemented.

## 2. Sources and immutable baseline

The supplied review is preserved verbatim in [factory-01a071db-independent-review-2026-09-11.txt](factory-01a071db-independent-review-2026-09-11.txt). SHA-256: `f81e97ffb0bed8b64aacfc14077baf454be256fcac3ae977193c12c53e996453`. Keep the original unchanged and record adjudications separately.

Reviewed PRs and source identities:

| Repository | PR | Reviewed HEAD |
|---|---|---|
| skill-harness | https://github.com/mojomanyana/skill-harness/pull/74 | `c51d57d8badfa3503fc9e5bc52e0ab234e583f93` |
| pi-daddy | https://github.com/mojomanyana/pi-daddy/pull/35 | `7a43219f8f5aa7597034c27b17b68d09222de28c` |
| principal-pi-skills | https://github.com/mojomanyana/principal-pi-skills/pull/39 | `dda608492cc63a2837b0a06225d82be1f75783af` |

Original planning baseline: skill-harness `37532a44140f1d2db4051e5b748668ff9f9cb0ec`:

- `docs/factory/04-one-page-scope.md`
- `docs/factory/05-build-guide.md`
- `docs/factory/06-implementing-agent-handoff.md`

The original scope references earlier steps 1–3. Neither the independent reviewer nor the coordinator has located them in the sources searched. Verification is against the retained written specification and explicit later user instructions, not a reconstructed verbatim brainstorming conversation. Exact visual layouts and selector interactions are not established by those missing sources; propose them as new design choices rather than claiming they were agreed.

Local source locations, if the next session has this WSL host:

- Harness: `/home/neman/Code/factory-01a071db/skill-harness`
- Producer: `/home/neman/Code/factory-01a071db/P01-workspaces/ppw-vSUcVq`
- Principal: `/home/neman/Code/factory-01a071db/principal-workspace`
- Evidence root E: `/home/neman/Code/factory-01a071db/evidence/local-resume-20260908`

Useful local evidence: `CURRENT-CLOSURE-60.md`, `FINAL-READINESS.md`, `FINAL-MANUAL-USE.md`, `installed-workflow-validation/REPORT.md`, and `installed-session-review-implementation/authorized-once/{REPORT.md,receipt.json}` under E. These are not assumed to exist on GitHub. Old headers and old open/closed flags need reconciliation with newer receipts.

## 3. What is already delivered; do not rebuild it

- Governed execution retention and external archival, with explicit coverage and source references.
- Generic intent/acceptance schemas and projections; deterministic control, experiment, decision and adoption interfaces.
- Daily-view rendering, connected dashboard-host transport, debrief state and blind-choice storage.
- Model/effort/skill/prompt comparison support in the producer-backed **serial replay** composition; separate fixed-profile concurrent experiment machinery.
- An opt-in model-backed archive-retro path: `weekly-investigation.ts` exposes `prepareModel`/`runModel`, and `producer-product.ts` calls it. Real daily operation remains unproven.
- Isolated installation checks: 25 pass, 0 fail, 0 skip in the recorded Principal/Pi installation occurrence.
- One installed-session review occurrence: two SDK calls, two HTTP attempts, two original completion acknowledgements, active work zero, isolated roles, actual extension hooks and sealed subject output before judging. Advisory PASS is not whole-campaign acceptance.
- Published harness HEAD above has CI run `34536261885` successful, with 2,064 tests and three bundle checks. Existing pi-daddy CI evidence is recorded separately. Recheck merged-head CI later; do not reuse old green results for changed source.
- P17 dispositions are legitimate completed investigations: harness removal supported, Principal proposal rejected, producer retained/inconclusive. Do not reopen them merely to achieve a removal count.

## 4. Independent review: adjudication register

Keep the original review intact. The following is the coordinator's current interpretation, not a replacement reviewer verdict.

| Finding | Disposition and required follow-up |
|---|---|
| F1: daily work does not populate intent | High-priority integration gap. A targeted source scan confirms the sole production call to `appendWorkLedgerEventOnce` is in intent application, writing revisions/snapshots. Trace builders and all production routes on the merged revision before editing; then add explicit authorized intent and occurrence/acceptance wiring. |
| F2: digest-only effect profile | Confirmed limitation of the original experiment/order profile. Newer supervised model-review/serial-product paths exist, so “no real workload anywhere” is too broad. Real model-based concurrent variants and useful factory orders are not thereby delivered. Extend/reuse an appropriate existing execution route; do not require an arbitrary shell sandbox for every useful scope. |
| F3: no real detector/debrief feed | Integration gap with some existing source-job plumbing. Derive facts from actual retained events and receipts; do not recreate the existing archive/host connection or pretend declared facts are observed facts. Closing-pause integration needs a separate trustworthy signal. |
| F4: bespoke Codex transport complexity | Architecture/maintenance concern, not a proven functional defect or automatic rewrite instruction. Produce a keep/simplify/replace comparison using required guarantees and supported Pi/provider APIs. Preserve subscription-only execution and measured accounting. |
| F5: parallel infrastructure | Needs a dependency and ownership map. Two comparison families are explicitly required for fixed-model versus model/effort interventions; new modules or unchanged old files alone do not prove redundant systems. Consolidate only demonstrated duplication with a migration and compatibility case. |
| F6: stale published tracker | Confirmed continuity defect. Current working-copy guide/handoff/report differ substantially from tracked versions. Publish a concise current register and reviewed evidence, retaining history separately. |
| F7: raw JSON steering UX | Confirmed: dashboard CLI lines 237–243 consume stdin JSON. Add user-facing actions that construct validated requests through the existing host control route; raw CAS envelopes must not be the ordinary user workflow. |
| F8: misleading legacy Principal default | Reviewer-supported compatibility/UX issue. Verify consumers and current renderer semantics. Correct the ordinary user-facing current status while retaining explicit historical views; changing machine formats or regenerating unchanged templates is not automatically required. |
| F9: runner portability | Reproduce only relevant failures and document prerequisites. The review's “public-preview runner” characterization is not independently established here and may become stale. Verify supported runner availability before deciding. Do not remove namespace coverage to get green CI. |
| F10: documentation overload | Confirmed navigation/status problem; quantity alone is not a defect. One current entry point, clear published/installed/observed identities, preserved historical ADRs and failed evidence. |

Corrections to other review statements:

- “The weekly retro never invokes a model” is too broad: the opt-in model-backed composition exists. The missing result is real archive operation and an observed hypothesis-to-outcome loop.
- “Full-stack extension-bearing measurement is entirely missing” is too broad after the installed-session occurrence. That bounded owned-session path worked; arbitrary live interactive-session attribution and steering remain separate gaps.
- Do not treat an advisory FAIL on an earlier pilot as a code defect or a merge veto by itself.
- Do not accept `agent_settled + retention finish` as proof of a closing pause without validating session lifecycle semantics. The original agreement explicitly warns against this shortcut.
- Do not silently make a task digest the user's intended obligation or convert an exit-zero/check result into acceptance. An automatic identifier can establish provenance; it cannot invent intent or authority.
- Squashing commits, changing the CI runner, replacing transport, switching report defaults and accepting a synthetic second domain are recommendations/decisions, not already approved technical facts. A real second domain remains the original target unless explicitly amended.

## 5. Post-merge start gate

1. Read this plan, the original scope and the full supplied review. Check applicable repository instructions.
2. Verify PR merge state from GitHub and record actual merge/squash commits and resulting branch heads. Do not merge anything. If a required PR is unmerged, report that dependency; do not start work that assumes it is merged.
3. Verify which reviewed code survived the merge. Reconcile new code-review findings with this register before fixing or dismissing them.
4. Check running owners/ledgers and dirty worktrees. Use one explicit writer per worktree and pinned cross-repository inputs. A worktree registration alone is not an owner.
5. Create a continuation checkout/branch from the actual merged baseline under the existing campaign conventions. Preserve the old campaign/evidence worktrees.
6. Build a compact requirement-to-code-to-evidence table. Do not replay the whole campaign or rerun spent model grants.

Expected first-session output: verified baseline, reconciled findings, one chosen vertical slice and exact completion checks. Do not spend that session constructing another review framework.

## 6. Work queue and acceptance checks

IDs C00–C10 are follow-up tracking labels mapped to the original packets. They do not create a new product or revive withdrawn per-packet review ceremonies.

### C00 — Publish a truthful, portable current state

Owner: harness integration owner. Original scope: continuity, P00/P17H. Inputs: review F6/F10 and all latest receipts.

- Create one short current status and requirement register; move navigation toward it without erasing historical documents.
- Record original requirements, later amendments, verified implementation, actual execution, open findings and unverified claims separately.
- Publish a reviewed, redacted evidence index with available receipts or explicit unavailable-evidence labels. Keep credentials, raw private reasoning, private sessions and spent approval capabilities out of Git.
- Include the supplied review and this plan as review inputs when publishing the continuation documentation; retain their provenance and a separate adjudication file.
- Remove stale current-facing “local only,” “TODO,” or “blocked” statements only where evidence establishes the new status. Preserve original statements as dated history where necessary.
- Verify Principal's relevant CI and all actual merged-head checks.

Done: a GitHub-only reviewer can determine what is implemented, demonstrated and pending without reading this chat or the WSL filesystem. Every open item has an owner, evidence location and next action.

### C01 — Connect declared intent to normal execution

Owner: pi-daddy. Original packets: P01/P02/P04. Review: F1. Dependency: C00 baseline.

- Provide a minimal supported way to declare an outcome/obligation and bind ordinary governed delegation to it, reusing existing contracts.
- Emit occurrence joins at the real execution/retention boundary with unique attempt and parent identities. Recover incomplete evidence conservatively.
- Record acceptance only from an explicitly authorized acceptance operation or approved objective policy bound to exact revisions. Runtime success remains distinct.
- Make everyday setup practical; users must not author ledger JSON manually. Surface source registration/retention setup through existing configuration with explicit policy rather than a silent scan of all sessions.

Done: one ordinary task creates a visible obligation and real attempt without hand-editing files; retry does not double-count progress; changed work invalidates old acceptance; duplicate delivery is idempotent; missing bindings remain visibly unknown. No monitoring prompt or worker status turn is introduced.

### C02 — Derive learning signals from retained work

Owners: harness for archive/fact derivation; pi-daddy for the exact producer join. Original packets: P03/P07/P10. Review: F3. Depends on C01 for intent-dependent signals.

- Reuse current archive watch/checkpoints and host source jobs. Derive supported repeat, checkpoint, completion, reopen and evidence-coverage facts from actual receipts/events.
- Preserve expected wait, expected failure during development, changed requirements and insufficient evidence as distinct states.
- Keep semantic interpretation asynchronous and advisory. Start silent; no automatic alert flood.
- Establish selected-source access, retention/redaction and export behavior. Existing public-source approval does not mean blanket private-data collection.

Done: real retained work produces a traceable candidate and a good example without `/note` or fabricated facts; replay/restart does not duplicate cases; observer delay/failure does not block the worker; unresolved evidence is visible.

### C03 — Make herdr usable for watching, choosing and steering

Owner: pi-daddy's existing herdr plugin/CLI, consuming harness read models. Original packets: P04/P05/P08. Review: F7 and F3 pause boundary. Depends on C01; case cards use C02.

- Show current/overall obligations, individual attempts and variants, requested/observed model and effort where available, runtime, acceptance, evidence freshness, obstacles and concise factual explanations.
- Provide understandable keyboard/menu/command interactions appropriate to the existing terminal UI. Reuse the host transport and control validators. Users should not type raw JSON or CAS tokens.
- Expose scope/priority changes, approved alternatives, pause new dispatch and deliberate cancellation. Distinguish requested, pending, applied, rejected and unknown outcomes.
- Validate actual busy-child steering and reconnects. Do not claim safe arbitrary-TUI targeting from separate reads or terminal typing; prefer an existing owned-session route where it satisfies the task.
- Deliver at most five total case/blind-choice cards at a verified suitable pause; retain unanswered cards and defer on uncertain presence/session boundaries. A settled event alone is insufficient evidence of closure.

Done: a person can watch and steer one real task through the loaded herdr interface, see parallel variant state when C04 is available, and answer/defer real case cards without touching ledger files. Repeated reads/reconnects do not steer workers, refill attention budgets or fabricate continuity. Keep a short screen recording or screenshots plus action receipts, subject to data policy.

### C04 — Real parallel model/thinking-level variants and shadows

Owners: pi-daddy execution and harness comparison, with separate repository writers. Original packets: P06/P09/P11/P12. User priority: central. Dependencies: actual baseline and selected effect profile; integrate with C03 when ready.

- Reuse serial product scheduling, original reservations and measured installed-session transport as appropriate. Connect real concurrent sessions without inventing a second budget owner or weakening legacy wait-for-all behavior.
- Support explicit per-variant model, thinking level, skill/prompt differences and matched frozen inputs. Unsupported settings fail clearly; requested settings must not be described as provider-internal proof.
- Demonstrate two and three variants with separate destinations/results, total call/byte/time reservations, bounded fan-out and no contamination.
- Demonstrate a primary plus shadow: a stalled/cancelled shadow does not delay primary completion; original owner retains shadow lifetime/accounting through completion or explicit unknown state.
- Provide one usable configuration/launch flow. The precise UI is an implementation proposal, not a recovered brainstorming promise. Expose safe configuration through existing tooling, with herdr display integrated through C03.

Done: approved, bounded real sessions with different model/effort configurations overlap in time; evidence proves isolation, real request settings, primary independence, complete accounting and honest failed/missing arms. A serial replay must remain labelled serial. First evidence can use read-only review work; writable software variants require C07's appropriate effect profile.

### C05 — Correct ordinary Principal status and simplify setup

Owner: principal-pi-skills; producer/harness consumers pin the resulting contract. Original packet: P14. Review: F8.

- Identify which normal user entry points still show misleading all-history aggregation or empty-evidence failure.
- Make the ordinary current-work view understandable; preserve a named legacy/history view and compatibility for machine consumers where required.
- Change templates/generated artifacts only if their source contracts actually change. Reuse the already-passing installation/generation checks; rerun only checks affected by new changes.

Done: a normal user sees current accepted, failed, unknown, stale and superseded states correctly without needing to discover a special format. Historical evidence remains inspectable. Any incompatible machine-format change has an explicit migration decision.

### C06 — One real learning loop and quality-first comparison

Owner: harness, with existing producer execution and herdr decision UI. Original packets: P08/P10/P12/P13/P16. Depends on C02/C03 and a qualified experiment route; C04 is required for a claim of parallel comparison, but a labelled serial experiment can independently test the learning loop.

- Use an actual confirmed case and the existing model-backed archive-retro route; arrange weekly execution through existing scheduling capabilities, not a new scheduler.
- Record a hypothesis, prediction/disproof conditions, independent references, boundary/held-out cases, role separation and a frozen finite budget before running.
- Compare a real candidate with the existing approach. Record an authentic human quality choice before model/cost reveal when claiming the blind-choice requirement; do not generate a human decision.
- Keep objective failures, missing arms and uncertain votes visible. Quality eligibility precedes cost. Client elapsed time is not server time or subscription dollar billing.
- Record adopt/reject/defer separately. Pin any adopted configuration to supported future work with rollback and later outcome linkage.

Done: original work → observed case → confirmed hypothesis → frozen experiment → independent comparison → decision is navigable in existing tools. A losing hypothesis is a valid completed experiment. Later outcomes remain pending until observed; do not call the entire learning loop validated while that follow-up is pending.

### C07 — Useful bounded factory order

Owner: pi-daddy, reusing harness evidence and approved configuration/adoption inputs. Original packets: P06/P15/P16. Review: F2. Depends on a scoped execution-profile decision.

- Select one concrete useful workload, such as read-only review or isolated file edits followed by deterministic tests. Do not promise arbitrary shell autonomy as the first profile.
- Compare existing owned-session/supervised routes with the digest-only profile. Reuse a route that can enforce the declared effects, destinations, resource bounds, cancellation and failure semantics.
- Reserve total order/experiment resources, pin authority and revisions, and keep model judgments out of dispatch/grants.
- Demonstrate multiple dependent steps, finite recovery, continuation of independent work and a reserved decision returned to the user.

Done: an actual useful task progresses without manual per-turn coordination, stays inside the declared effects/budget, does not duplicate effects after restart/unknown acknowledgement, and returns a real reserved decision. Unsupported broader profiles remain explicit. Do not treat cgroups, hard dollar caps or a transport rewrite as universal prerequisites unless the chosen claim requires them.

### C08 — Second real domain and observed outcomes

Owner: domain skill owner plus existing integration owner; no changes to generic core vocabulary solely for the domain. Original packets: P13/P16.

- Select one genuine non-development workflow with defined stations and acceptance, using available authorized data/tools.
- Run the same intent, capture, comparison and decision contracts. The existing synthetic layout world remains fixture evidence.
- Observe later eligible work after an adoption or rejection; record acceptance, escaped defects, user attention and uncertainty within comparable work classes. Keep calibration training and evaluation outcomes separate, including unflagged samples.

Done: a real second-domain case uses the unchanged generic contracts; later results are recorded honestly. Scheduling a follow-up is not equivalent to observing it. This phase has unavoidable elapsed-work time.

### C09 — Targeted complexity and portability review

Owners: affected repositories; one integration owner. Review: F4/F5/F9/F10. Can proceed read-only alongside the main slices; do not hold all daily-mode work for a speculative rewrite.

- Map why the custom transport/IPC exists and which guarantees each layer supplies. Compare the existing supported Pi/provider route on the exact same necessary requirements.
- Recommend keep, simplify or replace with evidence, migration scope and rollback. Do not remove attestation/accounting merely to reduce line count; do not defend redundant layers merely because they were expensive to build.
- Map archive/case/comparison responsibilities and consolidate only verified duplication. Preserve the required separate comparison semantics and old evidence readers.
- Verify supported CI runner/prerequisite availability and actual portability failures. Keep environment limitations separate from code defects.

Done: concrete decisions and narrowly scoped follow-up PRs, or a documented reason to retain the current design. No automatic transport rewrite, history rewrite, force-push or wholesale documentation deletion.

### C10 — Coworking, periodic cleanup and final reconciliation

Owner: existing coordinator and affected product owner. Inputs: explicit user instructions plus original continuity rules.

- Keep execution observable in Pi/herdr. Stop asking the user to interpret technical findings or repeat previously authorized routine approvals.
- Define periodic cleanup eligibility using actual process/owner/dependency state. Close only completed campaign agents that have no dependent work; preserve evidence and the user's active coworking session. Never infer safety from an idle label or worktree registration alone.
- Distinguish the existing Codex 30-minute campaign heartbeat from any product-level monitoring feature. Decide and document where ongoing checks belong; do not create duplicate monitors or writers.
- Reconcile final review findings and native acceptance dispositions once the delivered scope is known. Do not erase historical CHANGES-REQUESTED/UNVERIFIED records or solve an infeasible historical fixture by assertion.

Done: one clear next-action/status source, a maintained follow-up queue, safe cleanup observations, a user-oriented usage guide, and an evidence-backed whole-scope assessment. Merges of follow-up PRs still belong to the user.

## 7. Delivery order and stopping rules

1. **Baseline and daily visibility:** C00 → C01 → C02, with C03 read-only usability as soon as its inputs exist. First milestone: a real task appears automatically in herdr and yields a traceable case.
2. **User-priority interaction and variants:** finish C03 and C04; C05 can proceed independently in Principal. Second milestone: choose model/effort variants, watch them run concurrently, compare results and steer safely.
3. **Actual factory behavior:** C06 and C07 using the exact supported profiles. Third milestone: one evidence-backed improvement decision and one useful bounded order.
4. **Breadth and outcomes:** C08; close C09 decisions and C10 continuity/final reconciliation. Later outcomes may remain scheduled and explicitly pending while other authorized work continues.

Use short vertical slices and the existing public commands/interfaces. Run meaningful targeted tests per change and required merged-head/PR checks. Conduct the user's requested overall review at a coherent milestone; do not spawn repeated planning/critique/judge swarms per task. Fix confirmed issues, not reviewer opinions alone.

The independent review estimated roughly 2–3 weeks for usable daily mode, excluding a major execution-profile/transport replacement. That is an external estimate, not a verified schedule. Re-estimate after the merged-baseline inspection and first daily slice. Do not promise the entire remaining product in an hour or delay the first useful result until all assurance/architecture work is finished.

Stop only dependent work for a genuine missing capability, unauthorized consequential effect, or a forbidden repair. Continue independent authorized work. Missing private-data policy, authentic human choice and later outcomes cannot be filled in by elapsed time or agent assertion; prepare the concrete choice first, then ask only for what is actually necessary.

## 8. Standing constraints

- Use WSL directly when on the original host. Do not ask the user to run commands or read files the agent can access.
- Use existing Pi/herdr for implementation, one explicit writer per repository/worktree, isolated continuation checkouts, pinned cross-repository contracts. Do not assume the old pane/session is still alive after merge; inspect first.
- Only the user's OpenAI Codex subscription for live model execution. No API-key/PAYG or alternate-provider fallback. Freeze concrete run scope/budget, use fresh run authority and never reuse spent approvals.
- No model calls on the deterministic dispatch/grant control path. Proposer, subject and judge retain the required distinct identities and fresh contexts.
- No mutation tests or per-packet model review loops. Preserve ordinary behavioral tests and actual runtime safeguards.
- Preserve unrelated local changes and all historical evidence. Never prune, clean, edit or reuse `/var/tmp/pi-daddy-timeout-20m/ppw-QN1zvH`. Worktree registration alone is not active ownership.
- User authorized commits, pushes and PR work, but **no merges**. Repository publication must exclude secrets/private evidence and follow existing permission boundaries. Do not install globally, delete evidence or change security/account configuration as a shortcut.
- Keep progress updates short: current slice, actual result, evidence and next action. Report implementation, live observation, acceptance and release separately.

## 9. Copy-paste prompt for the continuation session

> Continue factory-01a071db after the user-controlled merges. Read `factory-01a071db-post-merge-plan.md` and the accompanying verbatim independent review. First verify actual merge commits, current code-review findings, repository instructions and live ownership; never merge or assume the reviewed heads equal the merged baseline. Reconcile the review through section 4, especially the already-existing model-retro and installed-session paths. Implement through the existing Pi/herdr workflow using one writer per worktree. Start C00/C01 and deliver a real automatically populated daily view; prioritize C03/C04 herdr usability and parallel model/thinking-level sessions next. Reuse existing contracts, preserve evidence, use only Codex subscription model execution, and do not resurrect mutation testing or per-task review loops. Publish follow-up changes as reviewable PRs without merging. Keep source gaps, missing observations and genuine user decisions separate. Continue authorized work autonomously; stop only the affected work for a concrete blocker. Do not replay spent live runs or ask the user to adjudicate code. Update this plan's status/evidence register after each meaningful slice.
