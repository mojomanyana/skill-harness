# One call has to mean one launch

*Draft — infrastructure work, no qualification measurement has run.*

A model-evaluation command returning is not the same thing as an invocation becoming
terminal. The caller can time out while the model process still runs. A wrapper can
see an empty response and quietly try again. A controller can crash after spending a
call but before recording it. If every layer calls that “one run,” the arithmetic is
fiction.

`qualification-runner-v1` makes the boundary explicit:

```text
prepared → launch-claimed → running → terminal
```

Preparation costs nothing. The atomic launch claim costs one. A timeout, refusal,
spawn failure, truncated stream, or invalid artifact still costs one. There is no
automatic retry. An interrupted claim needs an unexpired one-time capability whose
digest was bound before preparation. If no attempt was published, that authority can finish the consumed launch path; if an
attempt exists, it is never replayed—the runner terminates any matching recorded child
and reconciles the invocation as failed or explicitly aborted.

That sounds stricter than a convenience runner because it is. Qualification is the
place where “helpfully retry” turns a fixed call ceiling into an estimate.

The other half is identity. Production configuration allows exact `openai-codex`,
ChatGPT OAuth metadata, no direct OpenAI provider, no API-key environment, no metered
override, and no provider/model fallback. Pi's auth metadata proves only readiness;
the completed JSONL separately has to report the exact provider and model requested.
The distinction survives in the receipt.

The local spool is canonical JSON, atomic writes, durable partial output, occurrence-
checked process-group cleanup, and hash-chained lifecycle/accounting records. A receipt
published just before a crash can idempotently repair its missing lifecycle terminal
event only after all cross-file digests reconcile. Those hashes detect torn or edited
evidence. They do not authenticate a signer or defeat the person who owns the
files. This is trusted-local-process integrity, not remote attestation or containment.

The same repair adds a separate consumer for pi-daddy's production ledger v3.
Execution occurrences now retain `executionId` and explicit parent execution identity;
workflow facts keep their own occurrence identity. The old unversioned 0.17 and frozen
v2 selector remains exactly that—historical compatibility, not a lossy fallback for v3.

What this work does **not** say: that OAuth will work tomorrow, that any model is good,
that a holdout exists, or that Principal passed anything. No subject, judge,
calibration, canary, or holdout call was made. This is the machinery that lets a later
packet state its call count without guessing.
