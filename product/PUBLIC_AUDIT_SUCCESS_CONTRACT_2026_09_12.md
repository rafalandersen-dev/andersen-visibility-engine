# Public audit success contract — 12 September 2026

Reviewed candidate 4a85cc9. The HTTP client accepted missing categories, invalid nested values and absent lists even though the results page reads every category and maps or joins those values. Twenty-two malformed-response regression cases failed against that implementation.

The client now checks all required response fields, all eight categories, bounded finite scores, status values, string lists and the optional extracted-signal fields before returning a result. Invalid responses take the existing controlled error path. The client does not synthesize missing scores or retry requests.

Validation: 41 client and boundary tests pass across two files, including 22 malformed-response regressions and serialized worker-normalized results both with and without extracted signals. The worker's generated response uses normalizePublicAudit and returns its result directly. Full TypeScript passed (/tmp/milo-audit-contract-types.log); scoped lint and whitespace checks passed. The root test configuration did not select Worker tests, so these results do not claim a Worker-suite run. No production build was repeated for this bounded client validation change.

This proves client contract handling with local fixtures, not live audit delivery, translated provider errors or rendered browser acceptance. No provider call or deployment occurred. Existing release and security-review holds remain; the full R00–R24/D01–D08 goal remains incomplete.
