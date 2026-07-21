# Article Studio 3.0 — Visual Composition & Conversion (P1.2)

**Status:** planning + architecture only. This document authorises **no** `src/`, migration, environment, connector-contract, or production change. It extends `ARTICLE-STUDIO-2.0.md` (P1.1, shipped + deployed) and inherits its governing principle.

**Last revised:** 2026‑07‑21.

**Roadmap identity (RESOLVED):** this phase is **P1.2 — Article Studio 3.0**. The former **P1.2 — Content Opportunity Engine (M4)** is renumbered **P1.4** across every roadmap/architecture/decision-log reference (owner decision, `DECISION-LOG.md` D‑AS3‑0, ADOPTED). No duplicate or stale P1.2 identity remains.

---

## 1. Goal

Article Studio 3.0 gives the author full, safe control over the **visual composition** of an article. Every **new** article must include:

1. an **approved featured/article image** (with alt text),
2. an **editable, approved opening hook**,
3. **intentional placement** of every inline image (stable anchors, not offsets),
4. **responsive presentation metadata** (size/aspect/focal/fit/alignment/style — bounded presets only).

It stays an **article editor**, not a general-purpose page builder. Existing articles are **never silently broken** — a controlled `needsVisualUpgrade` state governs backfill (§8).

---

## 2. Governing principle (inherited from 2.0, non-negotiable)

The **single canonical assembler** `assembleContentAsset` remains the **sole producer** of `assembled.{markdown, html, jsonLd}` — the **only** thing sent to any connector, scored, previewed, or exported. Article Studio 3.0 adds **typed inputs** (featured image, hook, anchored inline images, presentation) that the assembler weaves into that one output. It never adds a second render path, never allows arbitrary CSS or raw user HTML, and never lets an un-approved or un-vetted image/hook reach a page.

---

## 3. Canonical architecture decision (A vs B) — **ADOPTED: A**

**A. Stable anchored presentation blocks over the existing composed‑markdown model (ADOPTED).** Keep the body as markdown; add typed, approved presentation objects (`featuredImage`, `hook`, `images[]` with a stable `anchor` + `presentation`) that the **same assembler** resolves and weaves into the composed markdown/HTML at their anchors. A lightweight, derived **section index** (stable, persisted ids reconciled against the body headings — §4.1) provides anchor targets.

**B. Structured block-based canonical content model (REJECTED for this phase — deferred).** Replace composed‑markdown with a canonical block tree (section/hook/image/faq/cta blocks) as the source of truth; re‑implement the assembler, connectors' serialization, regeneration, and preview against blocks.

| Dimension | A (anchored blocks over markdown) — ADOPTED | B (block-tree canonical) — deferred |
|---|---|---|
| Migration risk | **Low** — optional JSONB fields, no schema migration (2.0 pattern); read‑time `needsVisualUpgrade` backfill | **High** — must convert every existing `ContentAsset` body to blocks; irreversible-ish |
| 2.0 compatibility | **High** — body stays markdown; output contract unchanged | **Low** — replaces the model 2.0 just shipped |
| Preview/publish parity | **Preserved** — one assembler, one `assembled.html` for both | **At risk** — new serializer must exactly match preview; new parity surface |
| Regeneration safety | **High** — body regenerates independently; anchors are stable ids; approved visual config persists; a broken anchor is a *blocker*, not silent loss | **Medium** — regeneration must re-map AI output into blocks without dropping human‑owned visual blocks |
| Connector compatibility | **Preserved** — connectors keep consuming `assembled.{md,html,jsonLd}`; featured image is a mapping layer | **Requires** re-serializing blocks → each connector's format |
| Complexity | **Moderate** — anchor resolver + presentation compiler | **High** — new model, assembler, editor, migration, connectors |
| Long-term maintainability | Keeps the proven "one canonical output, one assembler" invariant | Cleaner document model, but a rewrite for marginal near-term gain |

**Decision: A (ADOPTED).** It extends the exact invariant that made 2.0 safe (one assembler, one publishable output), ships behind optional JSONB fields with a controlled backfill, and keeps all four connectors + scoring + preview consuming an unchanged output shape. **B is recorded as a deferred option** (`DECISION-LOG.md` D‑AS3‑1) to revisit only if the editor's needs genuinely outgrow anchored blocks (e.g. multi-column layouts, embeds). The "sections" in A are a **derived structural index over a persisted identity**, not an adopted block tree. **Article Studio 2.0 remains the compatibility foundation**: one `ContentAsset`, one canonical assembler, one `assembled` markdown/HTML/schema output, one source for preview, export, validation and publishing.

---

## 4. Proposed data model (all additive, optional JSONB — **no migration**)

Storage discipline is identical to 2.0: everything lives in the `workspaces.data` blob's `ContentAsset`; the only Storage change class allowed is object buckets (already present). Bounded **enums** only — no free-form styling, no raw HTML.

