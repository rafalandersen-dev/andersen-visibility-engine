# Milo Content Factory — architecture audit and staged plan

## Recommendation and audit boundary

An isolated, default-off **Synergy Massage** module: evidence → ideas → script/caption/carousel → approval → calendar → manual export. Instagram-first export is the smallest complete MVP; no publishing API is needed.

Read-only audit, 25 November 2026, baseline `c5cc7c339d1a2b45bbd6574e2f951527729eab37`: source, migrations, tests, scan results and bounded SELECTs. Only this plan changes. No application/dependency/database/settings writes, paid calls, workers, mail or deployment; tests/builds not run. Proposals are not production acceptance.

## Confirmed existing architecture and gaps

Library paths below are under `src/lib/`; app routes under `src/routes/_authenticated/`.

- **Profile/brand:** `types.ts`, `brand.ts`, `brand-owner-edits.ts`, `ai.functions.ts:1182` (`projectBrief`). Reuse offers/voice/claims; visual brand kit missing.
- **Evidence:** `project-knowledge.ts`, `project-knowledge.server.ts`, `project-knowledge.functions.ts`, `brand-document.client.ts`, `brand-document.ts`. Revision/fingerprint/locator selection and PDF/DOCX parsing exist (5 MiB/40 pages/100,000 characters). “Teach” auto-accepts; imports must not silently do that. References alone do not prove support.
- **AI:** `ai.functions.ts:2418,2430–2551`, `ai-router.ts`, `ai-provider.server.ts`, `ai-provider-expense.server.ts`, `ai-text-bounds.server.ts`. Reuse current priced native provider. `socialPack` is article-shaped; scripts/slides/claim links missing. Direct core retention writes website content.
- **Quota/cost:** `generation-usage.server.ts`, `ai-usage.server.ts`, `ai-expense.server.ts`, `20260909150000_generation_usage_receipts.sql`: reuse both layers; narrow receipt whitelist extension needed.
- **Review/access:** `project-team.functions.ts`, `project-team-read.server.ts`, `project-team-authority.server.ts`, `project-team-review.server.ts`, `publication-version.ts`. Reuse actor/member/version/media contracts, not article RPCs. `20260911060000_project_team_approval_policy.sql:100–117`: policy changes affect article approvals/queue.
- **Export/calendar:** `app.editor.tsx:1136–1148`, `components/ui/carousel.tsx`, `app.calendar.tsx`, `calendar-schedule.ts`, `schedule.functions.ts`, `publish-cron.server.ts`. Text export changes article status; carousel is only a viewer; scheduling arms real publication. Independent renderer/export/dates needed.
- **Locale/analytics:** `content-languages.ts`, `src/i18n/ui-languages.ts`, `src/routes/milo-analytics[.]js.ts`, `src/routes/api.analytics.track.ts`, `ga4.ts`, `ga4.server.ts`, `ga4-daily.server.ts`. 24 EU content codes/four UI languages, consent tracking and Synergy ChatGPT reports exist—not social reporting. No Factory/UTM/local-media/official Meta publisher found.

**Actual Synergy:** one project `synergy`, `synergymassage.se`, Swedish primary, EN/PL/SV/DA additional languages, Malmö/Limhamn, Stockholm timezone, custom connector/automatic website publishing. Two sources/one accepted record; no accepted visual-style record, approval-policy row or active team members. Preserve premium calm voice/no-cure/no-guarantee restrictions. Confirm visual assets/rights; owner claims are not independent evidence. Do not substitute Synergy fixtures in `mock-data.ts`.

**Structural finding:** AI functions/editor/store/types are 3,477/3,808/1,616/1,849 lines. Another lifecycle increases regression risk; isolate Factory, no broad refactor.

**Security scan:** 22 November informational public-read findings: published blog records/public article asset listing; dependencies outdated. No recent deep-scan result: run one from the Security tab before rollout. No secure claim/unrelated fixes.

## Smallest complete MVP

1. **Sources/ideas:** read shared knowledge; manually import excerpts/documents/official reports with URL/title, language, dates, locator, fingerprint, rights and genuine metric/window if supplied. URL-only is not evidence. Distinguish inspiration/support; unknown/stale/disputed stays flagged. No scraping/invented trends or outcomes.
2. **Drafts:** manual editing works without AI. With approved budget: up to three ideas in one request; chosen idea’s script scenes/caption/CTA/five-slide text in another. Validate evidence IDs; human review determines factual support.
3. **Carousel:** one 1080×1350 template, 1–5 slides; edit text/order/approved branding/photos/alt text. Reuse image validation/JSZip; browser Canvas, no paid images. Save editable JSON; freeze PNG bytes. Missing branding/assets/overflow blocks approval.
4. **Review/calendar:** owner-only pilot; later delegates follow existing policy. Retain rejection/history; approve exact text/media/brand/source/language/destination/UTMs. Edits invalidate approval. Planning-only dates carry timezone/UTC and DST checks.
5. **Export/tracking:** approved ZIP: PNGs, caption/script/alt text, JSON, evidence/UTM manifest. Draft downloads remain unapproved. Stable campaign/item IDs, Instagram/organic-social UTMs, no personal data; validate URLs/preserve queries/resolve booking CTA against project origin. Export ≠ owner-reported post URL/time/channel ≠ live proof. Genuine manual report imports retain source/window; missing metrics unknown. UTMs do not prove destination tracking works.

