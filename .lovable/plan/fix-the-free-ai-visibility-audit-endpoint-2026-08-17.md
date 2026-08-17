# Fix the free AI visibility audit endpoint

## Confirmed problem

The free audit page posts to `/api/public-audit`. I verified with a live request: both `https://milogrowth.com/api/public-audit` and the local dev server return **404**. Nothing in the app answers that path — the handler now lives only in `workers/public-audit/`, a standalone Cloudflare Worker that `product/LAUNCH_READINESS.md` marks NO-GO (no route, no DNS, no secrets). Every visitor who enters a website and presses Run gets "The audit is temporarily unavailable."

## Two ways forward — pick one

### Option A — Deploy the worker (matches the current architecture)

Keep the code as-is and finish the deployment:

1. Set the worker's secrets: `GEMINI_API_KEY`, `TURNSTILE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_AUDIT_IP_SALT`, `PUBLIC_AUDIT_ALLOWED_HOSTS`, `PUBLIC_AUDIT_ALLOWED_ORIGINS`.
2. Deploy `workers/public-audit` and add a Cloudflare route mapping `milogrowth.com/api/public-audit` to it.
3. Set `VITE_TURNSTILE_SITE_KEY` in the app so the bot check renders — in production the Run button stays disabled without it.
4. Verify end to end, then update the launch-readiness docs.

This is infrastructure work outside the app repo; I cannot do steps 1–2 from here. It keeps the audit's isolation (own rate limits, own IP salt, own key) intact.

### Option B — Bring the handler back into the app

Add `src/routes/api/public/public-audit.ts` (a TanStack server route under the auth-bypassing `/api/public/*` prefix) and point the client at it:

- Move the worker's request parsing, safe-fetch, signal extraction and normalisation into a shared `src/lib/public-audit-handler.server.ts` so both entry points stay in sync.
- Call the model through the Lovable AI Gateway instead of a raw Gemini key, so no new AI secret is needed.
- Keep Turnstile verification (still needs `TURNSTILE_SECRET_KEY`) and re-add per-IP rate limiting backed by the existing rate-limit RPCs.
- Cache successful audits only — never cache the deterministic fallback.
- Update `runPublicAudit`'s default endpoint to the new path.

Faster to ship and fully verifiable here, but it puts unauthenticated, outbound-fetching AI work back in the main app — exactly what the worker split was meant to avoid — and re-exposes the app to the abuse budget the worker isolates.

## Interim behaviour either way

Until one of the above lands, the audit page should say the free audit is temporarily closed rather than showing a generic error with a Retry button that can never succeed. That is a small change to `src/routes/free-ai-visibility-audit.tsx` I can make immediately on request.

## Recommendation

Option A if you can reach the Cloudflare dashboard this week; Option B if the free audit must work before then and you accept running it inside the app.