```ts
// ---- Presentation presets (P1.2D) — bounded; compile to an allow-listed HTML/class set ----
type ImageSize   = "small" | "medium" | "large" | "wide" | "full";
type ImageAlign  = "left" | "center" | "right" | "full" | "float-left" | "float-right";
type ImageAspect = "original" | "16:9" | "4:3" | "3:2" | "1:1" | "portrait";
type ImageFit    = "cover" | "contain";
type ImageStyle  = "square" | "rounded" | "card" | "bordered" | "captioned" | "minimal";
type CropMode    = "auto" | "focal" | "none";
interface FocalPoint { x: number; y: number } // normalised 0..1, clamped

interface ImagePresentation {
  size: ImageSize; align: ImageAlign; aspect: ImageAspect; fit: ImageFit; style: ImageStyle;
  focalPoint?: FocalPoint; cropMode?: CropMode;   // focal → the ONE bounded inline style: object-position
}

// ---- Presentation variant (P1.2B/D) — per-context crop metadata over ONE stored object ----
interface PresentationVariant {         // NEVER a new Storage object — metadata only
  aspect: ImageAspect;
  focalPoint?: FocalPoint;              // clamped 0..1
  fit: ImageFit;
  // compiled to a clamped `object-position` + aspect box at render time
}

// ---- Stable placement anchors (P1.2C) — survive edits + regeneration ----
// Serialised as strings so they persist in JSONB and diff cleanly:
//   "before-hook" | "after-hook" | "before-section:<sectionId>" | "after-section:<sectionId>"
//   | "before-faq" | "before-cta" | "article-end"
// <sectionId> is the PERSISTED section identity from §4.1 — never a heading hash, never an index.
type PlacementAnchor = string;

interface SectionRef {
  id: string;              // PERSISTED identity, allocated once (§4.1); stable across heading edits
  heading: string;         // current heading TEXT — a reconciliation signal, NOT the identity
  normalized: string;      // normalised heading (lowercased, punctuation-stripped) — reconciliation signal
  level: number;
  order: number;           // current position in the body — reconciliation signal, NOT the identity
  contentHash?: string;    // hash of the section body — reconciliation signal for "semantic replacement"
  status?: "present" | "renamed" | "moved" | "merged" | "split" | "deleted"; // last reconciliation verdict
}

// ---- Hook (P1.2A) — first-class opening hook ----
type HookType  = "question" | "problem-to-solution" | "surprising-fact" | "contrarian" | "story" | "result" | "promise";
type HookState = "generated" | "user-edited";
type ApprovalState = "draft" | "approved";           // deliberate, never auto-approved

interface ArticleHook {
  text: string;
  type: HookType;
  purpose?: string;                                    // author intent for this hook
  state: HookState;                                    // generated vs user-edited
  approval: ApprovalState;
  warnings?: HookWarning[];                            // §4.4 validation (warn/block)
  blockers?: HookBlocker[];                            // §4.4 validation (hard block)
}

// ---- Featured / article image (P1.2B) — first-class; ONE stored object, many presentation variants ----
interface FeaturedImage {
  imageId: string;                                     // references a ContentImage (approved asset)
  storagePath: string;                                 // ONE controlled-origin object identity (never duplicated per variant)
  url?: string;                                        // stable PUBLIC url once approved (never signed)
  previewUrl?: string;                                 // short-lived signed preview pre-approval
  alt: string;                                         // HARD blocker if missing (new articles)
  caption?: string;
  // Presentation VARIANTS over the SAME object — metadata only, no extra Storage objects (§4.3):
  hero: PresentationVariant;                           // article/hero crop
  mobile?: PresentationVariant;                        // mobile crop (optional; falls back to hero)
  social?: {                                           // social / Open Graph crop
    variant?: PresentationVariant;                     // crop metadata over the same object
    physicalUrl?: string;                              // OPTIONAL distinct social asset (not mandatory)
    alt?: string;
  };
  approval: ApprovalState;
  // Connector identity mappings (set on publish/republish — NOT a contract change):
  wordpressMediaId?: number;                           // WP featured-media identity
  shopifyImageMapped?: boolean;                        // Shopify single article image set
  publishedObjectHash?: string;                        // detect stale-variant on republish (§4.3)
}

// ---- ContentImage GAINS (backward-compatible optional fields) ----
interface ContentImage /* existing */ {
  // ...existing 2.0 fields (id, concept, url, alt, caption, placement, source, status, required, storagePath, previewUrl)...
  anchor?: PlacementAnchor;                            // P1.2C — stable placement (targets a persisted sectionId)
  order?: number;                                      // ordering within an anchor
  presentation?: ImagePresentation;                    // P1.2D
  anchorState?: "resolved" | "broken" | "unplaced";   // reconciliation result (§4.2)
}

// ---- ContentAsset GAINS ----
interface ContentAsset /* existing */ {
  // ...existing 2.0 fields...
  featuredImage?: FeaturedImage;                       // P1.2B
  hook?: ArticleHook;                                  // P1.2A
  sectionIndex?: SectionRef[];                         // P1.2C — persisted identities + derived reconciliation cache
  visualState?: "current" | "needsVisualUpgrade";      // P1.2H — legacy backfill (read-time)
}
```

The `hook` composes at the top of the canonical body (after any `before-hook` image, before section 1), exactly as `tldr` does today, so it is **included exactly once** and is byte-identical across preview / markdown / HTML / connector payload / published output.

