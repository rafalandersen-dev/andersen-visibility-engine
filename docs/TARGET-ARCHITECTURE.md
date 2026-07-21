# Milo Growth — Target Product Architecture

**Status:** proposal for approval. Planning only — no `src/`, migration, environment, or production change is authorised here. **Last revised:** 2026‑07‑20.

Cross‑refs: `ROADMAP.md` (phases/epics), `PRODUCT-AUDIT-2026-07.md` (current state + evidence), `DECISION-LOG.md`, `ARTICLE-STUDIO-2.0.md`, `AI-VISIBILITY-MONITOR.md`.

---

## 0. Product definition (canonical)

> **Milo Growth is an AI Growth Operating System that detects opportunities, creates implementation‑ready assets, manages execution, verifies deployment, and demonstrates measurable business impact.**

Agency replacement is a **benchmark**, not the definition. Relationship services (PR, negotiated links, sponsored placements, outreach execution) are **customer‑ / partner‑ / Andersen‑managed‑service**, with Milo doing the find/brief/draft/measure around them.

**The one architectural axis that governs everything: MEASUREMENT vs ADVICE.**
- **Measurement** = derived from real external data (customer site fetch, GSC, GA4, DataForSEO, first‑party analytics, live AI‑engine probes).
- **Advice** = an LLM reasoning over the project profile.
Every module below is explicitly one or the other, and the UI must say which. Today four of five flagship modules are advice wearing measurement labels (see audit). The target moves the flagships onto real data, phase by phase.

---

## 1. Data architecture direction

**Today (verified):** almost all product data lives in one JSONB blob `workspaces.data` (projects, services, opportunities, content, all analysis‑module results, orders, drafts, tasks, pendingActions). Real Postgres tables exist only for infrastructure that needs row‑level truth or history: `workspaces(+rev)`, `analytics_events`, `google_connections`, `scheduled_publishes`, `cron_heartbeats`, `ai_usage`, `mcp_/oauth_*`, `email_infra`. `scheduled_publishes` was deliberately pulled OUT of the blob — a signal the blob strains where concurrency/history matter.

**Direction:** every new **measurement/time‑series** capability gets a **real table**, not a blob field, because it needs history and cross‑run diffing:
- `site_crawls`, `crawl_pages` (M1) — per‑URL technical signals, time‑stamped.
- `ai_visibility_prompts`, `ai_visibility_probes` (M6) — prompt library + stored engine responses/citations.
- `verification_snapshots` (M12) — baseline + after; finally writes the declared‑but‑unused `baselineSnapshotId`.
- `ga4_connections`, `revenue_daily` (M9).
- `backlink_snapshots` (M8) — lost/new/toxic diffing.
- `external_api_calls` / `usage_counters` (Cost‑Control Framework) — metering + cost caps.
- (P3) `products`, `offers` (M5).
Content authoring artifacts (Article Studio canonical asset) stay in the blob for now but move to a normalised document model when scale demands.

---

## 2. External‑API Cost‑Control & Metering Framework (foundation — epic P2.0)

**Every paid or rate‑limited external call routes through this layer. It is a hard prerequisite for enabling DataForSEO, AI‑engine probing, and PSI at scale.** No module below may call a paid provider except through it.

Controls (all required before DataForSEO is enabled, or explicitly approved otherwise):
- **Per‑workspace usage limits** — hard caps per workspace/project, independent of plan.
- **Daily & monthly cost caps** — global and per‑workspace spend ceilings in currency; breach ⇒ fail‑closed.
- **Caching** — response cache keyed by (provider, endpoint, normalised params) with TTL; a repeat query in‑TTL never bills.
- **Duplicate‑request prevention** — in‑flight de‑dup + idempotency keys so a double click or retry does not double‑bill.
- **Rate limits** — per provider and per workspace, token‑bucket; queue or reject over‑rate.
- **Subscription‑plan entitlements** — which providers/volumes a plan may use (extends the existing `ai_usage` plan model; owner ≠ unlimited, capped multiplier).
- **Usage metering** — every call recorded (provider, endpoint, cost, workspace, outcome) in `external_api_calls`; extends the `claim_ai_usage` pattern already shipped.
- **Admin cost dashboard** — owner view of spend by provider/workspace/day, with projections.
- **Alerts** — threshold alerts (e.g. 80% of monthly cap) to the owner.
- **Fail‑closed behaviour** — any ambiguity (cap unknown, meter write fails, provider error) blocks the call; never fail‑open into unmetered spend.
- **Test vs production separation** — sandbox creds/endpoints and a `EXTERNAL_API_ENV` switch; test traffic never bills production budget.
- **Request‑explosion protection** — no user action or prompt can fan out into unbounded external calls; every entry point has a bounded fan‑out and a per‑action ceiling (mirrors the "no bulk arm/publish" discipline already in the board).

