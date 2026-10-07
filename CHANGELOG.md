# Changelog

## 0.24.3

- Add explicit `pi-daddy-record-v1` ingestion for current native governance ledgers, pinned to the corrected pi-daddy 0.44.3 producer contract. Verify closed envelope/body schemas and the full hash chain before normalizing observations.
- Preserve historical bare-v3/v2 selectors and retain current model, definition, usage and execution identities without inventing grants or subjective verdicts.
- Enforce current schema negation, unique-array and exclusive numeric-bound constraints; reject unknown fields and torn or tampered records.

## 0.24.2 — release-state documentation and verification (2026-10-07)

- Separate source release targets from live npm and GitHub state in release documentation, so candidate preparation cannot be mistaken for a publication claim.
- Re-verify the Pi 1.0.4 extension-loader fix through the canonical pack path and an isolated npm installation without changing runtime behavior.

## 0.24.1 — Pi 1.0.4 extension-loader compatibility (2026-10-07)

- Declare TypeBox as a wildcard host-provided peer in the published Pi extension package while retaining it as a development dependency for builds and tests. This prevents a duplicate runtime copy and removes Pi 1.0.4's extension-loader warning.

## 0.24.0 — stable Pi qualification and final conformance (2026-10-07)

### Fixed

- Refuse fresh subject execution unless `pi --version` reports exactly `1.0.4`; unavailable, prerelease, older and newer versions produce a durable execution ERROR before subject spawn. They cannot silently select historical parsing or become judgeable during saved regrading.
- Match runtime final eligibility: concatenate visible text blocks without an inserted separator or trimming, reject tool-call or unknown block types as finals, and mark empty/thinking-only finals unavailable. Whitespace-only bytes remain preserved. Existing trace redaction is unchanged.
- Record settled `length` stops as `truncated` with the precise output-limit reason. Recorded provider or execution failures stop dependent structured turns. Known unavailable execution does not trigger the empty-answer retry; the existing provider-only empty-response retry for text-only compatibility adapters remains unchanged.
- Keep a bounded state marker when dropping streaming update payloads, so later activity invalidates an earlier final. Malformed update records remain errors, and malformed-line diagnostics are emitted once by the parser.
- Copy actual capture provenance verbatim from its original producer commit, pin that source separately, and share the runtime/harness final conformance table over the unchanged captures.

### Compatibility

- This corrected prerelease supersedes rc.1 for evaluation. The published rc.1 tag and artifacts remain immutable; this change does not assert npm publication or stable promotion.

- Retained result schemas remain readable. Exact Pi `0.83.0` raw captures retain their fixture-backed historical parser, which does not claim current settlement qualification; all other parser versions are unqualified. Structural capture errors (missing/duplicate tool identities, unmatched completions, malformed messages) apply to every parsed version and make objective trace evidence ERROR. Historical raw final text now uses the same separator-free, untrimmed assembly, which can affect whitespace-sensitive output-gate regexes on newly parsed captures; saved artifacts are not rewritten.
- Fresh structured runs end at a recorded provider or execution failure, including when no assistant text is available. This restriction is not limited to scenarios with trace gates. No model-quality evaluation or additional Pi version qualification is claimed.

## 0.24.0-rc.1 — Pi 1.0.4 settlement evidence (2026-10-07)

### Fixed

- Require settled Pi 1.0.4 delivery before judging. Terminal errors, aborts, missing settlement, malformed captures and nonzero process exits remain infrastructure ERROR during both new runs and saved regrading.
- Preserve the latest assistant final and its whitespace; an earlier successful answer cannot replace a later failure. Successful settled retries can supersede transient transport diagnostics without changing the existing empty-response retry policy.

### Changed

- Label requested Agent tasks and outstanding parent tool calls without claiming observed child launches or child concurrency.

### Added

- Add sanitized, hash-pinned actual Pi 1.0.4 CLI captures and parser, adapter, run and regrade regressions. Legacy version handling remains separate.
- Prepare synchronized prerelease package metadata. This candidate does not claim remote-provider qualification or npm publication, and does not promote a stable version or the npm latest tag.

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
