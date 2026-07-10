# Claude Connector — Phase 1A Write Smoke Window Runbook (owner-only)

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document.

**Target deployment:** `031d69e` (Phase 1A commit 2), deploy `8ddc5688`, bundle `index-BZkiVRJw` · **Flags:** `MCP_OAUTH_ENABLED=true` (live, stays on) · `MCP_WRITE_TOOLS_ENABLED` **unset/off — the subject of this window** · **MCP resource:** `https://milogrowth.com/api/mcp`

This window live-proves the first two MCP write tools — `create_growth_task` (`milo.tasks.write`) and `create_project_recommendation` (`milo.projects.write`) — end-to-end: flag flip → explicitly write-scoped DCR → **first live render of the amber consent write section** → both writes → DB/audit verification → idempotent replay → flag decision. Owner-driven; nothing user-facing is announced.

## 0. ✅ Dark baseline — verified 2026-07-10

Checked against prod at `031d69e` with the write flag off:

- `GET /.well-known/oauth-protected-resource` → **200**, `scopes_supported` = **only the 4 read scopes**. Metadata is write-free **by design and stays write-free even flag-on** (Claude.ai requests everything advertised — advertising writes would make them default). So the flag's fingerprint is **behavior, not metadata** (§3).
- `POST /api/oauth/register` explicitly requesting `milo.tasks.write milo.projects.write` → **400 `invalid_scope`** ("Unknown or disallowed scope(s)"). This is the dark-state fingerprint: flag off = write scopes not issuable, no client row created.
- No migration is needed for this window: the write tools ride the existing OAuth tables plus `workspaces.rev` + `workspaces_rev_guard` (applied and live-verified with Phase 1 foundation). 196 unit tests green at `031d69e`.
- The live Claude.ai connector (`milo_client_5vzISYkk…`, default DCR scope = 4 reads + `offline_access`) had **3 live refresh-family rows at deploy baseline** — grows ~1/rotation, normal.

## 1. What this window must prove (design invariants)

- **Double-gating holds.** Write tools require BOTH the flag AND an explicit write scope. Flag off → invisible in `tools/list`, `tools/call` → `-32602` "Unknown tool". Flag on without the scope → `-32002` "Insufficient scope". Legacy developer tokens (`scopes: null`) **never** get write tools, even flag-on.
- **Dark for existing grants.** The live Claude.ai connector's default-scope token sees **8 read tools even with the flag on** — writes reach only clients that explicitly requested write scopes at DCR/authorize.
- **Consent renders the write section** (never yet seen live): "Read & write access" badge, amber "Write permissions" section, and the cannot-list **drops** "Create content"/"Edit content" (still shows publish/delete/settings/billing).
- **Writes land correctly**: task in the workspace `tasks[]` array, opportunity in `opportunities[]` with `status:"Linked"` / `source:"claude"`, owner `workspaces.rev` bumps, `data` JSONB stays rev-free.
- **Audits are content-clean**: `mcp_write` carries names/ids only — titles, descriptions and rationale never enter the log.
- **Idempotency**: replaying the same `requestId` returns the same entity id + `deduped:true`, no duplicate row.

## 2. Pre-flight checklist