**Failure states:** cap reached → queued or refused with a clear message; provider down → cached/last‑known + honest staleness; meter write fails → fail‑closed.

---

## 3. The twelve modules

Format per module: **Problem · User · Workflow · Inputs · Output · UI · Data · Services · Jobs · Integrations · AI · Human steps · Success metric · Failure states · Permissions/Plan · MVP → Later.** Type = **MEASUREMENT** or **ADVICE** (or hybrid). Current status is summarised from the audit; full evidence in `PRODUCT-AUDIT-2026-07.md`.

### M1 — Technical SEO Monitor  · MEASUREMENT · (P2.1) · current: PRESENT_BUT_MISLEADING ("Site Audit")
- **Problem:** SMBs can't see the technical faults (noindex, robots block, broken canonicals, dead pages, slow CWV) that silently suppress them.
- **User:** owner / non‑technical operator.
- **Workflow:** crawl (BFS, robots‑respecting, capped) → per‑URL signal extraction → validate → diff vs last crawl → findings → opportunities.
- **Inputs:** site URL, sitemap, robots. **Output:** per‑URL status/redirects, robots/noindex/X‑Robots, canonical, hreflang, sitemap validity, extracted+validated JSON‑LD, CWV (PSI); regression diffs.
- **UI:** replaces the misleading "Site Audit" surface; issue list + per‑URL detail + trend.
- **Data:** `site_crawls`, `crawl_pages`. **Services:** crawler + parser + PSI client (via Cost‑Control). **Jobs:** scheduled re‑crawl (cadence by plan). **Integrations:** PageSpeed Insights, (later) GSC URL‑Inspection + Sitemaps API, rendering service for SPA/JS.
- **AI:** only to *explain/prioritise* findings, never to invent them.
- **Human steps:** the fix on the customer site (Milo detects + verifies, human/CMS implements).
- **Success:** % of real technical issues detected vs a reference crawler; a deliberately noindexed page is flagged.
- **Failure states:** SPA with no SSR → render fallback; if still empty, honest "could not read" (never a confident fake score — the P0.1 rule made permanent).
- **Plan:** crawl depth/frequency by plan. **MVP:** robots/sitemap/status/canonical/noindex/schema‑extract + PSI on a capped crawl. **Later:** log/orphan/faceted/parameter analysis, full regression alerts.

### M2 — SEO Execution Center  · hybrid · (redesign, spans P0→P2) · current: strong governance, broken customer‑site loop (Domain G 62/100)
- **Problem:** recommendations pile up with no honest lifecycle from detection to confirmed impact.
- **Workflow:** the recommendation lifecycle (see `PRODUCT-AUDIT` §Execution): DETECTED → EVIDENCE → PRIORITISED → APPROVED → ASSIGNED → IMPLEMENTED → **VERIFIED** → MONITORED → IMPACT(+/0/−).
- **Data:** existing `opportunities` + `pendingActions` + new `verification_snapshots`. **Services:** the pipeline (`pipeline.ts`, already excellent), extended with verification (M12).
- **Human steps:** approval, and any off‑platform implementation.
- **Success:** every recommendation reaches a terminal, evidenced state; `implemented` ≠ `verified` enforced.
- **MVP (P0/P1):** evidence + honest states on Milo's own actions. **Later (P2):** customer‑site verification via M1/M12.

### M3 — Article Studio 2.0  · ADVICE→grounded · (P1.1) · current: PARTIAL/misleading side‑fields (Content 42/100)
Full spec in `ARTICLE-STUDIO-2.0.md`. **Problem:** output feels like raw AI text; side‑fields (FAQ/CTA/links/schema) don't publish or get scored; no images/author/citations/structured data. **Core principle:** one canonical assembled asset is the only input to score/preview/export/publish/schema. **MVP:** grounded research + verified sources, formatting, tables/comparison, TL;DR, CTA, real internal‑link resolution, author/E‑E‑A‑T, images+alt+placement, Article/Breadcrumb/FAQ schema, mobile+desktop preview, publishing checklist. **This is the headline commercial differentiator.** — **P1.1 SHIPPED + deployed to production (2026‑07).**

