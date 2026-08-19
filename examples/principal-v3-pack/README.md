# principal v3 scenario pack example

Fifteen skill-level trajectory scenarios for risk-adaptive/critical assurance. The spec expects the
workflow under test to write normalized v1 events to `assurance/trajectory.jsonl` inside its throwaway
workspace.

`tests/protocol-fixtures/` contains five good/bad replay pairs for packet supersession, post-Build
task controls, whole-change review ordering, repair suspension/rebinding, and exact finalization.
They are exercised by `packages/core/test/principal-protocol-fixtures.test.ts`. The separate generic
`skill-harness mutation-test` proof uses synthetic normalized events to cover all 15 mutation classes.

This is **not** principal-pi-skills' live workflow E2E driver. It does not execute or replace the
eight-cell matrix in that repository. At creation time the seven principal E1 skill scenarios plus
Git-Ops E2 were static/linted but unmeasured, and all eight workflow E2E cells were unrun. Historical
v2 scorecards are not v3 evidence.
