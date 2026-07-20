# Milo Growth — Product Audit (2026‑07)

**Method:** evidence‑based audit of the actual repository (`/Users/rafi/Claude/Projects/andersen-visibility-engine`, HEAD `3dd798c`) by a multi‑agent code inspection across seven domains + a full inventory + an Article‑Studio deep dive, benchmarked against the Sempire "PAKIET SEO DLA E‑COMMERCE" proposal (see `AGENCY-BENCHMARK-SEMPIRE.md`).
**Evidence convention:** `[V]` = verified in code (file cited). `[A]` = assumption / inference (flagged). Capability status vocabulary: COMPLETE · PARTIAL · PLANNED · MISSING · PRESENT_BUT_WEAK · PRESENT_BUT_MISLEADING · NOT_RECOMMENDED.
**Last revised:** 2026‑07‑20.

---

## 0. Positioning note (benchmark, not definition)

Milo's product definition is: *an AI Growth Operating System that detects opportunities, creates implementation‑ready assets, manages execution, verifies deployment, and demonstrates measurable business impact* (see `TARGET-ARCHITECTURE.md`). "Can it replace an agency?" is used in this audit **only as a benchmark** to expose gaps. Relationship services (PR, negotiated links, sponsored placements, outreach execution) are expected to remain customer‑/partner‑/managed‑service, not automated.

---

## 1. Executive verdict

