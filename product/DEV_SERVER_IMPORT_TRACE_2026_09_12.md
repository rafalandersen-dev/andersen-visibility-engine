# Verified development startup import chain — 12 September 2026

Read-only application-source investigation on clean candidate `c274efe`. The built home/beta/demo interaction results remain valid. This evidence explains one concrete development-only eager dependency path; it does not assert a production incident, exposed secret, provider operation or complete inventory of all leaking imports.

A temporary Vite development server on127.0.0.1:4192 served transformed client source. A bounded traversal parsed static import/export declarations with TypeScript, without evaluating downloaded source or calling application server functions. It stopped after103 local source-module requests when it found this chain:

```text
/src/router.tsx
  → /src/routeTree.gen.ts
  → /src/routes/_authenticated/app.backlinks.tsx
  → /src/lib/mock-ai.ts
  → /src/lib/ai.functions.ts
  → /src/lib/generation-usage.server.ts
  → /@id/__vite-browser-external:node:crypto
```

The transformed backlinks route correctly splits its main page component, but retains its separately exported `AnalysisView` and a static `createOpportunityFromBacklinkRecommendation` import from mock-ai. That module imports the AI server-function facade. The transformed facade retains exported `generateContentCore`, `generateOpportunitiesCore`, `scanWebsiteCore` and `fetchSiteContext`, alongside other helpers and server-function proxies. Its top-level withGenerationUsage import survives. The usage helper in turn imports named randomUUID from Vite's browser-external node:crypto module, consistent with the predecessor's observed client-startup exception. The image-generation facade separately retains exported generateArticleImageCore and the same usage-helper import; this traversal stopped at the first chain and does not claim its complete root path.

This distinguishes route component splitting from actual server-code isolation. Merely delaying the exported AnalysisView/mock-ai path could hide the public startup symptom while leaving a later authenticated import failure. A future bounded fix should isolate server-core implementations and their dependencies from client-facing facades while preserving server handler authentication, quota, cost, result-retention and cron/benchmark entry semantics. Do not replace randomUUID with a browser shim or weaken metering/authentication to suppress the error. Prove the fix using transformed dev imports plus real dev hydration, built-page interaction and relevant mocked server behavior; existing production-build success alone does not cover this development graph.

Evidence scripts/results: `/tmp/milo-dev-import-chain.mjs`, `/tmp/milo-dev-import-chain.json`, `/tmp/milo-dev-import-trace.json`; server startup log `/tmp/milo-dev-import-trace.log`. Only module paths/export names were persisted from transformed responses, not complete source maps or environment material. The temporary server was stopped. No app source/configuration, dependency, credential, database, provider, account or browser setting was changed. No application server function was invoked and no deployment/review was requested. Pricing/case-study implementation remains owned by successor01a094b6-58fa-79e3-87f6-d7fa9b1fc6f6; this investigation does not duplicate that work.
