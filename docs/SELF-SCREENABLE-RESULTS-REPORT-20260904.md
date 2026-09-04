# Self-screenable results implementation report — 2026-09-04

## Scope and identity

- Repository: `mojomanyana/skill-harness`
- Starting identity: `main` at `d4fe4134af25ccbf0ef69e37f85fc91ac419cac9`
- Working branch: `feat/self-screenable-results`
- Implementation commit: `db222298a74cf986423532cc25b6830f964a6713`
- Pull request: [#72](https://github.com/mojomanyana/skill-harness/pull/72)
- Subject calls: 0; judge calls: 0
- No principal-pi-skills content, derived agents, generated workflows, qualification evidence, release, publish, or tag was changed.

## What was added

### Results schema 3

New Pi runs write schema 3. Schema 1 and schema 2 continue to read at their own version; reading does not rewrite, migrate, or re-digest the file.

Schema 3 retains:

- one `subject_invocations[]` observation per scenario/repetition/retry/provider request;
- model-visible prompt projection byte length, raw SHA-256, normalized SHA-256, and normalization rule ID;
- delivery mechanism, contract SHA-256/bytes, occurrence count, and computed PASS/FAIL/ERROR;
- one `rep_judgments[]` entry per repetition, including its objective result;
- every panel member's identity, ordinal, overall vote/reason/suspect state, and every numbered criterion vote/reason;
- adjudication repetition, split members, and tie-break member where present.

Runtime validation requires a complete 0..N-1 repetition set, independently selects each repetition's terminal retry, validates contiguous provider request indexes, rejects orphan observations, recomputes panel/adjudication verdicts from clean raw votes, and asserts that aggregate objective status equals the strict ERROR > FAIL > PASS aggregation of per-repetition objectives.

### Byte-computed delivery and prompt provenance

The Pi adapter loads a harness-owned read-only observer after declared extensions. Pi's `before_provider_request` event exposes the final provider payload. The observer projects only model-visible prompt fields, computes digests and contract occurrences in-process, and writes only the observation—not prompt plaintext. It deletes its environment capabilities and unlinks the temporary contract before subject/tool execution.

Delivery status is not accepted from a run caller. The adapter binds contract bytes before launch and computes:

- red/control: zero occurrences on every terminal-attempt request;
- force/system prompt: exactly one occurrence on every request;
- green progressive disclosure: zero or more leading absences followed by one occurrence on every later request (`0*1+`); duplicates or disappearance fail;
- missing/unsupported capture: ERROR.

The `skill_delivered` objective assertion is added to every schema-3 repetition and aggregate. FAIL/ERROR uses existing objective precedence and prevents silent scoring before any judge call.

### Normalization registry

The first registry member is `cwd-line-v1`. It replaces exactly the value of lines beginning `Current working directory:` while retaining CRLF/LF form and every other byte. The rule's pattern, flags, replacement, identifier, and source digest live in one canonical core module. `source_hashes[observation:prompt-normalization]` lets lint identify registry drift; the remedy is a rerun because plaintext provider payloads are intentionally not retained.

### Offline `screen`

`skill-harness screen <run-dir>...` is in the canonical free/offline command set. It never resolves an adapter and makes no subject or judge call. It groups by skill × model × scenario, uses only byte-proven terminal-attempt delivery and clean/recomputed votes, and emits:

- control-like pass rate and n;
- treatment-like pass rate and n;
- per-criterion failure rate and n, including retained secondary/tie-break members only when their referenced repetition has proven delivery;
- CEILING (control ≥80%), FLOOR (≤10%), INFORMATIVE (20–70%), or UNKNOWN.

Schema-2 scenarios remain visible as UNKNOWN rather than disappearing.

## Test-to-production-change map

| Test | Production change that makes it fail |
|---|---|
| `observation.test.ts` missing delivery | Makes schema-3 delivery status/observations optional |
| v3 writer/read round trip | Drops subject observations, repetition panels, objectives, or criterion votes in production YAML APIs |
| panel and tie-break recomputation | Trusts recorded panel verdict instead of shared clean-vote collapse |
| duplicate/missing repetitions and independent retries | Uses array length or scenario-wide retry selection instead of exact per-repetition identity |
| per-repetition/aggregate objective validation | Lets a delivery FAIL/ERROR weaken into an effective judge PASS |
| schema-v2 byte identity | Rewrites legacy evidence merely by reading it |
| incomplete criterion completion | Drops a missing numbered item instead of retaining criterion ERROR |
| `prompt-provenance.test.ts` occurrence cases | Infers delivery from argv/mode or misses zero/duplicate delivery |
| user-role quotation case | Counts stimulus text as delivery |
| exact normalization case | Broadens `cwd-line-v1` beyond the one dynamic line or loses CRLF |
| Google `systemInstruction` case | Omits provider-specific model-visible system bytes |
| observer handler privacy case | Disconnects `before_provider_request`, writes payload plaintext, or leaves contract/evidence paths in child env |
| `pi.test.ts` observer ordering | Omits the observer flag or loads it before declared extensions |
| `delivery-gate.test.ts` | Lets an absent skill reach the judge or score without `skill_delivered` |
| schema-artifact positive/negative controls | Makes the schema bump cosmetic or makes new observation/objective fields optional |
| schema-3 `field-roundtrip.test.ts` | Drops observations, per-rep objectives, votes, arm data, or adjudication through grade/regate/rescore |
| `screen.test.ts` fixture | Trusts mode labels, suspect votes, failed retry observations, or changes classification boundaries |
| `screen-cmd.test.ts` | Resolves an adapter or adds a model/judge path to the offline command |
| command-cost test | Removes `screen` from the single canonical free/offline vocabulary or incorrectly adds a conditional-spend command |
| bundle test | Ships stale Pi code or omits the separate self-contained observer module |
| source remedy test | Fails to map prompt-normalization drift to the honest rerun remedy |

The new tests were mutation-checked manually: altered CEILING threshold, broadened normalization, disabled panel divergence, disabled per-repetition objective validation, removed observer argv wiring, and broke missing-criterion completion were all killed by their targeted tests.

## Verification

- `npm run build:ext`: PASS; main bundle and self-contained observer regenerated.
- `npm run typecheck`: PASS.
- `npm test -- --run`: **105 test files passed, 1 skipped; 1,584 tests passed, 25 skipped.** The 25 release-pack tests require the repository's pinned Node 20.20.2/npm 10.8.2 CI toolchain; this host used Node 26.7.0/npm 12.0.2.
- `node bin/skill-harness.js mutation-test`: **21/21 mutations detected; no model or judge calls.**
- `git diff --check`: PASS.
- Independent final review: APPROVE, no findings.

## Evidence integrity

Recomputed after implementation, without writing the study repository:

- `evidence/`: `ac742e8246eab9b70e805d17cbc02f89007761abc615fceffbdcd998e5f1f349`
- `measurement/`: `25c5f791a4a0d1324be72ada922c96c93eba0b0abd727fe9635b1a67a3123eea`
- `runner-state/`: `00f08b9f43d015a7fc882087d2ac8b9c467a1a2f6f30e126fd63b591aa1c3cfd`
- pre-existing root files (excluding the subsequently created discriminating-power report): `170a13c0fcdf8c534c57ea8a376213801e068e78308b81749006b26b7499007c`
- input discriminating-power report remained `4ff3e147e22009fa358737a72ebb6f3831ec7fb1f65239c4668644dd9c895b05`.

## Can the previous UNKNOWN corpus now be classified?

**No historical UNKNOWN cell was reclassified.** Schema-1/2 files do not contain evidence that can be recovered honestly, and this change deliberately does not fabricate or backfill it.

**A newly recorded schema-3 cell is now classifiable from its retained result alone.** The fixture proves CEILING (5/5 control PASS), FLOOR (0/5), INFORMATIVE (1/5 and 7/10 boundary cases), and UNKNOWN (inconclusive or absent evidence), plus treatment rates and criterion failure rates. That is structural proof that future calls accumulate into a screenable asset; it is not empirical product evidence and consumed no model/judge budget.

## Deliberately not done

- No in-place migration, restamp, or rewrite of historical results: missing prompts/votes cannot be reconstructed.
- No plaintext prompt retention: only lengths, digests, mechanism, and occurrence counts survive.
- No change to judge prompts, overall verdict parsing, scoring, clean-vote rules, tie-break authorization, or panel aggregation.
- No change to the qualification-runner-v1 artifact schemas. That runner is a separate frozen/accounted boundary and already retains hash-bound raw judge artifacts; merging its contract with ordinary `results.yaml` would be a separate schema decision, not an incidental retention edit.
- The existing auto-rejudge policy that selects one documented transcript for a multi-repetition cell was not changed. Changing that would alter adjudication semantics. Schema 3 records the selected repetition and every member; a redesign, if desired, needs a separate proposal.
- No live Pi/provider smoke call was made because the approval boundary prohibited further call spend. Adapter hooks and installed bundle shape are fixture-tested; a future authorized smoke is still the only proof against a real provider payload version.
