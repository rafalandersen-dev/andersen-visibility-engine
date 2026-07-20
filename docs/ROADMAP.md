# Milo Growth — Product Roadmap (P0–P3)

**Status:** proposal for approval. **Scope of this document:** planning only. No `src/`, migration, environment, or production change is authorised by this file. DataForSEO remains **disabled** until the External‑API Cost‑Control Framework (P2.0) exists or is explicitly approved.

**Last revised:** 2026‑07‑20, incorporating the strategic corrections to the 2026‑07 product audit (see `PRODUCT-AUDIT-2026-07.md`, `DECISION-LOG.md`).

---

## 0. Product definition (canonical — use verbatim)

> **Milo Growth is an AI Growth Operating System that detects opportunities, creates implementation‑ready assets, manages execution, verifies deployment, and demonstrates measurable business impact.**

"Agency replacement" is a **benchmark**, not the product definition. Milo can absorb a large share of an agency's *analysis, content, and reporting* work. Relationship‑based services — PR, negotiated link acquisition, sponsored placements, and outreach *execution* — may remain **customer‑managed, partner‑managed, or offered as an Andersen Innovations managed service**. Milo's job around those is to *find, brief, draft, and measure*, not to promise placements.

---

## 1. How to read this roadmap

- **Phase order is deliberate and corrected**: credibility first, then the commercial core (Article Studio), then measurement/evidence, then advanced differentiation. Article Studio 2.0 is in **P1** — it is the known product weakness and Milo's strongest differentiator against a content‑volume‑poor agency package; it is **not** deferred for being large.
- **Epic IDs** (`P0.1` …) are stable references used by `TRACEABILITY-MATRIX.md`, `DECISION-LOG.md`, and the module specs.
- **Module IDs** (`M1`…`M12`) are defined in `TARGET-ARCHITECTURE.md`.
- **Complexity:** S / M / L / XL.
- Every epic has a **measurable Definition of Done (DoD)**. Nothing is "done" on vibes.

---

## 2. P0 — Credibility & integrity

*Goal: stop claiming measurement Milo does not perform, and make the content it already produces honest and structurally sound. Mostly small, high‑leverage, no new integrations, no billing dependency.*

| Epic | Title | Complexity | Definition of Done |
|---|---|---|---|
| **P0.1** | Honesty relabel + fallback disclosure | S | "Site Audit" and "AI Visibility" are renamed to reflect what they do (e.g. *On‑Page & Content Review*, *AI Readiness*). When the site could not be fetched or returned an empty SPA shell, the UI shows an explicit banner ("based on your inputs — we could not read your live site"), never a confident score presented as measured. QA on a CSR SPA (Synergy) shows the banner, not a number. |
| **P0.2** | Fix Milo Score inputs & weights | M | The quality evaluator receives every field its rubric weighs (`faq[]`, `cta`, `internalLinks[]`) **or** those weights are removed. No rubric category grades a field the evaluator cannot see. |
| **P0.3** | Preview == published output | M | The editor Preview and "Export HTML" render through the **same** converter as publishing (`src/lib/markdown.ts`), not the weaker editor‑local converter. A fixture containing a table, an inline link, and bold text renders identically in preview and on the published page. |
| **P0.4** | Remove fabricated internal‑link scoring & publishing | S/M | Invented/unresolvable internal links are not rewarded by the score and are not published as live `href`s. An `href` in published content must resolve to a real path (see internal‑URL validation, P1.1). |
| **P0.5** | Publish real deterministic structured data | M | Every newly published article carries valid **Article + FAQPage** JSON‑LD, generated deterministically from existing asset fields and injected at publish. It validates in Google's Rich Results Test. (Wording discipline: this delivers structured‑data *implementation* and *eligibility* — never a promise of a visible rich result; see `DECISION-LOG.md` §Schema.) |
| **P0.6** | Surface real AI‑referral data honestly | S | The genuinely‑measured `ai_referrer` signal (first‑party analytics) is surfaced in the AI‑Readiness view, labelled as *referral visibility only*, with its known under‑count caveat — never conflated with "mention" or "citation" visibility. |

**P0 guardrail (applies to all future work):** *no capability may claim measurement without measurement.* A module that reasons over the setup form is labelled advice/readiness; a module that reads real data is labelled measurement.

---

## 3. P1 — Commercially valuable core

*Goal: turn the known weakness (raw‑feeling AI text) into Milo's sharpest differentiator: publication‑ready, sourced, structured, brand‑consistent content — at a volume/price an agency package cannot match (benchmark: Sempire ships 34k–100k characters **per year**).*

