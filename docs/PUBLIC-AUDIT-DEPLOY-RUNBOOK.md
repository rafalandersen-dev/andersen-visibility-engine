# Public Audit Worker — Deployment Runbook (Option A)

Deploys `workers/public-audit/` as the complete execution boundary for the free
AI visibility audit and routes `milogrowth.com/api/public-audit` to it.
Until this is done, the audit page shows the "temporarily closed" notice.

Architecture: `docs/adr/ADR-0001-public-audit-boundary.md`
Safety contract: `docs/PUBLIC-AUDIT-SAFETY.md`

## 0. Prerequisites

- Cloudflare account with the `milogrowth.com` zone (the domain is already
  proxied through Cloudflare).
- Wrangler authenticated: `cd workers/public-audit && bunx wrangler login`.
- A Turnstile widget (Managed) with action `public_audit`, hostnames
  `milogrowth.com` and `www.milogrowth.com`.
- A paid Gemini API key (native `generateContent`, not the Lovable gateway).

## 1. Apply the database migrations

Both migrations are additive and service-role only:

1. `supabase/migrations/20260727220000_public_audit_safety.sql`
2. `supabase/migrations/20260727223000_public_audit_fetch_budget.sql`

Apply them to the Cloud project before the Worker is routed; the Worker
fails closed to the deterministic fallback if the RPCs are missing, but the
rate limits would then be unenforced.

## 2. Worker secrets

Run from `workers/public-audit/`:

```
bunx wrangler secret put SUPABASE_URL
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put PUBLIC_AUDIT_IP_SALT      # >= 24 random chars
bunx wrangler secret put TURNSTILE_SECRET_KEY
bunx wrangler secret put GEMINI_API_KEY
```

Non-secret vars (`PUBLIC_AUDIT_ALLOWED_HOSTS`, `PUBLIC_AUDIT_ALLOWED_ORIGINS`)
are already committed in `wrangler.jsonc`. Optional override:
`PUBLIC_AUDIT_AI_MODEL` (bounded Gemini model id; default
`gemini-3.1-flash-lite`).

Never configure these values in Lovable — they belong to the Worker only.

## 3. Verify, then deploy

```
cd workers/public-audit
bun install
bun run typecheck && bun run test
bun run build            # dry run, must show no bindings
bunx wrangler deploy --config ./wrangler.jsonc --env=""
```

The committed config carries the production routes
(`milogrowth.com/api/public-audit`, `www.milogrowth.com/api/public-audit`),
so `deploy` creates them. `workers_dev` and `preview_urls` stay disabled.

## 4. App-side configuration

Set in the Lovable project environment:

- `VITE_TURNSTILE_SITE_KEY` — the Turnstile **site** key. Without it the Run
  button stays disabled in production.
- `VITE_PUBLIC_AUDIT_API_URL` — leave unset; the same-origin
  `/api/public-audit` path is the default.

Republish the app so the site key is baked into the client bundle.

## 5. Post-deploy verification

1. `curl -i -X POST https://milogrowth.com/api/public-audit -H 'content-type: application/json' -d '{}'`
   → expect a bounded 4xx JSON error, **not** a 404 HTML page.
2. Load `/free-ai-visibility-audit`: the Turnstile widget renders and Run is
   enabled; the "temporarily closed" notice no longer appears.
3. Run a real audit against an external site; confirm a scored result.
4. Re-run the same URL within 24h → served from cache, no extra AI claim.
5. Exceed 5 runs in an hour from one IP → bounded rate-limit error.
6. Check Worker logs: only event type, result class, duration and a 12-char
   salted client key prefix. No raw IPs, URLs with query strings, HTML or
   tokens.

## 6. After it is live

- Update `product/LAUNCH_READINESS.md` (line 63) from NO-GO to GO with the
  deployed SHA and date.
- Update the status header of `docs/PUBLIC-AUDIT-SAFETY.md`.
- Record the release in `docs/DECISION-LOG.md`.

## Rollback

`bunx wrangler delete` (or remove the routes in the Cloudflare dashboard).
The app detects the missing endpoint and returns to the "temporarily closed"
notice — no user-facing error, no redeploy of the app required.
