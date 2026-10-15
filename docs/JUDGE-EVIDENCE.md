# Evidence supplied to the judge

New judgments receive the final-answer transcript plus a bounded execution-facts
projection. A final-answer transcript does not contain Pi's tool events; their
absence must not be graded as evidence that no call occurred.

The projection identifies registered tools, completion/error/unfinished states,
bounded local read-path labels, and result byte counts and digests. It excludes
commands, delegated prompts, arbitrary arguments, tool bodies, result details and
private reasoning. Paths remain untrusted requested labels. A completion without
a reported error does not establish full-file coverage, source contents, truth,
successful side effects, or independent verification. Redaction is heuristic;
review private artifacts before sharing them.

The projection includes at most 32 calls. Missing turns, unsettled calls, capture
errors, legacy settlement records or omitted calls make coverage partial or
unknown. Neither case permits inference that unlisted activity did not occur.
Mechanical gates retain authority over a judge's interpretation.

When a checklist needs source contents, a scenario may supply `judge_context`: a
non-empty string containing the exact reference text and its source label. It is
limited to 65,536 UTF-8 bytes and appears only in the judge prompt, as a JSON string
before the transcript. It is evidence, not instructions, and does not establish
that the subject read it. No paths are resolved and no files are loaded. Authors
must check that the selected reference matches the fixture or source being tested;
the harness does not authenticate this authored text. Keep references concise and
exclude credentials or private material not intended for the selected judge.

Adding or editing this field changes the scenario's rubric digest, so the remedy
is `grade` on saved answers rather than another subject run. Specs without the
field retain their previous prompt and digest. Run, grade and regate use the same
prompt builder; exact retained judge-input artifacts include the reference.

Fresh structured executions retain their traces even without `assert.trace`.
Judgment `input` records a content-addressed private `judge-input.<sha256>.txt`
artifact with the exact prompts (including a structured-format retry), selected
judge, evidence projection and its coverage. The artifact uses the same ignored
`.txt` convention as transcripts and has owner-only permissions where supported.
Later grading keeps earlier content-addressed inputs; it does not rewrite them.

`grade` and `regate` bind execution facts to the recorded trace digest, repetition,
scenario, mode, turn sequence, model/version when recorded, and every final
assistant turn. A mismatching/missing bound trace refuses regrading or makes a
regate evidence ERROR before a judge call. A legacy run without a digest can still
be judged as text, explicitly with unknown execution evidence. Computing a new
hash today does not authenticate old evidence. Digests establish local artifact
continuity, not a trusted signature or historical machine attestation.

This changes judge inputs. Regrade retained examples in a copy and retain the old
results when comparing old and new judges; do not present a regrade as a new
subject run. The Pi fresh-execution qualification pin is unchanged.