**Presentation compiler (safety-critical):** the bounded presets compile to an **allow-listed** `<figure>/<img>/<figcaption>` with fixed class names (`milo-size-large milo-align-center milo-aspect-16x9 milo-fit-cover milo-style-card`). The **only** inline style permitted is `object-position: X% Y%` from a clamped focal point. No arbitrary CSS, no user HTML, no `style`/`on*`/`<script>` passthrough, no absolute positioning, no pixel x/y, no arbitrary margins. The **same** compiled HTML feeds preview + export + connectors (parity). Markdown export renders image + caption; presentation that markdown can't express degrades gracefully and is documented.

### 4.1 Stable section-identity contract (amendment)

Section anchors depend on a **section identity that is not the heading text or a hash of it.** Basing identity on the current heading (or its hash) would break every anchored image the moment an author fixes a typo or the model rewords a heading during safe regeneration — exactly the failure this contract exists to prevent.

**Identity rule.** Each structural section carries a **persisted `id`** (an opaque token, e.g. `sec_<short-random>`), allocated **once** when the section first appears and stored on `SectionRef.id` inside `sectionIndex`. Heading text, normalised heading, position/order and a content hash are **reconciliation signals only** — they are used to *re-locate* an existing identity after a body edit, never to *define* it. Once a user anchors an image to a section, that section's identity is **explicitly persisted** and is preserved even if every heading in the article is later reworded.

**Reconciliation (run on every body edit / regeneration).** The reconciler diffs the previous `sectionIndex` against the freshly parsed headings and assigns each prior identity a verdict:

| Case | Detection | Behaviour |
|---|---|---|
| **Unchanged** | same normalised heading + same neighbourhood | keep `id`; status `present` |
| **Renamed** | heading text changed but position + surrounding sections + content hash are close | keep `id` (identity survives the rename); status `renamed` |
| **Moved** | same identity signals, different order | keep `id`; update `order`; status `moved` |
| **Merged** | two prior sections collapse into one | keep the identity that owns anchored images; the other becomes `deleted`; any anchors on the deleted id → **broken anchor** (§4.2), never silently reattached |
| **Split** | one prior section becomes two | the original `id` stays with the part that best matches (heading + content hash); the new part gets a **new** `id`; existing anchors stay on the original `id` |
| **Deleted** | prior identity has no acceptable match | status `deleted`; dependent anchors → **broken anchor** (§4.2) |
| **Regenerated (semantic section survives)** | heading and body both changed but the section still covers the same topic slot (position + content-hash similarity above threshold) | keep `id`; status `renamed`/`present`; anchored images stay attached |
| **Regenerated (semantic replacement)** | content hash diverges beyond threshold AND heading no longer matches | treat as `deleted` + new section; anchors → **broken anchor**, surfaced for the author to re-place — **never silently attach to an unrelated section** |

The reconciler is deterministic, runs at read/edit time, and **never** silently moves an image from one semantic section to a different one. When it cannot confidently preserve an identity, it fails **safe** by marking the anchor broken and asking the author — it does not guess.

### 4.2 Broken-anchor behaviour (amendment)

Anchor resolution produces one of three `anchorState` values, and behaviour differs by whether the image is **required**:

- **Required image with a broken anchor** → **hard publish blocker.** Publishing is refused on every path until the author takes a **direct resolution action** (re-anchor to an existing section, or remove the image). The image is never auto-relocated.
- **Optional image with a broken anchor** → **warning**, and the image is **excluded from the published output** until it is reassigned. It is **never silently moved** to article-end or to another section; it simply does not render until the author re-places it.
- **Legacy image with no anchor** (pre‑P1.2 inline image) → **may** map to `article-end` **only during the controlled legacy-upgrade flow** (§8), and when it does it is **visibly marked as needing placement review** (`anchorState: "unplaced"`). It is not treated as an intentional placement until the author confirms it.

None of the three cases ever attaches an image to an unrelated section, and none silently drops a *required* image (a required broken anchor blocks; it does not disappear).

### 4.3 Featured image, responsive & social variants (amendment)

There is **one underlying approved Storage object** per featured image (`storagePath`). Different presentation contexts — **article/hero crop, mobile crop, social/Open Graph crop** — are expressed as **`PresentationVariant` metadata** (aspect ratio, focal point, `object-fit`) over that same object. **Storage objects are never duplicated merely because presentation metadata changes.** A separate *physical* social asset (`social.physicalUrl`) is **optional**, not mandatory — most articles reuse the single object with a social crop; a distinct social image is offered only when an author deliberately supplies one.

**Media-identity & stale-variant behaviour on republish.** The featured object's identity is tracked so republishing is **idempotent** and stale variants are handled honestly:

- WordPress: the object maps to a single `wordpressMediaId`; republish **updates the same media id** (no duplicate upload). If the featured object itself changes, the prior featured-media is **detached/replaced** (behaviour approval-gated, P1.2G).
- Shopify: the single article `image` is **replaced by identity**, not appended.
- `publishedObjectHash` records what was last sent so a changed crop/object is detected and re-pushed, while an unchanged one is skipped. Presentation-only edits (crop/focal) do **not** create new objects and do **not** force a new upload unless the destination needs the re-rendered variant.

Milo does not claim a destination preserves a given crop/variant until that is **destination-verified** (§7 four-state model).

