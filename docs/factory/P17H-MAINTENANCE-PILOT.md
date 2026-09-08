# P17H local maintenance pilot — one redundant reconstruction

**Hypothesis supported for this local source change.** Baseline `0475e1f5684e01992850c48aa14841751711701a` rebuilt an already detached intervention manifest through the single-use `manifestWithDerived` helper before canonical comparison. The candidate compares the detached manifest directly. The complete frozen-field comparison, role gate and error remain; no evaluator check or test was removed.

Scope: `packages/core/src/intervention.ts::manifestValid`. Consumers are the pre-spend role check, evidence assessment and blind comparison. The wrapper function and one reconstruction allocation are removed, source shrinks83 bytes, and the rebuilt committed extension bundle is byte-identical. No runtime speed claim is made.

## Independent surviving obligations

The existing committed intervention/intervention-results/fixed-model-comparison tests and generated fixture bytes were NOT edited for this pilot. They continue to reject frozen input drift, incompatible fixed-model subjects, unqualified roles and missing outputs, and preserve quality-before-reveal behavior.

- Baseline selection:14 passed.
- Same candidate selection plus bundle guards:17 passed.
- Preserved result/schema-history and trace validators:105 passed.
- Direct build, bundle regeneration, fixture reproduction and diff check passed.
- All recorded oracle/test/generator/fixture byte hashes remained unchanged.

Detailed before/after inventories and actual logs are retained in the campaign's local P17H evidence. No raw evidence was added to source. No models, mutation testing, grants, archive data, historical results or source under test were changed by the comparison.

This is a deterministic source-maintenance comparison, not model efficacy or effect/hostile-process qualification. Full P12/P16/overall acceptance dependencies remain pending; the local pilot is not a campaign-wide P17 success claim.
