# Conditional calibration reports (P13 statistical slice)

`calibratePredictions(predictions, {outcomes})` recomputes per-component/version/population/conditioning/split statistics. Outcomes are independently supplied host context, never correctness flags accepted from predictions. The host must establish their independent provenance; the function does not authenticate arbitrary caller context.

- Eight correct and two incorrect resolved incidents with three unresolved produce8/10 precision and3 unresolved, not8/13 or11/13.
- Repeated predictions/labels from one incident do not increase sample size. Conflicting reference identities or outcomes remain unresolved.
- Tuning predictions are explicitly excluded; calibration and held-out populations stay separate. Approval and rejection reliability are separate groups.
- An unmatched version/population cannot inherit prior outcomes. No resolved incidents means unknown precision/interval, not zero or perfect accuracy.
- Reports include a Wilson95% interval and are always advisory. Agreement is not an independent outcome.

`recommendExposure(report, selectedPolicy, now)` defaults to silent without a policy, rejects inapplicable/expired policy, and checks minimum resolved evidence, confidence and attention limits. It can recommend ask or retire; it never applies a policy, changes routing/grants or authorizes adoption. Reports must be freshly recomputed by this module and are frozen; deserialized/injected better scores cannot be used as exposure inputs. The host is responsible for selecting an authorized policy established before promotion, not post-hoc tuning.

This is not completed P13: authenticated reference/decision integration, actual calibration sampling/unflagged miss detection, adopted exposure policy, hypothesis/experiment-bound adoption and rollback, later production escapes and lean outcome metrics remain pending. No component is promoted or trusted by adding this code.

```sh
node node_modules/vitest/vitest.mjs run packages/core/test/factory-calibration.test.ts
```

The fixtures are fixed independent reference examples, not live measurement or evaluator qualification.