### 4.4 Hook quality & safety contract (amendment)

The hook is **visible canonical content**: editable, **explicitly approved** (never auto-approved), **included exactly once**, and **consistent** across preview, Markdown, HTML and every connector payload (it lives inside the assembled body, so all consumers get the identical bytes).

Validation runs on generate + edit and yields **warnings** (non-blocking) and **blockers** (hard publish gate for new articles):

| Condition | Severity |
|---|---|
| Unsupported statistics or outcomes (a number/result with no cited support) | **block** (YMYL-style sourcing gate) |
| Fabricated testimonial language ("customers say…", invented quotes) | **block** |
| Guarantees ("guaranteed", "we promise ranking/results") | **block** |
| YMYL claims without support (health/finance/legal assertions) | **block** |
| Generic filler / empty opener ("In today's world…") | warn |
| Repetition of the title (hook ≈ title) | warn |
| Hook unrelated to the article body (low overlap with body topics) | warn |
| Excessive clickbait (hype markers, all-caps, excessive punctuation) | warn |
| Excessive length (beyond the hook length budget) | warn |

Blockers must be cleared (or the offending claim sourced) before a **new** article publishes; warnings never block but are surfaced in the editor and checklist. The hook is never invented content that asserts facts the body does not support.

---

## 5. Sub-epics (P1.2A–H)

Each: **Goal · Architecture · Affected systems · Data model · UI · Connector implications · Security risks · Acceptance tests · Migration/backfill · Approval triggers.**

### P1.2A — Hook model & workflow
- **Goal:** first-class, editable, approved opening hook that is part of the canonical visible content (§4.4).
- **Architecture:** `hook` typed field; assembler composes it at the body top (like `tldr`), included exactly once; AI proposes (`generated`), human edits/approves (`user-edited` + `approval`).
- **Affected systems:** `content-assembler.ts`, `mock-ai.ts` (proposal), editor, checklist, readiness, export/connectors (via assembled output).
- **Data model:** `ArticleHook` (§4), validation (§4.4).
- **UI:** hook panel — type selector (7 types), text editor, purpose, generated/edited badge, **Approve** (deliberate), warnings + blockers list.
- **Connectors:** none direct — hook is inside the assembled body (all connectors get it identically).
- **Security:** hook validation contract (§4.4) — blockers for unsupported stats/testimonials/guarantees/YMYL; warnings for filler/clickbait/length/off-topic/title-repeat.
- **Acceptance tests:** hook composes identically (exactly once) in preview/md/html/payload; missing/unapproved hook blocks a new article; fabricated-statistic/guarantee hook is blocked; generic/long hook warns; hook survives body regeneration.
- **Migration/backfill:** legacy assets have no hook → `needsVisualUpgrade` (not blocked unless upgraded/new).
- **Approval triggers:** none beyond this plan (no connector/migration).

### P1.2B — Featured / article image
- **Goal:** first-class `featuredImage` with alt/caption/hero+mobile+social variants over one object (§4.3), connector mappings, approval; **missing featured image blocks publishing for new articles**.
- **Architecture:** `featuredImage` typed field over the existing approved-asset workflow (upload→private→approve→public); assembler emits it as hero (or hands it to connector featured-media mapping); variants are metadata only.
- **Affected systems:** image workflow (`image-storage*`), assembler, connectors (WP featured-media, Shopify article image, OG), checklist, editor.
- **Data model:** `FeaturedImage` + `PresentationVariant` (§4/§4.3).
- **UI:** featured-image slot — pick approved asset, alt (required), caption, hero/mobile/social crop + focal controls, desktop/mobile/social preview, **Approve**.
- **Connector implications:** WP → upload/attach featured-media (`wordpressMediaId`, idempotent on republish); Shopify → set the single article `image`; **OG image** output from `social.physicalUrl || url`.
- **Security:** controlled-origin only (no hotlink); focal point clamped; alt hard-gate; approval deliberate (no auto-approve); no duplicate Storage object per variant.
- **Acceptance tests:** new article without featured image is blocked; unapproved featured image blocked; alt-missing blocked; WP republish updates the same media id (no duplicate); presentation-only crop edit creates no new object; OG image present.
- **Migration/backfill:** legacy without featured image → `needsVisualUpgrade`; **not** retroactively blocked.
- **Approval triggers:** connector featured-media mapping behaviour (WP media lifecycle, Shopify image replace) — **document first, approve before implementing** the WP media create/update/detach.

### P1.2C — Stable image anchors
- **Goal:** placement that survives edits/regeneration — anchors over a **persisted section identity** (§4.1), not paragraph numbers or offsets.
- **Architecture:** persisted `sectionIndex` identities + reconciler (§4.1) + `ContentImage.anchor` + `order`; assembler resolves anchors when composing; broken anchors handled per §4.2.
- **Affected systems:** assembler, editor, checklist (broken-anchor blocker), regeneration/reconciler.
- **Data model:** `SectionRef[]` (persisted ids), `ContentImage.anchor/order/anchorState` (§4).
- **UI:** insert image at an anchor; move to another anchor; reorder within an anchor.
- **Connectors:** anchored images render in the assembled body (all connectors identical).
- **Security:** anchors are enums + persisted opaque ids — no injection surface; reconciler fails safe (never attaches to an unrelated section).
- **Acceptance tests:** image keeps its anchor after a heading edit; regeneration re-binds by identity (not heading text); deleted/semantically-replaced section → broken-anchor blocker (required) / excluded-with-warning (optional), never silent reattach; order preserved.
- **Migration/backfill:** legacy inline images map to `article-end` only in the controlled upgrade flow, marked `unplaced` (§4.2/§8).
- **Approval triggers:** none.

