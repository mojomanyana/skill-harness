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

- one `subject_invocations[]` observation per authenticated provider request, or explicit parent-authored ERROR when observation is unavailable/unauthenticated;
- model-visible prompt projection byte length, raw SHA-256, normalized SHA-256, and normalization rule ID;
- delivery mechanism, contract SHA-256/bytes, occurrence count, and computed PASS/NOT-MEASURED/ERROR;
- expected `criterion_count` plus one `rep_judgments[]` entry per repetition, including its objective result;
- every panel member's identity, ordinal, overall vote/reason/suspect state, and every numbered criterion vote/reason;
- adjudication repetition, split members, and tie-break member where present.

Runtime validation requires a complete 0..N-1 repetition set, independently selects each repetition's terminal retry, validates contiguous provider request indexes, rejects orphan observations, recomputes panel/adjudication verdicts from clean raw votes, and asserts that aggregate objective status equals the strict ERROR > NOT-MEASURED > FAIL > PASS aggregation of per-repetition objectives.

### Byte-computed delivery and prompt provenance

For extension-free subjects, the Pi adapter loads a harness-owned read-only observer. Pi's `before_provider_request` event exposes the final provider payload. The observer projects only model-visible prompt fields, computes digests and contract occurrences in-process, and writes only the observation—not prompt plaintext. The observer HMAC-authenticates every complete observation and an end-of-session count. The parent rejects mutation, replay, truncation, or a missing summary, source-binds contract digest/length/mechanism, and recomputes status rather than accepting those child fields.

Arbitrary scenario/arm extensions and arm-supplied runtime environment share Pi's process, so no in-process capability can be made secret from hostile code while still observing after its payload rewrite. Those runs now fail provenance closed: the child receives no capture/contract path, the observer is not loaded, and the parent writes explicit unauthenticated `ERROR`. This prevents forged PASS evidence at the cost of leaving extension-bearing cells unscreenable until an out-of-process recorder exists.

Delivery status is not accepted from a run caller. The adapter binds contract bytes before launch and computes:

- red/control: zero occurrences on every terminal-attempt request;
- force/system prompt: exactly one occurrence on every request;
- green progressive disclosure: zero or more leading absences followed by one occurrence on every later request (`0*1+`);
- known zero, duplicate, or disappearing delivery: NOT-MEASURED;
- missing, unsupported, or unauthenticated capture: ERROR.

The `skill_delivered` objective assertion is added to every schema-3 repetition and aggregate. NOT-MEASURED/ERROR prevents judging and blocks SHIP. NOT-MEASURED is excluded from efficacy denominators rather than counted as product failure.

The standalone observer remains committed because Pi git installation performs no build and the adapter loads that sibling module at runtime. Its build now aliases the core barrel to the dependency-free normalization module: the artifact shrank from 119,681 bytes/3,391 lines to 5,928 bytes/118 lines, with CI assertions forbidding js-yaml, trajectory, and qualification identifiers.

### Normalization registry

The first registry member is `cwd-line-v1`. It replaces exactly the value of lines beginning `Current working directory:` while retaining CRLF/LF form and every other byte. The rule's pattern, flags, replacement, identifier, and source digest live in one canonical core module. `source_hashes[observation:prompt-normalization]` lets lint identify registry drift; the remedy is a rerun because plaintext provider payloads are intentionally not retained.

### Offline `screen`

`skill-harness screen <run-dir>...` is in the canonical free/offline command set. It never resolves an adapter and makes no subject or judge call. It groups by skill × model × scenario, uses only byte-proven terminal-attempt delivery and clean/recomputed votes, and emits:

- control-like pass rate and n;
- treatment-like pass rate and n;
- a separate not-measured count that never enters efficacy denominators;
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
| per-repetition/aggregate objective validation | Lets NOT-MEASURED/ERROR weaken into an effective judge PASS |
| schema-v2 byte identity | Rewrites legacy evidence merely by reading it |
| incomplete criterion completion | Drops a missing numbered item instead of retaining criterion ERROR |
| `prompt-provenance.test.ts` occurrence cases | Infers delivery from argv/mode or misses zero/duplicate delivery |
| user-role quotation case | Counts stimulus text as delivery |
| exact normalization case | Broadens `cwd-line-v1` beyond the one dynamic line or loses CRLF |
| Google `systemInstruction` case | Omits provider-specific model-visible system bytes |
| observer handler privacy case | Disconnects `before_provider_request`, writes payload plaintext, or leaves contract/evidence paths in child env |
| adversarial `pi.test.ts` extension | Exposes capture paths, trusts extension-written JSON, or permits same-process extensions to claim authenticated PASS |
| `delivery-gate.test.ts` | Lets an absent skill reach the judge or score without `skill_delivered` |
| schema-artifact positive/negative controls | Makes the schema bump cosmetic or makes new observation/objective fields optional |
| schema-3 `field-roundtrip.test.ts` | Drops observations, per-rep objectives, votes, arm data, or adjudication through grade/regate/rescore |
| `screen.test.ts` fixture | Trusts mode labels, suspect votes, failed retry observations, or changes classification boundaries |
| `screen-cmd.test.ts` | Resolves an adapter or adds a model/judge path to the offline command |
| command-cost test | Removes `screen` from the single canonical free/offline vocabulary or incorrectly adds a conditional-spend command |
| bundle test | Ships stale Pi code or omits the separate self-contained observer module |
| source remedy test | Fails to map prompt-normalization drift to the honest rerun remedy |
| permanent mutation required-ID test | Removes any of the 36 named catalogue entries or lets the printed denominator drift |
| mutation command outside-checkout test | Makes the free catalogue depend on repository fixtures instead of installed code |
| adversarial extension/runtime-injection tests | Exposes capture/contract paths, loads the observer beside hostile code, accepts forged JSONL/HMAC, or trusts arm preload environment |
| parent contract-binding/MAC test | Trusts child-supplied contract identity/status or accepts a tampered authenticated envelope |
| bundle exclusion test | Pulls js-yaml, trajectory, or qualification code back into the observer artifact |
| ordinary-vs-critical adjudication test | Restores the always-true wrapper identity comparison or drops the genuine critical bound |
| delivery-ERROR adjudication test | Spends a judge call on a schema-3 instrument failure |
| selected-repetition primary-vote test | Combines an aggregate scenario verdict with repetition-zero criteria/transcript |
| criterion-count/truncation test | Accepts a shortened criteria array that still has a `criteria` property |
| adjudication state/verdict test | Accepts an unresolved label whose clean votes recompute to settled PASS/FAIL |
| score/UI parity NOT-MEASURED tests | Counts an undelivered experiment as product failure or lets it SHIP |
| screen NOT-MEASURED test | Adds an undelivered repetition to an efficacy denominator or hides its separate bucket |
| delivery/regrade suppression test | Sends a known-undelivered transcript to either the initial judge or a later `grade` call |
| review-server delivery guard test | Resolves an adapter or spends a judge call on NOT-MEASURED/ERROR through `/rejudge` |
| unsupported-PASS validation/screen tests | Accepts or counts a behavioral PASS with no retained clean judgment |
| top-level aggregate validation test | Lets `scenario.judge_verdict` contradict retained repetition panels and still SHIP |

The former ad-hoc source mutations were promoted into the permanent `mutation-test` catalogue. Its required-ID test derives the expected total from a named list, so removing an entry fails without a hardcoded numeric assertion. The catalogue now includes schema-v3 rejection, zero/duplicate/unobservable delivery, objective judge suppression, normalization and contract binding, extension forgery/observer wiring, and screen boundary/filter cases.

## Verification

- `npm run build:ext`: PASS; main bundle and self-contained observer regenerated.
- `npm run typecheck`: PASS.
- `npm test -- --run`: **105 test files passed, 1 skipped; 1,602 tests passed, 25 skipped.** The 25 release-pack tests require the repository's pinned Node 20.20.2/npm 10.8.2 CI toolchain; this host used Node 26.7.0/npm 12.0.2.
- `node bin/skill-harness.js mutation-test`: **42/42 mutations detected; no model or judge calls** (21 before this change, 42 after).
- Adversarial mutation proof: changing the extension trust policy back to allow same-process observation made `pi.test.ts` fail (exit 1, capture path exposed).
- Catalogue removal proof: deleting one production catalogue case made `mutation-cmd.test.ts` fail (exit 1, required ID absent).
- Real historical read: all 205 available principal-pi-skills results parsed as schema 2; aggregate file hash remained `049fd98bdb0f474aa4e379e2de9f869ce41bd3043f5cee2b89dac42ce507aa3c`. That corpus contains no schema-1 result to exercise beyond the existing migration tests.
- `git diff --check`: PASS.
- Independent final whole-change review after all repair rounds: APPROVE, no blockers.

