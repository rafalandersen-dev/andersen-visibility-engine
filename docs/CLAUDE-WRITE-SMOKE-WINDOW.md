# Phase 1A Commit 2 — Owner-Only Write Smoke Runbook (exact)

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document. `MCP_WRITE_TOOLS_ENABLED` remains off until §1.

**Prod baseline:** commit `031d69e`, deploy `8ddc5688-f0df-41b9-ae50-37496fb4a602` · `MCP_OAUTH_ENABLED=true` (never touched) · `MCP_WRITE_TOOLS_ENABLED` unset (flipped on in §1, off in §12) · owner `rev` baseline **11**.

Two code-verified facts that shape the expectations below:

1. **Replays bump `rev` too.** A deduped write still re-saves the (unchanged) workspace blob through `mutateWorkspace`, and the `workspaces_rev_guard` trigger increments unconditionally. So the dedupe proof is **entity count + same entityId + `deduped:true`** — not a frozen rev. Expected rev sequence from baseline 11: **12 → 13 → 14 → 15**.
2. **Flag-off, a write-scoped DCR returns `400 invalid_scope`** — that is the unauthenticated behavioral fingerprint of the flag in both directions (metadata never changes).

**Conventions**

- Shell vars: `BASE=https://milogrowth.com`, `SCRATCH=<session scratchpad dir>`. All curl from the Mac (never python for network — TLS gotcha). Tokens live only in `chmod 600` scratch files; chat/logs show at most the first 12 chars.
- SQL runs via Lovable MCP `query_database`, project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0` (the standalone Supabase MCP points at the wrong project). Owner: `OWNER = 'bcc9d773-2de5-44da-a798-5add38ccf6ae'`.
- `PROJECT_ID` = `synergy` **pending §0 confirmation** — if the Synergy project's real id differs, substitute it everywhere (a wrong id fails safe with `-32011`).
- The live Claude.ai connector (`milo_client_5vzISYkk…`) is **never used, re-consented, or revoked** in this smoke. All calls use the new test client's token.
- Budget: ≤3 `register` calls (limit 10/h/IP), ≤2 `token` calls (15/h/client), 4 write calls (30/h/token) — all far under the limits.

**GLOBAL STOP RULE** — on any ❌ below: stop immediately, capture the response/SQL output, then run §12 (flag off + redeploy + fingerprint). Rollback is always safe: one env change, read connector unaffected, created data persists.

---

## §0 Pre-window baseline (flag still OFF — read-only checks)

**SQL — record every number:**

```sql
-- 0.1 owner rev (expect 11; if drifted, record the new number as REV0)
SELECT rev FROM workspaces WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae';

-- 0.2 entity counts (tasks likely 0 — the array may not exist yet)
SELECT jsonb_array_length(coalesce(data->'tasks','[]'::jsonb))        AS tasks,
       jsonb_array_length(coalesce(data->'opportunities','[]'::jsonb)) AS opportunities
FROM workspaces WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae';

-- 0.3 confirm the Synergy project id (sets PROJECT_ID; STOP-and-substitute if ≠ 'synergy')
SELECT p->>'id' AS id, p->>'businessName' AS name
FROM workspaces, jsonb_array_elements(data->'projects') AS p
WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae';

-- 0.4 OAuth table counts (mcp_write MUST be 0 — no write has ever run)
SELECT (SELECT count(*) FROM oauth_clients)  AS clients,
       (SELECT count(*) FROM oauth_tokens)   AS tokens,
       (SELECT count(*) FROM oauth_consents) AS consents,
       (SELECT count(*) FROM oauth_audit_log WHERE event = 'mcp_write') AS mcp_write_rows;

-- 0.5 live Claude.ai connector status (scope must contain NO ".write"; record family/live counts)
SELECT client_id, client_name, scope FROM oauth_clients WHERE client_id LIKE 'milo_client_5vzISYkk%';
SELECT refresh_family_id, count(*) AS rows, count(*) FILTER (WHERE revoked_at IS NULL) AS live
FROM oauth_tokens WHERE client_id LIKE 'milo_client_5vzISYkk%' GROUP BY refresh_family_id;
```

**curl — confirm flag OFF + metadata write-free:**

```bash
# 0.6 PRM: 200, scopes_supported = exactly the 4 read scopes
curl -s $BASE/.well-known/oauth-protected-resource
# 0.7 AS metadata: 200, scopes_supported = 4 reads + offline_access; grep both docs for "write"/"publish" → nothing
curl -s $BASE/.well-known/oauth-authorization-server
# 0.8 write-flag fingerprint, expect 400 {"error":"invalid_scope"} — proves flag OFF, creates no client row
curl -s -X POST $BASE/api/oauth/register -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"client_name":"Write Flag Probe","scope":"milo.tasks.write milo.projects.write"}' \
  -w '\nHTTP %{http_code}\n'
