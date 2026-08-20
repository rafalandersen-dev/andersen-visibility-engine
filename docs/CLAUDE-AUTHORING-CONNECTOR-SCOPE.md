# Claude-Authors-Milo — Connector Write Expansion (scope, 2026-08-20)

> Goal (owner, verbatim): *"I want to be able to say to Claude — this is the
> website, review the business, fill in the profile, go through discovery,
> analysis, competitor analysis, check whether all is filled in, and then
> create articles for the next 3 months including image generation — and Claude
> does it all,"* shifting AI cost from Milo's credits to Claude's.

This is a build spec, not a config flip. It extends the OAuth MCP connector
(now write-live for `create_growth_task` + `create_project_recommendation`, see
[[milo-oauth-connector]]) into a full authoring surface.

---

## 0. The credit-arbitrage reality (read first — it shapes the whole plan)

- **Article TEXT: full win.** Claude natively writes body/meta/FAQ/outline/
  internal-link + schema suggestions. `create_content_draft` just STORES the
  structured asset. Milo spends **0** text-generation credits — the expensive
  line item moves entirely to the owner's Claude plan. This is the core value.
- **IMAGES: conditional, not automatic.** Claude on claude.ai cannot natively
  produce a photographic raster image (text + vector/SVG only). So:
  - If the owner's Claude has an image-gen tool/connector, it produces the image
    and hands Milo the **bytes** → Milo validates + stores → credits saved.
  - Vector/SVG illustrations Claude draws directly → free, stylistically limited.
  - Photographic hero images with no external image model → still need Milo's
    image pipeline (`generateArticleImageFn`, costs Milo image credits) OR the
    owner adds them. **No image-credit saving in that case.**
  - **We build the INGEST pipe regardless; whether it saves image credits
    depends on the owner's Claude image capability.** Don't promise otherwise.

## 1. Hard guardrails (invariants — never relaxed by this build)

Everything Claude creates lands in **reviewable, non-live state**. Publishing
stays an owner action in Milo. Specifically the connector must NEVER:
- publish or push anything live (`milo.content.publish` stays non-issuable),
- delete anything,
- touch billing / subscription / entitlements / Paddle,
- touch any customer/personal data (Milo stores the owner's own marketing data;
  no end-customer PII flows through these tools — keep it that way),
- overwrite owner-set profile fields by default (prefer filling empty fields;
  changes to non-empty fields go through the proposal/approval path).

Every write tool keeps `readOnlyHint:false`; the connector UI already groups them
under "Needs approval" by default. Content drafts are safe as **direct** writes
(status `Draft` — not published), so they need not be per-item approved; profile
overwrites and anything structural go through `create_pending_action` (owner
approves in Milo).

## 2. Scopes

| scope | state today | this build |
|---|---|---|
| `milo.projects.write` | advertised + live | keep |
| `milo.tasks.write` | advertised + live | keep |
| `milo.content.write` | **exists, no tool** | wire the content-draft tools + **advertise** it |
| `milo.actions.propose` | exists, **dark** | **advertise** it (enables project-setup + opportunity proposals on the web connector) |
| `milo.content.publish` | non-issuable | unchanged — stays impossible |