- [ ] Owner (`rafal.andersen@gmail.com`) logged into `milogrowth.com` in the test browser (consent renders without a login bounce).
- [ ] Pick the **target project id** (from the dashboard or a `list_projects` call with any read token) — use a real project so the opportunity inherits its language.
- [ ] Record **baselines** via Lovable `query_database` (project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0` — the standalone Supabase MCP points at the WRONG project):
  - owner workspace `rev` (`SELECT rev FROM workspaces WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae'`),
  - `jsonb_array_length(data->'tasks')` (likely NULL — array may not exist yet) and `jsonb_array_length(data->'opportunities')`,
  - `oauth_audit_log` row count.
- [ ] Confirm rollback is one env change + redeploy (§8).
- [ ] Scripting gotchas: use **curl** (Mac system python3.9 can't TLS-handshake with milogrowth.com); `register`/`token`/`revoke` are **POST-only** — a GET returns the 200 SPA shell, which proves nothing.

## 3. Flag flip + fingerprint

1. Lovable Cloud settings → set **`MCP_WRITE_TOOLS_ENABLED=true`** → **redeploy** (env changes need a fresh deploy).
2. **Fingerprint ON** (unauthenticated, behavioral):

```bash
curl -s -X POST https://milogrowth.com/api/oauth/register \
  -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"],
       "client_name":"Milo Write Smoke Test",
       "scope":"milo.projects.read milo.content.read milo.insights.read milo.authority.read offline_access milo.tasks.write milo.projects.write"}'
```

   → **201** with a `client_id` (capture it; no `client_secret` — public client). Flag off this exact call returns 400 `invalid_scope` (§0).
3. Confirm **metadata unchanged**: PRM `scopes_supported` still the 4 reads; AS metadata `scopes_supported` still reads + `offline_access`. Writes advertised nowhere.

## 4. Scripted OAuth with write scopes

1. PKCE pair: `code_verifier` + `code_challenge = BASE64URL(SHA256(verifier))`.
2. **Authorize (browser, logged in)** — scope explicitly includes both write scopes:

```
https://milogrowth.com/api/oauth/authorize?response_type=code
  &client_id=<client_id>
  &redirect_uri=https://claude.ai/api/mcp/auth_callback
  &scope=milo.projects.read%20milo.content.read%20milo.insights.read%20milo.authority.read%20offline_access%20milo.tasks.write%20milo.projects.write
  &code_challenge=<challenge>&code_challenge_method=S256&state=xyz
```

   → 302 → `/app/connect?req=…`.

## 5. Consent — FIRST live render of the write section 📸

On `/app/connect?req=…` verify and **screenshot**:

- [ ] Badge reads **"Read & write access"** (not the read-only badge).
- [ ] Amber **"Write permissions"** section with the warning: "This connection will be able to create and edit content, tasks and project recommendations in your Milo workspace. It can never publish or delete anything."
- [ ] The "Claude will NOT be able to" list **no longer contains** "Create content" / "Edit content", **still contains** Publish content / Delete anything / Change settings / Access billing.
- [ ] Click **Allow** → redirect to `redirect_uri?code=…&state=xyz`; capture `code`.

## 6. Token + tools/list = 10

```bash
curl -s -X POST https://milogrowth.com/api/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode 'client_id=<client_id>' \
  --data-urlencode 'code=<code>' \
  --data-urlencode 'redirect_uri=https://claude.ai/api/mcp/auth_callback' \
  --data-urlencode 'code_verifier=<verifier>'
```

- [ ] 200; `scope` includes **both write scopes** + `offline_access`; `refresh_token` present (commit 6). Capture `access_token`.
- [ ] `tools/list` with the token → **10 tools** (8 reads + `create_growth_task` + `create_project_recommendation`); each write tool carries `annotations {readOnlyHint:false, destructiveHint:false, idempotentHint:false}`:

```bash
curl -s -X POST https://milogrowth.com/api/mcp \
  -H "Authorization: Bearer <access_token>" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 7. Negative gates (before any write lands)

- [ ] **Default-scope grant stays read-only.** Cleanest: in a **brand-new** Claude.ai chat on the existing live connector, prompt "Use the connector to call tools/list right now, don't answer from memory" → 8 read tools, no writes. (Chats that already listed tools answer from context without calling — always force a fresh call.) Scripted equivalent: DCR **without** a scope field → authorize/token (default = reads + offline_access) → `tools/list` = 8; `tools/call create_growth_task` → **`-32002`**.
- [ ] **Legacy developer token**: `tools/call create_growth_task` → **`-32002`** (null-scope grants never qualify for writes).
- [ ] **Strict validation**: with the write-scoped token, call `create_growth_task` with an unknown field (e.g. `{"projectId":"x","title":"t","evil":1}`) → **`-32010`** `Invalid evil: unknown field`.
- [ ] **Uniform not-found**: bogus `projectId` → **`-32011`** "Not found." (indistinguishable from a foreign user's project) + `mcp_write` audit `ok:false, error:"not_found"`.

## 8. The two writes + idempotent replay

Use a dated idempotency key so replays are deliberate.

1. **create_growth_task**:

```json
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"create_growth_task","arguments":{
  "projectId":"<project>","title":"Write smoke: verify connector task path",
  "description":"Created during the Phase 1A write smoke window.","dueOn":"2026-07-20",
  "priority":"Medium","requestId":"write-smoke-<date>-task-1"}}}
