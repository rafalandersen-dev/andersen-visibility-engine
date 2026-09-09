# Controlled owner benchmark runner — 9 September 2026

Status: PR #101 merged, migration applied and release verified on 9 September. Base is the verified PR #100 merge `849df9ff05ee406f4254079e81a0d93de16c16ed`. This packet does not provision or execute the approved test. Full-plan/public-launch acceptance remains incomplete.

## Behavior and boundaries

A service-provisioned immutable plan binds an owner, existing project and topic, allowlisted frozen business context, a new draft/image identity and exactly three existing monetary permit identities. It includes no publishing secrets, integrations, schedules or arbitrary project extension fields. Missing/changed targets or context stop before the stage claim. No browser or MCP action can mint or edit these plans/permits.

`/app/owner-test?run=<plan UUID>` offers the owner's controlled test. Status and execution functions require a verified owner role, use the authenticated user ID and look up that owner's plan. Inputs accept only a run ID and an explicitly named stage; injected users, attempts, snapshots, providers and retry flags are refused. Opening/refreshing only reads. The start button advances through at most three separately confirmed stages; a failure, uncertain result or navigation away stops further client dispatch. No ordinary evaluation comparison is launched. UI copy covers the four currently supported app locales; this does not complete 24-language UI work.

The database locks and claims the expected stage once. It requires all three matching OpenAI permit identities, active current/future permits and restricted, unpaused global/account budgets; the existing expense reservation RPC remains the atomic money authority. The three ceilings must total at most USD5. A replay of scan cannot execute article; a running/stopped/finished attempt is never reclaimed. Only service-role functions can record/finish stages, and the plan fields cannot be changed. The database installation creates no plans, permits, budgets, schedules or provider calls.

Each stage invokes the existing production core: strict AI scan, article generation, image generation/private staging. Paid output is stored in the restricted run record before the separate revision-checked workspace write. If saving fails, retained output can be recovered after inspection without regenerating it. The draft remains Draft, hooks unapproved and the image proposed/private. No scheduling, approval, public promotion, publication or email. Concurrent unrelated workspace edits survive. Storage/admission waits are bounded; an unconfirmed/late claim never starts the provider.

## Verification

- Final full suite: 2,074 tests / 143 files passed after review fixes. The benchmark and i18n parity selection passed 55/55, including previously completed permit expiry/revocation and transient status errors. TypeScript, production build, lint of the new/changed implementation files and whitespace checks passed.
- Real PostgreSQL semantics through PGlite cover service permissions, immutable plans, matching permits/restricted budgets, duplicate and concurrent claims, expected stage, retained output, token binding and no recovery by rerunning a paid attempt.
- Server tests cover existing-core/attempt forwarding, only draft/proposed output, credential exclusion, changed target/context, provider failure, late admission, conflicting workspace writes, preserved output and truthful completion vs merely recorded output.
- Authorization tests reject non-owner/unknown roles and injected privileged input; status never executes and errors do not expose supplier details.
- No authenticated live generation or visual acceptance: OpenAI connection still needs reauthentication; browser automation could not verify its administrator policy. No workaround was used.

## Provisioning and running after release

1. Complete the already approved secure OpenAI key flow and server configuration. Do not expose the key or reuse discovery-only organization/project IDs as selection consent.
2. Verify the current provider/model/rate contract and expense ledger. The existing owner approved at most one scan, one article and one image within USD5 total; do not approve another test or ordinary background spending.
3. Select an existing owner project/topic; build its allowlisted snapshot with `buildBenchmarkSnapshot`. Check the exact topic/concept and input bounds, then allocate one run UUID, new asset/image UUIDs and three distinct request UUIDs. Do not serialize the complete workspace/project into the plan.
4. In one reviewed administrative transaction, provision restricted global/account budgets and the three exact permits (job ID = run UUID; native production model/operation/reserve for each), then insert the immutable run with an expiry no more than 24 hours after creation. Do not broaden an already funded shared budget or silently discard existing accounting. This is a future provisioning step, not an executed SQL instruction in this packet.
5. Open the authenticated owner test link. Confirm the three stage results and retained expense evidence. Costs remain reserved/unknown until independently reconciled; generated output is not an invoice or a quality acceptance.
6. On stopped/running-too-long/uncertain state, inspect saved results, ledger and workspace first. Do not reset the plan, replace consumed permits or regenerate an artifact. Recovery of a saved artifact is a separate reviewed storage operation, with no AI call.

The runner is infrastructure for R09/R18 acceptance. Useful-result customer allowances/refunds, actual quality/cost measurement and all other open roadmap outcomes remain required.

## Review corrections

Completed-stage permits retain their identity binding but their later expiry/revocation cannot block the remaining authorized stages. Current and future stages still require active permits. A transient status failure remains distinct from a missing run: the owner screen retains its last status, shows a refreshable error and does not dispatch generation. New plans must start at scan with no prior results; IDs used in storage paths are restricted to safe segments.

Production rechecked 9 September during review: zero budgets, zero permits and zero native provider attempts. No test has been provisioned or executed.

## Verified release

- Final reviewed head `ada37cacc788b9be1a698d09ee6b82d02ec89bc5`; review `34339705167` succeeded with `is_error: false` and no new inline findings. Normal merge `806636237f4f7ae89baef090759de92da6e4d3ec`.
- Migration `20260909120000_owner_ai_benchmark_runs.sql` applied from that reviewed head in one production transaction. Do not reapply it. RLS enabled; anonymous read and authenticated insert/claim denied; service insert/claim allowed, direct service UPDATE denied. Runs, budgets, permits and native provider attempts all zero after installation.
- Deployment `95b35d27-6771-4d6f-8565-4cb79f148d7a`; public build `1788950127754`; fingerprint `5b5757913917c3f0a154b9fc6ccd3a0f2f2a421d07af2e9304c0b66d8a63e602`. Full and every component match clean merged source. Runtime reports exact merge revision with `modified: false`.
- Home/owner-test GET 200; MCP GET 200, OPTIONS 204, anonymous POST 401. The anonymous owner-test response is the SPA shell, not evidence of authenticated access or a live test.
- OpenAI still requires reauthentication. The owner clarified no setup action had been performed. No live test, new email or customer publication occurred.
