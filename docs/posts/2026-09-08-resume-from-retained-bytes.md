# Draft: resume from retained bytes, not timestamps

External ingestion now has immutable checkpoints. An append resumes the pending line and preserves source-record identities. A replacement, parser change or missing prior content does not masquerade as continuous observation. Re-reading identical bytes produces no new records.

These are byte/syntax guarantees, not native branch inference or task acceptance. The archive still needs the explicit producer semantic contract and its operational content-handling policy before full integration can be claimed.