### P1.2D — Presentation controls
- **Goal:** bounded, safe visual presets (size/align/aspect/fit/style + focal/crop).
- **Architecture:** `ImagePresentation` + a **presentation compiler** → allow-listed HTML/classes; the only inline style is clamped `object-position`.
- **Affected systems:** assembler (compiler), preview, export, connectors, editor.
- **Data model:** `ImagePresentation` / `PresentationVariant` (§4).
- **UI:** preset pickers (enumerated), focal-point picker, live preview.
- **Connectors:** compiled classes map to WP alignment/size classes where supported; Shopify/theme support documented; custom endpoint carries `presentation` only under the future payload (approval-gated).
- **Security:** **no arbitrary CSS / no unsafe HTML / no absolute positioning / no pixel offsets** — the compiler is the single choke point; presets are enums; sanitisation asserted by test.
- **Acceptance tests:** every preset compiles to the expected allow-listed markup; an out-of-enum value is rejected/defaulted; no `style`/`script`/`on*` escapes; preview HTML === publish HTML for the same presentation.
- **Migration/backfill:** legacy images default to `{size:"large", align:"center", aspect:"original", fit:"cover", style:"minimal"}`.
- **Approval triggers:** none (no connector-contract change; custom-endpoint payload deferred).

### P1.2B/E ordering note
Per the approved order (§11), **P1.2C + P1.2D land before P1.2B**: anchors and the presentation compiler are the foundations the featured image reuses. **P1.2F (responsive preview) lands before P1.2E (visual editor)** so the compiled output is validated before the Arrange UI is wired over it.

### P1.2F — Responsive preview
- **Goal:** faithful desktop + mobile **Preview mode** of featured image + inline placement + presentation (§5.1).
- **Architecture:** preview renders the **same** compiled `assembled.html` at desktop/mobile widths (parity with publish); focal/crop reflected via `object-position`/aspect. Connector-aware rendering shows the closest supported destination view.
- **Affected systems:** editor preview, assembler.
- **Data model:** derived desktop/mobile/social variant rendering (no new stored object).
- **UI:** desktop/mobile toggle (exists) extended to visuals; connector selector; poor‑mobile‑crop **warning**.
- **Connectors:** shows closest supported rendering + explicit downgrade warning (§7 four-state).
- **Security:** none new.
- **Acceptance tests:** preview markup === publish markup; mobile crop uses focal point; a `preview/publish presentation mismatch` is a hard blocker (parity guard); desktop + mobile crop persistence.
- **Migration/backfill:** none.
- **Approval triggers:** none.

### P1.2E — Visual editor (Preview & Arrange modes)
- **Goal:** lightweight **visual composition** over the canonical asset — a two-mode surface (**Preview** + **Arrange**, §5.1) to insert/move/reorder images, edit appearance, and edit/approve the hook, all saved through the existing canonical workflow.
- **Architecture:** an editor **view** over the anchored model (A) — it manipulates typed fields + anchors, **never a separate document/state**. Reuses the P1.1‑hotfix Save/dirty/`beforeunload` affordance (single editor-wide Save).
- **Affected systems:** `app.editor.tsx`, `editor-form.ts` (dirty fields += featuredImage/hook/presentation/anchors), assembler.
- **Data model:** none new (drives §4 fields).
- **UI:** §5.1 — Preview mode (clean reader view) and Arrange mode (selectable blocks, stable drop zones, drag-between-anchors, inline appearance/caption/alt controls, inline hook edit+approve, featured crop+focal), desktop/mobile, unsaved-changes indicator, **one Save**.
- **Connectors:** none direct.
- **Security:** stays an article editor — **not** a page builder; only enumerated blocks/anchors/presets; no free-form layout/CSS/HTML/absolute positioning.
- **Acceptance tests:** §5.1 test list — drag between two section anchors; placement survives heading edits; crop persistence; preview/publish parity; downgrade warning; refresh-before-Save warning; Save+reload persistence; no duplicate image/metadata after repeated movement.
- **Migration/backfill:** legacy assets open normally (visual blocks empty / `needsVisualUpgrade`).
- **Approval triggers:** none.

