# Milo Content Factory — architecture audit and staged plan

## Recommendation and audit boundary

An isolated, default-off **Synergy Massage** module: evidence → ideas → script/caption/carousel → approval → calendar → manual export. Instagram-first export is the smallest complete MVP; no publishing API is needed.

Read-only audit, 25 November 2026, repository `c5cc7c339d1a2b45bbd6574e2f951527729eab37`: source, migrations, test files, scan results and bounded database SELECTs. Only this plan is written. No application/dependency changes, database writes, provider calls, worker runs, mail, settings changes or deployment. Tests/builds were not run; proposals are not production acceptance or expanded launch authorization.

## Confirmed existing architecture and gaps

Library paths below are under `src/lib/`; app routes under `src/routes/_authenticated/`.

| Reuse | Actual files | Gap / boundary |
|---|---|---|
| Profile/brand | `types.ts`, `brand.ts`, `brand-owner-edits.ts`; `ai.functions.ts:1182` (`projectBrief`) | Reuse offers/voice/claims/owner precedence; visual logo/palette/font kit missing. |
| Evidence/import | `project-knowledge.ts`, `.server.ts`, `.functions.ts`; `brand-document.client.ts`, `brand-document.ts` | Revision/fingerprint/locator selection and PDF/DOCX extraction exist (5 MiB/40 pages/100,000 characters). Owner “teach” auto-accepts; imports must not silently do that. References alone do not prove support. |
| Generation/provider | `ai.functions.ts:2418,2430–2551`; `ai-router.ts`, `ai-provider.server.ts`, `ai-provider-expense.server.ts`, `ai-text-bounds.server.ts` | Existing `socialPack` is article-shaped; structured scripts/slides/claim links missing. Reuse current priced native provider. Direct `generateContentCore` retention writes website content. |
| Metering | `generation-usage.server.ts`, `ai-usage.server.ts`, `ai-expense.server.ts`; `20260909150000_generation_usage_receipts.sql` | Reuse quota AND money admission; narrow three-operation receipt whitelist extension required. |
| Review/access | `project-team.functions.ts`, `project-team-read.server.ts`, `project-team-authority.server.ts`, `project-team-review.server.ts`, `publication-version.ts` | Reuse actor/member/version/media contracts, not article RPCs. `20260911060000_project_team_approval_policy.sql:100–117`: policy changes can alter article approvals/queue. |
| Export/calendar | `app.editor.tsx:1136–1148`; `components/ui/carousel.tsx`; `app.calendar.tsx`, `calendar-schedule.ts`, `schedule.functions.ts`, `publish-cron.server.ts` | Text export changes article status; carousel is a viewer; calendar redirects to Plan and scheduling arms real publication. New independent renderer/export/dates needed. |
| Languages/analytics | `content-languages.ts`; `src/i18n/ui-languages.ts`; `src/routes/milo-analytics[.]js.ts`, `src/routes/api.analytics.track.ts`; `ga4.ts`, `ga4.server.ts`, `ga4-daily.server.ts` | 24 EU content codes, four UI languages, consent tracking and Synergy ChatGPT reports exist. No Factory/UTM/local-media/official Meta publisher found; existing GA4 is not social reporting. |

**Actual Synergy data:** one project `synergy`, `synergymassage.se`; Swedish primary, EN/PL/SV/DA additional languages; Malmö/Limhamn; `Europe/Stockholm`; custom connector and `autoPublishApproved`. Two knowledge sources, one accepted record, zero accepted visual-style records; no approval-policy row or active unexpired team members. Preserve calm premium voice and explicit no-cure/no-guarantee rules. Confirm visual kit and source rights; profile claims are owner-supplied, not independent substantiation. `mock-data.ts` also contains Synergy demo fixtures—never substitute them for actual data.

**Structural finding:** AI functions/editor/store/types are 3,477/3,808/1,616/1,849 lines. Another lifecycle increases regression risk; isolate Factory, no broad refactor.

**Security scan summary:** 22 November results reported informational public-read findings for published Milo blog records and public article asset listing; dependency results were outdated. No recent deep-scan result supplied: run a deep scan from the Security tab before rollout. No “secure” claim or unrelated fixes proposed.

## Smallest complete MVP

1. **Sources/ideas:** read existing knowledge without changing it; manually import excerpts/documents/official reports with URL/title, language, observation/import dates, locator, fingerprint, permission-to-use and genuine supplied metrics/window. URL-only is not evidence. Distinguish inspiration from factual support; unknown/stale/disputed stays flagged. No scraping or invented trends/outcomes.
2. **Script/caption:** manual editing always works. With explicit budget, one request proposes up to three ideas; a second for the chosen idea returns script scenes, caption/CTA and up to five slides. Validate claim references against included evidence; human review establishes support, not IDs alone.
3. **Carousel:** one 1080×1350 template, 1–5 slides; edit text/order, approved colors/font/logo, rights-cleared photos/alt text. Reuse image validation and JSZip; browser Canvas, no paid images. Save editable JSON and freeze PNG bytes for review/export. Missing branding/assets or overflow blocks approval.
4. **Approval/calendar:** owner-only pilot, matching existing owner approval. Retain rejection/history; approval binds text/media bytes, brand/source versions, language, destination and UTMs. Edits invalidate applicability. Dates are planning only, with explicit timezone/UTC and DST validation. Delegates later follow existing viewer/editor/reviewer policy without changing it.
5. **Export/measurement:** approved ZIP contains PNGs, caption/script, alt text, JSON and evidence/UTM manifest; draft downloads stay unapproved. Stable campaign/item IDs, `utm_source=instagram`, `utm_medium=organic_social`, no personal data; preserve valid query parameters and validate destinations. Resolve Synergy booking CTA against project origin. Export and owner-reported post URL/time/channel are separate—not live proof. Optional genuine report imports retain source/window; missing metrics stay unknown. UTMs do not prove destination tracking works.

