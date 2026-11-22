# GA4 sync and Business Hub paste for the ChatGPT channel

On 22 November 2026 the release operator enabled the Google Analytics Admin
and Data APIs in the existing Milo Cloud project and registered the read-only
Analytics scope. Both pilot tables were applied to Milo's production database.
The release check confirmed row-level security and service-role access on
both tables, with no read access for anonymous or authenticated browser roles.
The reference Synergy traffic acquisition report showed two sessions from
chatgpt.com and none from chat.openai.com for 25 October–21 November 2026.
The Synergy Business Hub profile displayed “Unavailable” for all three totals.

## Rollout boundary

Google Cloud asked that the new, unverified `analytics.readonly` scope not be
offered to general production users. The GA4 sync is therefore limited to the
**Synergy Massage project in the platform owner's own workspace**:

- Client: `Ga4ChannelSync` renders nothing unless the project's `websiteUrl` is
  `https://synergymassage.se` (or `www.`), and then nothing until the server
  confirms access. Other users never see the connect box.
- Server (the actual control): every server function (status, start, list
  properties, select, sync, disconnect) and the OAuth callback call
  `assertGa4Rollout(userId, projectId)` in `src/lib/ga4.server.ts`. It requires
  `has_role(userId, 'owner')` **and** a project with that id in
  `readWorkspaceRow(userId)` (the caller's own stored workspace) that passes
  `isGa4RolloutProject`. Any lookup error denies (`not_available`).
- To widen the rollout later, change `GA4_ROLLOUT_HOSTS` in `src/lib/ga4.ts`
  only after Google has verified the scope.

## OAuth flow

The flow reuses the Search Console Google client and its registered callback
(`/api/google/search-console/callback`); a state signed with the GA4 key is routed
to the GA4 handler.

1. `startGa4OAuthFn` creates a 32-byte nonce, stores `sha256(nonce)` in
   `ga4_oauth_attempts` (one pending attempt per user; a new start voids older
   ones), sets `__Host-milo_ga4_oauth=<nonce>` (HttpOnly, Secure, SameSite=Lax,
   Path=/, 10 minutes) and returns the consent URL. The signed state carries
   the user, project, expiry and the nonce **hash**, never the nonce.
2. The callback requires a valid signed state, the cookie from the same browser
   whose hash matches the state, and an unexpired attempt row for the same
   user and project. It deletes that row before doing anything else (so a replay
   fails), re-checks the rollout gate, then exchanges the code. Every GA4
   callback response clears the cookie.
3. Scope: `analytics.readonly` only, `include_granted_scopes=false`. The token is
   accepted only if Google reports that scope and returns a refresh token. It is
   stored AES-GCM-encrypted and bound to the owner id in `google_connections`
   with provider `google_analytics`.

`google_connections` constraints were checked against the released migrations
(20260630120000, 20260712130000): unique `(user_id, provider)`, no CHECK or enum
on `provider`, no foreign key. The GA4 row sits beside the Search Console row,
and the GSC cron and GSC reads filter by their own provider.

Disconnect is local: it clears the stored token, deletes the user's property
selections and pending attempts, and fails visibly if any of those writes
fails. It does not call Google's revoke endpoint, because that could drop the
Search Console grant. To fully revoke, remove Milo under the Google Account's
third-party access.

## What is fetched

For the selected property (re-verified on every sync with the owner's token):
the 28 most recent complete days in the property's time zone, sessions with
session source exactly `chatgpt.com` or `chat.openai.com`, and `booking_click`
and `booking_completed` event counts for those sessions. A zero is shown only
when GA4 answered completely and the event exists in the property; thresholded
or limited data and never-recorded events show as "Not measured". API figures
are stored beside the manual GA4 entry and never overwrite it.

The browser writes the snapshot only if the signed-in owner, the active
project and the selected property are unchanged since the request started.
Otherwise the result is dropped.

## Business Hub paste (all users)

Milo does not read ChatGPT Business Hub itself and uses no unofficial endpoint
or scraping. The user can paste the visible English summary. The parser in
`parseBusinessHubPaste`, which runs only in the browser, reads `Mentions` and
`Website clicks`:

- a displayed whole number (for example `1,204`) fills the field;
- `Unavailable` leaves the field blank (Not measured), never 0;
- a missing label leaves the field unchanged and is reported;
- abbreviated values (for example `1.2K`) or conflicting values are reported as
  unreadable and leave the field unchanged;
- `Profile views` and the chart are ignored;
- the period is never read from the paste. The UI asks the user to check that
  the period end date matches Business Hub;
- if the paste would change a value already typed, the user must confirm.

The pasted text is not saved or sent anywhere. Only the figures the user then
saves are stored.

## Prerequisites before a test

User-only steps, not done here: enable the Google Analytics Admin API and the
Data API on the Google Cloud project, add `analytics.readonly` to the OAuth
consent screen and keep the Synergy owner as a test user, then review and
apply `20261122152000_ga4_connections.sql`.

## Tests

`src/lib/ga4.test.ts`, `src/lib/ga4.server.test.ts` (gate, nonce/cookie,
consumption, storage errors), `src/lib/ga4-migration.test.ts` (PGlite: RLS,
grants, constraints, one-time delete), and the paste and snapshot cases in
`src/lib/chatgpt-channel.test.ts`.