### P1.2G — Connector publishing compatibility
- **Goal:** publish featured + inline images + presentation faithfully per connector; **honest four-state capability matrix** (§7); identity + stale-image handling on republish.
- **Architecture:** a **mapping layer** from the assembled output + `featuredImage` to each connector — the custom-endpoint **contract is unchanged** unless explicitly approved; WP/Shopify get the assembled HTML + featured-media/article-image mapping.
- **Affected systems:** `wordpress.functions.ts`, `shopify.functions.ts`, `publish-targets.ts`, `publish.functions.ts` (custom), `connector-guard.server.ts`.
- **Data model:** connector identity on `FeaturedImage` (`wordpressMediaId`, `shopifyImageMapped`, `publishedObjectHash`).
- **UI:** connector-capability panel (honest per-connector four-state matrix, like the 2.0 "custom endpoint — JSON‑LD not supported" line).
- **Connector implications:** see §7 matrix + four-state model.
- **Security:** re-derive everything server-side (2.0 connector-guard invariant); never trust the request body; featured-media uploads use the controlled public object only.
- **Acceptance tests:** WP featured-media set + updated-not-duplicated on republish + stale featured-media removed/detached; Shopify article image set/replaced by identity; custom endpoint unchanged (payload extension only behind an approved flag); inline presentation renders within each connector's support and **downgrades honestly** with a warning; capability never reported beyond its verified state.
- **Migration/backfill:** none.
- **Approval triggers:** **any** WP media create/update/detach behaviour, Shopify image-replace behaviour, and **especially** the custom-endpoint payload extension — **explicit approval required before implementation.**

### P1.2H — Checklist, scoring & legacy backfill
- **Goal:** the new hard blockers + warnings; a conversion/visual score; the `needsVisualUpgrade` backfill + upgrade-transition contract (§8).
- **Architecture:** extend `buildPublishingChecklist` + `readiness`; `visualState` read-time coercion (no migration).
- **Affected systems:** `checklist.ts`, `readiness.ts`, editor, store (read-time state).
- **Data model:** `visualState` (§4/§8).
- **UI:** new blockers/warnings in the publishing checklist; a "needs visual upgrade" non-blocking prompt + filter on legacy assets.
- **Connectors:** none.
- **Security:** blockers enforced on **every** path (editor, WP/Shopify RPC via connector-guard, cron, custom) — the 2.0 parity invariant.
- **Acceptance tests:** each new hard blocker blocks a **new** article across all paths; legacy `needsVisualUpgrade` article is **not** retroactively blocked; warnings never block; scoring reflects visual completeness; upgrade transition flips policy (§8).
- **Migration/backfill:** **read-time** `visualState = needsVisualUpgrade` for any pre‑P1.2 asset lacking featured/hook; new blockers apply to **new** articles (created after P1.2) or when a legacy article is opted into the upgrade — **never silently break legacy** (§8).
- **Approval triggers:** none beyond this plan.

---

## 5.1 Visual composition — Preview & Arrange modes (amendment)

The responsive preview is a **direct visual-composition surface over the same canonical asset**. It supports **two distinct modes**; neither creates a separate preview-only document or state.

**1. Preview mode**
- Clean, reader-facing article — **no editing chrome**.
- **Connector-aware** rendering (shows the closest supported destination view; §7).
- **Desktop and mobile** views.

**2. Arrange mode**
- **Selectable** article blocks.
- **Visible, stable drop zones** between sections.
- **Drag-and-drop** image movement between supported anchors.
- Inline controls for image **size, alignment, aspect ratio, crop, focal point, caption and alt text**.
- **Inline editing and approval of the hook.**
- **Featured-image crop and focal-point** editing.

**Anchor resolution (hard rule).** Dragging an image **never** stores pixel coordinates or paragraph indexes. Every drop action resolves to a **stable semantic anchor**:

`before-hook` · `after-hook` · `before-section:<sectionId>` · `after-section:<sectionId>` · `before-faq` · `before-cta` · `article-end`

— where `<sectionId>` is the **persisted section identity** from §4.1.

**Single-source invariant.** The preview is an **editing surface over the same `ContentAsset`** — it must **not** create a separate preview-only document or state. Every change made in Arrange mode:

- updates the **typed `ContentAsset` presentation fields** (`featuredImage`, `hook`, `images[].anchor/order/presentation`),
- marks the **editor dirty**,
- uses the **editor-wide Save** (the P1.1-hotfix Save/`editorFormDirty`/`beforeunload` affordance, extended to the new fields),
- **survives refresh**,
- feeds the **canonical assembler**,
- produces the **same positioning in preview, export and publishing**.

**Never allowed:** absolute positioning · pixel-based x/y placement · arbitrary CSS · arbitrary margins · overlapping content · unsupported connector layouts.

**Connector-specific presentation:** show the **closest supported destination rendering**; show an **explicit warning when a layout will be downgraded**; retain the **four-state capability model** (generated / included / retained / destination-verified — §7).

**Acceptance tests (Arrange/Preview):**
1. Image dragged between two section anchors resolves to the correct semantic anchor (no pixel/index stored).
2. Image placement survives heading edits (identity-based anchor, §4.1).
3. Mobile and desktop crop persistence.
4. Preview and publish parity (compiled markup identical).
5. Unsupported connector layout downgrades with an explicit warning (four-state honesty).
6. Refresh **before** Save warns (unsaved-changes guard).
7. Save and reload persistence (the P1.1 defect class stays fixed — `editorFormDirty` covers the new fields).
8. No duplicate image or metadata after repeated movement.

---

## 6. Checklist (spec)

**New-article hard blockers:** featured image missing · featured image not approved · featured-image alt missing · hook missing · hook not approved · hook validation blocker (unsupported stat / testimonial / guarantee / YMYL — §4.4) · required inline image missing · **required** broken image anchor (§4.2) · image object missing (unresolvable storagePath/url) · preview/publish presentation mismatch.

