# Factory: work, review, learn

**Product guide for the current implementation candidate.** The last audited releases
are skill-harness **0.15.0**, pi-daddy **0.26.1**, and Principal **3.2.0**.
New learning entrypoints below require the matching candidate/release packages;
publication and installed-flow verification are separate gates. Check
`skill-harness --version`, `skill-harness learning help`, and the loaded Pi resources.
Do not assume an existing session reloaded because a package was updated. Use a **fresh
Pi session** when upgrading an already-published immutable dashboard bridge: `/reload`
cannot replace the old global API. No other running session needs to be stopped.

## Who does what?

**pi-daddy** coordinates permitted work and owns execution, steering and the future-order
registry. **Herdr** displays its sessions and side panel. **skill-harness** retains
measurement and learning evidence. The panel is not an autonomous worker. Finished
execution is not human acceptance.

Use the producer's `/grants work` guided setup for multiple obligations, dependencies,
priority and explicit agent/model/thinking selections, then its supported run/host controls.
For existing single-task use, `pi-daddy work add --id report --outcome "Review the report"`
remains supported. Only listed controls are available. Pausing new dispatch does not
cancel running work; changing a next-order policy does not mutate active sessions.
Principal's ordinary current/stale/superseded reports remain unchanged.

## Open learning in Pi

With both matching extensions loaded, use **`/grants learning`** from the current host.
The producer binds the exact current snapshot, archive, population and local review author.
A changed scope must report a mismatch, not silently reuse an old learning workspace.

The harness also exposes **`/skill-harness learning --state "WORKSPACE"`** (use the
workspace path displayed by the host), or `skill-harness learning --state "WORKSPACE"`
in a terminal. These open the **same guided flow and durable records**, not another app.

1. **Readiness** explains what's retained, what's missing, and why automatic questions
   are silent. Opening a review is deliberate: it neither reserves attention nor
   represents an earned automatic question. It starts no model or delegation.
2. **Connect retained input** lists compatible case batches and qualified comparisons
   already in the selected archive. Pick one and give it a short name and title.
   No hand-written manifests or ledger JSON. No compatible evidence is an honest empty state.
3. **Review cases** shows nominations and lets you open their actual retained evidence
   sources by selection (CLI: `learning evidence BATCH --item N --evidence N`). Redacted
   or unavailable sources are marked, never called complete evidence. Record confirmed defect, expected
   behavior, exemplar, uncertain or skip, with a reason. Corrections are append-only.
   Confirming a case is not promoting a test or establishing a cause.
4. **Review comparisons** opens complete retained artifacts under A/B labels. Acknowledge
   each complete artifact only after reviewing it. Then choose one, tie, none acceptable,
   or insufficient evidence. **Reveal model/cost** is a separate action, enabled only after
   the durable quality receipt. Artifact contents themselves may disclose identity.
5. **Record adopt / reject / defer** records a separate scope-bound decision. Reject and defer
   are normal outcomes; neither forces a preference or reveal. Missing evidence can be
   durably deferred. Adopt is intent, not activation.
6. **Propose hypothesis** records prediction, disproof, downside, rollback and a competing
   explanation from an actual case. **Link original hypothesis** only accepts the comparison's
   actual frozen origin, never a retrospective replacement.

Previously retained excerpt feedback concerned
**excerpts**. Keep that receipt unchanged and linked as prior feedback. It is not full-artifact
acceptance, detector calibration or a fresh blind experiment. An old unscoped quality choice
also does not automatically become a full-artifact acknowledgement.

## Configure trust without writing manifests

Open **Trust / independent labels** in the same guided flow:

- Before freezing, explicitly add any real unflagged incident evidence and select its split.
  Only selected evidence files are retained; do not include private sessions or secrets.
- Select a retained case batch, detector and evaluation split. The product derives the
  cohort and predictions from actual nominations and groups repeated target observations
  into one incident. Detector version and population remain exact.
- Automatic questions default to **silent**. To configure them, explicitly select minimum
  resolved independent incidents, the confidence lower bound, attention budget and expiry.
  The form previews the exact frozen policy. It creates **no independent labels**.
- Review cases independently, then choose **Link current case label**. Unflagged sample
  labels have their own explicit evidence/author step. Preference, model self-report,
  panel agreement and exit zero are not independent correctness labels.

Missing calibration, missing unflagged samples, held-out absence, conflicting labels,
expired policy and exhausted attention stay visible. Reopening neither resets choices nor
refills attention. Correcting a linked case withdraws its old label from confidence.
The original producer closing path still requires presence, quiescence and its exposure gate.

## Scoped adoption and later work

Use the connected **producer learning controls** for activation/rollback. The producer candidate
implements two separate profiles: unchanged **`fixed-policy-v1`**, and
**`ordinary-work-policy-v1`** for model/effort-only changes to the same selected task IDs and
agent definitions. The latter does not change instructions, skills, grants, capabilities,
topology or assessment policy; do not disguise those changes as model/effort or fixed policy.
The producer prepares policy bytes and owns independent authority and the original registry.
This is source-level support, not an installed integration or release claim.

Activation needs the exact selected candidate, original confirmed case/hypothesis/comparison,
current independently verified eligible facts, explicit adoption authority, and registry
revision consent. The original registry revalidates these again. Only its actual activation
receipt advances the learning record to activated. New ordinary-work orders pin the policy
under fresh eligibility confirmation; active or history-bearing runs never migrate.
Rollback similarly needs its own authorized request and original applied registry receipt.
A stored lifecycle link, human preference or prepared receipt cannot substitute for either.

**Adoption / outcomes** can inspect linked later observations or record one using complete
artifact, original/current requirement and independent evidence files. Unknown is valid.
Acceptance requires both the exact accepted artifact and independent acceptance evidence.
Changed requirements, changed artifact, out-of-scope, success, caught defect and escape remain
distinct. No outcome triggers automatic rollback, and no single outcome proves improvement.

## CLI and local archive use

```sh
skill-harness learning status --state "WORKSPACE"       # human readiness
skill-harness learning status --state "WORKSPACE" --json # integration/details
skill-harness learning review reports --state "WORKSPACE"
skill-harness learning help                             # all explicit operations
skill-harness learning guide                            # this guide, packaged offline
skill-harness learning current                          # packaged requirement register
```

Without a producer host, `skill-harness learning` guides connection to an explicitly selected
archive and selecting an actual retained case scope. Or use
`learning init --archive DIR --author NAME --confirm`; multiple retained scopes ask you to
select `--scope-item N`. Snapshot digest and population are derived from actual cases, not
typed hashes. For a comparison-only archive with no cases, `--scope TEXT --population TEXT`
can explicitly declare a local review scope; it cannot bind mismatching case snapshots.
Use the producer flow to connect a host. Noninteractive writes require explicit `--confirm`.
All learning commands are offline/no-model. Command completion is never a quality verdict.
Local author attribution and content hashes are not authentication or hostile-owner attestation.

Current requirements and remaining evidence: [STATUS.md](STATUS.md).
