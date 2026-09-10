# Headers are not completion

Node's HTTP client can detach a response's socket before your `end` listener runs. A check that reads TLS state through that late reference can reject a perfectly complete response—and lose the useful refusal evidence too.

Our bounded subscription port now keeps the original socket, checks its authorization and message completeness, and records fixed completion-failure reasons. Non200 replies stay non200. Only explicitly allowlisted parameter/type/code values survive into refusal metadata; messages and arbitrary provider text do not.

Credential and account reflections are rejected before body hashing, at every status. Unknown errors stay unknown; recording failure is still failure.

A local loopback fixture and mocked TLS/error cases prove this lifecycle repair. They do not explain an earlier HTTP400 whose body was never retained, and they do not authorize another model call. Keep the old charged attempt intact; review a fresh exact proposal separately.
