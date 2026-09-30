# Changelog

## 0.22.0 — Objective output assertions (2026-10-01)

### Added

- Add `assert.output_matches` and `assert.output_excludes` regex gates over the final assistant message.
- Re-evaluate output gates from retained transcripts with `regate`, without rerunning the subject or spending judge calls on objective failures.
- Reject unknown assertion keys and invalid output regexes during lint.

## 0.21.0 — Split skill and spec roots (2026-09-30)

### Added

- Add `--specs <root>` and `SKILL_HARNESS_SPECS` so skill text can remain in one repository while specifications, fixtures, post-tests, and results live in another.
- Record whether each source hash came from the skills root or the specs root.
- Report each spec's root in `list` and reject duplicate specs across both roots.

## 0.20.0 — Pi-only model routing (2026-09-29)

### Changed

- Route subject, judge, and spec-drafting model calls exclusively through Pi.
- Change the default judge and `suggest` model to `openai-codex:gpt-5.6-sol`.
- When a retained result records the removed direct-Claude judge provider, use the current Pi default for its next judge-backed rewrite and record the new judge.
- Reconcile active documentation with the current command surface.

### Removed

- Remove direct Claude CLI / `claude-code` judge routing.
- Remove obsolete handoffs, superseded plans, dated measurements, and draft posts.

## 0.19.0 — Pi subject usage accounting (2026-09-29)

### Changed

- Use structured Pi capture by default.
- Record nullable per-repetition subject input, output, and cache-read token counts.
- Derive subject cost from the dated repository price table at `packages/adapters/prices/model-prices.json`.

### Known limitation

- Judge usage is not yet recorded.