| Epic | Title | Complexity | Definition of Done |
|---|---|---|---|
| **P1.1** | **Article Studio 2.0 MVP** (M3) | XL | The **canonical assembled content asset** is the single input to scoring, preview, export, publishing, and schema generation. Delivers: grounded research + verified sources; professional formatting; tables & comparison blocks; TL;DR / key takeaways; CTA blocks; **real internal‑link resolution** (against a lightweight URL inventory — see dependency note); author & E‑E‑A‑T model; featured + supporting images with alt text & placement; Article/Breadcrumb/FAQ structured data where appropriate; mobile + desktop preview; a publishing checklist. Full acceptance criteria and test list in `ARTICLE-STUDIO-2.0.md`. |
| **P1.2** | Real data feeding the Content Opportunity Engine (M4) | M | Content opportunities are seeded from **real** GSC top queries (already OAuth‑connected) and real keyword/SERP data, not an LLM guess. An opportunity shows its evidence (query, impressions, position) instead of "because the model suggested it". |

**P1.1 build packages** are detailed in §7 (Article Studio 2.0 MVP implementation package).

---

## 4. P2 — Measurement & evidence

*Goal: measure the customer's actual site and close the recommend → do → verify → measure loop. This phase makes the honesty of P0 backed by data.*

| Epic | Title | Complexity | Definition of Done |
|---|---|---|---|
| **P2.0** | **External‑API Cost‑Control & Metering Framework** | L | A shared control layer that MUST exist before any paid external API (DataForSEO, LLM probing, PSI quota) is enabled at scale. Provides: per‑workspace usage limits; daily & monthly cost caps; response caching; duplicate‑request prevention; rate limits; subscription‑plan entitlements; usage metering; an admin cost dashboard; alerts; **fail‑closed** behaviour; test vs production separation; and protection against prompt/user‑triggered request explosions. **DataForSEO may only be enabled after this exists or is explicitly approved.** (See `TARGET-ARCHITECTURE.md` §Cost‑Control Framework.) |
| **P2.1** | Technical SEO Monitor MVP (M1) | XL | For a given site Milo returns real, persisted, diffable signals: HTTP status/redirects, robots.txt, meta‑robots/X‑Robots/noindex, canonical, hreflang, sitemap presence/validity, extracted+validated existing JSON‑LD, and Core Web Vitals via PageSpeed Insights. A deliberately noindexed page is flagged. Handles SPA/JS sites (rendering fallback) so it does not silently read nothing. |
| **P2.2** | GA4 + revenue attribution (M9) | L | GA4 Data API connected; first‑party events + GSC clicks mapped to conversions and (where GA4 e‑commerce is on) revenue, attributable to specific content items and recommendations. |
| **P2.3** | Implementation Verification Engine (M12) | L | `implemented` and `verified` are separate states. A recommendation cannot enter `verified` without machine evidence; `baselineSnapshotId` is written; before/after snapshots exist. Content‑level verification (did it publish, did it earn GSC impressions) can begin on GSC alone; site‑change verification depends on M1 (P2.1). |
| **P2.4** | Reporting & Evidence Center (M11) | L | A verifiable ledger: recommendation → evidence → done → re‑checked → before/after delta, with ROI per content item and per recommendation. This is the anti‑opacity differentiator vs an agency report. |

---

## 5. P3 — Advanced differentiation

| Epic | Title | Complexity | Definition of Done |
|---|---|---|---|
| **P3.1** | AI Visibility Monitor (M6) | L | Real scheduled probing of ≥2 AI engines; three **separate** metrics (mention / citation / referral) with confidence levels and limitations; stored raw answers + extracted citations; trend history. Full spec + honesty rules in `AI-VISIBILITY-MONITOR.md`. Gated by P2.0 (paid probing). |
| **P3.2** | E‑commerce Growth Intelligence (M5) | XL | A product data model (price/availability/SKU), Product/Offer/AggregateRating schema, feed & Merchant‑Center readiness checks. |
| **P3.3** | Entity & Knowledge Center (M7) | M | Organization + author `sameAs`/schema, NAP consistency. Never promises a Knowledge Graph entry (emergent, not a deliverable). |
| **P3.4** | Backlink monitoring + supplier/partner workflows (M8) | L | Lost/new/toxic link monitoring (DataForSEO historical, behind P2.0); acquisition positioned as *find + draft + hand off* to customer/partner/managed service — never "guaranteed links". **DataForSEO activation lives here, behind P2.0.** |

---

## 6. Dependency notes (why the order holds, and the two genuine exceptions)

- **P0 before everything.** Fixing misleading framing and the score/preview/schema integrity is cheap and de‑risks every claim Milo makes. It has no external dependencies.
- **Article Studio 2.0 (P1.1) does NOT block on the crawler (P2.1).** Its "real internal‑link resolution" resolves against a **lightweight URL inventory** — the site's `sitemap.xml` (fetched once) plus Milo's own set of already‑published content — not a full site crawl. Full site‑graph‑aware linking arrives later with M1. This is the one place the corrected order could look inverted; it is resolved by scoping the MVP's link source, not by moving Article Studio.
- **Article Studio "verified sources" (P1.1) uses bounded, metered live fetches** of cited pages at generation time — not the full measurement infrastructure. It is subject to the same cost discipline that P2.0 later formalises; until P2.0, source verification runs under the existing per‑handler AI metering with a hard per‑article fetch cap.
- **P0.5 (deterministic JSON‑LD) is a foundation P1.1 extends.** P0 ships Article + FAQPage injection; P1.1 adds Breadcrumb + author schema. Correct ordering.
- **P2.0 gates all paid external usage.** DataForSEO (backlinks) stays dark until P2.0. This is why "turn on DataForSEO" is explicitly **removed from P0** and placed behind P2.0 / P3.4.
- **M12 verification (P2.3)** needs M1 (P2.1) for *site‑change* evidence; *content‑performance* verification can start on GSC (already connected).

