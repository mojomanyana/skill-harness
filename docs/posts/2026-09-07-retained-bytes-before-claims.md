# Draft: retained bytes before evidence claims

The first external archive primitive now stores supplied bytes and small content-addressed manifests separately from workers. A reference without content reports missing evidence. Redacted input stays labeled redacted, and partial JSONL stays partial.

This is a local, explicit-retention primitive—not a live observer, acceptance engine, producer-contract qualification or completed archive product. Exact producer joins and operational retention policy still need their own evidence.

Mutation-testing machinery was removed at the user's explicit request. Ordinary validators and behavioral regression tests remain; historical mutation results are preserved, not presented as a current requirement passed.
