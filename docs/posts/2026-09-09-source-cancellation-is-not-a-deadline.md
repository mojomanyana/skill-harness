# Draft: Source cancellation is not a deadline

A producer-owned invocation must be able to cancel pending host I/O through the original source signal. The host now accepts that optional signal on its subscription SDK exchange, refuses pre-aborted sources before any claim/write, and records cancellation without mislabeling it a wall deadline. A claimed exchange remains counted and cannot retry.

Two behavioral tests first failed: a pending exchange ignored source cancellation, and a pre-aborted source still completed a request. Both now pass. This is a host prerequisite, not a claim that producer IPC/resource ownership has been integrated or qualified. The producer bridge still needs its exact finished source receipt and an actual connected test before that claim is available. Existing inert callers are unchanged; no live provider calls are involved.
