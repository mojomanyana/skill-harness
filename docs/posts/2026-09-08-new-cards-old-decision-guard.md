# Draft: new cards, the same decision guard

Frozen structural signals can now produce explicitly versioned cards through a separate review API. Decisions still pass through the existing durable lock, stale-parent and correction-history checks. A case from another observation or missing original input cannot support a new decision.

The old v2 reviewer stays v2. New clients must opt into the new card contract, and a local author string still does not authenticate a human or authorize live exposure, promotion or adoption.
