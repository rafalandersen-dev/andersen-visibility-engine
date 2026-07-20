# Decision Log — 2026‑07 Product Audit & Strategy

Records what was decided, rejected, or postponed and why. **Last revised:** 2026‑07‑20. Cross‑refs: `ROADMAP.md`, `TARGET-ARCHITECTURE.md`, `PRODUCT-AUDIT-2026-07.md`, `AGENCY-BENCHMARK-SEMPIRE.md`.

Each entry: **D#** decision · **status** (ADOPTED / REJECTED / POSTPONED) · rationale.

---

## Positioning

- **D1 · ADOPTED — Product is an "AI Growth Operating System", not an "agency replacement".** Canonical definition: *detects opportunities, creates implementation‑ready assets, manages execution, verifies deployment, demonstrates measurable business impact.* Agency replacement is a **benchmark** only. *Rationale:* the audit used the agency benchmark to expose gaps, but defining the product as a replacement over‑claims and mis‑frames the roadmap. Milo's edge is a growth OS with a closed loop, not a like‑for‑like agency substitute.
- **D2 · ADOPTED — Relationship services stay human/partner/managed.** PR, negotiated links, sponsored placements, and outreach *execution* are customer‑, partner‑, or Andersen‑Innovations‑managed‑service. Milo does find/brief/draft/measure around them. *Rationale:* these are relationship + media‑budget services; automating "placements" would force a dishonest guarantee.

## Roadmap ordering

