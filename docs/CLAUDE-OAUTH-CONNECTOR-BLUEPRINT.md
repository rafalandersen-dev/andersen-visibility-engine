# Milo Growth → Claude.ai Custom Connector (Remote MCP + OAuth) — Implementation Blueprint

> Status: **approved, phased execution only.** This document is the discovery
> output + build blueprint. No runtime code changes accompany it.
>
> **Confirmed decisions**
> - Public base URL: `https://milogrowth.com`
> - v1 Claude.ai connector stays **read-only**.
> - v1 OAuth grant may be **workspace-wide read** access.
> - **Project-level selector is a fast follow**, not a v1 blocker.
> - Existing **developer-token MCP connector must remain backward compatible**
>   for Claude Code / Claude Desktop.
> - Full OAuth connector must be gated behind **`MCP_OAUTH_ENABLED`**.
> - **No write scopes, no publishing, no billing/settings access** in v1.
>
> **Reviewer assessment:** Technical 8.5/10 · Security 8/10 · Product 7/10 ·
> Implementation readiness: approved, **phased only** (do Phase 1 first —
> metadata, schema, safe discovery headers behind the flag — then separate
> reviewable phases for endpoints, consent UI, token exchange/refresh, E2E,
> hardening). Do not build everything in one sprint.

## 0. Executive summary

Milo already has a working **resource server** (`/api/mcp`, read-only tools, bearer auth). What's missing is an **OAuth 2.1 Authorization Server (AS)** that Claude.ai can discover and drive, plus the metadata documents and a consent screen. This is additive — MCP v1 developer tokens keep working unchanged.

**The four hard requirements Claude.ai imposes** (MCP auth spec, 2025-06-18):
1. **Protected Resource Metadata** (RFC 9728) at `/.well-known/oauth-protected-resource`, and `/api/mcp` 401s must carry `WWW-Authenticate: Bearer resource_metadata="…"`.
2. **Authorization Server Metadata** (RFC 8414) at `/.well-known/oauth-authorization-server`.
3. **Dynamic Client Registration** (RFC 7591) — Claude registers itself; we cannot pre-issue it a client_id.
4. **Authorization Code + PKCE (S256)**, public client (no client secret), with **resource indicators** (RFC 8707) binding tokens to the MCP URL.

**The one architectural pivot:** because the session is in `localStorage`, the server `/authorize` endpoint redirects to a **client-side consent page under `_authenticated`** (`/app/connect`), which mints the auth code via an authenticated server function. Login/consent then work with Milo's existing Supabase auth with zero changes to how users log in.

## 1. Current-state inventory (verified)

| Area | Current |
|---|---|
| Resource endpoint | `src/routes/api.mcp.ts` — JSON-RPC POST, `GET` info, `OPTIONS` CORS; Bearer→`resolveUser`→`handleMcpMessage`; 401 with plain `WWW-Authenticate: Bearer` (no `resource_metadata`). |
| MCP core | `src/lib/mcp.server.ts` — token gen/hash (SHA-256), `resolveUser`, `loadWorkspace`, 8 read-only tools, JSON-RPC dispatch (`initialize`/`tools/list`/`tools/call`/`ping`). |
| Token mgmt fns | `src/lib/mcp.functions.ts` — `getMcpStatusFn`/`createMcpTokenFn`/`revokeMcpTokenFn`. |
| Table | `mcp_connections` (service-role only: `user_id`, `token_hash`, `label`, `last_used_at`, `revoked_at`). |
| UI | `ClaudeConnectorCard.tsx` in Project Setup (generate/copy/revoke, CLI+Desktop snippets). |
| Docs | `docs/CLAUDE-MCP-CONNECTOR-SETUP.md`. |
| Auth model | Supabase JWT; `requireSupabaseAuth` middleware → `context.userId` from claims. **Session in localStorage** (`src/integrations/supabase/client.ts:51`) → server routes can't read it; only server *functions* (bearer header) can. |
| Runtime | Cloudflare Workers (nitro); WebCrypto (`crypto.subtle`) available; `supabaseAdmin` service-role client via lazy import. |
| Scoping | Every tool scopes to the resolved user's workspace blob. No per-scope or per-project restriction yet. |

