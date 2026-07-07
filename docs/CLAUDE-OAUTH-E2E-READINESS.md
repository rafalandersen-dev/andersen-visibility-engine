# Claude.ai OAuth MCP Connector — E2E Readiness Plan

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document. `MCP_OAUTH_ENABLED` remains off.

**Target deployment:** `465ffa9` (Phase 4), deploy `699f5de5` · **Flag:** `MCP_OAUTH_ENABLED` unset (off) · **MCP resource:** `https://milogrowth.com/api/mcp`

## 0. 🔴 Critical finding — database migrations are NOT applied

A live query of the production database shows the `public` schema contains only:
`analytics_events, email_send_log, email_send_state, email_unsubscribe_tokens, profiles, suppressed_emails, user_roles, workspaces`.

**Every OAuth/MCP table is missing.** Pushing a migration file to the git repo does **not** auto-apply it to the Lovable-managed Supabase — these must be applied manually before any flag-on test.

| Migration file | Tables | Needed for | Status |
|---|---|---|---|
| `20260707130000_oauth_server.sql` | `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens`, `oauth_consents`, `oauth_audit_log` | **OAuth connector (required)** | ❌ pending |
| `20260707140000_oauth_authorization_requests.sql` | `oauth_authorization_requests` | **OAuth connector (required)** | ❌ pending |
| `20260707120000_mcp_connections.sql` | `mcp_connections` | Developer-token connector (for the "legacy still works" comparison test) | ❌ pending |
| `20260630120000_google_connections.sql` | `google_connections` | GSC OAuth sync (unrelated; graceful-off today) | ❌ pending |

**Consequence:** with the flag on but migrations unapplied, `POST /api/oauth/register` → 500 and the whole flow fails. Also note the **developer-token MCP connector is not actually DB-backed in prod today** (its table is missing, so token generation would fail) — it only *appears* unchanged because a missing table makes `resolveUser` return null → 401. Apply `mcp_connections` too if you want the legacy-token comparison to be meaningful.

> The migrations are additive, service-role-only, RLS-on, no client policies. They
> must be applied before a flag-on window.

## 1. Environment variables

The OAuth connector needs exactly **one** env var — there is **no** signing/pepper secret (tokens are random + SHA-256 hashed; pending requests are DB-keyed by random UUID, not a signed state):

```
MCP_OAUTH_ENABLED=true
```

- Set it in Lovable Cloud project settings/secrets, then **redeploy** (Workers reads `process.env` at runtime; a new value needs a fresh deploy to take effect).
- `GSC_TOKEN_ENCRYPTION_KEY` is unrelated (GSC sync only). No `GOOGLE_*` needed for this connector.

## 2. Pre-flight checklist (before enabling the flag)

- [ ] Apply `20260707130000_oauth_server.sql` to prod DB.
- [ ] Apply `20260707140000_oauth_authorization_requests.sql`.
- [ ] Apply `20260707120000_mcp_connections.sql` (so the legacy-token comparison test is valid).
- [ ] Verify the 6 OAuth tables + `mcp_connections` exist and RLS is enabled with no anon/authenticated policies.
- [ ] Decide the **test window** (short; owner-only) and announce nothing user-facing.
- [ ] Confirm rollback is one env change (§5).
- [ ] Pick **test account**: the owner Milo login (`rafal.andersen@gmail.com`), already logged into `milogrowth.com` in the test browser so the consent page renders without a login bounce.
- [ ] Pick **test workspace/project**: an existing project with data (an audit run, ≥1 content asset with a Milo Score, and ideally a GSC import) so tool responses are non-empty.
- [ ] Acknowledge **known limitations** for this test: no refresh tokens (access token lives 1h, then re-auth), no `/revoke` endpoint, no connected-apps UI, no write scopes.

