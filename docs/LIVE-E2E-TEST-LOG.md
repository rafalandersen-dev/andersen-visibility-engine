# Live E2E Test Log — Milo Growth

Honest record of integration verification. **No live pass is recorded unless it
was actually performed.** Live OAuth/credential flows could not be executed in
the engineering environment (no real Google/WordPress/Shopify accounts, no
interactive browser, OAuth env not provisioned). Those are marked **blocked**
with the exact setup required. Code-path correctness was reviewed and the safe
(not-configured / regression) behaviours were verified.

- **Log date:** 2026-06-30
- **Build/typecheck:** PASS (`vite build` + `tsc --noEmit` green)
- **No secrets are stored in this document.**

Status legend: `pass` (live, performed) · `partial` · `blocked` (cannot run
here; setup pending) · `fail`.

---

## 1. Google Search Console OAuth/API

- **Status:** blocked (live) / code-verified
- **Test date:** 2026-06-30
- **Test account/site:** none available in this environment
- **What worked (verified here):**
  - Callback route is live and safe in production:
    - `GET /api/google/search-console/callback` (no params) → `302` →
      `/app/analytics?gsc=error`
    - `?error=access_denied` → `302` → `/app/analytics?gsc=denied`
    - No code/token/state echoed; friendly redirect only.
  - Unit tests (24/24) pass: AES-GCM encrypt/decrypt round-trip + tamper →
    empty; OAuth state HMAC sign/verify + tamper rejection; auth URL uses
    **read-only** scope and `access_type=offline` only when encryption is
    configured (`online` otherwise); id_token email decode.
  - Not-configured state: with env vars absent, `getGscOAuthStatusFn` returns
    `notConfigured` **without** touching the DB; Analytics shows "not configured"
    and **CSV import still works**.
  - Read-only scope only (`webmasters.readonly`); tokens encrypted at rest in a
    service-role-only table; never returned to the client/UI/logs.
- **What failed:** n/a — the live consent → list → select → 28d/90d sync path
  was not executed (blocked).
- **Fix required:** none in code. **Setup required to unblock:**
  1. Apply migration `supabase/migrations/20260630120000_google_connections.sql`.
  2. Create Google Cloud OAuth client; register redirect URI
     `https://milogrowth.com/api/google/search-console/callback`.
  3. Set prod env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
     `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_SCOPES`, `GSC_TOKEN_ENCRYPTION_KEY`.
  4. Then run the 17-step E2E flow in `docs/GSC-OAUTH-SETUP.md`.
- **Demo-safe:** yes — CSV import is the demo path until OAuth env is live.

---

## 2. WordPress Connector

- **Status:** blocked (live) / code-verified
- **Test date:** 2026-06-30
- **Test account/site:** none available in this environment
- **What worked (verified here):**
  - Code review of `wordpress.functions.ts`: test connection (`/users/me`),
    create draft (`status: draft`), **update by stored post ID** (no slug/status
    change on update), publish (`status: publish`), live URL from `link`.
  - `mock-ai.ts` passes `postId: asset.wordpressPostId` on re-send/publish and
    stores `wordpressPostId` → **re-send updates, never duplicates**.
  - Application password is server-side only, never pre-filled after save, never
    logged (only host/path/status logged). Friendly 401/403/404 errors.
- **What failed:** n/a — live create/update/publish against a real site not run.
- **Fix required:** none. **Setup to unblock:** real/test WordPress site + user
  with an Application Password; then run the flow in
  `docs/WORDPRESS-CONNECTOR-SETUP.md`.
- **Demo-safe:** yes, with the "architecture-ready, confirmed during assisted
  setup" wording for a site not yet live-tested.

---

## 3. Shopify Connector

- **Status:** blocked (live) / code-verified
- **Test date:** 2026-06-30
- **Test account/site:** none available in this environment
- **What worked (verified here):**
  - Code review of `shopify.functions.ts`: test connection (`shop` query), list
    blogs, create unpublished article (`isPublished: false`), **update by stored
    article GID**, publish (`isPublished: true`), live URL
    `/blogs/<blog>/<article>`.
  - `mock-ai.ts` passes `articleGid: asset.shopifyArticleGid` and stores it →
    **re-send updates, never duplicates**.
  - Admin API token server-side only, never pre-filled after save, never logged
    (only shop host/status). **Content scopes only** — no product/order/customer
    calls anywhere in the code.
- **What failed:** n/a — live create/update/publish against a real store not run.
- **Fix required:** none. **Setup to unblock:** Shopify custom app with
  `read_content`/`write_content`, a blog, and the Admin API token; then run the
  flow in `docs/SHOPIFY-CONNECTOR-SETUP.md`.
- **Demo-safe:** yes, with the same "confirmed during assisted setup" wording.

---

## 4. Custom Milo Connector (regression)

- **Status:** pass (code regression) / blocked (live against Synergy)
- **Test date:** 2026-06-30
- **What worked (verified here):**
  - No code path for the Custom connector was modified this sprint or in
    Sprint 17; the GSC/WordPress/Shopify work is additive and branch-gated by
    `connectorType`. `publish.functions.ts` and the `connectorType === "custom"`
    branches in `mock-ai.ts` are unchanged.
  - Build + typecheck green with all connectors compiled.
  - Draft endpoint / live endpoint / shared-secret-header logic intact.
- **What failed:** n/a — a live send to the Synergy endpoint was not executed.
- **Fix required:** none. **To confirm live:** use the existing Synergy
  connector settings and run the Part 4 flow.
- **Demo-safe:** yes — Custom connector (Synergy) is the most demo-ready path.

---

## 5. Analytics / GSC matching

- **Status:** pass (code) / data-dependent (live)
- **What worked (verified here):**
  - `matchGscToPublishedContent` matches by normalized path for **both** CSV and
    API imports (API imports are `source: "api"`, type `mixed`, so the matched
    table renders, not the query-only message).
  - Import history shows source labels: **API sync** vs **CSV import**.
  - Launch checklist counts a GSC import (CSV **or** API) as done; the connection
    card distinguishes CSV-only / connected-not-synced / synced / reconnect.
- **Live note:** real matching requires a published Milo URL **and** Search
  Console data for that property (CSV or API). Data-dependent.

---

## Known issues
- None found during this sprint's code audit. (Sprint 17 fixed a WebCrypto
  `BufferSource` typing issue before release.)

## Required fixes
- None in application code. Remaining work is **environment/credential
  provisioning** for live GSC OAuth, and **per-site live E2E** for WordPress and
  Shopify, as listed above.

## Demo-safe status (summary)
| Integration | Demo-safe now | Notes |
|---|---|---|
| Free audit | ✅ | Public, works live. |
| Custom connector (Synergy) | ✅ | Most demo-ready publishing path. |
| Analytics snippet | ✅ | Data-dependent; install + visit to populate. |
| GSC CSV import | ✅ | Always available. |
| GSC OAuth sync | ⏳ | Needs OAuth env; not-configured state is safe. |
| WordPress connector | ⏳ | Architecture-ready; confirm per site in setup. |
| Shopify connector | ⏳ | Architecture-ready; confirm per store in setup. |
| Live card payments | ⏳ | Pending company/Paddle setup; manual for beta. |