## 2. Gap analysis — v1 vs full connector

| Capability | Now | Needed | Gap |
|---|---|---|---|
| Protected Resource Metadata | ❌ | RFC 9728 doc + `WWW-Authenticate` pointer | **Build** |
| AS Metadata | ❌ | RFC 8414 doc | **Build** |
| Dynamic Client Registration | ❌ | RFC 7591 `POST /register` | **Build** |
| `/authorize` endpoint | ❌ | validate params → consent | **Build** |
| Consent screen | ❌ | client page `/app/connect` | **Build** |
| `/token` endpoint | ❌ | code→token, refresh, PKCE verify | **Build** |
| PKCE (S256) | ❌ | required | **Build** |
| Redirect URI validation | ❌ | exact-match allowlist per client | **Build** |
| Access-token validation | Static token hash lookup | OAuth token hash lookup + scope + audience + expiry | **Extend** |
| Refresh tokens | ❌ | rotating, hashed, reuse-detection | **Build** |
| Revocation | Developer token only | RFC 7009 `/revoke` + in-app "connected apps" revoke | **Build** |
| Scopes | ❌ (implicit full read) | read-only scope set + per-tool enforcement | **Build** |
| Consent records / connected apps | ❌ | table + UI list | **Build** |
| Audit logging | `last_used_at` only | `oauth_audit_log` | **Build** |
| Rate limiting | ❌ | per-IP/token on auth + mcp | **Build (Phase 6)** |
| Backward compat | n/a | keep developer tokens | **Preserve** |

## 3. Proposed data model (new migrations, all service-role-only, RLS on, no client policies)

**`oauth_clients`** (DCR registrations)
`id uuid pk`, `client_id text unique`, `client_secret_hash text null` (public clients: null), `client_name text`, `redirect_uris text[]`, `grant_types text[]`, `response_types text[]`, `token_endpoint_auth_method text` (`none`), `scope text`, `software_id text null`, `metadata jsonb`, `created_at`, `last_used_at`, `disabled_at null`.

**`oauth_authorization_codes`** (short-lived, ~5 min)
`code_hash text unique`, `client_id text`, `user_id uuid`, `redirect_uri text`, `scope text`, `code_challenge text`, `code_challenge_method text` (`S256`), `resource text`, `nonce text null`, `expires_at`, `consumed_at null`, `created_at`.

**`oauth_tokens`** (one row per active grant/connection)
`id uuid pk`, `user_id uuid`, `client_id text`, `access_token_hash text unique`, `refresh_token_hash text unique null`, `refresh_family_id uuid` (rotation lineage), `scope text`, `resource text`, `access_expires_at`, `refresh_expires_at null`, `created_at`, `last_used_at null`, `revoked_at null`, `label text null`.

**`oauth_consents`** (connected-apps + optional re-consent skip)
`id uuid pk`, `user_id uuid`, `client_id text`, `scope text`, `granted_at`, `revoked_at null`. Unique `(user_id, client_id)` active.

**`oauth_audit_log`** (no secrets, hashes/ids only)
`id uuid pk`, `user_id uuid null`, `client_id text null`, `event text` (`register|authorize|consent_granted|consent_denied|token_issued|token_refreshed|token_reuse_detected|revoked|mcp_call|mcp_denied`), `detail jsonb`, `created_at`.

Notes: `mcp_connections` (developer tokens) is **untouched**. Token secrets are never stored — only SHA-256 hashes (reuse `sha256Hex`). Everything indexed on the hash columns + `(user_id, created_at)`.

## 4. Proposed OAuth scopes (v1, read-only)