**Warnings (never block):** generic / title-repeating / off-topic / clickbait / excessively long hook (§4.4) · optional image with broken anchor (excluded until reassigned, §4.2) · legacy image needing placement review (`unplaced`) · excessive image count · poor mobile crop · duplicate image · oversized image · image too far from the related section.

**Legacy contract:** a pre‑P1.2 article (`needsVisualUpgrade`) publishes under the existing 2.0 rules; the new visual hard blockers apply only to **new** articles or on explicit upgrade (§8).

---

## 7. Connector capability matrix + four-state model (documentation — no contract change here)

Capability is reported with an explicit **four-state model** — Milo never claims more than the state it can prove:

1. **generated** — Milo produced the artifact (e.g. a compiled inline-image layout, a social crop).
2. **included in payload** — it was actually placed in the connector payload.
3. **retained** — the destination stored it (survived the write).
4. **destination-verified** — Milo re-read the destination and confirmed it renders/persists.

**Milo does not claim that visual presentation is preserved by WordPress or Shopify until it is destination-verified.** The custom-endpoint contract remains **unchanged** and **approval-gated**.

| Capability | WordPress | Shopify | Custom endpoint |
|---|---|---|---|
| Featured image | generated→included→retained→verified via `wordpressMediaId` | generated→included→retained (single article `image`) | ⏳ future payload `featuredImage` (approval-gated) |
| Inline images | generated→included in assembled HTML (retained/verified per site) | generated→included in `body_html` (theme-dependent) | ⏳ future payload `inlineImages` |
| Size / alignment | included (map presets → WP align/size classes); **verified** only where confirmed | ⚠️ often **downgraded** (theme CSS) — warn, don't claim retained | ⏳ future payload `presentation` |
| Media identity on republish | `wordpressMediaId` (update, no duplicate) | article image replaced by `shopifyArticleGid` | n/a (upserts by slug/URL — 2.0 contract) |
| Stale-image / variant handling | detach/replace prior featured-media (behaviour to approve) | single image replaced on update | n/a |
| Hook / body | ✅ inside assembled body (retained) | ✅ inside `body_html` (retained) | ✅ inside `markdown` (unchanged) |

**Custom-endpoint desired future payload (documented target — NOT shipped, NOT contract-changed without approval):**
```jsonc
{ "featuredImage": { /* FeaturedImage subset: url, alt, caption, hero/mobile/social variants */ },
  "hook": { "text": "…", "type": "question", "approval": "approved" },
  "content": "…canonical markdown (unchanged 2.0 field)…",
  "inlineImages": [ { "url": "…", "alt": "…", "anchor": "after-section:<id>", "presentation": { … } } ],
  "presentation": { /* article-level presentation defaults */ } }
```

---

## 8. New vs legacy articles, backfill & transition (amendment)

**No schema migration.** All new fields are optional JSONB on `ContentAsset` (2.0 pattern). The only Storage change class allowed remains object buckets (already present).

**New articles (created after P1.2 activation)** require, as hard blockers:
- an **approved hook**,
- an **approved featured image**,
- **featured-image alt text**.

**Legacy articles (created before P1.2 activation):**
- receive a **read-time** `visualState = "needsVisualUpgrade"` (nothing is written to any blob — same technique used to retire `autoPublishApproved`);
- remain **editable and publishable under the legacy (2.0) policy**;
- are **not silently blocked**;
- can be **filtered** (a "needs visual upgrade" view) and **upgraded intentionally**.

**Legacy → upgraded transition.** The transition is an **explicit author action**, never automatic. An article moves from `needsVisualUpgrade` to `current` only when the author opts it into the visual upgrade **and** satisfies the new-article requirements (approved hook + approved featured image + alt). During the upgrade, legacy inline images may be mapped to `article-end` and marked `unplaced` for placement review (§4.2). On completion, `visualState` flips to `current` and the article is thereafter held to the new-article rules.

**Reversibility.** The forward transition is **deliberate and, by default, forward-only** — once an article is `current`, it is governed by the new rules and is not silently reverted. A **documented escape hatch** allows an explicit author "revert to legacy policy" that sets `visualState` back to `needsVisualUpgrade` (e.g. to un-block an in-progress edit); this is an explicit, logged choice, not an automatic fallback. (Open sub-decision D‑AS3‑5: whether to expose the revert in the MVP or defer it — see `DECISION-LOG.md`.)

---

## 9. Security & integrity risks

