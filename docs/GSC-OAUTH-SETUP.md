# Google Search Console — OAuth / API Sync Setup

Milo can pull Search Console performance directly via the Google Search Console
API (read-only), in addition to manual CSV import. CSV import is always
available as a fallback and needs no setup.

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
This encrypts the Google refresh token at rest. Without it, Milo refuses to
store long-lived tokens and reports "not configured" (CSV still works).

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