```

✅ Gate to proceed: 0.4 `mcp_write_rows` = 0 · 0.5 Claude scope read-only · 0.8 returns `invalid_scope`. (0.6–0.8 were already verified 2026-07-10; re-run at window start.)

## §1 Flag on (owner action)

Lovable Cloud → set `MCP_WRITE_TOOLS_ENABLED=true` → **redeploy** (env reads happen at runtime but need a fresh deploy). Note the new deployment id.

## §2 Flag-on fingerprint

```bash
curl -s $BASE/.well-known/oauth-protected-resource      # 200 — STILL exactly 4 read scopes
curl -s $BASE/.well-known/oauth-authorization-server    # 200 — STILL 4 reads + offline_access only
curl -s -o /dev/null -w '%{http_code}\n' $BASE/         # 200 public page
curl -s -D - -o /dev/null -X POST $BASE/api/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'   # 401 + WWW-Authenticate: Bearer resource_metadata="…"
```

❌ STOP if any `.write`/`publish` string appears in either metadata doc — that breaches the never-advertise design (writes would become Claude.ai's default ask).

## §3 Scripted DCR — explicitly write-scoped test client

```bash
curl -s -X POST $BASE/api/oauth/register -H 'Content-Type: application/json' -d '{
  "redirect_uris":["https://claude.ai/api/mcp/auth_callback"],
  "client_name":"Milo Write Smoke Test",
  "scope":"milo.projects.read milo.content.read milo.insights.read milo.authority.read offline_access milo.tasks.write milo.projects.write"
}' -w '\nHTTP %{http_code}\n' | tee $SCRATCH/dcr.json
```

**Expect:** HTTP **201**; `client_id` present (save as `CLIENT_ID`); **no `client_secret`**; echoed `scope` contains **both** write scopes. ❌ STOP on `invalid_scope` (the §1 deploy didn't take — the flag isn't live).

**Optional default-scope proof** (safe; creates one extra evidence client, no token/consent):

```bash
curl -s -X POST $BASE/api/oauth/register -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"client_name":"Milo Write Smoke Default-Scope Proof"}'
# Expect 201 with scope = the 4 reads + offline_access ONLY — writes never enter by default, even flag-on.
```

## §4 Authorization + token

```bash
# 4.1 PKCE + state
VERIFIER=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 64)
CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '=\n')
STATE=$(openssl rand -hex 12)

# 4.2 authorize URL (print it; owner opens it in the browser already logged into milogrowth.com)
echo "$BASE/api/oauth/authorize?response_type=code&client_id=$CLIENT_ID&redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback&scope=milo.projects.read%20milo.content.read%20milo.insights.read%20milo.authority.read%20offline_access%20milo.tasks.write%20milo.projects.write&code_challenge=$CHALLENGE&code_challenge_method=S256&state=$STATE"
```

**4.3 Consent screen (`/app/connect?req=…`) — verify + 📸 screenshot (first live render):**

- [ ] Badge: **"Read & write access"** (not read-only)
- [ ] Normal read + offline_access rows present
- [ ] Amber **"Write permissions"** section with the warning: *"This connection will be able to create and edit content, tasks and project recommendations in your Milo workspace. It can never publish or delete anything."*
- [ ] Write rows for the tasks + project-recommendation scopes
- [ ] Cannot-list **drops** "Create content"/"Edit content", **keeps** Publish/Delete/Settings/Billing

❌ STOP if the amber section is missing or the badge still says read-only.

**4.4 Allow → callback.** The browser lands on `https://claude.ai/api/mcp/auth_callback?code=…&state=…` (claude.ai shows an error page — expected, there's no real Claude session; the URL bar is what matters). Owner copies the **full URL** and pastes it. Extract `code`; ❌ STOP if `state` ≠ `$STATE`.

```bash
# 4.5 token exchange — response goes to scratch, never to chat
curl -s -X POST $BASE/api/oauth/token -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "code=$CODE" --data-urlencode 'redirect_uri=https://claude.ai/api/mcp/auth_callback' \
  --data-urlencode "code_verifier=$VERIFIER" > $SCRATCH/token.json && chmod 600 $SCRATCH/token.json
python3 - <<'EOF'
import json; d=json.load(open("token.json"))   # run inside $SCRATCH; local python is fine (only network TLS is broken)
print("access:", d["access_token"][:12]+"…", "refresh:", ("refresh_token" in d), "expires_in:", d["expires_in"])
print("scope:", d["scope"])
EOF
```

