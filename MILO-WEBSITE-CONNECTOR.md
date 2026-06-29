# Milo Website Connector — implementation guide & template

How to make any client website **Milo-publishable**. Milo (the control app) sends
content to a connected website as a **draft**, and — on command — **publishes it
live**. The website only exposes two secure endpoints; **all publishing is
controlled from Milo**. There is no website-side publish UI.

This guide is the canonical contract. It is derived from the live, verified
Synergy implementation (`synergymassage.se`, Supabase edge functions). Any new
client site that implements these two endpoints will work with Milo's existing
Publishing settings — no Milo-side changes needed.

---

## 1. Architecture

```
Milo Content Editor
  │  (server function, secret in header — never from the browser)
  ├──POST {endpoint}/milo-publish        → website creates/updates a DRAFT row → returns draftUrl
  └──POST {endpoint}/milo-publish-live   → website flips that row to PUBLISHED → returns liveUrl
```

- **Two endpoints, one shared secret.** Same `MILO_PUBLISH_SECRET` authenticates both.
- **Milo never calls your endpoint from the browser.** Calls originate from Milo's
  server functions, so the secret is never exposed client-side.
- **The website owns:** storing the content row, the draft↔published state, public
  routes for published content, and returning the URLs. Milo only stores what your
  endpoints return.

---

## 2. What Milo sends

Both requests are `POST` with:

```
Content-Type: application/json
x-milo-publish-secret: <the shared secret>
```

The secret is **only** in the header, never in the body. Milo uses a **10 s
timeout** and treats any non-2xx response, malformed JSON, `{ "ok": false }`, or
(for live) a missing `liveUrl` as a failure — surfaced to the user and stored on
the asset, with content preserved for retry.

### 2a. Draft endpoint — `POST .../milo-publish`

```json
{
  "source": "milo-growth",
  "projectId": "oC4kAHC…",
  "assetId": "8343c4vf",
  "title": "The Nordic Crumb Story: Artisan Sourdough…",
  "slug": "the-nordic-crumb-story-artisan-sourdough-specialty-coffee-in",
  "assetType": "article",
  "destinationType": "blogPost",
  "language": "English",
  "markdown": "## The Heart of Stockholm's Baking Scene\n\n…",
  "metaTitle": "…",
  "metaDescription": "…",
  "sourceOpportunityTitle": "…",
  "sourceType": "audit",
  "status": "draft",
  "createdAt": "2026-06-29T14:55:00.000Z",
  "sentAt": "2026-06-29T19:50:00.000Z"
}
```

- `assetType` ∈ `brief | article | servicePage | landingPage | faq | comparison | gbpPost | meta | socialPack`
- `destinationType` ∈ `blogPost | servicePage | faq | landingPage`
- `sourceType` ∈ `opportunity | audit | competitor | authority | aiVisibility | manual | unknown`
- `status` is always `"draft"` from this endpoint. Milo v1.x never asks this endpoint to publish live.

**Expected success response (2xx):**

```json
{ "ok": true, "draftUrl": "https://yoursite.com/drafts/<slug>", "externalId": "row-id-123" }
```

- `draftUrl` — a preview URL for the draft (shown in Milo as "View website draft").
- `externalId` — your row's id. **Strongly recommended**: Milo stores it and sends
  it back on live-publish so you can locate the exact row.

**Failure response** (use a non-2xx status, or 200 with `ok:false`):

```json
{ "ok": false, "error": "Helpful message shown to the Milo user" }
```

### 2b. Live endpoint — `POST .../milo-publish-live`

```json
{
  "source": "milo-growth",
  "projectId": "oC4kAHC…",
  "assetId": "8343c4vf",
  "externalId": "row-id-123",
  "slug": "the-nordic-crumb-story-…",
  "destinationType": "blogPost"
}
```

Locate the row by `externalId` (preferred), else by (`projectId`,`assetId`) or
(`destinationType`,`slug`). Flip it to **published** and return:

```json
{ "ok": true, "liveUrl": "https://yoursite.com/blog/<slug>", "externalId": "row-id-123" }
```

- `liveUrl` is **required** — Milo treats a missing `liveUrl` as a failure.
- Shown in Milo as "View live page" and stored as `liveUrl` + `livePublishedAt`.

---

## 3. Public live route mapping

