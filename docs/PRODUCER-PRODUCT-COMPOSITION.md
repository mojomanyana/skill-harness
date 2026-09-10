# Opt-in producer-backed arms, finite panels and archive retro

`prepareProducerProduct` freezes a `producer-product-v1` plan;
`executeProducerProduct` executes it through original producer permits and the existing
Codex SDK/transport and host panel. The selected `qualification-worker.mjs` accepts this
only under `supervised-producer-product-launch-v1`. The older five-role launch version and
inert intervention/weekly APIs remain separate; no inert record is relabelled as observed.

## Exact scope

- N2/N3 **serial replay**, wave width1—not a live non-blocking primary/shadow deployment.
  All arms use the same frozen case inputs. Skill/prompt/configuration bytes must hash to
  the arm's declared digests; scenario/rubric/partition/repetition bytes must match the
  common input digests. Runtime configuration currently supports exactly `{}`; unhandled
  overrides are denied, not silently ignored. Model/effort/skill/prompt really vary.
- Finite case/arm/repetition schedule, calibration versus heldout partition and explicit
  boundary flag. One criterion per cell is the supported scope. At most32 pre-reserved
  invocations, including unused tie-breaks and optional one-shot retro. Larger schedules
  refuse before effects; no implicit retries, extra variants or budget resets.
- ONE original reserveBatch for the entire schedule, including all reserved judges/retro.
  Existing per-call byte bounds remain; aggregate byte reservations are exact worst-case
  sums. One global monotonic wall budget plus wall-clock rollback/approval expiry checks
  spans every cell/host. Cells cannot reset the experiment deadline.
- Original producer emitter remains model-free; it sends only its bounded id/sequence
  frame. SDK work stays in the trusted worker after child EOF. No new producer opcode,
  fixed-profile relaxation, reconstructed permit or replacement accounting owner.

## Evidence and eligibility

`createProducerInterventionRun` uses the existing intervention/archive/panel machinery with
an explicitly different producer journal type. It binds the plan, material and exact
cell-to-invocation IDs. `recordProducer` requires matching original settlement and actual
SDK-serialized request bytes. Retention must match that observed output hash. Whole-plan
settlement is required before finishing; failed/unknown plans cannot become complete.

Observed configuration means **outbound SDK request observation**, not provider-internal
truth. Backend identity, backend effort and actual instruction use remain null.
For a frozen `wall_ms` resource metric, each subject cost is observed monotonic
`performance.now()` elapsed time from original subject IPC exchange start through
acknowledged completion. This is client exchange time (including source settlement),
NOT server-generation time, tokens or subscription dollars. Judges/retro and subsequent
retention work are excluded. The same metric applies to every arm; existing assessment
sums retained cell costs per arm. A separate `subject-exchange-cost` journal record
preserves measurement scope without changing the original source observation.
Other resource metrics and invalid/unmeasured durations retain null cost. Unknown
acknowledgements produce no eligible cost retention; objective failures may retain
observed elapsed time but cannot become cheapest eligible. Partial/failed plans do not
finish. Cheapest eligible remains conditional, not adoption or a routing default. Source acknowledgement gates subject eligibility and judge
progress. Objective-failed cells remain visible and skip judges. Blind labels come from
the existing host/panel machinery; content can still disclose clues. Only a pre-reserved
clean-split third judge is conditional. Every compiled judge instruction explicitly
requests ONLY JSON, uppercase PASS/FAIL, Boolean suspect and exactly those two keys,
with no explanation. This states the existing closed vote schema; it does not guarantee
model compliance. Lowercase verdicts, extra keys and non-Boolean suspect still reject;
no normalization/coercion is permitted. An instruction change is a new proposed
experiment/source pin, never a retrospective repair of failed votes.
No model judgment selects an arm, adds a cell,
adopts a candidate or changes routing defaults.

Reference kind/digest/labels are explicit frozen inputs. Synthetic reference agreement is
fixture evidence, not accuracy/calibration. `liveAccuracy` and routing defaults remain null.
An `independent` declaration still needs genuine inspectable provenance; this API does not
authenticate that declaration. Repeats and heldout cells are retained individually; one
fixture run does not establish production stability or heldout efficacy.

## Model retro without new access authority

`prepareModel` / `runModel` are separate opt-in methods on the existing weekly owner.
Only predeclared archive manifest IDs pass through the existing bounded reader. Invalid
IDs, tool expansion, excess read count/input bytes and changed preparation refuse. One
prepared input is retained in that same journal; it cannot reset the weekly selection or
model call. Existing confirmed-case ownership is checked before preparation and execution.

The model receives only those frozen bytes and selection in one bounded text request—no
shell, path selector, extra filesystem tool or model-directed read loop. Original producer
settlement must match the plan before the response is parsed as a scope/limits-bound
hypothesis. It remains **proposed**, never automatically approved/promoted/executed. The
transport host's unknown-output proposer hash check is not an efficacy assessment of a
hypothesis; that record is preserved, while the weekly consumer validates the proposal
schema/identity. A joint plan's predeclared experiment is not claimed to have been caused
by the later proposal.

## Admission and supported environment

Product execution needs an exact product approval (`planSha256`, total maxCalls, path,
expiry) as well as the existing canonical/account/SDK charter checks. The selected launch
requires its exact launch digest and `approvedLiveCalls` equal to the complete product
reservation—not an old five-call approval. Fixture mode uses only inert ports and cannot
accept live approval. No new credential loader, scheduler, archive store or acceptance
owner exists. Existing OAuth/HTTPS logic is reused only behind the live gates.

Proofs use retained dependencies in a no-home/network-unshared namespace and the actual
pinned b17 source/installed SDK serializer. They cover N2 repeats+heldout, N3 distinct arms,
objective failures, original cancellation and required settlement-sync failure. Visibility
of settlement bytes is not an acknowledgement; unknown holds are not caller-released.
Independent parent supervision retains its documented limits: no hostile-code containment,
hard aggregate CPU/RSS/PID/money, server-generation cap or crash-recovery claim.