## Technical design and isolation

- New `src/features/content-factory/` schemas/helpers, context adapter, repository, authenticated `.functions.ts`, server helpers, browser renderer/views/tests. Thin `_authenticated/app.content-factory` index/sources/editor/review/calendar routes; parent Outlet. Reuse AppShell/tokens/controls/i18n, gated nav and leaf metadata.
- Extract `projectBrief` with parity tests; reuse `loadProjectKnowledgeContext` and scoped profile/service reads. Factory imports must not change shared brand memory/weekly SEO inputs.
- Additive `content_factory_projects` (trusted flags/limits/brand kit), `content_factory_sources`, `content_factory_items`, immutable `content_factory_versions`, append-only `content_factory_events` (reviews/attempts/exports/reported posts). Owner/project composite keys/project foreign keys; no new auth-schema references. Paginate 50/page, fail visibly at limits. Private Factory storage avoids article promotion/cleanup; reuse validation.
- Tenant = **owner UUID + project ID**, not name/host/UI selection. Actor comes from auth middleware. Check current membership/project/role/flag each operation; transactionally recheck authority/source/media on approval/export. RLS/least-privilege GRANTs; no direct client budget/flag/approval grants. Caller-scoped reads; authorize privileged work first. No cross-project cache/delegate workspace fallback; private links expire; no exported/logged credentials.
- Default-off server flag pinned to existing Synergy owner/project, never rebound to visitor; separate AI/media/Meta/analytics/autopilot gates, initially off. Hidden nav is not authorization.
- No website content/status, queue/mirror/approval, weekly state, team-policy or GA4-job mutations; no publication/preparation worker calls. Preserve existing gates/schedules/budgets. Factory approval/date/export cannot invoke a connector; disablement leaves website publishing untouched.

## EU languages, privacy and costs

Reuse all 24 EU content codes independently of UI/source language. UI EN/PL/SV/DA; Swedish first. Review each translation; fluent acceptance precedes quality claims. Test diacritics/Greek/Cyrillic/wrapping/Stockholm DST. Sources are untrusted data, not instructions. No patient histories/unconsented photos. Explicit retention/deletion policy; no automatic deletion/new tracking without consent. Analytics consent is not publishing/autopilot consent.

**Factory AI starts at USD0 until explicit budget approval.** Proposed USD5/month reservation sublimit INSIDE existing USD50 global ceiling. Current USD0.50/text reserve allows at most ten attempts—not an invoice estimate. Free accounts need manual grants. Atomic module/account/global admission, stable attempt IDs, retain uncertain reservations/no regeneration. One attempt/action, no retries/tools/benchmarks; ≤64 KiB prompt/8,000 output tokens, existing 60-second bound, complete-output/schema checks. No subscriptions/credentials/paid data/images/fallback provider. Provider/deployed budget unverified; hosting/storage not claimed free.

## Staged rollout and acceptance

1. **Review:** owner approves scope; Claude authors/Codex reviews under the agreement/fallback. Check active writers; confirm owner/assets/rights/samples. Record architecture in AGENTS.md during implementation. No spend/deployment permission follows from this audit.
2. **Manual slice:** isolated test/local schema and full import→edit→approve→calendar→ZIP, AI off. Test tenant/project/role denial, forged calls, pagination, reload, stale sources, invalidated reviews, assets, export/UTMs and DST. Authorized-state browser E2E and desktop/mobile rendering.
3. **AI pilot:** explicit budget; receipt integration and durable Factory results. Fake-provider tests: no-budget/no-dispatch, quota/races/duplicates, timeout/uncertain persistence, incomplete JSON and invalid references. Separately budget Swedish human accuracy/brand review.
4. **Release:** separately authorize deployment/Synergy enablement; three approved manual packages. Independent review/deep scan, production export/access checks and unchanged website queue/gates evidence. Separate exports/reported posts/metrics; rollback disables Factory, retaining data.
5. **Later, separate approval:** local FFmpeg/Whisper on owner hardware, not app bundles; bounded authenticated jobs, media rights/model/compute/storage limits. Official Meta API after account/scopes/version review, token handling, idempotency/reconciliation and genuine metric windows. Opt-in autopilot last: explicit project/channel scope, budget, revocation/kill switch and own queue; never inferred from approval/calendar/analytics/website autopublish. No consumer automation or terms-violating scraping.

**Validation:** new Factory tests and targeted `bunx vitest run` on existing knowledge, generation-usage, AI-expense, team-review, calendar/language/image, weekly-readiness/executor, publish-cron and GA4-daily tests. Migration tests use the isolated harness; typecheck/production build use required CI/platform checks. Report commands/pass counts/errors, paths/SHA and authorized persisted-flow/download evidence. No tests/live acceptance claimed now.
