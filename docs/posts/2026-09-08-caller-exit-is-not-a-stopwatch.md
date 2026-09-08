# Draft: caller exit is not a stopwatch

A CI lifecycle test allowed its start caller1500ms and reported only `status:null`. That timeout included source loading and authentication, not just the supervisor acknowledgement. A bounded inert readiness delay reproduces `ETIMEDOUT`/`SIGTERM` before any launch; the original CI log did not retain enough diagnostics to establish its exact signal cause.

The corrected test holds the worker behind a release barrier. The caller must exit successfully while the supervisor and exact child remain live; then release permits one terminal completion. A caller that waits for its worker cannot pass. No production authority, timeout or accounting check was relaxed, and no model was called.
