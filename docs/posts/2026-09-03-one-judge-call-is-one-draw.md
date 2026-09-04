# One judge call is one draw

A qualification board can repeat the model under test three times and still confuse model variance with judge variance if each saved response receives only one judgment.

We measured that failure directly: the same judge model gave both PASS and FAIL to the same saved artifact under the same frozen rubric. The provenance was sound. The semantic verdict was not reproducible.

The qualification runner now uses the same clean-vote collapse as skill-harness adjudication. Every subject artifact receives two initial judge calls. Two matching clean votes confirm it. A clean split authorizes exactly one third call, and a 2-of-3 majority settles the artifact as disputed. Malformed, ambiguous, contradictory, or failed judge answers remain evidence but are not votes. No quorum means INCONCLUSIVE, not behavioral FAIL.

The policy is frozen in external configuration, including the approved board, each judge ordinal, and the 108–162-call Wave A budget. Each vote is still a separate OAuth-authenticated, atomically claimed invocation with its own receipt and artifact. The panel layer cannot turn three calls into one accounting event.

Disagreement is output, not logging. Each artifact records whether its first two clean votes split and its minority rate. Each scenario/arm cell records judge calls, clean votes, split artifacts, unresolved artifacts, and the split rate denominator.

Finally, a Critical behavioral failure fails acceptance without stopping a predetermined read-only board. “This wave cannot pass” and “later evidence would be invalid or unauthorized” are different decisions. Only the latter is a reason to halt collection.

The lesson is small: provenance can prove which stochastic draw happened. Reproducibility requires more than one draw.
