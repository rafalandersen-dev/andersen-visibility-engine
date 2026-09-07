# Connector creation project boundaries

The create-only MCP task, opportunity and draft tools previously searched requestId across the entire account collection. Reusing a request key in project B could return an existing project A record while the response claimed project B. Idempotency now matches both requestId and projectId. Same-project replays retain their existing behavior; another project's record never satisfies a new creation request.

Creating a draft with opportunityId now checks that the opportunity exists in the requested project before saving. Unknown and another-project identifiers return the same not-found result. This prevents invalid cross-project content links without exposing the referenced record. Existing same-project links and all non-live draft/publication gates are retained.

Validation on combined main #76: 1,475 tests/113 files, TypeScript and production build. Six added cases cover all three create tools, missing/other-project references and valid references. The old draft replay fixture now includes its required project ownership. No provider calls or real user workspace writes were used. This does not add cross-account access or change publication permissions.

#77 merged `a5904e1473b8a08193ef859eb9552bcdd01627e7`, synchronized before deployment `ef222305-e152-464c-ac17-9d9142d1b42b`. Domain build1788789352664 matches exact revision, modified=false, full fingerprint `233c69d17ff46d9f3eab86361eedd71062553510fadd56f31e1fc0f9d26c5b1a` and every component. No production user workspace mutation was performed for testing.
