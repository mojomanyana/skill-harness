# Scoped adoption predicates — P13 input for P15

Owner: skill-harness, source `packages/core/src/adoption.ts`. These are deterministic validation/data functions, not an activation service or an authenticated authority store. No model participates in their decision path.

`buildAdoptionBinding` pins hypothesis, experiment, candidate, scope, assessment policy, rollback candidate and expiry. The only supported activation boundary is `next-orders`. `authorizeAdoption` additionally requires separately supplied host-approved binding IDs and independently verified eligible facts matching every identity. Defaults deny. `validateAdoptionReceipt` recomputes authorization at use; a stored receipt or caller flag alone cannot authorize activation.

P15 must independently establish that host context, revalidate under its own authoritative state/lock at application, and preserve old order pins. The receipt has `grantExpansion:false`; it cannot expand grants, migrate existing orders or make an unsupported effect profile supported. Hashes are integrity under trusted host storage, not signatures or malicious-same-user rollback protection. The API does not manufacture an approval by copying incoming IDs into the context.

`classifyProductionObservation` links a later independently confirmed observation to the exact adoption/hypothesis/experiment. A confirmed defect is an escape only with an explicit prior acceptance digest and the same accepted artifact/requirements. Changed requirements/artifacts, caught-before-acceptance defects, out-of-scope and unknown observations remain distinct. The host must verify those observation/acceptance facts; no raw runtime claim establishes them. Nothing automatically rolls back.

`buildRollbackRequest` binds restore candidate/scope/adoption/reason/evidence and its own expiry. `authorizeRollback` needs an independently approved request digest plus matching CURRENT active adoption/candidate/scope. It returns `application:not-performed`. A new explicitly authorized rollback may have its own validity window after the original adoption window; stale rollback cannot overwrite a newer candidate. Automatic deterministic rollback-rule evaluation is not implemented here.

`summarizeLeanOutcomes` reports one explicitly comparable population: first-pass acceptance without a repair, complete/unknown denominator coverage, confirmed escapes excluding changed requirements, recovery work, observed decision wait and question counts. Missing measurements are not zeros; there is no universal agent score. Inputs must be independently established host outcomes, not labels inferred from an exit code.

## Remaining integration

Real trusted authorization/reference storage, qualified comparison eligibility, authenticated human choice, actual activation/migration/rollback application, production follow-up and full P13/P15 acceptance remain pending. These predicates do not close those gates.

```sh
node node_modules/vitest/vitest.mjs run packages/core/test/adoption.test.ts packages/core/test/factory-calibration.test.ts
```

Fixtures use fixed synthetic host declarations; they are not live authorization or efficacy evidence.
