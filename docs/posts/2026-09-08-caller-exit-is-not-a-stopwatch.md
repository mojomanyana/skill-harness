# Draft: caller exit is not a stopwatch

A CI lifecycle test allowed its start caller1500ms and reported only `status:null`. That timeout included source loading and authentication, not just the supervisor acknowledgement. A bounded inert readiness delay reproduces `ETIMEDOUT`/`SIGTERM` before any launch; the original CI log did not retain enough diagnostics to establish its exact signal cause.

A second CI failure occurred in the abort-named test, but its stack points to `start`, before `abort` was called. A zero-budget acknowledgement probe separately observed start exit1 followed by one running invocation that could be explicitly aborted; the missing original stderr prevents attributing that exact cause to CI. The abort test now waits for a held worker's actual running identity, checks cancellation before release, and reports operation-specific process diagnostics.

The corrected detached test holds the worker behind a release barrier. The caller must exit successfully while the supervisor and exact child remain live; then release permits one terminal completion. A caller that waits for its worker cannot pass. No production authority, timeout or accounting check was relaxed, and no model was called.
