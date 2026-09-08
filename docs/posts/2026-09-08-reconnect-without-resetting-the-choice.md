# Draft: reconnect without resetting the choice

An in-memory blind comparison loses its quality-before-cost gate when its process goes away. The local archive adapter now retains the exact inputs and private label seed, rechecks output bytes on every access, and writes one immutable quality choice before allowing reveal.

Two competing Node processes can propose different initial choices; one directory claim wins. A torn claim is an explicit recovery problem, not a blank form. Reopening keeps both the labels and the chosen answer. Identity and cost stay outside the pre-reveal API, though output content can still offer clues.

This is durable local review infrastructure, not authenticated live casting, a model evaluation, or permission to adopt the cheapest arm.
