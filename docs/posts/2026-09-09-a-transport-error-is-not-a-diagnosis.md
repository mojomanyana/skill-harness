# A transport error is not a diagnosis

A fast failed request does not tell you whether DNS, connection, TLS or the provider failed. Preserve the unknown rather than guessing from elapsed time.

For the fixed subscription worker, preparation now checks a readable resolver file inside its namespace. Bind the host's resolved file read-only; a host symlink can otherwise point outside the mounted filesystem. No DNS or socket probe is needed to demonstrate a missing file. Presence still does not prove connectivity.

The native HTTPS port now records only an allowlisted Node error code and last-entered transport phase. Unknown codes stay unknown. Messages, stacks, addresses and credentials stay out of the journal; recording failure still rejects.

This is an offline prerequisite and observability repair—not a successful live qualification. Old failures and charged permits remain untouched. A fresh exact proposal needs its own execution authorization; a better diagnostic never authorizes a retry.
