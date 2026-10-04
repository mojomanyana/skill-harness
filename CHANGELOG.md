# Changelog

## 0.23.0 — Structured judge votes (2026-10-04)

### Changed

- Require new judge replies to use one JSON object with ordered criterion votes, an overall verdict, and reasons; parse the first complete object, including fenced replies, and strictly validate its shape and criterion count.
- Retry one invalid judge reply with the original prompt plus its validation error. If the retry is also invalid, record the repetition as UNGRADED and retain both raw replies.

### Added

- Record `judgeFormat: json` on newly judged repetitions while continuing to load retained prose-format results without migration.

## 0.22.4 — Incomplete criterion votes are UNGRADED (2026-10-04)

### Fixed

- Repetitions with any ERROR criterion vote after the judge retry now aggregate as UNGRADED; previously a raw overall PASS could credit incomplete evidence. UNGRADED reps remain in the denominator as non-passes, passing siblings can still meet the scenario threshold, and existing FAIL ship-bar allowances apply.
- Offline `rescore` reclassifies retained missing-vote repetitions without changing raw judge evidence or spending model tokens.

### Added

- Add the UNGRADED verdict and optional `ungraded_reps` count to results schemas 2 and 3. Reports and `list` surface the count separately from judged failures; lift and stability do not label ungraded results as behavioral failures.

## 0.22.3 — Judge criterion-vote recovery (2026-10-01)

### Fixed

- Judging now retries missing criterion votes once with identical judge input; previously missing votes remained ERROR immediately. Record optional `judgeRetries: 1`, count both calls, and retain ERROR votes and the last raw reply if the retry also fails. Judge prompts and overall verdict semantics are unchanged.

### Added

- Add `regrade <run-dir> --unparsed-only` to repair only retained repetitions with ERROR criterion votes using their recorded judge, without rerunning subjects or rejudging clean repetitions.

## 0.22.2 — Fireworks model prices (2026-10-01)

v0.22.1 was tagged before the version bump and has no published artifacts; this release supersedes it.

### Fixed

- Add current Fireworks token prices for DeepSeek V4.1 Flash and Nemotron Lightning 3.5 30B A3B.

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
