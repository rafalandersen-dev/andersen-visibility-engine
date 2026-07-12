# Google Search Console — OAuth / API Sync Setup

Milo can pull Search Console performance directly via the Google Search Console
API (read-only), in addition to manual CSV import. CSV import is always
available as a fallback and needs no setup.

## Current production state (2026-07-12)

- Google Cloud project: **Milo Growth Integrations**
  (`my-project-4915-1781031501961`, project number 117784515235).
- Search Console API: **enabled**.
- Google Auth Platform: branding "Milo Growth", support email set, homepage /
  privacy / terms links set, authorised domain `milogrowth.com`, audience
  **External**, scope `webmasters.readonly` (classified **non-sensitive** —
  publishing to production does not require full Google verification).
- OAuth client: **Milo Growth Web** (Web application), client id
  `117784515235-atlddib0j1tqmcnhoaefbt9scal2im6g.apps.googleusercontent.com`,
  single authorised redirect URI (below), no JS origins.
- Publishing status: **Testing** with `rafal.andersen@gmail.com` as test user.
  ⚠ In Testing mode Google expires refresh tokens after ~7 days. The E2E flow
  is proven (connected + synced 2026-07-12) — the owner should click
  **Google Auth Platform → Audience → Publish app**. The scope is
  non-sensitive, so no Google verification is required and the consent screen
  keeps working for any external user.
- E2E verified 2026-07-12: connect → consent (owner's own browser — passkeys do
  NOT work in embedded browsers), encrypted `v1.` token row in
  `google_connections`, property `https://butelkiwodorowe.pl/` selected, 28d
  sync OK (0 rows — new property), cron endpoint 200/403 auth-tested live.
- Background sync: pg_cron job `gsc-daily-sync` (05:20 UTC daily) POSTs to
  `/api/google/search-console/cron-sync` authenticated with a Bearer secret
  that lives ONLY in Supabase Vault (`gsc_cron_secret`, generated in-database;
  verified server-side via the service-role-only RPC `public.gsc_cron_secret()`).
  Applied by migration `20260712130000_gsc_cron_sync.sql`. The job syncs every
  project with a selected property (28d) at most once per 20 h, isolates
  per-customer failures, and marks `invalid_grant` as a reconnect-needed state
  instead of retrying.
