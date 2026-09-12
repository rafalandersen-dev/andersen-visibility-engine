# Weekly source-review outcome — 12 September 2026

Reviewed 46e27e1 against P2/P3 source-outage and changed-evidence requirements. refreshWeeklySources already throws WeeklySourceReviewRequiredError when refreshed evidence is unavailable, belongs to a replaced source revision, or its refresh cannot be confirmed. The executor incorrectly folded this explicit review hold into the generic recovery-required summary.

The executor now classifies that typed error as review-required. Generation and scheduling remain held; generic timeouts/storage errors keep their recovery-required behavior. This changes the reported reason, not authority, retries, source acceptance or generation admission.

Three orchestration regressions failed against the previous classification and now pass. They use the real refreshWeeklySources implementation with injected sources/refresh/observations and assert one refresh attempt, no stage claim, no content/research/image call, and no schedule admission for unknown evidence, a changed revision or an uncertain refresh.

All 41 tests across weekly executor, weekly sources and source-refresh storage pass. Full TypeScript (/tmp/milo-weekly-source-hold-types.log), scoped lint and whitespace checks pass. No full-suite/build repeat for this bounded outcome mapping.

Live source capture, approval UI/browser behavior and real weekly publication acceptance remain unverified. No provider/database/deployment/task-handoff operation occurred. Release holds and the full R00–R24/D01–D08 scope remain unchanged.

## Final connector expiry check

At candidate b08d058, traced connector-guard.server.ts through assertAssetSourcesCurrent and checkOutputDependencies. The production checks already enforce expiry at the exact validUntil boundary; no additional production change was needed.

Added WordPress and Shopify authorization cases using the real source-publication gate with mocked stored observations and approval. Each first proves the issue is specifically expired (not a fixture-validation or unrelated failure), then confirms that successful approval cannot bypass that hold, a cooldown refresh does not erase it, and the stored draft remains unchanged. Neither connector returns publication arguments. These are authorization tests, not actual transport or destination checks.

All 48 tests across connector guard, source-publication and source-refresh evaluation pass, plus full TypeScript (/tmp/milo-connector-expiry-types.log), scoped lint and whitespace checks. Existing evaluator/publication tests cover unrelated facts remaining unaffected. This extends local P3/R18 evidence while real CMS, source capture and release acceptance remain open.