Milo sends `destinationType`; your site decides the public path. The verified
Synergy convention (recommended default):

| destinationType | Public route   | Example liveUrl                    |
|-----------------|----------------|------------------------------------|
| `blogPost`      | `/blog/:slug`     | `https://yoursite.com/blog/<slug>`     |
| `servicePage`   | `/services/:slug` | `https://yoursite.com/services/<slug>` |
| `faq`           | `/guides/:slug`   | `https://yoursite.com/guides/<slug>`   |
| `landingPage`   | `/pages/:slug`    | `https://yoursite.com/pages/<slug>`    |

You may use different routes — Milo only uses the `liveUrl` you return — but keep
them consistent so editors can predict them.

---

## 4. Required behaviors

1. **Auth.** Reject any request whose `x-milo-publish-secret` ≠ `MILO_PUBLISH_SECRET`
   with `401` (or `{ok:false,error:"Invalid secret"}`). Never log the secret.
2. **Idempotent upsert (no duplicates).** Re-sending the same asset must **update
   the same row**, not create a new one. Key on `external_id`, or uniquely on
   (`project_id`,`asset_id`), or (`destination_type`,`slug`). Milo re-sends and
   re-publishes routinely and expects the **same** `draftUrl`/`liveUrl` back.
3. **Draft never auto-publishes.** `milo-publish` always lands the row as `draft`.
   Content only goes public via `milo-publish-live`.
4. **Re-send after publish = back to draft-pending.** If an already-published row
   is re-sent via `milo-publish` (edited content), update the draft content and
   treat it as **pending re-publish** (e.g. keep the live page on the last
   published version, or mark `needs_publish=true`). Do **not** silently change the
   live page from a draft send. Milo mirrors this: a re-send updates only the draft
   side and never assumes the live page changed without an explicit live-publish.
5. **Always respond JSON, never hang.** Milo's timeout is 10 s. Return a clear
   `{ok:false,error}` rather than a 500 with no body where possible.
6. **CORS not required** — Milo calls server-to-server, not from a browser.

---

## 5. Reference implementation (Supabase edge functions, Deno)

Set the secret once: `supabase secrets set MILO_PUBLISH_SECRET=<value>` (must match
the value saved in Milo → Project Setup → Publishing → Publish secret).

### 5a. Suggested table

```sql
create table if not exists milo_content (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  asset_id text not null,
  destination_type text not null,           -- blogPost | servicePage | faq | landingPage
  slug text not null,
  title text,
  markdown text,
  meta_title text,
  meta_description text,
  language text,
  source_type text,
  status text not null default 'draft',      -- draft | published
  needs_publish boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, asset_id)              -- the idempotency key
);
```

### 5b. Shared helpers (`_shared/milo.ts`)

```ts
export function checkSecret(req: Request): boolean {
  const sent = req.headers.get("x-milo-publish-secret") ?? "";
  const expected = Deno.env.get("MILO_PUBLISH_SECRET") ?? "";
  // constant-time-ish compare; never log either value
  return expected.length > 0 && sent === expected;
}

const ROUTE: Record<string, string> = {
  blogPost: "blog",
  servicePage: "services",
  faq: "guides",
  landingPage: "pages",
};

export function publicPath(destinationType: string, slug: string): string {
  const base = ROUTE[destinationType] ?? "pages";
  return `/${base}/${slug}`;
}

export const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://yoursite.com";
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
```

