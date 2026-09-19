# Knowledge review refresh after a confirmed mutation

A successful review save or withdrawal was followed by a history read before notifying ProjectKnowledgePanel to reload its source/knowledge impact state. If the history read failed, that callback never ran. A confirmed withdrawal also retained old acknowledgements and active history, because resetting them depended on the history response.

The component now tracks confirmed mutation completion separately. It clears stale history after confirmation and immediately resets acknowledgements for a confirmed withdrawal. Its completion path notifies the still-current parent even if the subsequent history read fails. The failure alert remains visible and another save remains disabled until reinspection. A failed mutation or a result from an unmounted scope does not notify the current parent. Server authority, approval checks and publication behavior are unchanged.

Validation: 32 focused component/Czech tests, component lint, whitespace and type checking pass. Type log: /tmp/milo-knowledge-history-refresh-types.log. The real component passed all six browser interaction groups using Czech copy and local server-function fixtures. New regressions cover confirmed save followed by history failure, and confirmed withdrawal followed by history failure, including cleared acknowledgements and absence of stale active history. The earlier duplicate-save, successful save, withdrawal, failed-mutation and late-scope checks also pass. Temporary local server stopped.

This is candidate code, not a deployed or real-backend acceptance result. Full-page layout, actual screen-reader behavior, live team roles and release gates remain open.
