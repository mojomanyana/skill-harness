# Draft: enumerate names before process identities

Linux process directories can disappear while they are being listed. Asking Node for Dirents can trigger an internal `lstat` before our per-process error handler gets control. One unrelated disappearing PID could therefore prevent qualification process-group cleanup.

The scanner now lists names and performs the existing per-process checks itself. A whole-directory failure is still an error, and both reused-leader rejection and occurrence checks before signal escalation remain intact. Four ordinary filesystem-fault tests cover these boundaries; they never signal real PIDs.

This repairs a separately recorded enumeration defect. It does not establish the missing cause of historical CLI startup failures, relax timeouts/accounting, or constitute live model qualification.
