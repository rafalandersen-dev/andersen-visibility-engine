# Publication and workflow evidence — implementation pending release

P5 implementation, 10 September 2026. The migration `20260910200000_publication_evidence.sql` is **unapplied**. This record is implementation evidence, not production or provider acceptance.

Live WordPress, Shopify, custom and scheduled publication now admit an immutable snapshot of the exact approved assembled article before connector transport. Snapshot includes safe destination metadata, action and weekly-stage provenance. Published, rejected and unknown outcomes are distinct. A successful connector result whose evidence acknowledgement fails produces a permanent uncertainty warning rather than authorizing automatic republication. Drafts and historical publications are not backfilled as newly verified results.

Three private tables and seven service-only RPCs scope publication attempts, saved GSC observations and workflow evaluations by owner/project. The report UI can inspect saved versions and attach an exact existing project GSC import. Date windows, page match, source, truncation, volume and other publication attempts constrain comparison. Connector response and manually supplied source evidence remain explicitly unverified; deltas are tentative and never causal claims.

An offline comparison tool and the AI Evaluation page accept owner-reviewed baseline/candidate outputs for fixed project briefs. All revision costs count; missing or estimated costs remain incomplete. Per-case regressions block eligibility. A favourable verdict only permits development review: no model call, spending or automatic release follows. Project imports cannot silently change scope. The synthetic local fixture is not a real provider benchmark.

Validation: 2,677 tests across 198 files pass, including actual migration execution with PGlite and permission/isolation/immutability checks. TypeScript and production build pass. Logs: `/tmp/milo-p5-candidate-{types,tests,build}.log`. Focused lint has no errors. Latest P4 navigation fix has also been incorporated. Signed-in visual acceptance, live connector parity and real provider comparisons remain pending under the existing access and authorization boundaries.
