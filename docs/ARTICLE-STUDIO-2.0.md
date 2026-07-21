# Article Studio 2.0 — Specification

**Status:** proposal for approval. Planning only. **Roadmap:** epic **P1.1** (Commercially Valuable Core). **Last revised:** 2026‑07‑20.
Cross‑refs: `ROADMAP.md` §8 (MVP build package), `PRODUCT-AUDIT-2026-07.md` (current‑state evidence), `AUTOPILOT-DESIGN.md` (Spark/Forge — reconciled below), `TARGET-ARCHITECTURE.md` (M3).

Article quality is the **known current product weakness** and Milo's **strongest commercial differentiator** against a volume‑poor agency package. It is in P1, not deferred.

---

## 1. Why this exists (current state, verified)

From the code audit (evidence in `PRODUCT-AUDIT-2026-07.md` §Article Studio):
- Generation is a **single ungrounded LLM call** over the business brief (`ai.functions.ts` generateContentFn ~1657; `sharedRules` forbids claiming the site was analysed). It is advice, not researched content.
- Output is one markdown blob (capped `cleanString(8000)` ≈ ~1,100–1,400 words) **plus ~9 side‑fields** (`metaTitle`, `h1`, `outline`, `faq[]`, `cta`, `internalLinks[]`, `schemaSuggestions[]`, `editorNotes`).
- **Only `markdown` + `title` + `slug` + `metaDescription` reach the published page.** `metaTitle` reaches only the custom endpoint. `faq[]`/`cta`/`internalLinks[]`/`schemaSuggestions[]`/`h1`/`outline` **neither publish nor are scored** — Potemkin fields.
- **Milo Score is blind to ~36% of what it weighs** — the evaluator never receives `faq[]`/`cta`/`internalLinks[]` (`mock-ai.ts` ~392‑434 vs rubric `quality.ts` ~33‑42).
- **Preview lies** — the editor uses a weaker local converter (`app.editor.tsx` ~1228) than publishing (`markdown.ts`); tables/links/bold are invisible in preview but real live.
- **`internalLinks[]` are invented** relative paths, never resolved against the site — yet worth 8% of the score and published as live `href`s.
- **No images** (`markdown.ts` strips all images by design), **no author/E‑E‑A‑T** (`ContentAsset` has no author field), **no citations/sources**, **no JSON‑LD injection** (grep of the publish path = 0).

---

## 2. The governing principle (non‑negotiable)

> **There is exactly one canonical assembled content asset. It contains every publishable component, and it is the ONLY input to scoring, preview, export, publishing, and schema generation.**

**No side field may be shown as "complete" in the UI unless it is included in the final published asset.** If a component (FAQ, CTA, internal links, author, sources, images) is not composed into what actually publishes, it is not a deliverable and must not be presented as one. This single rule removes every Potemkin‑field defect above.

Two acceptable implementations (decide at build time):
1. **Composed markdown** — FAQ/CTA/author/links are rendered into the canonical body before score/preview/publish; OR
2. **Structured document model** — a typed document (blocks + metadata) that a single assembler turns into (a) published HTML, (b) preview HTML, (c) JSON‑LD, (d) the scorer's input.
Either way, **one assembler, one source of truth**, and `app.editor.tsx`'s second converter is deleted (P0.3).

---

## 3. The pipeline (MVP)

1. **Validated topic & search intent** — seeded from real GSC queries + keyword/SERP evidence (M4/P1.4), not an LLM guess. Intent (informational/commercial/transactional) is explicit and drives structure.
2. **Competitor / SERP gap** — bounded, metered fetch of the pages currently ranking for the target query; extract what they cover that the draft must address. (Cost‑bounded per article; subject to the P2.0 discipline once it lands.)
3. **Structured outline + brief** — every section carries a **reason to exist**; sections without one are rejected (no filler).
4. **Grounded draft** — generation attaches **real sources**; fabricated citations remain forbidden (`sharedRules`), but real ones are now *fetched, validated, and attached*.
5. **Assembly** — body + TL;DR/key‑takeaways + FAQ (as prose *and* structured) + CTA block + resolved internal links + author + sources + images → the canonical asset.
6. **Deterministic structured data** — Article + FAQPage + Breadcrumb JSON‑LD generated from the assembled fields (extends P0.5). Schema reflects **only** what is in the body (schema‑content consistency).
7. **Images** — propose visual concept → generate or accept an uploaded image → brand‑consistent → placement recommendation → alt text; **reject decorative/irrelevant images**; upload via the customer CMS media API; never hotlink (publishing is upsert‑only, so a dead/hallucinated image would be permanent).
8. **Author / E‑E‑A‑T** — author entity (name, bio, credentials, `sameAs`), rendered on the page + author JSON‑LD.
9. **Scores over the real asset** — content quality, SEO, **AI‑readability**, **YMYL‑risk**, **duplicate**, **cannibalisation** — all computed on the assembled document (the score can finally see everything it grades).
10. **Mobile + desktop preview** — through the publish converter (built on P0.3). WYSIWYG truth.
11. **Publishing checklist** — a hard gate before "Publish now"/"Schedule": schema present · alt text present on every image · sources cited & resolvable · internal links resolve · no unresolved YMYL red flag · score ≥ threshold · human "Looks good".

---

## 4. Data model additions (blob `ContentAsset`, no migration in MVP)