- **D3 · ADOPTED — Article Studio 2.0 MVP is P1, not post‑90.** *Rationale:* article quality is the known product weakness and the strongest commercial differentiator vs a volume‑poor agency package (Sempire: 34k–100k chars/**year**). Size is not a reason to defer a differentiator.
- **D4 · ADOPTED — Corrected phase order:** P0 credibility/integrity → P1 commercial core (Article Studio + real content data) → P2 measurement/evidence (technical monitor, GA4/revenue, verification, reporting) → P3 advanced (AI Visibility, e‑commerce, entity, backlink monitoring/supplier). *Two genuine dependency notes recorded in `ROADMAP.md` §6* (Article Studio uses a lightweight URL inventory, not the P2 crawler; bounded metered source fetch, not the full monitor) — these scope the MVP rather than reorder it.
- **D5 · ADOPTED — "Turn on DataForSEO" is removed from P0** and placed behind the Cost‑Control Framework (P2.0) / P3.4. *Rationale:* see D8.

## Credibility & integrity (P0)

- **D6 · ADOPTED — No capability may claim measurement without measurement.** Modules that reason over the setup form are labelled advice/readiness; only real‑data modules are labelled measurement. Rename "Site Audit" and "AI Visibility"; add a fallback banner when the site could not be read. *Rationale:* the current framing is actively misleading (esp. on CSR SPAs like Synergy).
- **D7 · ADOPTED — Fix the Milo Score, preview parity, internal‑link integrity, and ship real JSON‑LD (P0.2–P0.5).** *Rationale:* the score grades ~36% of weight on fields it can't see; preview ≠ publish; invented internal links publish; `schemaSuggestions` promises structured data never emitted. All are integrity defects, cheap to fix.

## External‑API safety

- **D8 · ADOPTED — External‑API Cost‑Control & Metering Framework (P2.0) is a hard prerequisite for enabling any paid external API** (DataForSEO, LLM probing, PSI at scale). Controls: per‑workspace limits; daily/monthly cost caps; caching; duplicate‑request prevention; rate limits; plan entitlements; usage metering; admin cost dashboard; alerts; fail‑closed; test/prod separation; request‑explosion protection. **DataForSEO may only be enabled after this exists or is explicitly approved.** *Rationale:* enabling a paid, per‑call external API that user actions/prompts can fan out is a spend‑risk; the existing `ai_usage` metering pattern must be extended to external providers before activation.

## Schema & AI claims (corrected)

- **D9 · ADOPTED — Reject unsupported AI‑markup techniques, using a defensible (non‑absolute) claim.** Verbatim position: *"There is no reliable evidence or documented search‑engine support showing that arbitrary `data-*` attributes, HTML comments, custom AI tags, or CSS class names improve ranking, AI citations, or AI visibility."* Supported approach: standard schema.org, visible content, crawlability, source authority, factual consistency. *Rationale:* the corrected wording avoids the overclaim "impossible for any crawler/model to read" while still rejecting the gimmicks Sempire sells as its premium USP.
- **D10 · ADOPTED — Distinguish three schema levels; never promise a visible feature.** structured‑data implementation → rich‑result eligibility → actual rich‑result appearance (Google decides). Milo delivers the first, can indicate the second, never promises the third.
- **D11 · ADOPTED — Ship the visible TL;DR, reject the `ai-summary` myth.** A visible summary helps readers; the class name carries no documented AI meaning. Milo builds the summary (Article Studio), not the claim that the class does anything.

## Article Studio

- **D12 · ADOPTED — One canonical assembled asset is the sole input to score/preview/export/publish/schema.** No side field is "complete" unless present in the published asset. *Rationale:* removes the entire Potemkin‑field class of defects (faq/cta/internalLinks/schema that neither publish nor score).
- **D13 · ADOPTED — Expanded Article Studio acceptance tests** (16 cases incl. preview/publish parity, source handling, internal‑URL validation, schema‑content consistency, duplicated‑FAQ, missing‑image, alt‑text, mobile, tables, comparison, YMYL, author, refresh, cannibalisation, WordPress/WooCommerce). See `ARTICLE-STUDIO-2.0.md` §7.

## Rejections (deliberately not building)

- **D14 · REJECTED — AI‑markup gimmicks** (`data-*`, HTML comments, custom tags, `ai-summary` class as a signal). See D9/D11.
- **D15 · REJECTED — "Unlimited keywords" and character‑volume KPIs.** Vanity, unconnected to revenue. Milo sells governed, evidence‑seeded outcomes.
- **D16 · REJECTED — Ranking/traffic guarantees.** Existing policy; kept. Milo markets the *honesty* contrast (Sempire's "guarantee" = a renegotiation right).
- **D17 · REJECTED — Knowledge‑Graph‑entry promise.** Emergent; Milo builds inputs only.
- **D18 · REJECTED — Standalone voice‑search module.** Low‑ROI; covered by FAQ/conversational content.
- **D19 · REJECTED — Any AI‑visibility dashboard that renders noise as data.** Build the honest 3‑metric version (confidence + evidence) or don't ship.
- **D20 · REJECTED — Unmetered external spend / uncontrolled auto‑publish.** Existing publishing‑governance discipline extended to external APIs (D8).

## Postponements

- **D21 · POSTPONED — E‑commerce product/schema/feed intelligence (M5) to P3.** *Rationale:* biggest net‑new; sequence after the credibility + content + measurement spine. si‑longevity is e‑commerce, so revisit priority if a concrete e‑com customer commitment lands.
- **D22 · POSTPONED — Entity & Knowledge Center (M7) to P3;** MVP is Organization/author schema only.
- **D23 · POSTPONED — Real link acquisition (supplier/marketplace) to P3.4;** intelligence + monitoring first; acquisition stays find/brief/draft/hand‑off.
- **D24 · POSTPONED — Blob → normalised tables migration** for product data; new *measurement* capabilities already use real tables (D‑architecture), authoring stays in the blob until scale demands.
- **D25 · NOTED — Billing is Sept‑gated and orthogonal** to this roadmap; `AI_METERING_ENFORCED` and payments stay off until the billing track lands (separate from P2.0 external‑API cost control, though they share the metering pattern).

## Contradictions found (existing docs vs audit) — see the turn summary; reconciled in `AUTOPILOT-DESIGN.md` and this log
- `AUTOPILOT-DESIGN.md` assumes branding "already inherited" via classless HTML — **true and retained**, but it did not account for the preview/publish converter split (P0.3) or the score's blindness (P0.2). Reconciled: Article Studio 2.0 owns assembly; AUTOPILOT owns the generation trigger.