Advertising = add to `ADVERTISED_WRITE_SCOPES` in `oauth.server.ts` (same
flag-gated pattern as PR #57), each with a `SCOPE_LABELS` entry so the amber
consent screen renders a correct row. Add insights/authority WRITE scopes only
if a future tool needs them — competitor/audit output lands as opportunities, so
no new scope needed for §4.

## 3. New tools, grouped by the owner's workflow

### A. Review business + fill profile  (`milo.actions.propose` + `milo.projects.write`)
- **Reuse `create_pending_action` `project_setup_proposal`** (already built) — just
  advertise `milo.actions.propose`. Claude browses the site itself (Milo never
  crawls), proposes profile fields; owner approves. Extend the payload to cover
  **BrandIntelligence** (voice/claims/offers/proof/ctas) so "fill the profile"
  means the deep brand layer, not just the shallow fields.
- Add read `get_project_readiness` (or extend `get_project_brief`) returning a
  per-section filled/empty map so Claude's "check whether all is filled in" is
  one call, not inference.

### B. Discovery / analysis / competitor  (`milo.projects.write`)
- **`create_project_recommendation` already IS discovery output** (an opportunity,
  live). Add **`create_opportunities_batch`** (N in one idempotent call) so a
  3-month plan doesn't need N round-trips. Competitor findings land as
  opportunities tagged `source:"competitor"` (schema already supports it).

### C. Article creation  (`milo.content.write`) — the credit-saver
- **`create_content_draft`**: accepts the authored `ContentAsset` shape
  (title, slug, metaTitle, metaDescription, h1, outline[], faq[], cta, markdown,
  internalLinks[], schemaSuggestions[], language, assetType, optional
  `opportunityId`). Server re-validates + runs the existing content-assembler,
  lands `status:"Draft"`. Idempotent via `requestId`. **This is where Milo's
  text credits → 0.**
- **`update_content_draft`**: iterate a draft by id (never touches a published
  asset — refuse if `livePublishStatus === "published"`).
- **Images** — decision needed (see §5). Recommended: **signed-upload-URL**
  pattern to dodge the JSON-RPC payload limit:
  1. `request_content_image_slot(assetId, concept, alt)` → returns a short-lived
     signed PUT url + imageId.
  2. Claude PUTs the image bytes directly to storage (not through the MCP call).
  3. `confirm_content_image(assetId, imageId)` → server re-validates magic bytes
     (reuse `validateImageBytes` + `stageValidatedImageBytes`), attaches as a
     `proposed` `ContentImage`. Never public until the owner approves in-editor.
  - Fallback tool `generate_content_image` (uses Milo's pipeline, costs Milo
    credits) for when Claude has no image source — clearly the non-arbitrage path.

### D. 3-month plan / scheduling
- Claude creates the opportunities + drafts; **scheduling→publishing stays owner-
  controlled** (publish path is off-limits). Claude may create `growth_task`s
  with target dates ("publish week of …") and the owner uses the existing Monthly
  Auto-Scheduler / calendar to go live. Do NOT give the connector a
  schedule-to-publish tool — that crosses the publish guardrail.

## 4. Safety / approval model (how "do it all" stays safe)

- **Drafts + tasks + opportunities = direct writes** (safe, non-live) — Claude
  fills the workspace autonomously.
- **Profile/brand overwrites + anything structural = proposals** (`pending_actions`)
  the owner approves in Milo.
- **Publish, delete, billing, settings = never** (unchanged).
- Net owner experience: Claude does the whole research→profile→discovery→draft
  pipeline; the owner opens Milo to a workspace full of drafts + a filled profile,
  reviews, and clicks publish. Autonomy without ceding the irreversible actions.

## 5. Open decisions for the owner (before build)

1. **Image path** (§3C): build the signed-upload ingest pipe (works only if the
   owner's Claude can produce images), the Milo-pipeline fallback, or both?
   Recommend **both** — ingest for when Claude has images, fallback otherwise.
2. **Draft approval friction**: content drafts as direct writes (recommended —
   low friction, still non-live) vs. proposals (max control, heavy for a batch)?
3. **Profile overwrite policy**: fill-empty-only always, or allow Claude to
   propose overwrites of owner-set fields (via proposals)?

## 6. Phasing (each phase = its own PR + smoke window, like Phase 1A)

- **P-A** Advertise `milo.content.write` + `milo.actions.propose`; wire
  `create_content_draft` + `update_content_draft` (text only). ← the credit win,
  smallest surface. Ship first.
- **P-B** Image ingest (signed-upload slot + confirm) + Milo-pipeline fallback.
- **P-C** `create_opportunities_batch` + BrandIntelligence in project-setup
  proposal + `get_project_readiness`.
- **P-D** Tighten the end-to-end "run the whole pipeline" prompt ergonomics
  (tool descriptions that chain: review→profile→discovery→draft), plus a
  connector-side rate/quota guard so a runaway 3-month batch can't hammer writes.

Each phase reuses the write-smoke runbook shape (`docs/CLAUDE-WRITE-SMOKE-
WINDOW.md`): consent-screen check, tools/list count, create + idempotent replay,
audit + leak probes, UI render, flag-off fingerprint.