**Article Studio 3.0 (P1.2 — architecture approved, planning only; full spec `ARTICLE-STUDIO-3.0.md`):** visual composition & conversion — first‑class **hook** + **featured image**, **stable image anchors** over a **persisted section identity** (not offsets, not heading hashes), bounded **presentation presets**, a two‑mode **Preview + Arrange visual editor**, responsive preview, and connector image mapping with **four‑state** fidelity honesty (generated / included / retained / destination‑verified). **Architecture (ADOPTED): extends the same canonical assembler** with typed presentation blocks over composed‑markdown (option A — no migration, one publishable output preserved); a block‑tree rewrite (option B) is **rejected for this phase / deferred**. Legacy assets protected by a read‑time `needsVisualUpgrade` state; no connector‑contract change without explicit approval. Stays an article editor, not a page builder. **Roadmap id: P1.2** (the former Content Opportunity Engine P1.2 is renumbered **P1.4**).

### M4 — Content Opportunity Engine  · ADVICE→MEASUREMENT · (P1.4) · current: PRESENT_BUT_WEAK
- **Problem:** topics are LLM guesses, not demand‑evidenced.
- **Inputs:** GSC top queries (connected), keyword/SERP data, competitor gaps. **Output:** opportunities with *evidence* (query, impressions, position, gap).
- **Integrations:** GSC (have), keyword/SERP source (DataForSEO extension behind Cost‑Control).
- **Success:** each opportunity cites real demand data. **MVP:** GSC‑query‑seeded opportunities. **Later:** SERP/keyword enrichment.

### M5 — E‑commerce Growth Intelligence  · MEASUREMENT · (P3.2) · current: MISSING (17/100)
- **Problem:** no product‑level SEO (schema, price/availability, feeds) — Shopify is used as a blog CMS only.
- **Data:** new `products`, `offers`. **Output:** Product/Offer/AggregateRating schema, feed & Merchant‑Center readiness, price/availability consistency, OOS/discontinued handling, category/product page content.
- **Integrations:** Shopify Admin (catalog, not just articles), (later) Merchant Center / feed.
- **MVP:** product data model + Product/Offer schema on published product‑adjacent content. **Later:** feed audit, faceted/parameter handling.

### M6 — AI Visibility Monitor  · MEASUREMENT · (P3.1) · current: PRESENT_BUT_MISLEADING (never queries an engine, 20/100)
Full spec in `AI-VISIBILITY-MONITOR.md`. Three **separate** metrics: mention / citation / referral. Real scheduled probing (≥2 engines), stored answers + citations, sentiment, confidence + limitations. Gated by Cost‑Control (P2.0). Current planner is renamed **AI Readiness** (advice) in P0.1; the *monitor* (measurement) is P3.1.

### M7 — Entity & Knowledge Center  · hybrid · (P3.3) · current: MISSING/weak
- **Problem:** AI/search can't cleanly resolve "who is this business / author".
- **Output:** Organization + author `sameAs`/schema, NAP consistency checks.
- **Discipline:** produces the *inputs* to entity understanding; **never promises a Knowledge Graph entry** (emergent).
- **MVP:** Organization/author schema + `sameAs` from setup. **Later:** NAP/citation consistency scan.

### M8 — Authority & Backlink Workspace  · MEASUREMENT + relationship · (P3.4) · current: intelligence real (45/100), acquisition demo/dark
- **Problem:** SMBs can't see link gaps or watch their profile; acquisition needs humans/budget.
- **Have (real):** DataForSEO gap + profile + referring domains (**dark — no keys; enable only behind Cost‑Control P2.0**).
- **Add:** lost/new/toxic monitoring (`backlink_snapshots`), unlinked‑mention detection.
- **Acquisition (honest):** find + draft (real) → **hand off** placement to customer / partner / Andersen managed service. Outreach sending stays human‑approved behind its kill‑switch. **Never "guaranteed links".**
- **MVP:** enable intelligence behind Cost‑Control + monitoring diffs. **Later:** supplier/marketplace integration for real placements.