1. **Arbitrary CSS / unsafe HTML / absolute positioning** — mitigated by the presentation **compiler** (single choke point, enum presets, only clamped `object-position` inline; no pixel x/y, no arbitrary margins). *Test: no `style`/`script`/`on*` escapes; no absolute positioning.*
2. **Fabricated hook content** — §4.4 validation: block unsupported statistics/testimonials/guarantees/YMYL; warn on filler/clickbait/length/off-topic/title-repeat.
3. **Preview/publish drift** — one assembler, one compiled output; a mismatch is a hard blocker.
4. **Silent anchor reattachment** — the §4.1 reconciler fails safe; a broken required anchor blocks, an optional one is excluded-with-warning; an image is **never** attached to an unrelated section.
5. **Connector image duplication / stale media / stale variant** — WP featured-media identity (`wordpressMediaId`) + `publishedObjectHash` make republish idempotent; stale-media handling is approval-gated; no Storage object is duplicated per presentation variant.
6. **Over-claiming connector fidelity** — the four-state model (§7) forbids claiming presentation is retained/verified before it is.
7. **Regeneration losing human-approved visuals** — visuals are typed, human-owned fields; regeneration touches the body only; broken anchors surface as blockers, never silent loss.
8. **Editor persistence regression** — the P1.1 hotfix (footer Save + `editorFormDirty` + `beforeunload`) must cover the new fields (`featuredImage`, `hook`, anchors, presentation) — asserted by test; Arrange-mode edits use the same single Save.
9. **Scope creep to page-builder** — enumerated blocks/anchors/presets only; no free-form layout, no separate preview-only document.

---

## 10. Acceptance-test plan (pure/unit-first, matching 2.0 discipline)

- Assembler: hook + featured + anchored inline images compose deterministically and **identically** across markdown/html/jsonLd; byte-identical preview vs publish; hook included **exactly once**.
- Section identity: id persists across heading rename/typo edit; survives safe regeneration where the section semantically remains; a semantic replacement is detected (not silently reattached); merge/split/move/delete each produce the §4.1 verdict.
- Anchors: survive body edits + regeneration (identity-based); required broken anchor → blocker; optional broken anchor → excluded-with-warning (never moved); order preserved; legacy → `article-end`+`unplaced` only in the upgrade flow.
- Presentation compiler: every preset → expected allow-listed markup; out-of-enum rejected/defaulted; **no** unsafe-HTML/absolute-positioning escape; focal → clamped `object-position`.
- Featured image: missing/unapproved/alt-missing blocks new article; WP republish updates same media id (no duplicate); presentation-only crop edit creates no new Storage object; OG image present; social/mobile/hero variants are metadata over one object.
- Hook validation (§4.4): unsupported-stat/testimonial/guarantee/YMYL → block; filler/clickbait/length/off-topic/title-repeat → warn; consistent across all outputs.
- Checklist: each new hard blocker blocks a **new** article on **every** path (editor / WP+Shopify RPC via connector-guard / cron / custom); legacy `needsVisualUpgrade` not retroactively blocked; warnings never block.
- New vs legacy + transition: new article requires approved hook + featured + alt; legacy publishes under 2.0 rules; explicit upgrade flips `visualState` to `current` and applies new rules; documented revert path (if exposed) is explicit.
- Connectors: four-state honesty (never report beyond verified); WP/Shopify identity + stale handling (behind approval); unsupported layout downgrades with a warning; custom-endpoint contract **unchanged**.
- Visual composition (§5.1): the 8 Arrange/Preview tests — drag between anchors; survives heading edits; desktop+mobile crop persistence; preview/publish parity; downgrade warning; refresh-before-Save warning; Save+reload persistence; no duplicate image/metadata after repeated movement.
- Backfill: read-time `visualState` derivation; no blob writes; legacy assets load normally.

---

## 11. Approved implementation order

**`A → C → D → B → F → E → G → H`** (ADOPTED).

| Step | Sub-epic | What |
|---|---|---|
| 1 | **P1.2A** | Hook model & workflow |
| 2 | **P1.2C** | Stable image anchors (persisted section identity) |
| 3 | **P1.2D** | Presentation controls (compiler) |
| 4 | **P1.2B** | Featured / article image (variants over one object) |
| 5 | **P1.2F** | Responsive preview (Preview mode) |
| 6 | **P1.2E** | Visual editor (Arrange mode) |
| 7 | **P1.2G** | Connector publishing compatibility (approval-gated) |
| 8 | **P1.2H** | Checklist, scoring & legacy backfill |

Rationale: the **hook (A)** and **anchors + presentation (C, D)** are the pure model/assembler foundations; the **featured image (B)** builds on the approved-asset workflow and the presentation compiler; **responsive preview (F)** validates the compiled output before the **visual editor (E)** wires the Arrange UI over it; **connectors (G)** and **checklist/backfill (H)** land last, with G's connector behaviours **approval-gated**. Each sub-epic: one commit, tests, adversarial review, no migration, stop-for-approval on the G triggers.

---

## 12. Approval triggers (must stop and request explicit approval)

- Any **connector-contract change** — especially the **custom-endpoint payload** (kept unchanged by default).
- Any **WordPress media lifecycle** behaviour (create/update/detach featured-media) and **Shopify article-image replace** behaviour.
- Any **database migration** beyond Storage object configuration.
- **Paid image generation**, DataForSEO, billing/pricing, production deploy, repo-wide formatting.

Everything else (typed JSONB fields, assembler composition, presentation compiler, editor UI, checklist/readiness, read-time backfill, unit tests) proceeds within this plan.

**Gate:** P1.2A implementation does **not** begin until Article Studio 2.0 final verification is formally closed (it is — "ARTICLE STUDIO 2.0 VERIFIED AND CLOSED", 2026‑07‑21) **and** this plan is approved. This document is planning/architecture only.
