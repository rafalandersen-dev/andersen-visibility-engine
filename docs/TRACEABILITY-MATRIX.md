# Traceability Matrix

Links each benchmarked capability to a Milo feature/module, its roadmap epic, its acceptance criterion, and the success metric that proves it. **Last revised:** 2026‑07‑20.
Cross‑refs: `AGENCY-BENCHMARK-SEMPIRE.md` (competitor claims), `ROADMAP.md` (epics), `TARGET-ARCHITECTURE.md` (modules M1–M12), `PRODUCT-AUDIT-2026-07.md` (current status), `ARTICLE-STUDIO-2.0.md`, `AI-VISIBILITY-MONITOR.md`.

Status = current Milo state. "→ Target" = the module/feature that closes it.

| # | Competitor capability (Sempire) | Milo now | → Target (module) | Epic | Acceptance criterion | Success metric |
|---|---|---|---|---|---|---|
| 1 | Technical audit / indexation / redirects / CWV | MISSING (1‑homepage LLM) | M1 Technical SEO Monitor | P2.1 | Real HTTP status, robots/noindex, canonical, hreflang, sitemap validity, extracted JSON‑LD, CWV(PSI); a noindexed page is flagged; persisted & diffable | % of real technical issues detected vs a reference crawler; regression diffs available |
| 2 | Structured data (schema.org) | MISSING output (suggestions inert) | Article Studio 2.0 + M1 | P0.5 → P1.1 | Every published article has valid Article+FAQPage(+Breadcrumb) JSON‑LD; schema‑content consistent | % published articles passing Rich Results Test; 0 fabricated schema entries |
| 3 | Content creation (34k–100k chars/yr) | PARTIAL (on‑demand drafts) | M3 Article Studio 2.0 | P1.1 | Canonical assembled asset is sole input to score/preview/publish/schema; publication‑ready per §6 | articles/month at quality ≥ threshold within `PUBLISHING-CAP.md`; human edit time per article ↓ |
| 4 | Content plan / keyword & topic research | PRESENT_BUT_WEAK (LLM) | M4 Content Opportunity Engine | P1.4 | Opportunities seeded from real GSC queries + keyword/SERP evidence; each shows its evidence | % opportunities with real demand evidence attached |
| 5 | E‑E‑A‑T / author profiles | MISSING (no author field) | M3 (author model) + M7 | P1.1 / P3.3 | Author entity + author JSON‑LD present & consistent for YMYL assets | % YMYL articles with author + credentials |
| 6 | Internal linking | PRESENT_BUT_MISLEADING (invented) | M3 internal‑link resolution | P0.4 / P1.1 | Links resolve against URL inventory; unresolved dropped/repaired, never published | 0 unresolved live `href`s in published content |
| 7 | On‑page content optimisation | PARTIAL | M3 | P1.1 | Assembled asset with TL;DR, tables/comparison, FAQ, CTA all publishing & scored | score sees 100% of weighted fields (P0.2) |
| 8 | Link building / sponsored placements | intelligence real, acquisition demo | M8 Authority & Backlink Workspace | P3.4 | Find + draft (Milo) → hand off to customer/partner/managed service; never "guaranteed links" | # qualified prospects + drafted outreach; placements tracked (human‑executed) |
| 9 | Backlink gap intelligence | COMPLETE but DARK | M8 (DataForSEO) | P2.0 → P3.4 | Enabled only behind Cost‑Control Framework | real gap/profile data rendered with cost metered & capped |
| 10 | Link monitoring (lost/toxic/new) | MISSING | M8 monitoring | P3.4 | `backlink_snapshots` diffing lost/new/toxic | # links gained/lost detected per period |
| 11 | AI mention + sentiment monitoring | MISSING (never probes) | M6 AI Visibility Monitor | P3.1 | Scheduled probing ≥2 engines; mention + sentiment with confidence; evidence‑linked | mentions detected w/ stored raw answers; confidence shown |
| 12 | AI Overview / citation visibility | MISSING | M6 (citation metric) | P3.1 | Cited‑URL extraction from stored answers; our‑domain vs competitor | citation rate per prompt set, with confidence |
| 13 | LLM referral reporting | PARTIAL (real `ai_referrer`) | M6 (referral metric) / analytics | P0.6 / P3.1 | Referral surfaced honestly (referral‑only label + under‑count caveat) | AI‑referral sessions (first‑party), labelled |
| 14 | Conversational query analysis | PRESENT_BUT_WEAK | M6 prompt library | P3.1 | Prompt library built from GSC queries + services, human‑editable | # realistic prompts probed per locale |
| 15 | Knowledge Graph / entity | MISSING | M7 Entity Center | P3.3 | Organization/author schema + `sameAs`; NAP consistency; **no KG‑entry promise** | entity schema present + consistent |
| 16 | GA4 config & analysis | MISSING | M9 CRO & Revenue | P2.2 | GA4 Data API connected; conversions/revenue mapped to content | revenue/conversions attributed per content item |
| 17 | Search Console monitoring | COMPLETE (query only) | M4/M1 (extend) | P1.4 / P2.1 | Add URL‑Inspection + Sitemaps API | indexation status surfaced per URL |
| 18 | UX / conversion analysis | PRESENT_BUT_WEAK | M9 | P2.2 | Funnel + content‑assisted conversions from first‑party + GA4 | content‑assisted conversion path shown |
| 19 | Competitor / trend monitoring | PARTIAL (homepage) | M10 Competitor Intelligence | P2/P3 | GSC‑query overlap + (later) SERP/keyword sets | shared‑keyword overlap tracked over time |
| 20 | Reporting / client panel | PARTIAL | M11 Reporting & Evidence Center | P2.4 | Verifiable ledger: recommendation → evidence → done → re‑checked → before/after | every claimed win links to machine evidence |
| 21 | Done‑vs‑planned review | COMPLETE (Milo wins) | M2 Execution Center | P0/P2 | Surface the existing pipeline honesty as a report | false‑completion rate = 0 (already) |
| 22 | Implementation & verification | PARTIAL/MISSING (never verified) | M12 Verification Engine | P2.3 | `implemented` ≠ `verified`; `baselineSnapshotId` written; before/after snapshots | % recommendations reaching an evidenced terminal state |
| 23 | Quarterly technical remediation | n/a (human) | M1 detect + M12 verify | P2.1/P2.3 | Milo detects + verifies; human/CMS implements | fixes verified on re‑crawl |
| 24 | **AI markup gimmicks (data‑*, comments, custom tags, ai‑summary class)** | absent (correct) | **REJECTED** | — | *Not built.* Standard schema.org only; visible TL;DR only | n/a — marketed against |
| 25 | **Unlimited keywords / volume quotas** | n/a | **REJECTED** | — | *Not built.* Governed, evidence‑seeded opportunities | n/a |
| 26 | **Ranking/traffic guarantees** | policy: none | **REJECTED** | — | *Not offered.* Honest expectation‑setting | n/a |
| 27 | E‑commerce product/feed/schema | MISSING | M5 E‑commerce Intelligence | P3.2 | Product data model + Product/Offer schema + feed checks | product pages with valid Offer schema |

**Reading the matrix:** rows 1, 11–13, 16, 20, 22 are the credibility‑defining gaps (real measurement + proof). Rows 2, 3, 5–7 are the P0/P1 content‑integrity + differentiator core. Rows 24–26 are the deliberate rejections that become marketing contrast.