Small, human-legible set. Umbrella-friendly (Claude requests all; consent shows the breakdown).

| Scope | Grants | Consent label |
|---|---|---|
| `milo.projects.read` | `list_projects`, `get_project_brief` | "See your projects and brand profile" |
| `milo.content.read` | `list_opportunities`, `list_content`, `get_content` | "Read your opportunities, drafts and Milo Scores" |
| `milo.insights.read` | `get_latest_audit`, `get_gsc_summary` | "Read your audits and Search Console summaries" |
| `milo.authority.read` | `list_authority_opportunities` | "Read your authority opportunities" |
| `offline_access` | issue a refresh token | "Stay connected without re-approving each time" |

No write scopes exist in v1 (`milo.*.write` reserved, not issued). Default requested set = the four reads + `offline_access`.

## 5. Consent UX (`/app/connect`, client-rendered, authenticated)

- **Flow:** `/authorize` (server) validates the request, stores a pending-request row, and `302 → /app/connect?req=<id>`. The `_authenticated` layout forces login if needed (returnTo preserved), so an unauthenticated user logs in and lands back on consent.
- **Title:** "Connect Milo Growth to Claude"
- **Body:** "Claude (added as a connector) is requesting read-only access to your Milo Growth workspace."
- **Claude will be able to:** bulleted scope labels (from §4) actually present in the request.
- **Claude will NOT be able to:** "create, edit, publish or delete content · change settings or billing · access payment details · act on your behalf." (Reinforces the read-only product rule.)
- **Account shown:** logged-in email + (optional, Phase-later) a **project selector** to scope the grant to specific projects. v1 recommendation: grant is workspace-wide read; ship the selector as a fast follow to reduce scope-creep risk.
- **Actions:** **Approve** (calls `approveOAuthConsentFn` → returns `redirect_uri?code=…&state=…`, page navigates there) · **Cancel** (→ `redirect_uri?error=access_denied&state=…`).
- **Error states:** invalid/expired request id, unknown client, redirect_uri mismatch, request replayed → friendly page, no redirect, "Start again from Claude."

## 6. `/api/mcp` bearer validation (OAuth + legacy)

Order of checks on each call:
1. Extract `Bearer`. If absent → **401** with `WWW-Authenticate: Bearer resource_metadata="https://milogrowth.com/.well-known/oauth-protected-resource"` (this header is what makes Claude start the OAuth dance).
2. Hash token; look up **`oauth_tokens`** by `access_token_hash`, not revoked, `access_expires_at > now`. If found → resolve `user_id`, `scope`, `resource`.
   - Validate **audience**: `resource` matches the MCP URL; else 401.
3. Else look up **`mcp_connections`** (legacy developer token). If found → user_id, implicit full-read scope.
4. Else → 401 (generic; **never reveal** whether a token/client/user exists — uniform message + timing-insensitive path).
5. In `tools/call`, map tool→required scope (§4) and **reject with JSON-RPC error** if the granted scope set lacks it. `tools/list` filters to callable tools for that scope set.
6. Update `last_used_at` best-effort; write `mcp_call`/`mcp_denied` to audit log (no token material).
7. Expired-but-refreshable → 401 `invalid_token` so Claude refreshes.

## 7. Backward compatibility

- **Two clearly separated connectors in the UI:**
  - **"Claude.ai connector (OAuth)"** — new. Shows connected apps (client name, scopes, connected date, last used) with **Revoke**. No token copying.
  - **"Developer token (Claude Code / Desktop)"** — the existing card, unchanged.
- `/api/mcp` accepts **both** token types (OAuth first, legacy fallback). Existing v1 users are unaffected.
- New OAuth behavior is gated behind an env flag `MCP_OAUTH_ENABLED` (default off until Phase 5 passes). When off: metadata endpoints return 404 and only developer tokens work — i.e., today's behavior.
- Docs: extend `CLAUDE-MCP-CONNECTOR-SETUP.md` with a "Claude.ai (one-click)" section; keep the developer-token section.

