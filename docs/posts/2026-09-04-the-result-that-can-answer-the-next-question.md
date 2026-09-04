# The result that can answer the next question

We screened a large evaluation corpus for discriminating power. Almost every cell came back UNKNOWN—not because nobody had run it, but because the committed result had forgotten the evidence needed to tell whether the skill was present and which rubric item failed.

That makes every run a one-shot answer. It cannot cheaply answer the next question.

New skill-harness runs retain three things in results schema 3: the model-visible prompt's byte provenance and exact skill occurrence count, every numbered criterion vote, and enough panel membership to recompute the recorded panel verdict. Delivery is now an objective gate rather than an assumption inferred from `--mode green`.

The new `screen` command reads those fields offline. It reports which baselines are ceiling, floor, informative, or still unknown, alongside criterion failure rates. No model. No judge. No silent promotion of legacy evidence: schema-1 and schema-2 files remain readable, but unknown evidence stays unknown.

The point is not a prettier report. It is that the next call budget starts with a free question: “Which cells can actually measure change?”
