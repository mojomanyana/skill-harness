# Calendar side-effect acceptance fixture

This offline example covers the secretary role's approval and lost-response boundary. It sends nothing, accesses no account and is not a production Calendar adapter. Run `node --test connectors/calendar-fixture.test.mjs` from this example package.

The fixture binds approval to exact event parameters, keeps unknown results unresolved until an exact lookup agrees, preserves conflicts, and never turns a repeated intent into a second insertion. A changed request needs new approval. Its `privateIntent` and `requestDigest` are synthetic connector metadata, not Google Events fields; a real adapter must map and verify these using supported fields. Its in-memory intent store is not durable crash recovery. Notification delivery remains unverified even when the event exists.

Provider assumptions were checked on 2026-11-04 against Google's documentation:

- [Versioned resources](https://developers.google.com/workspace/calendar/api/guides/version-resources): updates/deletes support `If-Match`; a stale version returns 412. Inserts do not support conditional modification, but a supplied resource ID cannot insert over an existing ID.
- [Events get](https://developers.google.com/workspace/calendar/api/v3/reference/events/get): lookup uses the Calendar event ID and calendar ID. An iCalendar UID is a different identifier.
- [Events insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert): insertion is a POST with start/end fields. Notification behavior must be handled separately; finding an event does not establish that a recipient received a message.

This tests the local interpretation of those contracts. It does not qualify provider availability, eventual consistency, authentication, notification semantics, cancellation, or exactly-once delivery. Production rollout still needs a concrete adapter, durable intent/reconciliation storage, and live provider contract acceptance.