### M9 — CRO & Revenue Intelligence  · MEASUREMENT · (P2.2) · current: MISSING (F ~22/100)
- **Problem:** Milo can't show business value; no GA4, no revenue, no ROI‑per‑content.
- **Inputs:** GA4 Data API, first‑party events (have), GSC clicks (have). **Output:** conversions, organic revenue, content‑assisted conversions, **ROI per content item and per recommendation**.
- **Data:** `ga4_connections`, `revenue_daily`. **Success:** a content item shows attributed sessions/conversions/revenue over an attribution window.
- **MVP:** GA4 connect + content‑ROI. **Later:** funnel/checkout, assisted‑conversion paths.

### M10 — Competitor Intelligence  · ADVICE→MEASUREMENT · (P2/P3) · current: PARTIAL (homepage‑only)
- **Problem:** competitor gap is homepage‑only + LLM.
- **Add:** real SERP overlap / shared‑keyword data (behind Cost‑Control), competitor content/backlink deltas over time.
- **MVP:** keep homepage gap, add GSC‑query overlap. **Later:** SERP/keyword competitive sets.

### M11 — Reporting & Evidence Center  · MEASUREMENT · (P2.4) · current: PARTIAL
- **Problem:** agencies report opaquely; Milo can be radically transparent.
- **Output:** a verifiable ledger — recommendation → evidence → done → re‑checked → before/after delta; ROI per content/recommendation; exportable client report.
- **Data:** reads `verification_snapshots`, GSC, GA4, analytics. **Success:** every claimed win links to machine evidence + a before/after.
- **MVP:** verified‑work ledger with GSC deltas. **Later:** branded PDF/client‑panel export, scheduled reports.

### M12 — Implementation Verification Engine  · MEASUREMENT · (P2.3) · current: MISSING (measurementStatus never advances)
- **Problem:** "implemented" is asserted, never verified; impact never measured.
- **Workflow:** on "implemented", capture/compare a snapshot (re‑crawl for site changes via M1; GSC for performance) → flip to `verified` only on evidence → track impact (+/0/−) over an attribution window.
- **Data:** `verification_snapshots` (writes the dormant `baselineSnapshotId`). **Success:** no recommendation reaches `verified` without machine evidence.
- **MVP:** content‑performance verification on GSC. **Later:** site‑change verification via M1 re‑crawl, regression alerts.

---

## 4. Integration map (target)

| Integration | Purpose | Status today | Phase | Cost‑Control gated? |
|---|---|---|---|---|
| Lovable AI gateway (Gemini) | generation, scoring | LIVE | — | metered (ai_usage) |
| GSC OAuth | queries/clicks/impressions (+ URL‑Inspection, Sitemaps later) | LIVE (query only) | P1.4/P2.1 | no (quota‑bounded) |
| First‑party analytics | pageview/CTA/AI‑referrer | LIVE (needs snippet) | P0.6 | no |
| PageSpeed Insights / CrUX | Core Web Vitals | none | P2.1 | rate‑limited via framework |
| GA4 Data API | conversions/revenue | none | P2.2 | quota via framework |
| DataForSEO | backlinks (have), keyword/SERP (extend) | code‑ready, **DARK** | P2.0→P3.4 | **YES — blocked until P2.0** |
| LLM engine probing (OpenAI/Perplexity/Gemini) | AI‑visibility measurement | none | P3.1 | **YES — paid, blocked until P2.0** |
| Rendering service (headless) | SPA/JS crawl | none | P2.1 | rate‑limited |
| Publish connectors (WordPress/Shopify/custom) | asset delivery | LIVE per‑project | — | no |
| Shopify Admin (catalog) | product data (currently blog‑only) | partial | P3.2 | no |
| Resend (outreach) | email send | GATED (double kill‑switch) | P3.4 | no |
| Supplier/marketplace (links) | real placements | DEMO | P3.4 | provider‑specific |
| Paddle | billing | DARK (Sept‑gated) | separate track | no |

---

## 5. What this architecture deliberately does not build

See `DECISION-LOG.md`. No AI‑markup gimmicks (`data-*`/HTML‑comments/custom‑tags/`ai-summary` class), no unlimited‑keywords, no volume‑quota KPI, no ranking/traffic guarantees, no Knowledge‑Graph‑entry promise, no standalone voice‑search module, no noise‑as‑data AI dashboard, no uncontrolled auto‑publish (already policy), no unmetered external spend.
