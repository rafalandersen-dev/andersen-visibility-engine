# Claude.ai OAuth MCP Connector — E2E Readiness Plan

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document. `MCP_OAUTH_ENABLED` remains off.

**Target deployment:** `465ffa9` (Phase 4), deploy `699f5de5` · **Flag:** `MCP_OAUTH_ENABLED` unset (off) · **MCP resource:** `https://milogrowth.com/api/mcp`

## 0. ✅ Database migrations — applied and verified

The three required migrations have been **applied to the production Milo database and verified** against the live schema. All seven tables exist, RLS is enabled on each, and each has **zero client-readable RLS policies** (service-role-only, matching the established `analytics_events` pattern — Supabase's default table grants to `anon`/`authenticated` are neutralised by RLS-enabled + no-policies).

| Migration file | Tables | Needed for | Status |
|---|---|---|---|
| `20260707120000_mcp_connections.sql` | `mcp_connections` | Developer-token connector | ✅ applied |
| `20260707130000_oauth_server.sql` | `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, `oauth_consents`, `oauth_audit_log` | **OAuth connector (required)** | ✅ applied |
| `20260707140000_oauth_authorization_requests.sql` | `oauth_authorization_requests` | **OAuth connector (required)** | ✅ applied |
| `20260630120000_google_connections.sql` | `google_connections` | GSC OAuth sync (unrelated) | ⏸ not applied (out of scope; GSC is graceful-off today) |

**Verified state (per-table):** `mcp_connections`, `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, `oauth_consents`, `oauth_audit_log`, `oauth_authorization_requests` — all **exist**, **RLS enabled = true**, **client-readable policies = 0**.

**Migration-file bug fixed.** During the apply, `20260707130000_oauth_server.sql` was found to reference a non-existent `created_at` column in the `oauth_consents` index (the column is `granted_at`). The live DB was created with the corrected index, and the repo migration file was fixed in commit **`53a2c27`**, so the file now matches production and is re-applyable in a fresh environment.

> The migrations are additive, service-role-only, RLS-on, with no client policies.
> They are applied, so this is no longer a pre-flight blocker.
>
> **The OAuth connector remains inactive:** `MCP_OAUTH_ENABLED` is unset/off, so
> every OAuth endpoint still returns 404 and `/api/mcp` still challenges with the
> plain `Bearer` header. Applying the tables changed no runtime behaviour — an
> E2E test still requires a deliberate, controlled flag-on window (§2–§5).

## 1. Environment variables

The OAuth connector needs exactly **one** env var — there is **no** signing/pepper secret (tokens are random + SHA-256 hashed; pending requests are DB-keyed by random UUID, not a signed state):

```
MCP_OAUTH_ENABLED=true
```

- Set it in Lovable Cloud project settings/secrets, then **redeploy** (Workers reads `process.env` at runtime; a new value needs a fresh deploy to take effect).
- `GSC_TOKEN_ENCRYPTION_KEY` is unrelated (GSC sync only). No `GOOGLE_*` needed for this connector.

## 2. Pre-flight checklist (before enabling the flag)

- [x] Apply `20260707130000_oauth_server.sql`, `20260707140000_oauth_authorization_requests.sql`, and `20260707120000_mcp_connections.sql` to the prod DB. **(Done — see §0.)**
- [x] Verify the 6 OAuth tables + `mcp_connections` exist and RLS is enabled with no anon/authenticated policies. **(Done — verified in §0.)**
- [ ] Decide the **test window** (short; owner-only) and announce nothing user-facing.
- [ ] Confirm rollback is one env change (§5).
- [ ] Pick **test account**: the owner Milo login (`rafal.andersen@gmail.com`), already logged into `milogrowth.com` in the test browser so the consent page renders without a login bounce.
- [ ] Pick **test workspace/project**: an existing project with data (an audit run, ≥1 content asset with a Milo Score, and ideally a GSC import) so tool responses are non-empty.
- [ ] Acknowledge **known limitations** for this test: no refresh tokens (access token lives 1h, then re-auth), no `/revoke` endpoint, no connected-apps UI, no write scopes.

**Expected endpoints — flag OFF (today):** all five OAuth surfaces (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/api/oauth/register`, `/api/oauth/authorize`, `/api/oauth/token`) → **404**; `/api/mcp` unauth → **401 plain `Bearer`**; `GET /api/mcp` → 200.

**Expected endpoints — flag ON:** the two `.well-known` docs → **200 JSON**; `/api/oauth/register` → **201** (public client); `/api/oauth/authorize` → **302** to `/app/connect?req=…` (valid) or the redirect_uri with an error; `/api/oauth/token` → **200** token JSON (valid code) or OAuth error; `/api/mcp` unauth → **401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`**.

## 3. Flag-on smoke test (scriptable, before touching Claude.ai)

Run these from a terminal once the flag is on (the migrations are already applied — §0). They exercise the whole server side without a browser except where noted.

1. **PRM:** `GET /.well-known/oauth-protected-resource` → 200; JSON `resource` = `https://milogrowth.com/api/mcp`, `authorization_servers` = `["https://milogrowth.com"]`, `scopes_supported` lists **only the 4 read scopes** (`milo.projects.read`, `milo.content.read`, `milo.insights.read`, `milo.authority.read`) — **no `offline_access`**.
2. **AS metadata:** `GET /.well-known/oauth-authorization-server` → 200; `issuer` = `https://milogrowth.com`, endpoints point to `/api/oauth/{authorize,token,register,revoke}`, `scopes_supported` = the 4 read scopes, `response_types_supported` = `["code"]`, **`grant_types_supported` = `["authorization_code"]`** (no `refresh_token`), `code_challenge_methods_supported` = `["S256"]`, `token_endpoint_auth_methods_supported` = `["none"]`.
3. **DCR:** `POST /api/oauth/register` with `{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}` → 201; capture `client_id`; assert **no** `client_secret`.
4. **PKCE pair:** generate `code_verifier` + `code_challenge = BASE64URL(SHA256(verifier))`.
5. **Authorize (browser, logged in):** open `GET /api/oauth/authorize?response_type=code&client_id=…&redirect_uri=https://claude.ai/api/mcp/auth_callback&scope=milo.projects.read%20milo.content.read%20milo.insights.read%20milo.authority.read&code_challenge=…&code_challenge_method=S256&resource=https://milogrowth.com/api/mcp&state=xyz` → should **302 → `/app/connect?req=…`**. (Do **not** request `offline_access`. The compatibility patch makes `resource` optional: if omitted it defaults internally to `https://milogrowth.com/api/mcp`; if present it must equal that URL.)
6. **Consent page:** `/app/connect?req=…` shows title "Connect Milo Growth to Claude", read-only badge, the scope list, and the can/cannot lists. Click **Allow** → browser redirects to `redirect_uri?code=…&state=xyz`. Capture the `code`.
7. **Token:** `POST /api/oauth/token` (form-encoded) `grant_type=authorization_code&client_id=…&code=…&redirect_uri=…&code_verifier=…&resource=https://milogrowth.com/api/mcp` → 200; assert `token_type=Bearer`, `expires_in=3600`, `scope` = the 4 reads (no `offline_access`), **no `refresh_token`** in the response. (`resource` may be omitted here too — the code is bound to the default MCP resource.) Capture `access_token`.
8. **MCP with OAuth token:** `POST /api/mcp` `Authorization: Bearer <access_token>` `{"jsonrpc":"2.0","id":1,"method":"tools/list"}` → 200; tool list present.
9. **Scope-filtered list:** repeat step 3–8 requesting only `scope=milo.projects.read`; `tools/list` returns **only** `list_projects`, `get_project_brief`.
10. **Blocked call:** with that projects-only token, `tools/call` `list_content` → JSON-RPC **error `-32002`** ("Insufficient scope for this tool."), **not** 401, no result.
11. **Allowed call:** `tools/call` `list_projects` → 200 result (JSON of projects).
12. **Unauth challenge:** `POST /api/mcp` with no token → 401 with `resource_metadata` header.
13. **Legacy dev token still works:** generate a developer token in Project Setup → Claude connector; `POST /api/mcp` with it → `tools/list` returns **all 8** tools; a `tools/call` succeeds. (Requires `mcp_connections` applied.)
14. **Reuse/expiry sanity:** re-POST the same `code` to `/token` → `invalid_grant`.

## 4. Manual Claude.ai E2E checklist

**Add the connector**
- [ ] Claude.ai → **Settings → Connectors** (or the "Add custom connector" affordance) → choose **Add custom connector / remote MCP**.
- [ ] Enter the MCP URL: **`https://milogrowth.com/api/mcp`**.
- [ ] Claude fetches `/api/mcp` (401 → reads `resource_metadata`) → PRM → AS metadata → **dynamically registers** (DCR) → opens the **authorize** URL.

**Consent**
- [ ] Browser lands on **`/app/connect?req=…`** (log in first if prompted; you return to consent).
- [ ] Screen reads **"Connect Milo Growth to Claude"**, shows read-only badge, requesting client, your email, the requested scopes, and the **can / cannot** lists.
- [ ] Click **Allow access** → Claude reports the connector connected.

**After approval — test prompts inside Claude**
- [ ] "List my Milo Growth projects." → uses `list_projects`.
- [ ] "Show the brand brief for my project." → `get_project_brief`.
- [ ] "What's the Milo Score and top issues on my latest draft?" → `list_content` + `get_content`.
- [ ] "Summarize my latest AI Visibility audit and its top fixes." → `get_latest_audit`.
- [ ] "What are my top Search Console queries?" → `get_gsc_summary`.
- [ ] "List my authority opportunities." → `list_authority_opportunities`.

**Expected failures / edges**
- [ ] After ~1 hour the access token expires; with **no refresh token issued** (`offline_access` is no longer advertised or requested), Claude must **re-run the consent flow** to reconnect. The token endpoint still rejects `grant_type=refresh_token` with `unsupported_grant_type`, but Claude has no refresh token to try, so this should not occur in practice.
- [ ] "Publish this / edit this / delete this" → no such tool exists (read-only); Claude should decline.
- [ ] Cancelling consent → `access_denied` back to Claude; connection not established.

**Capture**
- [ ] Screenshots: the Claude connector-add dialog, the Milo consent screen, a successful tool response, and (if it occurs) the token-expiry/re-auth behavior.
- [ ] Server logs for the window (no tokens/codes are logged by design — confirm that).
- [ ] Rows created: `oauth_clients` (1), `oauth_authorization_requests`, `oauth_authorization_codes` (consumed), `oauth_tokens` (1, `last_used_at` populated), `oauth_consents` (1), `oauth_audit_log` (`register`/`consent_granted`/`token_issued`/`mcp_call`).

## 5. Rollback (fast, code-preserving)

1. Set **`MCP_OAUTH_ENABLED`** back to unset/`false` (or remove it) in Lovable, **redeploy**.
2. Verify all five OAuth endpoints → **404** again.
3. Verify `POST /api/mcp` unauth → **401 plain `Bearer`** (no `resource_metadata`); a `milo_at_` token → 401 (OAuth path skipped).
4. Verify legacy developer-token `/api/mcp` still works (if `mcp_connections` applied) / still 401s otherwise.
5. **Do not roll back code** unless there's a runtime regression. The additive migrations can stay applied (they're inert with the flag off — nothing reads them). Only revert commits if a specific defect requires it.

## 6. Must-fix blockers before public launch

**Hard blockers**
- **Refresh tokens / re-auth.** No refresh token is issued and the `refresh_token` grant isn't implemented, so a connection stops working after the ~1h access-token lifetime and the user must re-run consent. This is now a **missing feature, not a metadata mismatch** — the compatibility patch removed `offline_access` and `refresh_token` from the advertised metadata, so Claude no longer expects a refresh token. Before public launch, implement refresh (rotation + reuse detection, per blueprint) so connections persist without repeated re-auth.
- **`/api/oauth/revoke`** (RFC 7009) — users/Claude expect to disconnect; only the developer-token revoke exists today.
- **Connected-apps UI** — no way for a user to see or revoke an active Claude grant from Milo.
- **Rate limiting** — none on `/register`, `/authorize`, `/token`, `/api/mcp` yet (DCR abuse, token brute-force).
- **Migration process** — the current tables are applied (§0), but repo migration files do **not** auto-apply to the Lovable Supabase, so any *future* migration must be applied manually as a first-class deploy step.

**Resolved by the compatibility patch (no longer an E2E risk)**
- **`resource` handling.** Previously authorize + token strictly required `resource == https://milogrowth.com/api/mcp`, which risked failing the first connection if Claude omitted the param. The patch now **defaults `resource` to the MCP URL when omitted** (and still rejects a mismatched value), so a Claude client that does not send `resource` is handled gracefully.
- **`offline_access` / `refresh_token` advertising.** No longer advertised, so the earlier metadata/behaviour mismatch is gone (see the hard blocker above for the remaining missing-feature work).

**Should-fix**
- **Audit log surfacing / last-used display** (rows are written; no UI/owner-QA view yet).
- **Docs + user-facing setup copy** — a "Add Milo to Claude.ai" guide + the connector-card copy distinguishing the OAuth connector from the developer token.
- **Project-level scoping** (fast-follow) — grants are workspace-wide read; add the project selector from the blueprint.

---

### Bottom line
The server-side OAuth flow is code-complete through Phase 4 plus the compatibility patch, and safely flag-gated. The two earlier E2E risks — the **`resource`-required** behaviour and the **advertised-but-missing refresh token** (`offline_access`/`refresh_token`) — are **resolved**: `resource` now defaults to the MCP URL when omitted, and neither `offline_access` nor `refresh_token` is advertised. The remaining pre-launch gap is a **missing feature, not an inconsistency**: no refresh token means a connection needs re-auth after ~1h. Migrations are applied and verified (§0); the flag remains off. Recommended order: (1) open a controlled, owner-only flag-on window, (2) run the §3 scripted smoke test, (3) then attempt the Claude.ai §4 flow — and turn the flag back off afterwards (§5).