### 5c. `milo-publish` (create/update draft)

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkSecret, publicPath, SITE_ORIGIN, json } from "../_shared/milo.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!checkSecret(req)) return json({ ok: false, error: "Invalid secret" }, 401);

  let p: any;
  try { p = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  if (!p?.assetId || !p?.slug) return json({ ok: false, error: "Missing assetId or slug" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Upsert by (project_id, asset_id) → never creates a duplicate on re-send.
  const { data, error } = await db.from("milo_content").upsert({
    project_id: p.projectId, asset_id: p.assetId,
    destination_type: p.destinationType, slug: p.slug,
    title: p.title, markdown: p.markdown,
    meta_title: p.metaTitle, meta_description: p.metaDescription,
    language: p.language, source_type: p.sourceType,
    status: "draft", needs_publish: true, updated_at: new Date().toISOString(),
  }, { onConflict: "project_id,asset_id" }).select("id").single();

  if (error) return json({ ok: false, error: error.message }, 500);

  return json({
    ok: true,
    draftUrl: `${SITE_ORIGIN}/drafts/${p.slug}`,
    externalId: data.id,
  });
});
```

### 5d. `milo-publish-live` (flip draft → published)

```ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { checkSecret, publicPath, SITE_ORIGIN, json } from "../_shared/milo.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!checkSecret(req)) return json({ ok: false, error: "Invalid secret" }, 401);

  let p: any;
  try { p = await req.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Locate by externalId first, else by (project_id, asset_id).
  const q = db.from("milo_content").update({
    status: "published", needs_publish: false,
    published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const { data, error } = p.externalId
    ? await q.eq("id", p.externalId).select("slug,destination_type").single()
    : await q.eq("project_id", p.projectId).eq("asset_id", p.assetId).select("slug,destination_type").single();

  if (error || !data) return json({ ok: false, error: error?.message ?? "Draft not found — send it first" }, 404);

  return json({
    ok: true,
    liveUrl: `${SITE_ORIGIN}${publicPath(data.destination_type, data.slug)}`,
    externalId: p.externalId ?? undefined,
  });
});
```

> Public pages: render published rows at the routes above (e.g. a `/blog/:slug`
> page that reads `milo_content` where `status='published'`). Drafts can render at
> `/drafts/:slug` for preview (optionally behind a noindex/token). That page layer
> is normal website work and outside the connector contract.

---

## 6. Connecting in Milo

In Milo → **Project Setup → Publishing**:

1. **Publish endpoint** — `https://<project>.supabase.co/functions/v1/milo-publish`
2. **Live publish endpoint** — `https://<project>.supabase.co/functions/v1/milo-publish-live`
3. **Publish secret** — the exact `MILO_PUBLISH_SECRET` value (entered by the
   account owner; Milo stores it privately and sends it only as a header).
4. **Publishing mode** — `Draft only` / `Manual publish live` / `Auto-publish approved content`.
5. **Default destination** — blogPost / servicePage / faq / landingPage.

> Tip when configuring: enter the **endpoint and the secret in the same browser
> tab and Save once** — saving captures both fields together.

---

## 7. Test checklist (per new site)

1. **Auth** — wrong/empty secret → 401 `{ok:false}`; correct secret → proceeds.
2. **Draft create** — `milo-publish` returns `{ok:true,draftUrl,externalId}`; row exists as `draft`.
3. **Idempotent draft** — re-send same `assetId` → same row updated, **same draftUrl**, no duplicate.
4. **Live publish** — `milo-publish-live` returns `{ok:true,liveUrl}`; row is `published`; public route resolves.
5. **Idempotent live** — re-publish → success, **same liveUrl**, no duplicate.
6. **Route mapping** — each `destinationType` yields the correct public path.
7. **Re-send after publish** — content updates as draft / pending; live page not silently changed.
8. **Failure shape** — induce an error → `{ok:false,error}`; Milo shows it and preserves content.

Milo-side verification (Editor): status badges flip **Not sent → Sent → Published
live**; "View website draft" and "View live page" links appear; statuses persist
after refresh; auto-publish only fires on **Approve** (never Draft/In Review/Rejected).

---

## 8. Hard boundaries (keep the model clean)

- **No website-side publish UI / admin** — publishing is controlled only from Milo.
- **No auto-publish initiated by the website.**
- **The secret lives in env on the website and in Milo's stored settings only** —
  never in client code, never in the JSON body, never logged.
- **Don't change the response field names** (`ok`, `draftUrl`, `liveUrl`,
  `externalId`, `error`) — Milo reads exactly these.

---

## 9. Optional Milo Analytics Setup

Independent of publishing, you can add **Milo Analytics** to a connected website
so Milo can show whether the site is growing after content is planned, created and
published. It is first-party, anonymous, and lightweight — not Google Analytics.
This section is optional and can be added with or without the publishing endpoints.

### 9a. Analytics snippet

Add this **once, globally** to the client website — preferably in the shared
head/body layout so it loads on every page:

```html
<script src="https://milogrowth.com/milo-analytics.js" data-project-id="PROJECT_ID"></script>
```

- `PROJECT_ID` comes from **Milo → Analytics → Setup** (the snippet there is
  pre-filled with the correct id; copy it from the project you're connecting).
- Tracks **anonymous page views** automatically on load.
- **Supports SPA route changes** (history navigation), so single-page sites still
  record each view.
- Stores **no names, emails or full IP addresses** — anonymous visitor/session
  ids only.
- Dependency-free; safe to load once site-wide.

### 9b. CTA / booking click tracking

The snippet exposes a tiny global helper, `window.miloTrack(eventType, metadata)`.
Use optional chaining (`?.`) so calls are safe even if the script hasn't loaded:

```js
window.miloTrack?.('cta_click', {
  label: 'Book now',
  location: 'Header'
})
```

```js
window.miloTrack?.('booking_click', {
  label: 'Book appointment',
  location: 'Service page CTA'
})
```

Recommended actions to track (wire `miloTrack` to the click handler / `onClick`):

- **Book now** → `cta_click`
- **Book appointment** → `booking_click`
- **Contact** → `cta_click`
- **Membership CTA** → `cta_click`
- **Gift card CTA** → `cta_click`
- **Published page CTA block** → `cta_click`

`metadata` is free-form (e.g. `label`, `location`) and shown for context in Milo;
keep it small and free of personal data. Valid `eventType` values:
`page_view`, `content_view`, `cta_click`, `booking_click`.

### 9c. Published content performance

Milo links visits to the content it published by **matching the page's path to the
live URL stored on the content asset**:

- When you publish live (section 2b), Milo stores the `liveUrl` you return.
- Milo compares each analytics event's `path` to the **path of that `liveUrl`**.
- So public pages must be served at the **same route Milo recorded** — i.e. the
  connector route convention from section 3 (`/blog/:slug`, `/services/:slug`,
  `/guides/:slug`, `/pages/:slug`). If your public routes match the returned
  `liveUrl`, Milo shows **views and CTA/booking clicks per published page**
  automatically — no extra wiring.

> No per-asset id needs to be embedded in the page for v1 — path matching is
> enough. Just keep public routes consistent with the `liveUrl` you return.

### 9d. AI-related signals

Milo flags traffic that **appears** to come from AI tools, using referrer and
user-agent detection only. Use cautious wording on the client side too:

- **AI-related visits**
- **Possible AI referral** (e.g. a visitor arriving from chatgpt.com, perplexity.ai, …)
- **AI crawler activity** (e.g. GPTBot, ClaudeBot, PerplexityBot, …)
- **AI/search bot signal** (e.g. Bingbot, Applebot)

Important framing:

- These signals are **inferred from referrer or user agent** — nothing more.
- They do **not** mean the business ranks in, or is recommended by, any AI tool.
- **Do not** market this as guaranteed "AI visibility ranking" or "AI Overview
  ranking". Keep claims to readiness/observed-signal language.
- Note: AI crawlers usually don't run JavaScript, so the most common real signal
  is a **Possible AI referral** (a human arriving from an AI tool).

### 9e. Privacy note

Show this (or equivalent) wherever analytics is described to the client:

> Milo Analytics uses anonymous visit and event tracking. It does not store names,
> emails or full IP addresses.

### 9f. Per-site analytics verification checklist

1. **Snippet loads** — `/milo-analytics.js` returns 200 and runs (no errors in console).
2. **page_view appears** — open a few pages, then check Milo → Analytics (visits / top pages update).
3. **CTA click appears** — trigger a `cta_click` action → it shows in Milo (CTA/booking card, page row).
4. **booking_click appears** — trigger a `booking_click` → it shows in Milo.
5. **Published content links correctly** — visit a published page at its `liveUrl`
   route → views appear under **Published content performance** for that asset.
6. **AI referrer detection** — if testable, arrive at the site from an AI tool (or
   simulate the referrer) → it appears under **AI-related signals** as a Possible AI referral.
7. **No console errors** — on the client site or in Milo Analytics.
8. **Privacy copy acceptable** — the anonymous-tracking note is acceptable for the client site.

---

*Reference: verified live against the Synergy site (Supabase functions
`milo-publish` + `milo-publish-live`, shared `MILO_PUBLISH_SECRET`) on 2026-06-29.
Milo-side connector code lives in `src/lib/publish.functions.ts` (server),
`src/lib/mock-ai.ts` (client surface), and the Publishing UI in
`src/routes/_authenticated/app.setup.tsx` + `app.editor.tsx`.*