## 8. Implementation phases

- **Phase 1 — Metadata + schema.** Migrations (§3); `/.well-known/oauth-protected-resource`; `/.well-known/oauth-authorization-server`; add `resource_metadata` to `/api/mcp` 401. (Safe, inert without endpoints. **Do this phase first.**)
- **Phase 2 — Endpoints.** `POST /api/oauth/register` (DCR), `GET /api/oauth/authorize`, `POST /api/oauth/token` (code + refresh + PKCE), `POST /api/oauth/revoke`. Server helpers `oauth.server.ts` (hash, PKCE verify, code/token issue+rotate, redirect_uri validation).
- **Phase 3 — Consent UI.** `/app/connect` page + `approveOAuthConsentFn`/`denyOAuthConsentFn`; login returnTo handling.
- **Phase 4 — MCP token validation.** Extend `resolveUser`→`resolveGrant` (OAuth+legacy), per-tool scope enforcement, audit logging.
- **Phase 5 — Claude.ai E2E.** Deploy with flag on; add connector in Claude.ai; consent; tool calls; refresh; revoke. (Requires the owner to drive Claude.ai — non-interactive for the coding agent.)
- **Phase 6 — Hardening.** Rate limits, audit dashboard/owner QA, refresh-reuse detection, optional project selector, docs/analytics, security review.

## 9. Risks & blockers

- **Claude.ai compatibility (highest):** exact metadata fields, DCR requirement, and PKCE/resource handling must match Claude's current expectations. Mitigation: build to the published MCP auth spec, then **verify empirically in Phase 5** before flag-on; keep everything behind `MCP_OAUTH_ENABLED`.
- **localStorage session:** server `/authorize` can't identify the user → **must** bounce to `/app/connect`. Mitigation: designed in (§5). Preserve `req` across login.
- **Open redirect / token exfiltration:** strict exact-match `redirect_uri` per registered client; PKCE mandatory; `state` echoed; codes single-use + 5-min TTL + bound to client+redirect+challenge+resource.
- **Refresh-token theft:** rotation with **reuse detection** (reused refresh → revoke whole `refresh_family_id`); short access TTL (1h), refresh TTL (~30d).
- **DCR abuse:** unbounded client registration → rate-limit `/register`, store minimal data, prune stale/disabled clients; consider a soft cap per IP/day.
- **Token/workspace leakage:** only hashes stored; new tables service-role-only (no RLS policies → invisible to client); uniform 401s; never log tokens/codes/verifiers.
- **Supabase/RLS:** follow the established service-role-only pattern; audit that no `authenticated` role can select these tables.
- **Deployment/config:** needs `MCP_OAUTH_ENABLED`, a signing/pepper secret (`OAUTH_TOKEN_PEPPER` for hashing), correct public base URL; migrations applied (same open item as GSC/MCP tables). Cloudflare Workers: prefer WebCrypto + DB over any Node-only libs.
- **Non-interactive testing limit:** Phase 5 E2E can't be run by the coding agent; provide a scripted PKCE curl harness for everything up to the browser consent step, and a manual Claude.ai checklist.

## 10. Final blueprint

**Files to create**
- `supabase/migrations/<ts>_oauth_server.sql` — the 5 tables (§3).
- `src/lib/oauth.server.ts` — hashing/pepper, PKCE S256 verify, code issue/consume, token issue/rotate/revoke, redirect_uri validation, metadata builders, DCR.
- `src/lib/oauth.functions.ts` — `approveOAuthConsentFn`, `denyOAuthConsentFn`, `getConnectedAppsFn`, `revokeConnectedAppFn` (auth-gated; lazy-import server module).
- `src/routes/[.]well-known.oauth-protected-resource.ts` — PRM (GET, public).
- `src/routes/[.]well-known.oauth-authorization-server.ts` — AS metadata (GET, public).
- `src/routes/api.oauth.register.ts` — DCR (POST).
- `src/routes/api.oauth.authorize.ts` — authorize (GET → redirect to consent).
- `src/routes/api.oauth.token.ts` — token + refresh (POST).
- `src/routes/api.oauth.revoke.ts` — RFC 7009 (POST).
- `src/routes/_authenticated/app.connect.tsx` — consent page.
- `docs/CLAUDE-OAUTH-CONNECTOR.md` — setup + security + E2E checklist.

