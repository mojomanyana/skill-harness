# Current State & Handoff

## Active Architecture

- **Pi-only runtime (Pi >= 1.6.1)**: Pi is the sole subject, judge, and spec-drafting executable. Older Pi releases (`< 1.6.1`) and legacy `0.83.0` capture compatibility have been removed.
- **Pi qualification**: `QUALIFIED_PI_VERSIONS = ["1.6.1"]`; CI runs `scripts/pi-qualification/capture.mjs 1.6.1` across both native and adapter stages with a loopback scripted provider.
- **Pi-daddy contract**: `pi-daddy-record-v1` is the sole pi-daddy ledger adapter, pinned under `contracts/pi-daddy/ledger-record/v1/` to `pi-daddy@1.1.3`. Legacy `v1`/`v2`/bare-`v3` ledger formats and Herdr fields/enums are removed. See [PI-DADDY-RECORD-COMPATIBILITY.md](PI-DADDY-RECORD-COMPATIBILITY.md).
- **Session harvesting & judge defaults**:
  - `skill-harness harvest <session.jsonl> --out <dir> [--id <id>] [--prompt <text>] [--unique] [--json]` turns real Pi sessions into secret-redacted, `parseSpec`-validated regression scenarios.
  - `defaultJudge()` resolves `models.fast` and `modelFallbacks.fast` from `~/.pi/agent/ecosystem.json` when `--judge` and env overrides are omitted.
- **Authoring entry points**: `/skill-harness create <idea>`, `author`, and `skill_author` retain briefs, preview/apply exact drafts, prepare controls, and collect explicit label review.

## What the product retains

The current release retains bounded tool completion facts and exact private judge-input artifacts to run/grade/regate. Saved evidence must match the original digest, identity, and assistant turns; unbound evidence stays unknown. See [JUDGE-EVIDENCE.md](JUDGE-EVIDENCE.md) and [VALIDATION-INDEX.md](VALIDATION-INDEX.md).

## Before handing off a change

1. Run `npm run build:ext`, `npm run typecheck`, `npm run check:ext`, and `npm test`.
2. Run `node scripts/vendor-pi-daddy-record-v1-contract.mjs ../pi-daddy --check` when touching `pi-daddy` contract files.
3. Run `git diff --check` and confirm no `.pi/`, `scratch/`, release artifacts, or provider credentials are staged.