```

   → result `{taskId, projectId, status:"open"}`.
2. **create_project_recommendation**:

```json
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"create_project_recommendation","arguments":{
  "projectId":"<project>","title":"Write smoke: recommended comparison page",
  "rationale":"Smoke-window recommendation via the Claude connector.","contentType":"Comparison",
  "priority":"Medium","requestId":"write-smoke-<date>-rec-1"}}}
```

   → result `{opportunityId, projectId, status:"Linked"}`.
3. **Replay both calls verbatim** → same `taskId`/`opportunityId` + **`deduped:true`**, and DB row counts unchanged.

## 9. Verification (DB + UI + audits)

**DB (Lovable `query_database`):**
- [ ] `data->'tasks'` contains the task: `origin:"claude"`, `status:"open"`, the `requestId`, `createdAt/updatedAt` set — and exactly **one** row despite the replay.
- [ ] `data->'opportunities'` contains the recommendation: `status:"Linked"`, `source:"claude"`, `businessValue` = the rationale, `language` from the project, `searchIntent:"Informational"` — exactly one row.
- [ ] `workspaces.rev` bumped vs the §2 baseline; `data` JSONB contains **no** `rev` key.
- [ ] Other users' workspaces untouched.

**Audit log:**
- [ ] `mcp_write` rows: `{tool, projectId, action:"create", fieldsChanged:[sorted field NAMES only], entityIds:[id], requestId, ok:true}`; replay rows add `deduped:true`.
- [ ] **Content-clean probe**: search `oauth_audit_log.detail` for a distinctive substring of the titles/rationale (e.g. `Write smoke`) → **0 rows**.
- [ ] No generic `mcp_call` rows for the write calls (mcp_write replaces them); `-32002` denials from §7 show as `mcp_denied {tool, requiredScope}`.
- [ ] Rate-limit note: write bucket = **30/h/token** (`-32003` when exceeded). Do **not** burst-test it — 30 real writes would pollute the workspace; the bucket mechanics were burst-proven in commit 5.

**UI (Chrome extension, milogrowth.com allowlisted):**
- [ ] Opportunities page shows the recommendation (Linked, Claude source). Tasks have no UI surface yet — DB check is authoritative.
- [ ] `/app/setup` → Connected apps: the "Milo Write Smoke Test" card shows **amber write pills** for the write scopes. 📸

## 10. Flag decision + rollback (default: OFF)

**Default path — turn it back off:**
1. Unset/`false` **`MCP_WRITE_TOOLS_ENABLED`** in Lovable → **redeploy**.
2. **Dark verification**: write-scope DCR → 400 `invalid_scope` again (§0 fingerprint); the smoke client's still-valid token → `tools/list` = **8** (write scopes on the token but tools invisible); `tools/call create_growth_task` → **`-32602`**.
3. `MCP_OAUTH_ENABLED` stays **on** — the read connector remains live.

**If the decision is leave ON:** writes remain dark for every default-scope grant (including the live Claude.ai connector) because metadata never advertises them; only clients that explicitly request write scopes — i.e. deliberate re-adds/scripted registrations — can get them. Record the decision in the memory file.

**Cleanup:** revoke the smoke client's grant via the Connected-apps UI (kills token + consent → card shows Revoked). Keep all DB evidence rows (house rule — never delete); the created task/opportunity stay in the owner workspace as evidence unless removed by hand in the UI.

## 11. Evidence to capture

- [ ] Screenshots: amber consent write section (§5), Connected-apps write pills (§9).
- [ ] The `client_id`, both entity ids, and the replay `deduped:true` responses.
- [ ] SQL outputs: rev before/after, task + opportunity rows, `mcp_write` audit rows, the 0-row content probe.

---

### Bottom line
Everything below the flag is deployed dark at `031d69e` and unit-proven (196 tests); the §0 fingerprint confirms prod is in the expected dark state. The window itself is ~30 minutes of owner time: flip the flag (§3), run the scripted flow (§4–§8), verify (§9), and flip it back (§10). The two firsts that only a live window can prove are the amber consent render (§5) and a real Claude-issued write landing in the owner workspace under the rev guard (§8–§9).
