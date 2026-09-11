# Completion is an observed fact, not an acceptance decision

A daily work archive used to jump from the raw work projection straight to detector input. When the host had no separate facts file, it correctly produced a coverage gap—but it did not retain a small, navigable statement of what the work ledger itself had actually established.

The archive now stores an `observed-work-runtime-v1` fact artifact beside each signal linkage. It records exact attempt identity, projected runtime state and resolution, terminal occurrence digests when those events exist, plus obligation acceptance and coverage states. Checkpoints, expected waits and prior acceptance history are explicitly unavailable unless a host supplies them.

That distinction matters. A completed process is useful evidence that an attempt ended. It is not proof that the artifact is right, that a checkpoint was met, that the user accepted the result, or that reopened work is a defect. The retained artifact makes the known part easy to follow without manufacturing the missing part.

The artifact is content-addressed and produced from the pinned pure work-v4 projection, so replaying the same archive input creates the same identity. It adds no worker turn, prompt, alert, acceptance authority or model call.