Milo today is a **strong content‑planning + generation + safe‑publishing engine with a best‑in‑class publishing‑governance spine**, wrapped in **four flagship "analysis" modules (Site Audit, Competitor Gap, Authority, AI Visibility) that are an LLM reasoning over the setup form — advice wearing measurement labels.** The genuine measurement it has (GSC, first‑party analytics, DataForSEO) is real but **under‑wired** (DataForSEO dark) and **disconnected** from the modules named as if they measured. Some framing is **actively misleading today** (a "Site Audit" that reads one homepage and silently returns nothing on CSR SPAs — including the founder's own Synergy site; an "AI Visibility" module that never queries an AI engine).

**As an agency‑replacement benchmark it scores ~33/100. As a content‑planning + publishing tool it is ~60/100.** The strategic response is not parity — it is to win on content scale/honesty/closed‑loop proof (see `ROADMAP.md`, `DECISION-LOG.md`).

---

## 2. Current‑state score

| Lens | Score | Basis |
|---|---|---|
| Agency‑replacement benchmark (measurement + execution + proof) | **33/100** | Little on the customer's site is measured; the loop doesn't close. |
| Content‑planning + generation + safe‑publishing tool | **~60/100** | Good drafts, excellent publishing governance, real backlink data. |

Domain scores (from the audit): A Technical SEO **12** · B E‑commerce **17** · C Content **42** · D AI/AEO/GEO **20** · E Authority **45** · F UX/CRO/Revenue **~22** · G Execution **62**.

---

## 3. Top 10 credibility gaps

1. **"Site Audit" reads one homepage, silently degrades to LLM opinion on SPAs** `[V]` `ai.functions.ts:836`, fallback `:962` (`fetchedWebsite:false`). Breaks on Synergy.
2. **"AI Visibility" never queries an AI engine** `[V]` `ai.functions.ts:1285`.
3. **Milo Score grades ~36% of weight on fields the evaluator never receives** `[V]` (`faq[]`/`cta`/`internalLinks[]` not passed; `mock-ai.ts:392‑434` vs `quality.ts:33‑42`, rubric `ai.functions.ts:1859`).
4. **Product is rewarded for fabricating internal links it then publishes** `[V]` (invented paths, 8% score weight `quality.ts:41`).
5. **`schemaSuggestions` advertises structured data never emitted** `[V]` (0 JSON‑LD in the publish path).
6. **DataForSEO — the only real measurement module — is dark** `[V]` (no keys in prod).
7. **Preview/Export use a weaker converter than publish** `[V]` (`app.editor.tsx:1228` vs `markdown.ts`).
8. **No revenue/ROI attribution** `[V]` (first‑party events only; no GA4).
9. **"Implemented" never verified; "measured" never happens** `[V]` (`opportunity.measurementStatus` set to `collecting`, never advances; `baselineSnapshotId` declared, never written).
10. **No images, author/E‑E‑A‑T, or citations in articles** `[V]` (Article Studio deep dive §E/F/G).

---

## 4. Domain audits

*Each verdict is the multi‑agent finding; each capability cites evidence. Full prose verdicts retained.*

### A. Technical SEO — **12/100**
> Milo does NOT crawl or technically audit a website. "Site Audit" performs a single raw homepage fetch, regex‑extracts title/meta/H1/links/text, and asks Gemini for opinion‑based scores. No headless renderer (no puppeteer/playwright/lighthouse in package.json) `[V]`, so CSR SPAs return an empty shell and the audit degrades to "based on your project details". None of the real technical signals are measured.

| Capability | Status | Evidence |
|---|---|---|
| Multi‑page crawler | MISSING | `ai.functions.ts:823‑871` fetches only the homepage `[V]` |
| JS rendering / SPA support | PRESENT_BUT_MISLEADING | raw `fetch`, no headless; empty→`fetchedWebsite:false` `[V]` |
| robots.txt / meta‑robots / noindex | MISSING | no parsing in `src` `[V]` |
| HTTP status / redirects | MISSING | status is a boolean; one page `[V]` |
| Canonicalisation | MISSING | no `rel=canonical` extraction `[V]` |
| Sitemap discovery/validation (customer) | MISSING | `sitemap[.]xml.ts` is Milo's own `[V]` |
| hreflang | MISSING | none `[V]` |
| Schema/structured‑data validation | PRESENT_BUT_MISLEADING | only free‑text suggestions `[V]` |
| Core Web Vitals / mobile perf | MISSING | no PSI/Lighthouse/CrUX `[V]` |
| Faceted/pagination/params | MISSING | none `[V]` |
| On‑page basics extraction | PRESENT_BUT_WEAK | title/meta/H1 from homepage only `[V]` |
| Indexing/coverage (GSC) | PRESENT_BUT_WEAK | only `searchAnalytics/query`, no URL Inspection/Sitemaps API `[V]` |
| Regression monitoring | MISSING | no history `[V]` |
| "Site Audit" framing | PRESENT_BUT_MISLEADING | opinion labelled audit `[V]` |

### B. E‑commerce SEO — **17/100**
> No product data model anywhere: the only "product" is `ServiceItem.kind="Product"` `[V]` `types.ts:408‑417` with zero commerce fields. Cannot generate Product/Offer schema, audit price/availability, check feeds/Merchant Center, or attribute revenue. The Shopify connector is blog‑article‑only `[V]` — the canonical e‑commerce platform used as a blog CMS.

| Capability | Status |
|---|---|
| Product data model (price/availability/SKU/feed) | MISSING |
| Product/Offer/AggregateRating schema | MISSING |
| Category/collection/product page content | MISSING |
| Shopify catalog integration | PRESENT_BUT_MISLEADING (blog only) |
| Reviews & ratings schema | MISSING |
| Price/availability consistency, OOS/discontinued | MISSING |
| Merchant Center / feed quality | MISSING |
| Product comparison content | PRESENT_BUT_WEAK |
| Purchase‑intent keywords / info→commercial | PRESENT_BUT_WEAK |
| Cannibalisation detection | MISSING |
| Revenue attribution | MISSING |

### C. Content Production — **42/100**
> A competent, brand‑aware FIRST‑DRAFT generator dressed as a content engine. Every artifact is one gemini call over the setup form (`projectBrief` says "Website: … (NOT crawled)" `[V]` `ai.functions.ts:737`; `sharedRules` forbids search volumes/citations/sources `[V]` `:764`) — zero measurement. Internal links are invented yet count for 8% of the score, so the product is rewarded for fabricating links it publishes. Sourced citations, author/E‑E‑A‑T, real internal linking, schema/JSON‑LD, images, ~2000‑word depth, duplicate/cannibalisation/decay handling are missing, misleading, or capped.

| Capability | Status | | Capability | Status |
|---|---|---|---|---|
| Keyword/topic research | PRESENT_BUT_WEAK | | Author / E‑E‑A‑T | MISSING |
| Search‑intent classification | PRESENT_BUT_WEAK | | Internal links | PRESENT_BUT_MISLEADING |
| Competitor content gaps | PARTIAL | | External links | MISSING |
| Content briefs | PARTIAL | | Schema markup | PRESENT_BUT_WEAK |
| Article generation | PARTIAL | | Images / alt / placement | MISSING |
| Structure / headings | COMPLETE | | Draft preview | COMPLETE (weak converter) |
| Summary / AI‑overview block | COMPLETE | | YMYL / claims safeguards | PARTIAL |
| Tables & comparison | PARTIAL | | Milo Score | PRESENT_BUT_WEAK |
| FAQ generation | COMPLETE | | Improve/rewrite loop | PRESENT_BUT_WEAK |
| CTAs | COMPLETE | | Multi‑format breadth | COMPLETE |
| Citations & source validation | MISSING | | Duplicate/cannibalisation/decay | MISSING |

### D. AI / AEO / GEO Visibility — **20/100**
> Milo NEVER queries ChatGPT/Perplexity/Gemini/Copilot/AI‑Overviews `[V]`. "AI Visibility" is an LLM planner (`ai.functions.ts:1285`). The one measured signal is `ai_referrer` (real but thin). `ai_crawler` detection is near‑dead (bots don't run the JS that hits the endpoint). Saving grace: the copy is honest ("readiness/likely gap", "NOT live AI rank tracking") — not theatre, but as a *measurement* domain, mostly absent.

Mention/citation monitoring, sentiment, competitor mentions, source analysis, accuracy, prompt tracking, AI‑Overview, Bing/Copilot: **MISSING**. AI referral: **PARTIAL**. AI‑crawler detection, conversational library, geo/lang, readiness scoring: **PRESENT_BUT_WEAK**. Knowledge/visibility gaps, entity understanding: **PARTIAL**.

### E. Authority & Link Building — **45/100**
> One genuinely strong real‑data capability: competitor backlink gap + profile via DataForSEO (honestly guardrailed). But that is the *intelligence* half. *Acquisition* is largely demo/gated/absent: the marketplace runs on 8 hardcoded fabricated domains with a fail‑closed adapter `[V]`; outreach sending is real code behind an un‑flipped kill‑switch; prospect discovery is manual; the "Authority" module is pure LLM advice. **No link monitoring** (lost/toxic/new), no unlinked‑mention detection, no ROI — the analysis is a single replaceable snapshot, so diffing is impossible.

Backlink gap + profile: **COMPLETE** (but dark). AI link recs / prospect discovery / outreach send / pipeline / cost tracking: **PARTIAL**. Outreach generation / marketplace / directories: **PRESENT_BUT_WEAK**. Lost/toxic monitoring, ROI: **MISSING**.

### F. UX, CRO & Revenue — **~22/100** `[A: score reconstructed from the inventory + Domains D/G evidence; the dedicated agent failed on a tooling error, findings cross‑verified in code]`
> First‑party analytics is real (`analytics_events`: `page_view/content_view/cta_click/booking_click`) `[V]` and GSC clicks/impressions/position are real `[V]`. But there is **no GA4** `[V]`, **no organic‑revenue or ROI attribution** `[V]`, and `opportunity.measurementStatus` never advances beyond `collecting` `[V]`. Milo cannot connect any data to revenue or to a specific recommendation/content item.

GA4, conversion events beyond CTA, checkout funnel, product‑view‑to‑purchase, assisted conversions, organic revenue, ROI by page/recommendation/content, business‑value scoring: **MISSING**. GSC clicks, first‑party pageview/CTA: **COMPLETE (measurement, thin)**. LP/CTA effectiveness, UX/mobile conversion: **PRESENT_BUT_WEAK**.

### G. Execution & Governance — **62/100**
> Two products live here. Publishing governance is genuinely excellent — arguably the strongest engineering in the codebase: a derived‑not‑stored pipeline stage (`pipeline.ts`), an atomic cron queue with SKIP‑LOCKED claiming, meticulous duplicate‑publish prevention, permanent‑vs‑retryable classification, an interrupted‑run reaper, fire‑time consent re‑checks, a persisted audit log. False‑completion prevention is a design obsession and it works. **But the agency loop — recommend → implement on the live site → verify → measure before/after — is broken everywhere except content Milo itself publishes:** recommendations are never verified against the live site, no regression/re‑crawl, `measurementStatus` never advances, `baselineSnapshotId` never written, "View impact" dumps the user on the generic dashboard.

Approval, publishing controls, completed‑vs‑planned/false‑completion prevention: **COMPLETE**. Recommendation gen, implementation, verification, result measurement, audit trail, human review: **PARTIAL**. Evidence, prioritisation, effort/impact scoring, notifications: **PRESENT_BUT_WEAK**. Assignment, regression checks: **MISSING**.

---

## 5. Inventory summary (measurement vs advice)

**Real external data sources (3 + first‑party):** single‑homepage HTTP fetch `[V]`, DataForSEO backlink index `[V]` (DARK), GSC API `[V]`, first‑party analytics beacon `[V]`. **Everything labelled audit/competitor/authority/AI‑visibility beyond a shallow homepage read is an LLM over the project profile** — 15 of ~20 AI functions are advice; only Backlinks is data‑driven `[V]`.

**Real Postgres tables:** `workspaces(+rev)`, `analytics_events`, `google_connections`, `scheduled_publishes`, `cron_heartbeats`, `ai_usage`, `mcp_/oauth_*`, `refresh_tokens`, `gsc_cron_sync`, `email_infra`. **Everything else (all product/domain data) is one JSONB blob `workspaces.data`** `[V]`.

**Crons (real):** `scheduled-publish-run` (*/5), `gsc-daily-sync` (05:20 UTC), email queue, `cron_heartbeats` `[V]`.

**Integration status:** Lovable AI gateway LIVE; GSC LIVE (query only); first‑party analytics LIVE (needs snippet); WordPress/Shopify/custom connectors LIVE per‑project; DataForSEO **DARK** (no keys); Paddle **DARK** (Sept‑gated); Resend outreach **GATED** (double kill‑switch); Linkhouse **DEMO**; MCP/OAuth server LIVE.

**Legacy/dead:** `app.calendar`, `app.opportunities`, the `calendar` blob collection; `tasks` are Claude‑writable with no UI `[V]`.

---

## 6. Recommendation lifecycle gap (for M2/M12)

Target: DETECTED → EVIDENCE COLLECTED → PRIORITISED → APPROVED → ASSIGNED → IMPLEMENTED → **VERIFIED** → PERFORMANCE MONITORED → IMPACT (confirmed / none / negative). Today the chain holds only through APPROVED and (for Milo‑published content) IMPLEMENTED; **VERIFIED, MONITORED, IMPACT are absent on the customer's site.** `implemented` and `verified` must be separate states with machine evidence between them (see `TARGET-ARCHITECTURE.md` M12, `ROADMAP.md` P2.3).

---

## 7. Assumptions & limitations of this audit

- `[A]` Domain F's dedicated agent failed on a StructuredOutput tooling error; its findings were reconstructed from the inventory and Domains D/G, all cross‑verified against code. Treat F's numeric score as approximate.
- `[A]` The Sempire proposal is dated 03.07.2026; it is a 3‑tier comparison table read from the rendered PDF (checkmarks). Prices/quotas quoted are from that document (`AGENCY-BENCHMARK-SEMPIRE.md`).
- Line numbers reference HEAD `3dd798c`; they will drift as code changes. The *facts* (what exists / doesn't) are the durable claims.