- `author?: { name; bio?; credentials?; url?; sameAs?: string[] }`
- `sources?: { url; claim?; status: 'verified' | 'unreachable' | 'unsupported' }[]`
- `images?: { concept; url?; alt; placement: 'featured' | 'inline'; status: 'proposed' | 'accepted' | 'generated' | 'missing' }[]`
- `assembled?: { html; jsonLd: object[] }` — the canonical rendered output cached for preview/publish parity.
- `checklist?: { key; passed: boolean }[]` — publishing‑gate results.
(Existing `faq[]`/`cta`/`internalLinks[]` are retained but become **inputs to assembly**, not standalone deliverables.)

---

## 5. Structured‑data discipline (aligned with the corrected schema position)

- Milo emits **standard schema.org** JSON‑LD (Article, FAQPage, Breadcrumb) plus visible, crawlable content and consistent facts. This is the supported approach.
- **No** `data-*` attributes, HTML comments, custom tags, or special CSS class names are used as "AI signals" — *there is no reliable evidence or documented search‑engine support that they improve ranking, AI citations, or AI visibility* (see `DECISION-LOG.md` §Schema).
- The UI distinguishes three levels and never conflates them:
  1. **Structured‑data implementation** — the JSON‑LD is present and valid (Milo delivers this).
  2. **Rich‑result eligibility** — the markup qualifies for a rich‑result type (Milo can indicate this).
  3. **Actual rich‑result appearance** — whether Google shows it (**never promised** — Google decides).

---

## 6. Acceptance criteria (Definition of Done)

The asset is publication‑ready only when **all** hold:
- The canonical assembled asset is the sole input to score, preview, export, publish, and schema.
- No side field is marked complete unless present in the final published asset.
- Preview HTML byte‑matches the published HTML for a table+link+bold+FAQ fixture (mobile and desktop).
- Every published article carries valid Article + FAQPage (+ Breadcrumb where applicable) JSON‑LD that passes Google's Rich Results Test — with copy that claims implementation/eligibility, never appearance.
- Every image has alt text; a missing/rejected image degrades gracefully (no broken `<img>`, no decorative filler).
- Every internal link resolves against the URL inventory; unresolved links are dropped or repaired, never published.
- Every attached source URL resolves; unreachable/unsupported sources are labelled, not silently dropped, and never fabricated.
- Schema content matches body content (no FAQPage entry that isn't in the visible FAQ).
- No duplicated FAQ entries; author data present where E‑E‑A‑T is required (YMYL topics).
- YMYL claims pass the safety gate (no unresolved red flag).

## 7. Required tests (correction 5 — expanded)

| # | Test | Asserts |
|---|---|---|
| T1 | **Preview/publish parity** | preview HTML == published HTML for tables, links, bold, ordered lists, FAQ block (mobile + desktop). |
| T2 | **Source links** | attached sources render as real, resolvable links with correct rel/target. |
| T3 | **Unsupported/unavailable source handling** | an unreachable or unsupported source is labelled `unreachable`/`unsupported`, excluded from citations, never fabricated, never silently dropped. |
| T4 | **Internal URL validation** | an invented `/made-up-path` does not publish as a live link; a real path does. |
| T5 | **Schema‑content consistency** | FAQPage JSON‑LD entries exactly match the visible FAQ; Article schema fields match the body/title/author. |
| T6 | **Duplicated‑FAQ prevention** | regenerating the FAQ does not produce duplicate questions in the assembled asset. |
| T7 | **Missing‑image handling** | a missing/rejected image yields no broken `<img>` and no decorative placeholder; layout stays valid. |
| T8 | **Alt‑text requirement** | publish is blocked if any image lacks alt text. |
| T9 | **Mobile rendering** | the mobile preview matches the published mobile render for the standard fixture. |
| T10 | **Tables** | a markdown/table block renders as a real `<table>` (thead/tbody) in preview and publish identically. |
| T11 | **Product comparison content** | a comparison asset renders a comparison table and does not degrade to a wall of pipes. |
| T12 | **YMYL claims** | a health/finance claim without support triggers the YMYL gate and blocks "ready". |
| T13 | **Author data** | author entity + author JSON‑LD present and consistent for an E‑E‑A‑T‑required asset. |
| T14 | **Content update & refresh** | re‑generating/refreshing an existing asset preserves publish identity (no duplicate post; carries `wordpressPostId`/`republishTargetUrl`) and re‑scores. |
| T15 | **Cannibalisation detection** | two assets targeting the same query/intent are flagged before publish. |
| T16 | **WordPress/WooCommerce publishing** | the assembled asset (body + schema + excerpt) publishes correctly to WordPress and to a WooCommerce‑enabled WordPress (post + JSON‑LD present), with idempotent re‑publish. |

---

## 8. Reconciliation with Spark/Forge (`AUTOPILOT-DESIGN.md`)

Spark (auto‑brief, ~$0.003) and Forge (on‑click full article, ~$0.039) remain the **generation trigger model**. Article Studio 2.0 is the **quality + assembly + publish‑readiness system** those triggers feed. Concretely: Spark produces the brief (pipeline step 3); Forge produces the grounded draft (step 4); Article Studio 2.0 owns steps 5–11 (assembly, structured data, images, author, scores, preview, checklist). The "threshold 85", governed publishing cap (`PUBLISHING-CAP.md`), and "What only you know" value gate from AUTOPILOT are retained and become part of the publishing checklist (step 11). See the AUTOPILOT update note.

---

## 9. Human steps (what Milo does not automate)

Milo generates, assembles, scores, and publishes. A human: approves ("Looks good"), supplies the "what only you know" specifics (real prices, a recent client case), optionally provides/【approves an image, and owns any claim that carries legal/medical/financial risk. Milo never publishes YMYL content without a human passing the gate.