**Expect:** `token_type=Bearer`, `expires_in=3600`, `refresh_token` present, `scope` = all 7 requested (both writes + offline_access). Export `AT` from the file for the calls below; never echo it.

## §5 tools/list = 10

```bash
curl -s -X POST $BASE/api/mcp -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**Expect exactly 10 tools:** `list_projects, get_project_brief, list_opportunities, list_content, get_content, get_latest_audit, get_gsc_summary, list_authority_opportunities` + `create_growth_task, create_project_recommendation` — the two writes carrying `annotations {readOnlyHint:false, destructiveHint:false, idempotentHint:false}`. ❌ STOP if ≠ 10. (This smoke never touches the live Claude.ai connector — every call here uses `$AT`.)

## §6 create_growth_task

```bash
curl -s -X POST $BASE/api/mcp -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{
 "jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"create_growth_task","arguments":{
  "projectId":"synergy","title":"Write smoke task — safe to keep",
  "description":"Created by Phase 1A write smoke test.","priority":"Low",
  "requestId":"phase1a-write-smoke-task-001"}}}'
```

**Expect:** result text = `{"taskId":"<8 chars>","projectId":"synergy","status":"open"}` — no `deduped`. Record `TASK_ID`. ❌ STOP on `-32011` (wrong PROJECT_ID — recheck §0.3), `-32602` (flag not live), `-32002` (scope missing from token).

```sql
-- 6.1 exactly one task, correct shape
SELECT t->>'id' AS id, t->>'status' AS status, t->>'origin' AS origin, t->>'projectId' AS project,
       t->>'priority' AS priority, (t->>'createdAt' IS NOT NULL) AS has_created, (t->>'updatedAt' IS NOT NULL) AS has_updated
FROM workspaces, jsonb_array_elements(data->'tasks') t
WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae' AND t->>'requestId' = 'phase1a-write-smoke-task-001';
-- expect 1 row: status open · origin claude · project synergy · priority Low · both timestamps true
-- 6.2 rev
SELECT rev FROM workspaces WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae';  -- expect 12
```

## §7 Idempotent replay — task

Re-run the **§6 curl verbatim** (only change `"id":11`).

**Expect:** same `taskId` = `TASK_ID` + `"deduped":true`. SQL: §6.1 still returns **exactly 1 row**; total `tasks` count +1 vs §0.2. **Rev = 13** — the replay bumps rev even though nothing was added (the write layer re-saves the unchanged blob; the trigger increments unconditionally). Dedupe is proven by the count and the id, not by rev. ❌ STOP if a second row exists or the id differs.

## §8 create_project_recommendation

```bash
curl -s -X POST $BASE/api/mcp -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{
 "jsonrpc":"2.0","id":12,"method":"tools/call","params":{"name":"create_project_recommendation","arguments":{
  "projectId":"synergy","title":"Write smoke recommendation — safe to keep",
  "rationale":"Created by Phase 1A write smoke test.","priority":"Low",
  "requestId":"phase1a-write-smoke-rec-001"}}}'
```

**Expect:** `{"opportunityId":"<8 chars>","projectId":"synergy","status":"Linked"}`. Record `OPP_ID`.

```sql
SELECT o->>'id' AS id, o->>'status' AS status, o->>'source' AS source, o->>'projectId' AS project,
       o->>'businessValue' AS rationale, o->>'language' AS language, o->>'contentType' AS content_type
FROM workspaces, jsonb_array_elements(data->'opportunities') o
WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae' AND o->>'requestId' = 'phase1a-write-smoke-rec-001';
-- expect 1 row: status Linked · source claude · project synergy ·
-- rationale = "Created by Phase 1A write smoke test." · contentType "Blog Article" (default) · language from the project
SELECT rev FROM workspaces WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae';  -- expect 14
```

(`Linked` matters: opportunity regeneration replaces only `New`, so this survives.)

## §9 Idempotent replay — recommendation

Re-run **§8 verbatim** (`"id":13`). **Expect:** same `opportunityId` + `deduped:true`; SQL still exactly 1 row; **rev = 15** (same replay-bump note as §7). ❌ STOP on duplicate.

## §10 Audit verification

```sql
-- 10.1 the four mcp_write rows, oldest first
SELECT client_id, detail, created_at FROM oauth_audit_log WHERE event = 'mcp_write' ORDER BY created_at;
```

**Expect exactly 4 rows**, `client_id = CLIENT_ID`, `detail` keys **only** from: `tool, projectId, action, fieldsChanged, requestId, entityIds, deduped, ok`:

| row | tool | fieldsChanged (sorted names only) | deduped | ok |
|---|---|---|---|---|
| 1 | create_growth_task | `["description","priority","title"]` | — | true |
| 2 | create_growth_task | same | true | true |
| 3 | create_project_recommendation | `["priority","rationale","title"]` | — | true |
| 4 | create_project_recommendation | same | true | true |

```sql
-- 10.2 planted-content leak probe → MUST be 0
SELECT count(*) FROM oauth_audit_log
WHERE detail::text ILIKE '%safe to keep%'
   OR detail::text ILIKE '%Created by Phase 1A write smoke test%'
   OR detail::text ILIKE '%Write smoke task%'
   OR detail::text ILIKE '%Write smoke recommendation%';

