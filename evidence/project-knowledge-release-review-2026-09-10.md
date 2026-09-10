# P1 project knowledge — release review packet

Updated 10 September 2026. Status: PR #108 merged, migration applied once, deployed and exact-runtime verified; **not browser-accepted or a public paid launch**. Executor: current Codex task; independent verifier remains the PR review. Broader P2–P5 and R00–R24/D01–D08 remain active.

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

## PR and lock reconciliation

PR #108: https://github.com/rafalandersen-dev/andersen-visibility-engine/pull/108. Product candidate `66882cfc7fceaea99ff2917839a40a6b7554fb7d` passed 2,413 tests/169 files, TypeScript, focused lint and a clean production build (`/tmp/milo-product-clean-build.log`).

The first CI dependency-lock run failed because the earlier P1 parser additions updated npm but not Bun. Regenerated Bun from the pinned npm graph in a disposable directory; retained lockfile format 1 for the observed Bun 1.3.3 host. Manifest and npm lock unchanged. Adds the 39 parser-related dependency records; the argparse root/nested placement follows npm (Mammoth uses 1.0.10; js-yaml retains 2.0.1). No unrelated dependency upgrade, production frozen-install change or release-age exception. Local Bun 1.4 frozen lock-only verification passes; final Linux 1.3.3/1.4 matrix validation remains required.

The initial draft-PR review workflow reported success with zero permission denials but posted no review/findings. This does not establish substantive independent review of the candidate; obtain the ready-for-review run on the final head. The pre-existing workflow reports model-account usage separately from Milo's untouched native OpenAI benchmark budget. No live Milo generation/provider benchmark ran.

## Release continuation: parser compatibility

Successor task recovered exact `8da4cbc` in its isolated worktree. Run `34456943555` passed both frozen-lock agreement checks, then Node 22 failed four real PDF bundle tests because the modern PDF.js build requires `Promise.try`; the Bun 1.3.3 sibling was cancelled by matrix fail-fast. This is a parser runtime compatibility failure, not another lock mismatch.

Switched both PDF.js API and worker to the supplied legacy compatibility builds, with no dependency change. The real worker regression harness removes `Promise.try` even on newer local Node, exercising the missing-feature case without a test-only polyfill. All six parser bundle cases and the full 2,413-test/169-file suite pass, as do TypeScript, focused lint and production build. Logs: `/tmp/milo-p1-parser-compat.log`, `/tmp/milo-p1-release-tests.log`, `/tmp/milo-p1-release-types.log`, `/tmp/milo-p1-release-lint.log`, `/tmp/milo-p1-release-build.log`. Node emits optional canvas/rendering warnings; these tests extract text and make no rendering/browser claim. Final Linux matrix and independent review remain required. No migration, merge or deployment has occurred.

Linux Bun 1.3.3/1.4.0 matrix `34457407604` passed all lock checks, the full suite, types and builds for parser fix `e761390`. Independent Codex review of `8da4cbc` reported one P2-severity finding: bare hostnames accepted by the onboarding scan were rejected by knowledge capture. Normalize whitespace and scheme-less input to HTTPS before the existing strict source validation; preserve rejection of explicit unsupported protocols and credentials. Regression tests cover consistent source identity/deduplication and denied inputs; 13 focused server/boundary tests plus focused lint pass (`/tmp/milo-p1-website-review-tests.log`). No migration SQL change.


## Completed P1 technical release — 10 September 2026

- Candidate `ebd61fec4981b694fb2ee57090e3eaeba89886dc`; final Linux matrix `34457660978` passes frozen Bun 1.3.3/1.4.0 locks, 2,418 tests / 169 files, types and builds. Earlier parser fix `e761390` and hostname fix preserved; no history rewrite.
- Independent Codex final code review of `ebd61fe` completed 09:02:42 UTC and found no major issues. Earlier security review of `8da4cbc` completed without posted findings. Claude final workflow `34457660955` reported success at 09:07 but 31 permission denials and no buffered output; **not** counted as substantive independent review. Prior `34457407688` had 17 denials; superseded `34456956376` was cancelled. Logs `/tmp/milo-p1-review-ebd61fe.log`, `/tmp/milo-p1-final-linux-matrix.log`. Existing GitHub review usage is separate from Milo native provider benchmark spending.
- Applied P1 SQL **once**, transactionally, after immediate absence checks plus advisory lock. Registry version `20260909200000`, name `project_knowledge`, exact SQL SHA-256 `27034fbe105b72bbe70ab354f2914798d3dc2f07149e0a13a5c1b382f4537a65`. All five tables use RLS; anon/authenticated table/RPC access denied; service SELECT but no direct writes; nine service functions and one trigger-only function match reviewed permissions; project deletion trigger enabled.
- New source/record/document/history/tombstone, archive, receipt, native budget/permit/request counts all zero; historical usage remains 10 rows / 226 units. No provider generation, funding, email, account/key change or client content publication.
- PR #108 normally merged as `b1abcf367ea58c610a224df3ed96e43473a8620c` at 09:05:39 UTC. Waited for Lovable Git sync to that revision before publishing. Deployment `d71e1ffb-4b24-484c-a593-452eec6d79f1` is live on the existing host.
- Custom-domain runtime verified 09:09:26 UTC: build `1789031231514`; exact merged revision, `modified:false`; full fingerprint `5c156a2c14aa171a8ac909d9505b6e6023f5ca6c416cf077ef9fdff1b278937f`, algorithm and every component match the clean source. Home/MCP GET 200/200; OPTIONS 204; anonymous POST 401. Machine-readable evidence `/tmp/milo-p1-runtime-verification.json`.

The ordered code/database/runtime release is complete. Signed-in upload/edit/revoke/reload, visual/responsive acceptance, secure provider setup and the unused one-attempt USD5 benchmark remain separate pending gates under the existing restrictions. P2 source refresh is the next implementation; P3–P5 and all R00–R24/D01–D08 remain required. Do not reapply P0/P1 or recreate hosting. Historical preflight/pending sections above describe their dated checkpoints, superseded by this release record.
