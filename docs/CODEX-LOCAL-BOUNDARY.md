# Codex host boundary — local implementation, not live qualification

## Decision and scope

The driver is an extension-bearing subject that can replace request and finalized-message fields. A parent parser of that subject's JSONL cannot independently observe the provider request. We therefore put request construction, sequence ownership and transport writes in the trusted host, with only bounded invocation frames from the subject. A TLS-interception proxy would require additional certificate/credential authority and is not used.

This is a narrow **local protocol implementation**. It has no HTTP client, auth loader, live switch, provider discovery, model runtime or installation code. The host must own the supplied streams; arbitrary caller-supplied `Writable` code is not a security sandbox. No production caller is wired. `qualification-runner-v1`, existing Pi extension-provenance rejection, and producer fixed digest/experiment guards are unchanged.

```mermaid
flowchart LR
  S[Fixed credentialless namespace probe] -->|bounded invocation frame| H[Trusted host observer + durable journal]
  H -->|actual serialized request body| F[Host-owned local file transport]
  R[Synthetic host response stream] -->|bounded bytes| H
  H -->|objective-passing anonymous artifact only| J[Separate local judge exchanges]
```

## Implemented observations and gates

`packages/adapters/src/codex-host-observer.ts` binds frozen invocation IDs, exact installed-catalogue Codex model IDs, requested effort, instructions and inputs. Subject frames cannot supply model, endpoint, payload replacements, sequence gaps or additional fields. The host constructs a deliberately small Codex request-body subset and observes its actual write to the host-owned transport. Journal CAS claims precede writes, failures remain counted, unmatched claims block reopening, no automatic retry is available, and an experiment-wide elapsed deadline plus request/response byte and invocation caps apply. The private journal retains body bytes and digests, not authentication headers.

**Write completion is not provider receipt.** Settings in these bytes are host-requested settings, not independently verified backend identity, effort acceptance or internal reasoning. A digest authenticates neither host nor signer. History integrity assumes a trusted cooperative host/filesystem; it does not resist a malicious same-UID owner rolling back the entire store. The local exchange counter is not a billable/provider-call count.

Judge emission is blocked until the bound subject's byte objective passes. The host builds the judge input from an opaque label, retained output and frozen criterion, not subject identity/cost. First/second judges precede a tie-break, which is admitted only for a clean split. Actual retained vote bytes feed existing `collapseVotePanel`, with immutable panel binding on reopen. No vote executes a controller action or authorizes adoption; routing remains null. Artifact content can itself reveal identity.

Canonical-role checking rejects missing roles, unknown exact catalogue IDs, repeated requested models, repeated canonical identities and shared/unresolved lineage. A consistent supplied policy is still `CONSISTENT_DECLARATION_ONLY`, never authenticated independence. Fixtures cannot qualify production judges.

## Separate profile: what actually executes

`codex-model-profile.ts` runs **only fixed IPC-probe code**, not arbitrary models/extensions. The actual Linux process has separate namespaces, read-only `/usr`/runtime binds, no credential/home mount, cleared inherited environment (bubblewrap establishes only `PWD=/`), dropped capabilities, original-handle cancellation, a two-second CPU limit, 64 descriptors, 32MiB V8 heap and bounded output/host elapsed timer. Runtime executables are checked and fingerprinted. A write to the read-only mount is refused; the child network namespace differs from its parent. No network connection is attempted.

This is intentionally named `linux-bwrap-codex-ipc-probe-v1`, **not a qualified model-effect profile**. Per-process CPU and V8 heap are not aggregate descendant/host memory/CPU limits. Client cancellation is not a provider-side deadline or token cap. A model-bearing profile still needs qualified aggregate resource and trusted host egress/credential boundaries; no arbitrary-code launch or weaker substitute is exposed here.

Ordinary unit tests are portable and require no package installation. The separate real-kernel conformance command is explicit and fails, rather than skips or installs, when prerequisites are unavailable:

```sh
node examples/codex-local-boundary/probe.mjs /absolute/new/private/evidence-directory
```

It uses built `packages/adapters/dist`, already-installed Linux bubblewrap/prlimit/Node, a real isolated child frame, actual host-owned file writes, synthetic response streams, and a durable objective-before-blind split panel. It records `liveCalls: 0` and `liveQualified: false`. It does not exercise the SDK's final compressed HTTP/SSE wire format or attest backend responses.

## Subscription-only future boundary

Only the user's existing **`openai-codex` ChatGPT subscription** may be considered for future evaluated proposer, subject or judge calls. Installed source maps this to `POST https://chatgpt.com/backend-api/codex/responses`. The provider declares OAuth `isSubscription: true`; its adapter uses a Bearer OAuth access token and ChatGPT account claim. These are source observations, not verification of this user's credentials, entitlement or remaining quota. Credential values are never read during preparation.

The private campaign proposal, outside this repository, lists exact candidates and payloads. Installed model IDs are not proof of independent lineage: all current candidates belong to the OpenAI GPT-5 family. Distinct labels, efforts and sessions do not resolve the campaign's independent-role requirement.

Installed Codex source defaults to transport fallback/retry, so a future approved host must force SSE and `maxRetries: 0`, deny redirects/proxies/custom destinations, and stop on any quota/access/usage-limit failure. No refresh, login, alternative account, credits, usage-reset redemption, API key, metered route or paid fallback is authorized. Even OAuth refresh at `https://auth.openai.com/oauth/token` is excluded from the current proposal.

The inspected request builder does not emit `max_output_tokens` from its output-token option. Do not invent backend support or equate a stream byte bound with a server generation limit. This is an explicit blocker for a hard-token-capped live charter.

**Current external authorization: zero calls.** Root must inspect exact destinations/models/data/credential mechanism/call-token-time-cost caps/isolation and give bounded execution approval. Original CHANGES-REQUESTED, unmeasured gates and pending native acceptance remain unchanged. No merge authority is delegated.