**Expected endpoints — flag OFF (today):** all five OAuth surfaces (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`, `/api/oauth/register`, `/api/oauth/authorize`, `/api/oauth/token`) → **404**; `/api/mcp` unauth → **401 plain `Bearer`**; `GET /api/mcp` → 200.

**Expected endpoints — flag ON:** the two `.well-known` docs → **200 JSON**; `/api/oauth/register` → **201** (public client); `/api/oauth/authorize` → **302** to `/app/connect?req=…` (valid) or the redirect_uri with an error; `/api/oauth/token` → **200** token JSON (valid code) or OAuth error; `/api/mcp` unauth → **401 with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`**.

## 3. Flag-on smoke test (scriptable, before touching Claude.ai)

Run these from a terminal once the flag is on + migrations applied. They exercise the whole server side without a browser except where noted.

1. **PRM:** `GET /.well-known/oauth-protected-resource` → 200; JSON `resource` = `https://milogrowth.com/api/mcp`, `authorization_servers` = `["https://milogrowth.com"]`, `scopes_supported` lists the 4 reads + `offline_access`.
2. **AS metadata:** `GET /.well-known/oauth-authorization-server` → 200; `issuer` = `https://milogrowth.com`, endpoints point to `/api/oauth/{authorize,token,register,revoke}`, `code_challenge_methods_supported` = `["S256"]`, `token_endpoint_auth_methods_supported` = `["none"]`.
3. **DCR:** `POST /api/oauth/register` with `{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"]}` → 201; capture `client_id`; assert **no** `client_secret`.
4. **PKCE pair:** generate `code_verifier` + `code_challenge = BASE64URL(SHA256(verifier))`.
5. **Authorize (browser, logged in):** open `GET /api/oauth/authorize?response_type=code&client_id=…&redirect_uri=https://claude.ai/api/mcp/auth_callback&scope=milo.projects.read%20milo.content.read%20milo.insights.read%20milo.authority.read%20offline_access&code_challenge=…&code_challenge_method=S256&resource=https://milogrowth.com/api/mcp&state=xyz` → should **302 → `/app/connect?req=…`**.
6. **Consent page:** `/app/connect?req=…` shows title "Connect Milo Growth to Claude", read-only badge, the scope list, and the can/cannot lists. Click **Allow** → browser redirects to `redirect_uri?code=…&state=xyz`. Capture the `code`.
7. **Token:** `POST /api/oauth/token` (form-encoded) `grant_type=authorization_code&client_id=…&code=…&redirect_uri=…&code_verifier=…&resource=https://milogrowth.com/api/mcp` → 200; assert `token_type=Bearer`, `expires_in=3600`, `scope` present, **no `refresh_token`**. Capture `access_token`.
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
- [ ] After ~1 hour the access token expires; with **no refresh token**, Claude must re-run consent. If Claude instead attempts a `refresh_token` grant, `/token` returns `unsupported_grant_type` → connection drops until re-auth (see §6 risk).
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
- **Refresh tokens / re-auth.** `offline_access` is advertised and requested, but no refresh token is issued and the `refresh_token` grant isn't implemented — connections die at 1h. Either implement refresh (rotation + reuse detection, per blueprint) **or** stop advertising `refresh_token`/`offline_access` in AS metadata so Claude doesn't expect it. (Currently a **metadata/behavior mismatch**.)
- **`/api/oauth/revoke`** (RFC 7009) — users/Claude expect to disconnect; only the developer-token revoke exists today.
- **Connected-apps UI** — no way for a user to see or revoke an active Claude grant from Milo.
- **Apply migrations** as a first-class deploy step (they don't auto-apply from the repo).

**Compatibility risk to verify in E2E (could become a blocker)**
- **`resource` parameter requirement.** Authorize + token currently **require** `resource == https://milogrowth.com/api/mcp`. If the current Claude.ai client omits the RFC 8707 `resource` param, `/authorize` returns `invalid_target` and consent never appears. If E2E shows this, relax to "if present, must match; if absent, default to the MCP URL." This is the single most likely cause of a failed first connection.

**Should-fix**
- **Rate limiting** on `/register`, `/authorize`, `/token`, `/api/mcp` (DCR abuse, token brute-force).
- **Audit log surfacing / last-used display** (rows are written; no UI/owner-QA view yet).
- **Docs + user-facing setup copy** — a "Add Milo to Claude.ai" guide + the connector-card copy distinguishing the OAuth connector from the developer token.
- **Project-level scoping** (fast-follow) — grants are workspace-wide read; add the project selector from the blueprint.

---

### Bottom line
The server-side OAuth flow is code-complete through Phase 4 and safely flag-gated, but it is **not testable in production yet**: the OAuth tables are unapplied, and there are two behavioral gaps that will surface immediately in a Claude.ai E2E — the **`resource`-required** compatibility risk and the **advertised-but-missing refresh token**. Recommended order: (1) apply the migrations, (2) run the §3 scripted smoke test, (3) only then attempt the Claude.ai §4 flow, watching those two risks.