---

## 7. P0 implementation package (proposed — awaiting approval)

*No code is written until approved. This is the plan.*

1. **P0.1 relabel + fallback banner** — UI copy + i18n keys (en/pl/sv/da) for the renamed modules; a shared `SiteReadState` banner shown when `audit.fetchedWebsite === false` (already a field). Files (to touch on approval): `app.audit.tsx`, `app.ai-visibility.tsx`, the two module result components, i18n dictionaries. No logic change to generation.
2. **P0.2 score inputs** — pass `faq[]`, `cta`, `internalLinks[]` into `evaluateContentQualityFn` (`ai.functions.ts` ~1826) and `evaluateContentQuality` (`mock-ai.ts` ~392‑434), OR remove those weights from `quality.ts` (~33‑42). Add a unit test asserting the evaluator payload contains every field the rubric weighs.
3. **P0.3 preview parity** — delete the editor‑local converter (`app.editor.tsx` ~1228) and render Preview + Export through `src/lib/markdown.ts`. Add a snapshot test: table+link+bold fixture → identical preview and publish HTML.
4. **P0.4 internal‑link integrity** — stop crediting `internalLinks[]` in the score unless resolvable; in `markdown.ts`, downgrade unresolvable internal `href`s (currently allow‑listed to `^/`) to non‑links or drop them. Test: an invented `/made-up-path` does not publish as a live link.
5. **P0.5 JSON‑LD injection** — new pure helper `buildArticleJsonLd(asset, project)` → Article + FAQPage; inject in the publish target builders (`publish-targets.ts`) for WordPress/Shopify/custom. Tests: valid JSON‑LD for an asset with/without FAQ; no injection when body is empty.
6. **P0.6 AI‑referral surfacing** — read existing `ai_referrer` aggregates (`analytics.compute`/`analytics.functions.ts`) into the AI‑Readiness view with the *referral‑only* label + under‑count caveat. No new tracking.

**P0 exit criteria:** all six DoDs met, `tsc` + full vitest green, adversarial review clean, deployed. No new external calls, no schema promises of visible features.

---

## 8. Article Studio 2.0 MVP implementation package (proposed — awaiting approval)

*Full spec: `ARTICLE-STUDIO-2.0.md`. This is the build slice.*

1. **Canonical asset model** — introduce a single assembled document (body + FAQ + CTA + internal links + author + sources + images) that is the ONLY input to score/preview/export/publish/schema. Retire the "side‑field that neither publishes nor scores" pattern (the current `faq/cta/internalLinks/metaTitle/h1/outline` split).
2. **Grounded generation** — brief → outline → draft with bounded, metered live source fetch; attach real sources; validate source URLs resolve; forbid fabricated citations (already in `sharedRules`) but now *attach* real ones.
3. **Internal‑link resolution** — resolve links against the lightweight URL inventory (sitemap + published set); drop/repair unresolved.
4. **Author / E‑E‑A‑T** — add author entity to `ContentAsset` (name/bio/credentials/`sameAs`); render author + author JSON‑LD.
5. **Images** — visual‑concept proposal → generate/accept → alt text → placement; upload via the customer CMS media API; reject decorative/irrelevant images; never hotlink (publish is upsert‑only).
6. **Structured data** — extend P0.5 with Breadcrumb + author schema; enforce schema‑content consistency (schema reflects only what is in the body).
7. **Preview** — mobile + desktop, through the publish converter (built on P0.3).
8. **Scores that see the real asset** — content, SEO, AI‑readability, YMYL‑risk, duplicate, cannibalisation — all over the assembled document.
9. **Publishing checklist** — schema present, alt text present, sources cited, internal links resolve, no YMYL red flags, score ≥ threshold, human "Looks good".
10. **Tests** — the full list in `ARTICLE-STUDIO-2.0.md` §Acceptance (preview/publish parity, source handling, internal‑URL validation, schema‑content consistency, duplicated‑FAQ prevention, missing‑image handling, alt‑text, mobile, tables, comparison, YMYL, author, refresh, cannibalisation, WordPress/WooCommerce publishing).

**Dependency:** P1.1 builds on P0.2/P0.3/P0.4/P0.5. It uses a lightweight URL inventory, not the P2.1 crawler.

---

## 9. Out of scope / deliberately avoided

See `DECISION-LOG.md` for full rationale. Summary: no `data-*`/HTML‑comment/custom‑tag/`ai-summary`‑class "AI markup"; no "unlimited keywords"; no character‑volume quotas as a KPI; no ranking/traffic guarantees; no Knowledge‑Graph‑entry promise; no standalone voice‑search module; no AI‑visibility dashboard that renders noise as data.
