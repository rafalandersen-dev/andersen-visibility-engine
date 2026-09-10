# P1 project knowledge — release review packet

Updated 10 September 2026. Status: local product implementation complete enough for independent release review; **not merged, migrated, deployed, browser-accepted or a public paid launch**. Executor: current Codex task; independent verifier remains the PR review. Broader P2–P5 and R00–R24/D01–D08 remain active.

## Baseline and scope

Released P0 main is `17372b78d65ada90a418a336f4473bc125626b41` (#107). P1 foundation checkpoint `c055a1e7bb77c5be53474df8878357bf3cbe972b` and history checkpoint `f0cd264d2edf69bf7def18869fb815c5356e2e13` are preserved. Branch: `codex/milo-p1-product-review-20260909`.

P1 adds private original PDF/DOCX storage and bounded text extraction, scoped editable source records and histories, website/skip intake, accepted shared text/image context and exact output references. The product completion layer maps **explicit supported text labels** for tone, writing style, preferred/avoided terms and claim restrictions into the existing Brand Intelligence fields. English/Polish/Swedish/Danish labels are supported. No model summary, OCR, graphical color/font/logo extraction or claim verification is claimed. Other passages remain manually editable proposals.

Source-backed values are computed from active accepted records. They are never copied into the stored canonical profile. Populated owner fields, existing project tone and explicit owner-clear markers hold competing source values. Revocation, replacement, forget, expiry and accepted conflicts remove the source contribution. Generation obtains the canonical profile under the authenticated project scope and only resolves records whose references fit the bounded prompt. Missing canonical state fails closed.

Brand form saves merge only edited fields and reject competing edits to the same field. Existing MCP fill and approved setup changes preserve field ownership. Account-keyed onboarding drafts retain project identity without raw document bytes/text, preserve newer owner edits and continue reviewed setup without rewriting the profile. New review/intake/status/error controls use four supported UI locales. R20's wider language delivery remains open.

## Verification

- Full regression suite, TypeScript, focused lint and production build are required on the final candidate. Latest logs: `/tmp/milo-product-full-tests.log`, `/tmp/milo-product-types.log`, `/tmp/milo-product-focused-lint.log`, `/tmp/milo-product-build.log`.
- Added actual SQL checks for scoped canonical profile retrieval and denied anonymous/authenticated access, 42-revision history pagination, restore/forget behavior, and derived-field tests for revocation/replacement, conflicts, owner-cleared values, bounded context and unknown state.
- Added interrupted-onboarding ownership tests and four-locale review-key/placeholder parity checks. Existing 2,392-test checkpoint remains inherited evidence; final candidate result is recorded in the WIP entry.
- A broad legacy-file lint run exposes existing formatting debt and the existing control-character regex in `ai.functions.ts`. Focused lint covers the changed/new product components, helpers, knowledge boundaries and tests. No unrelated wholesale AI/store/pending-action reformat was performed.
- Browser administrator-policy denial remains in force. No alternate browser, automation workaround or unchanged retry is allowed. Real signed-in upload/edit/revoke/reload/responsive acceptance remains unverified. Node parser-worker tests and successful builds are not browser acceptance.

## Read-only production preflight

10 September: Lovable confirms the existing database is enabled (Supabase). `project_knowledge_sources`, `project_knowledge_records`, `project_knowledge_documents`, and `read_project_knowledge_brand` are absent. Registry contains `20260909160000 / generation_result_recovery`; `20260909200000` is absent. No database write was performed.

Lovable project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`, workspace `oC4kAHCUIYuuomG2Hwnl`, database `fguokeheqoqunadhdbsz`, site `https://milogrowth.com`.

## Migration and release order

1. Finish independent review of the final pushed PR head; resolve meaningful findings and verify final checks. Do not overwrite or amend published commits.
2. Recheck registry and absence of P1 objects immediately before applying SQL. Apply only `20260909200000_project_knowledge.sql` **once in a transaction**, with an advisory lock and registry absence check. Record the exact SQL in the normal migration registry. Candidate SHA-256: `27034fbe105b72bbe70ab354f2914798d3dc2f07149e0a13a5c1b382f4537a65`. Recompute and reconcile if review changes SQL. Do not alter or reapply P0 or #103/#104/#101/#98 migrations.
3. Verify all five P1 tables use RLS; anonymous/authenticated roles cannot read originals/records/history or execute service-only functions; service-role permissions match the migration. Verify all functions exist, project-deletion trigger is installed, empty table counts and unchanged usage/provider counters. No real client documents or paid calls are needed for this preflight.
4. Merge normally and deploy the clean merged application through the existing Lovable hosting flow. **Never deploy the new generation reads before the migration.** Compare the custom-domain runtime identity, clean source revision and every fingerprint component to the deployed build. Run the existing allowed HTTP checks. Do not use another host or create a duplicate project/account.
5. Record release identifiers, exact migration hash, review coverage limitations and remaining signed-in acceptance honestly. A successful technical release does not remove the browser/provider/paid-launch gates.

## Rollback

Return application code to the previously verified P0 release while retaining P1 knowledge tables, originals, histories, owner markers and tombstones. The additive SQL does not replace existing P0 generation/recovery functions. Do not drop private knowledge, reset quotas, delete expenses or refund unknown outcomes as rollback. Old code ignores the added metadata; source-backed brand values were not copied into its stored profile. Reconcile any in-flight generation using the existing P0 durable recovery path. Re-enable P1 only after the new runtime and existing migration are verified together.

## Authority and next packet

No paid generation, funding, email, client publication, secret/account changes or browser attempts occurred. Exactly USD5 total for one scan, one article and one image (no retries) remains the recorded unused authorization; OpenAI remains last known unauthorized, with no successful key setup. Do not repeat unchanged auth/picker attempts or ask for secrets. The operational test-email authorization is consumed. Stripe stays owner-deferred; company admin/billing owner stays `rafi@anderseninnovations.com`, with the accepted OpenAI account exception. No subagents.

After P1 release review, continue P2 scoped website/catalog refresh and output dependencies, followed by P3–P5. Backlinks/Authority remains behind R14/R15 provider/outreach prerequisites. The owner's latest instruction is to continue autonomously and stop only for an action actually requiring them, such as signing in; independent local work must continue around those constraints.