-- 10.3 token/secret material in mcp_write rows → MUST be 0
SELECT count(*) FROM oauth_audit_log WHERE event = 'mcp_write'
  AND (detail::text LIKE '%milo_at_%' OR detail::text LIKE '%milo_rt_%'
       OR detail::text ILIKE '%hash%' OR detail::text ILIKE '%secret%' OR detail::text ILIKE '%family%');

-- 10.4 no double-logging: write tools never appear as mcp_call/mcp_denied → MUST be 0
SELECT count(*) FROM oauth_audit_log WHERE event IN ('mcp_call','mcp_denied')
  AND detail->>'tool' IN ('create_growth_task','create_project_recommendation');
```

❌ STOP (and treat as a defect, not a smoke failure) if 10.2–10.4 are nonzero.

## §11 UI spot-check (owner, after §10 SQL is recorded)

- Open milogrowth.com → Synergy project → Opportunities: **"Write smoke recommendation — safe to keep"** visible as Linked. 📸
- The task is DB-only (no tasks UI yet) — expected; §6.1 is authoritative.
- No conflict toast in normal single-tab use.
- Note: an open app session saves the workspace and bumps rev — that's why UI checks come after the rev assertions; later drift above 15 is harmless.

## §12 Flag-off rollback (default end state)

1. Owner unsets `MCP_WRITE_TOOLS_ENABLED` in Lovable → **redeploy**. `MCP_OAUTH_ENABLED` stays `true` — do not touch it.
2. Verify dark state:

```bash
curl -s $BASE/.well-known/oauth-protected-resource     # 200, 4 reads — unchanged (it never changed)
curl -s -X POST $BASE/api/oauth/register -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["https://claude.ai/api/mcp/auth_callback"],"client_name":"Write Flag Probe 2","scope":"milo.tasks.write"}'
# → 400 invalid_scope — fingerprint back to OFF
curl -s -X POST $BASE/api/mcp -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":20,"method":"tools/list"}'
# → 8 read tools ONLY (token still carries write scopes; the tools are simply not in the registry view)
curl -s -X POST $BASE/api/mcp -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":21,"method":"tools/call","params":{"name":"create_growth_task","arguments":{"projectId":"synergy","title":"x"}}}'
# → JSON-RPC error -32602 "Unknown tool: create_growth_task"
```

3. Data persists: re-run §6.1 and §8's SELECTs → both rows still there (created entities are owner data, independent of the flag).
4. Read connector healthy: in a **brand-new** Claude.ai chat — "Use the Milo connector to call list_projects right now, don't answer from memory" → tool call succeeds (a chat that already listed projects answers from context without calling — always force a fresh one).

## §13 Cleanup decision

**Default: preserve everything.** The test client, token, consent, audit rows, task, and opportunity all stay as evidence — consistent with the house rule from Phase 0. Nothing is deleted or revoked in this runbook. The test token expires naturally in 1h; its refresh token is inert for writes while the flag is off. If cleanup is wanted later, produce a separate guarded plan (UI-revoke of the "Milo Write Smoke Test" grant + optional in-app deletion of the two entities) for explicit approval first.

---

**Consolidated stop conditions:** write/publish scopes in any metadata doc (§2/§12) · `invalid_scope` on §3 flag-on DCR · missing amber section or read-only badge at consent · state mismatch at callback · token scope missing a write scope · tools/list ≠ 10 (§5) or ≠ 8 (§12) · any unexpected `-32602/-32002/-32011` on §6/§8 · duplicate entity after replay · rev deviating from 12/13/14/15 without an identified cause (e.g. an open app tab) · any nonzero result in §10.2–10.4 · read connector failing §12.4. Every stop path ends the same way: §12 steps 1–2, then investigate with the captured evidence.
