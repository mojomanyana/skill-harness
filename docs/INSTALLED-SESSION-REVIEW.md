# Installed-session review v1

Additive `producer-review-installed-v1` plan / `producer-review-launch-v2` launcher.
The existing `producer-review-v1`, launch-v1, and exact-output qualification profiles
retain their meanings. This is a bounded two-role adapter, not a general session runner.

## What executes

The same original producer reserves both permits and acknowledges each completed
exchange. Within each exchange, the installed Pi SDK constructs a fresh
`DefaultResourceLoader` and `AgentSession`, binds the real grants/harness extensions,
and **awaits `session.prompt`**. The supported `agent.streamFunction` receives the
actual post-extension context and passes that context to the pinned Codex SDK.
No separately loaded dummy session or reconstructed replacement context reaches the SDK.

A pinned inline extension performs the declared transformation: its
`before_agent_start` hook appends the exact installed review skill and review-agent
prompt bytes for the subject. Its `context` hook validates the one-message task;
it does not introduce history. The actual provider-request hooks run before the
existing exact payload/final-wire gate. Hook counts, role/session IDs, resource
hashes, effective context hash, final serialized request hash/bytes and compressed
wire hash/bytes are retained. Missing/repeated hooks or undeclared transformations
refuse the exchange. Undeclared provider-header transformations are refused.

The judge has a different declared session ID, fresh agent directory and no subject
resource delivery. Only the original public packet/rubric and **acknowledged,
durably sealed subject final text** enter its task. Raw SDK reasoning stays private
and is never copied to the judge. The verdict remains advisory; acceptance is
`not-assessed`, routing default null, and no adoption/merge action exists.

## Closed installed binding

`plan.session` contains exactly:

- `version: installed-review-session-v1`
- `root`: canonical isolated resource directory, exactly `dirname(runRoot)/installed`
- `runRoot`: exactly the launch's fresh `outputRoot`
- distinct `subjectId` / `judgeId` UUIDs, used by `SessionManager.inMemory`
- four `{kind,path,sha256}` resources, ordered skill, prompt, extension, extension.

The only `.pi` source-pin exceptions are these two exact files under that isolated root:

```
.pi/skills/review/SKILL.md
.pi/agents/principal-review.md
```

They are materialized from the verified installed package/agent artifact, not from
user conversations. Both realpaths must equal their declared paths. Each is at most
16384bytes. The root/runRoot themselves cannot be in `.pi`. Extensions must be the
pinned producer `packages/pi-daddy/extensions/grants.ts` and harness
`packages/pi-extension/dist/index.js`, in that order. Legacy `.pi` restrictions are
unchanged; extra auth/session/settings files cannot be admitted as resource pins.

All four resource hashes are checked at preparation and again at loading/hooks/SDK
handoff/payload. Required runtime pins include the installed session adapter and SDK
session/loader entry points. Freeze the complete installed SDK and producer dependency
inventory as well, as with the existing review launcher. A changed resource, runtime,
plan, output occurrence or approval digest requires new preparation/authority.

## Boundaries

- Maximum **2 SDK dispatches / 2 HTTP attempts**, one per role. An extra invocation
  poisons the session even if a faulty caller swallows its rejection.
- Effective tools disabled with `noTools: all`; tools/history/context/model drift
  refused before SDK dispatch. Tool output cannot pass the strict text SSE profile.
- Automatic retries, compaction, prompt expansion and fallback are disabled.
- Existing limits unchanged: 65536request / 262144response bytes per call,
  131072 / 524288 aggregate, 4096final text bytes, 30s call / 90s whole,
  2s supervisor settlement grace. Preparation bounds fully expanded instructions
  and worst-case judge escaping; nothing is truncated.
- Discovery is minimized with supported loader options: explicit extension/resource
  paths, no ambient skills/prompts/themes or agent context injection, in-memory settings.
- ModelRuntime uses a **non-secret invalid OAuth stand-in** through a read-only in-memory
  credential port; mutation/refresh refuses. It never gets the real OAuth token. Only
  the existing final-wire-checked native HTTPS port lazily reads actual subscription
  credentials. No API key, metered fallback or refresh is introduced.
- Session role directories are created exclusively below the fresh output root.
  Session prompt is awaited, cancellation closes the dispatch gate, and late calls
  cannot reach the provider. Failed/unknown original settlement never unlocks judging.

## Offline proof and preparation

Build first; regenerate/check the committed extension bundle. In a fresh namespace
with network/PID isolation, no auth mount, read-only code/runtime/resource mounts,
private HOME/TMPDIR and only the new output area writable:

```
node examples/codex-local-boundary/producer-review-launch.mjs --fixture /absolute/config.json
node examples/codex-local-boundary/installed-review-proof.mjs /absolute/fixture-config.json
```

The second command runs the actual installed SDK/session/extensions and original
producer, with inert HTTP responses and explicit negative ports. Each case owns a new
original budget and output directory; no mutation of production source is involved.
The timeout case exercises the actual 30s original-producer deadline. Fault injection
is **not** an option accepted by the production launcher.

`--prepare /absolute/config.json` makes no SDK/credential/producer call and prints the
exact digest-bound launch command. Run it in the intended namespace, retaining all
canonical paths. For later authorized live execution, retain PID/user/filesystem
isolation, make only the exact OAuth file read-only-visible, and allow networking for
the fixed subscription transport. The returned command is the command *inside* that
namespace, not permission to expose the user's setup or dispatch a model call.

Fresh approval is still separate and exclusive. Preparation and inert proof are not
live execution, advisory PASS, human calibration, original TUI control or campaign
acceptance. No original interactive session is resumed/replaced by this path.