**Files to modify**
- `src/routes/api.mcp.ts` — 401 `resource_metadata`; accept OAuth tokens.
- `src/lib/mcp.server.ts` — `resolveGrant` (OAuth+legacy), per-tool `requiredScope`, scope-filtered `tools/list`, audit hooks.
- `src/components/ClaudeConnectorCard.tsx` — add "Claude.ai connector (OAuth)" + connected-apps list/revoke; relabel developer section.
- `src/i18n/{en,pl,sv,da}.ts` — consent + connected-apps + scope-label keys.
- (maybe) `src/routes/auth.tsx` — ensure `returnTo` supports `/app/connect?req=…`.

**Endpoint list**
`GET /.well-known/oauth-protected-resource` · `GET /.well-known/oauth-authorization-server` · `POST /api/oauth/register` · `GET /api/oauth/authorize` · `POST /api/oauth/token` · `POST /api/oauth/revoke` · `GET /app/connect` (consent UI) · `POST /api/mcp` (extended).

**UI components**
Consent page (`/app/connect`); Connected-apps list + revoke in the connector card; scope-label i18n; optional owner-QA rows (OAuth clients, active grants).

**Test plan**
- *Unit:* PKCE S256 verify (match/mismatch), token hashing+pepper determinism, redirect_uri exact-match (incl. sub-path/scheme attacks), auth-code single-use + expiry, refresh rotation + **reuse→family revoke**, scope→tool enforcement, `tools/list` scope filtering, metadata JSON shape.
- *Integration (scripted):* curl PRM + AS metadata; DCR register; construct PKCE; hit `/authorize` (assert redirect to `/app/connect`); simulate consent via server fn; `/token` exchange; authed `/api/mcp` `tools/list`+`tools/call`; refresh; revoke → subsequent 401.
- *Live (Phase 5, user-driven):* add connector in Claude.ai → discovery → login → consent → approve → tool calls succeed → revoke in Milo → Claude loses access.
- *Security:* no token/code/verifier in logs; uniform 401s; new tables unreadable by `authenticated` role.

**Acceptance criteria**
- Claude.ai adds Milo via URL, completes OAuth, and calls read-only tools with an issued access token.
- Access tokens are audience-bound, scoped, expiring; refresh works with rotation + reuse detection.
- Consent screen lists exact scopes and the "cannot do" list; approve/cancel both behave.
- Revoking a connected app in Milo immediately blocks Claude.
- Developer-token connector (MCP v1) still works unchanged.
- No write/publish/billing capability exposed. No secrets stored in plaintext or logged.

**Rollback plan**
- Everything gated by `MCP_OAUTH_ENABLED`. Off → metadata endpoints 404, `/api/mcp` OAuth branch inert, only developer tokens work (identical to today).
- Migrations are additive (new tables only); no changes to `mcp_connections` or existing tables → rollback = flag off and/or `git revert`; tables can be dropped safely since nothing else references them.
- Staged: deploy flag-off → verify no regression → flag-on for owner-only test → general.

## 11. Open items before Phase 1
1. **Go/no-go** confirmed. Workspace-wide read grant for v1; project selector is a fast follow.
2. Public base URL confirmed: `https://milogrowth.com`.
3. **Phase 5 live E2E** must be run by the owner in Claude.ai; migrations must be applied in the Lovable/Supabase project.
