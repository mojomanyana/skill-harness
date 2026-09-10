# Two-call, tool-free producer review

For the additive, actual `AgentSession.prompt` path with pinned installed resources,
see [Installed-session review v1](INSTALLED-SESSION-REVIEW.md). The extension-free
profile documented below retains its historical semantics and approvals.

`producer-review-v1` is an opt-in path for one frozen code review and one separately isolated,
advisory judge. It does not replace exact-output qualification, intervention experiments or
native acceptance. `prepareProducerReview` and `executeProducerReview` are adapter APIs;
`examples/codex-local-boundary/producer-review-launch.mjs` is the supervised entry.

## Why a separate path

An execution-engine pin does **not** restrict the revision of code supplied as review input.
The historical qualification runner can consume newer source while keeping its old producer
pin. However its current positional-only configuration cannot add `--no-tools`, its fixed
accounting policy is not a one-subject/one-judge ceiling, and invocation accounting is not an
SDK/HTTP-attempt cap. Its panel policy requires two initial judges. Those are the relevant
configuration limitations; reviewing newer code is not one of them. No historical pin or
accounting policy was changed to accommodate this pilot.

The existing producer-product path instead requires an exact pre-known output digest and
N2/N3 arms. It remains unchanged. A free-form review cannot honestly provide that digest.

## Supported profile

- Fixed subject `openai-codex:gpt-5.6-luna` and judge `openai-codex:gpt-5.5`, both low effort.
  Each SDK call gets a fresh one-message context with no tools, extensions, prior response,
  session/cache identity or retries. Separate contexts/models do not establish independent
  training or remove same-provider grading correlation.
- Complete frozen packet:1–32768 UTF-8 bytes, SHA-256 checked; task and criterion each≤2048bytes.
  The PR35 packet is21489bytes, not an excerpt silently substituted by the launcher.
- Two calls total; request≤65536bytes each/131072total, response SSE≤262144each/524288total (framing overhead is distinct from final text).
  Final text≤4096bytes, nonblank and control-character checked. Preparation checks the actual
  subject request and worst admitted review escaping in the judge request before effects.
- Original producer `reserveBatch` reserves two original permits once. Producer input-byte
  accounting charges its binding/frame material; the host independently reserves SDK request/
  response maxima. These are different byte scopes, not a claim that the code packet is706bytes.
- Per-call original source deadline≤30s; shared monotonic90s limit, approval expiry and clock
  rollback refusal. An independent parent uses existing trusted-host supervision and2s grace.
  Failed/unknown settlement retains original accounting; unhanded permits are cancelled, not
  refunded. Existing output directories reject replay. No automatic retry or third judge.
- Only actual final text crosses to the judge, after its digest is durably sealed and original
  source completion acknowledges matching binding/frame/claim/response references. Admission
  says `structural-text-only-not-behavioral-pass`, never objective behavioral PASS. The judge
  receives the frozen packet/rubric and sealed review, not reasoning, identity/cost or old verdicts.
- Strict `{verdict: "PASS" | "FAIL", suspect: boolean}` advisory output. No adoption, routing,
  merge or native acceptance is performed. Every result says `acceptance: not-assessed`.

The new named SDK/HTTPS entrypoints allow larger **review** requests. Historical entrypoints
retain their4096-byte request cap,16384-byte response cap, exact-output comparisons and strict SSE decoder. The review profile raises bounded SSE byte capacity only; it does not expand accepted event shapes or reasoning-item bounds.
The native transport still validates exact HTTPS destination/TLS, strips SDK credentials,
uses only the lazy read-only approved OAuth snapshot, refuses API keys/refresh/redirects/
proxies/fallback and makes no retry. No credential bytes enter the packet or prepared manifest.

## Sequential reasoning summaries

The single reasoning item may contain0–16 sequential summary parts. Each part must start
empty at the next integer index, retain the reasoning item/output identity, finish its
matching text and then finish its matching part before the next index is admitted. The4096
UTF-8 byte limit is aggregate text across all parts, not a fresh allowance for each part.
The completed reasoning item must contain exactly those summaries in order; a full terminal
must still repeat the same completed items. Private SDK thinking is checked against the SDK's
paragraph joining/empty-summary behavior and the exact completed signature. Public output
remains final text only. Ciphertext, response-size and original exact-answer checks remain.
Retained-response verification is offline; it does not retroactively repair a failed run or
its spent approval.

## Prepare and execute

A private `producer-review-launch-v1` JSON contains `profile`, `plan`, canonical `runtime`
(node, SDK root, producer root, OAuth file path), absent `outputRoot`, exact source `pins` and
`executionApproval: null`. Preparation checks content/source pins without importing the SDK,
starting a producer, reading auth or consuming a call:

```sh
node examples/codex-local-boundary/producer-review-launch.mjs --prepare /absolute/fresh/launch.json
```

The result prints the launch/plan digests and exact future execute argv. Only after separate
user authorization, a fresh `producer-review-launch-approval-v1` file binds `launchSha256` and
`executionApproval:{version:"producer-review-approval-v1",scope:"subscription-live",planSha256,
journalPath:"<outputRoot>/owner",approvalId,expiresAt,maxCalls:2}`. Then the printed
`--execute-approved <launch.json> <fresh-approval.json>` command is the supported live route.
The parent atomically claims a new output directory, supervises its worker, and releases only
that launch digest to it. The worker rechecks pins/approval before any SDK/source effects.
`--fixture` accepts only an explicitly fixture profile and cannot use live approval/auth.

## Campaign observation — PR35 pilot

The first pilot failed during response parsing: its two sequential reasoning-summary parts
were refused by the old index-zero-only check. Its original failure and spent approval remain
unchanged. After the bounded parser repair, a separately authorized fresh pilot completed
2SDK calls/2HTTP attempts, with2original producer completions acknowledged and active0.
The advisory judgment was **FAIL**, `suspect:false`; its strict response supplied no reason,
and none is inferred. No extra call or rerun seeking PASS followed. Execution success is not
review success. Campaign acceptance remains **incomplete**; nativepending226 and historical
independent-review verdicts are not superseded. Private reasoning, transcripts and approvals
are not publication artifacts.

## Evidence and non-claims

Offline tests cover full packet delivery, unknown-output sealing, rejected input/approval/
SDK/source changes, original acknowledgement failure, cancellation, clock rollback, malformed
votes, failed transport and replay refusal. The installed-SDK/original-producer proof uses the
same entry in a no-auth/network-unshared namespace with inert HTTP; it observes two completed
original acknowledgements, two charged attempts, active0 and sealed-before-judge input.
Neither fixture votes nor passing tests are real review quality, live entitlement or approval.

This is trusted-host execution. Source pins are supplied authority, not remote attestation.
It does not authenticate a loaded interactive Pi extension or a human, guarantee termination
of remote generation/hostile escaped descendants, or enforce hard aggregate CPU/RSS/PID quotas.
Only the existing bounded SSE/final-text response profile is supported; unsupported model
responses fail and remain counted. The original campaign verdicts, grants and pending native
acceptance remain unchanged.