## Technical design and isolation

- New `src/features/content-factory/`: schemas, evidence/version/UTM/calendar helpers, context adapter, repository, authenticated `.functions.ts`, server helpers, browser renderer, views/tests. Thin `_authenticated/app.content-factory` index/sources/editor/review/calendar routes; parent renders Outlet. Reuse AppShell/tokens/controls/i18n; gated nav and leaf metadata.
- Extract `projectBrief` with parity tests/unchanged callers; reuse `loadProjectKnowledgeContext` and bounded scoped profile/service reads. Factory imports stay separate: accepting inspiration must not change shared brand memory or weekly SEO inputs.
- Additive proposed tables: `content_factory_projects` (trusted flags/limits/brand kit), `content_factory_sources`, `content_factory_items`, immutable `content_factory_versions`, append-only `content_factory_events` (reviews/attempts/exports/reported posts). Owner/project composite keys/project foreign keys; no new auth-schema references. Paginate 50/page; explicit limits fail visibly. Private Factory bucket avoids article promotion/cleanup; reuse upload validation.
- Tenant key: **owning account UUID + project ID**, not name/host/active-project UI state. Actor derives from existing auth middleware. Check current membership/project/role/flag every operation; transactionally recheck authority/source/media versions for approval/export. RLS and least-privilege GRANTs; no direct client flags/budget/approval grants. Caller-scoped ordinary reads; authorize privileged work first. No cross-project cache/delegate workspace fallback; expiring private URLs, no credentials in exports/logs.
- Default-off server `contentFactory` flag pinned to existing Synergy owner/project, never rebound to a visitor. Separate AI/local-media/Meta/analytics/autopilot gates, initially off; hidden navigation is not authorization.
- No writes/calls to website content/statuses, `scheduled_publishes`, mirrors/publication approvals, weekly state, team-policy setters, publication/preparation workers or GA4 daily jobs. Preserve their gates/schedules/budgets. Factory approval/date/export never invokes a connector. Disablement leaves website publishing untouched.

## EU languages, privacy and costs

Reuse 24 EU content codes independently of UI/source language. UI EN/PL/SV/DA; Swedish pilot first, others on request. Review each translation separately; fluent acceptance precedes quality claims. Test diacritics/Greek/Cyrillic/wrapping/Stockholm DST.

Treat sources as untrusted evidence, not instructions. No patient histories or unconsented photos. Retention/deletion needs explicit policy; no automatic deletion/new tracking without consent. Analytics consent never authorizes publishing/autopilot.

**Factory AI defaults to USD0 until explicit budget approval.** Proposed USD5/month reservation sublimit INSIDE existing USD50 global ceiling. Current USD0.50/text reservation permits at most ten attempts, not an invoice estimate. Free accounts still need manual grants. Atomic module/account/global admission; stable attempt IDs; uncertainty retains reservations, no regeneration. One attempt/action, no retries/tools/benchmarks; ≤64 KiB prompt/8,000 output tokens, existing 60-second bound, complete-output/schema validation. No subscriptions/new credentials/paid data/images/provider fallback. Provider/deployed budget configuration unverified; hosting/storage not claimed free.

## Staged rollout and acceptance

1. **Review:** owner approves scope; Claude authors/Codex independently reviews under the agreement/fallback. Check active writers; confirm owner/assets/rights/samples. Record architecture in AGENTS.md during implementation. No spend/deployment permission follows from this audit.
2. **Manual slice:** isolated test/local schema and full import→edit→approve→calendar→ZIP, AI off. Test tenant/project/role denial, forged calls, pagination, save/reload, stale sources, invalidated reviews, missing assets, ZIP/UTMs and DST. Authorized-state browser E2E plus desktop/mobile rendering.
3. **AI pilot:** explicit budget first; narrow receipt extension and Factory persistence before successful delivery/settlement. Fake-provider tests: no-budget/no-dispatch, quota, races, duplicates, timeout/uncertain persistence, incomplete JSON and invalid references. Separately budget Swedish accuracy/brand review; no unlimited evaluation.
4. **Release:** separately authorize deployment/Synergy enablement; three approved manual packages. Independent review/deep scan, production access/export verification and unchanged website queue/gates evidence. Separate exports/reported posts/metrics. Rollback disables Factory, retaining records.
5. **Later, separate approval:** local FFmpeg/Whisper on owner hardware, not app-server bundles; bounded authenticated jobs and media-rights/model/compute/storage limits. Official Meta publishing/analytics only after current account/API/scopes review, token handling, idempotency/reconciliation and genuine metric windows. Opt-in autopilot last: explicit project/channel scope, budget, revocation/kill switch and own queue; never inferred from approval/calendar/analytics/website autopublish. No consumer automation or terms-violating scraping.

**Validation:** new Factory tests plus targeted `bunx vitest run` on existing knowledge, generation-usage, AI-expense, team-review, calendar/language/image, weekly-readiness/executor, publish-cron and GA4-daily tests. Migration tests use the isolated harness. Typecheck/production build through required CI/platform checks. Report commands/pass counts/errors, paths/SHA and authorized persisted-flow/download evidence. No tests/live acceptance claimed now.