## Evidence integrity

Recomputed after implementation, without writing the study repository:

- `evidence/`: `ac742e8246eab9b70e805d17cbc02f89007761abc615fceffbdcd998e5f1f349`
- `measurement/`: `25c5f791a4a0d1324be72ada922c96c93eba0b0abd727fe9635b1a67a3123eea`
- `runner-state/`: `00f08b9f43d015a7fc882087d2ac8b9c467a1a2f6f30e126fd63b591aa1c3cfd`
- pre-existing root files (excluding the subsequently created discriminating-power report): `170a13c0fcdf8c534c57ea8a376213801e068e78308b81749006b26b7499007c`
- input discriminating-power report remained `4ff3e147e22009fa358737a72ebb6f3831ec7fb1f65239c4668644dd9c895b05`.

## Schema-3 meaning boundary

This PR deliberately changes what a new result means. Schema 3 reports behavioral efficacy only after delivery is established; NOT-MEASURED is excluded from pass-rate denominators and ERROR remains instrument/evidence failure. Schema 1/2 meanings and bytes are unchanged. Judge prompts, overall judge parsing, and clean-vote collapse remain unchanged.

The adjudication warning defect was introduced by this PR when `repetition` retention wrapped the adjudication object and the old identity check compared against the pre-wrapper object. It now compares the bounded object against the wrapper. Separate tests cover ordinary adjudication and the genuinely bounded critical aggregate. No subject/judge calls were made on this branch, and no existing result artifact contains the spurious text; no historical evidence was rewritten.

## Can the previous UNKNOWN corpus now be classified?

**No historical UNKNOWN cell was reclassified.** Schema-1/2 files do not contain evidence that can be recovered honestly, and this change deliberately does not fabricate or backfill it.

**A newly recorded schema-3 cell is now classifiable from its retained result alone.** The fixture proves CEILING (5/5 control PASS), FLOOR (0/5), INFORMATIVE (1/5 and 7/10 boundary cases), and UNKNOWN (inconclusive or absent evidence), plus treatment rates and criterion failure rates. That is structural proof that future calls accumulate into a screenable asset; it is not empirical product evidence and consumed no model/judge budget.

## Review disagreement / boundary

I agree with the forgery finding but disagree that a positive provenance channel can be made inaccessible to arbitrary extensions while observer and hostile extension execute in the same Node process. Hiding an environment variable or giving a signing key to a process that also loads hostile extensions is not a security boundary: arbitrary same-process code can inspect process state and filesystem capabilities. The honest repair is fail-closed `ERROR` for extension/arm-runtime-bearing runs, with no observer capability exposed. On the extension-free path, the observer's short-lived HMAC key protects the log from later model tool subprocesses and is removed before those tools execute. Trustworthy positive evidence for those runs requires a future out-of-process provider recorder or OS isolation.

## Deliberately not done

- No in-place migration, restamp, or rewrite of historical results: missing prompts/votes cannot be reconstructed.
- No plaintext prompt retention: only lengths, digests, mechanism, and occurrence counts survive.
- No change to judge prompts, overall verdict parsing, clean-vote rules, tie-break authorization, or panel aggregation. Scoring deliberately excludes schema-3 NOT-MEASURED cells from efficacy denominators and blocks SHIP on their presence.
- No change to the qualification-runner-v1 artifact schemas. That runner is a separate frozen/accounted boundary and already retains hash-bound raw judge artifacts; merging its contract with ordinary `results.yaml` would be a separate schema decision, not an incidental retention edit.
- The existing auto-rejudge policy that selects one documented transcript for a multi-repetition cell was not changed. Changing that would alter adjudication semantics. Schema 3 records the selected repetition and every member; a redesign, if desired, needs a separate proposal.
- No live Pi/provider smoke call was made because the approval boundary prohibited further call spend. Adapter hooks and installed bundle shape are fixture-tested; a future authorized smoke is still the only proof against a real provider payload version.