- ButelkiWodorowe: uses the URL-prefix property `https://butelkiwodorowe.pl/`.
  The preferred Domain property `sc-domain:butelkiwodorowe.pl` does not exist
  yet (needs a DNS TXT record in the client's Cloudflare zone). When it is
  created and verified, reconnect is NOT needed — just pick the new property in
  Analytics → Search Console sync → Load sites and run a sync.

## What you need (one-time, by the owner)

### 1. Google Cloud OAuth client
1. Go to <https://console.cloud.google.com/> → create or pick a project.
2. **APIs & Services → Library** → enable **Google Search Console API**.
3. **APIs & Services → OAuth consent screen** → External (or Internal for a
   Workspace org). Add your email as a test user while in testing.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   *Web application*.
5. Add the authorized redirect URI **exactly**:
   ```
   https://milogrowth.com/api/google/search-console/callback
   ```
6. Copy the **Client ID** and **Client secret**.

### 2. Scope (read-only only)
```
https://www.googleapis.com/auth/webmasters.readonly
```
Milo never requests write/manage scopes, and never any other Google product.

### 3. Token encryption key
Generate a 32-byte key (base64). Example:
```
openssl rand -base64 32
```
This encrypts the Google refresh token at rest (AES-256-GCM). Without it, Milo
refuses to store long-lived tokens and reports "not configured" (CSV still
works).

⚠ **Rotation warning:** rotating `GSC_TOKEN_ENCRYPTION_KEY` makes every stored
refresh token undecryptable. There is no re-encryption tool — after a rotation
every connected user must click **Reconnect Google Search Console** once.
Rotate only if the key may have leaked.

### 4. Production environment variables (Lovable Cloud project settings)
```
GOOGLE_CLIENT_ID=<from step 1>
GOOGLE_CLIENT_SECRET=<from step 1>
GOOGLE_OAUTH_REDIRECT_URI=https://milogrowth.com/api/google/search-console/callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/webmasters.readonly
GSC_TOKEN_ENCRYPTION_KEY=<32-byte base64 from step 3>
```

### 5. Database migration
Apply `supabase/migrations/20260630120000_google_connections.sql`. It creates a
service-role-only `google_connections` table (RLS on, no client policies) that
holds the **encrypted** refresh token. Tokens are never stored in the workspace
JSONB and never returned to the browser.

> If any of the five env vars or the migration are missing, the Analytics page
> shows **"Google Search Console sync is not configured yet"** and manual CSV
> import remains fully available. Nothing breaks.

## How to connect in Milo
1. Open **Analytics** (`/app/analytics`).
2. In the **Google Search Console sync** card, click **Connect Google Search
   Console** and complete Google consent.
3. You return to Milo as **Connected**.
4. Click **Load sites**, then pick the Search Console **property that matches
   this project** from the selector.

## How to sync
- **Sync last 28 days** / **Sync last 90 days** pull Search Analytics for that
  window (end date = today − 3 days to account for Google's reporting delay).
- Each sync creates an import labelled **API sync** in the import history, with
  a row count, top queries, top pages, and published-content matching — exactly
  like a CSV import.

## Background sync (automatic)

The pg_cron job `gsc-daily-sync` runs daily at 05:20 UTC and POSTs to
`/api/google/search-console/cron-sync`:

- Auth: `Authorization: Bearer <vault:gsc_cron_secret>`; the route verifies the
  header against the service-role-only RPC `public.gsc_cron_secret()` with a
  constant-time compare. The secret was generated inside Postgres and is not
  known to any human.
- Scope: every non-revoked connection → every project in that user's workspace
  with a selected property → `syncSearchAnalytics(28d)` (the same code path as
  manual sync) → stored through the rev-guarded `mutateWorkspace` writer.
- Throttle: projects synced (manually or automatically) within the last 20 h
  are skipped, so repeated invocations are idempotent and quota-friendly.
- Failures: isolated per customer; a short error code is stored in
  `project.gscOAuth.sync` (`lastAutoSyncErrorCode`). `invalid_grant` / revoked
  consent flips the project status to **expired**, which surfaces the
  "Reconnect Google Search Console" button in Analytics; the run does not keep
  retrying a dead connection.
- Observability: the route returns `{connections, synced, skippedFresh,
  failed, reconnectNeeded}`; pg_cron run history is in `cron.job_run_details`.
- Manual trigger for testing: re-run the same SQL the job executes (see
  `supabase/migrations/20260712130000_gsc_cron_sync.sql`) or call the endpoint
  with the vault secret from SQL.

## CSV fallback
Manual CSV import is always shown under the connection card. Export a CSV from
Search Console and upload it; CSV imports are labelled **CSV import**. CSV and
API imports coexist and both feed top queries/pages and page matching.

## Disconnect
Click **Disconnect Google Search Console**. Milo revokes the token at Google
(best effort) and clears the stored connection. Historical imports are kept
until you delete them.

## Security
- Read-only access only; Milo never modifies Search Console or touches other
  Google services.
- The refresh token is encrypted (AES-GCM) and only ever decrypted server-side.
- Tokens are never shown in the UI, network tab, toasts, or logs.
- You can disconnect at any time.

## Troubleshooting
| Symptom | Likely cause / fix |
|---|---|
| Card says "not configured" | Env vars or `GSC_TOKEN_ENCRYPTION_KEY` missing, or migration not applied. Use CSV meanwhile. |
| `redirect_uri_mismatch` on Google | The redirect URI in Google Cloud must match `GOOGLE_OAUTH_REDIRECT_URI` byte-for-byte. |
| Returns with "Could not connect" | App in testing mode and your account isn't a test user; or consent was cancelled. |
| "No properties found" | The Google account has no verified Search Console properties. |
| "Connection expired — reconnect" | Refresh token was revoked/expired. Click Reconnect. CSV still works. |
