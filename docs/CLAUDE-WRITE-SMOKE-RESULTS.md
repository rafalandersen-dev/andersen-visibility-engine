# Phase 1A Write Smoke — Results & Evidence Record (2026-07-10)

> Documentation only. Records a completed test window. No runtime code, routes,
> migrations, env vars, or database state are changed by this document.

## 1. Summary

**Phase 1A commit 2 — the first MCP write tools — was live-proven end-to-end and then safely darkened again.**

- **Code under test:** `031d69e` — *feat: add first MCP write tools for tasks and project recommendations*
- **Production deploy (window baseline):** `8ddc5688-f0df-41b9-ae50-37496fb4a602`
- **Runbook executed:** `docs/CLAUDE-WRITE-SMOKE-WINDOW.md` (owner-only window, 2026-07-10, ~18:00–21:15 UTC)
- **Final result:** **§0–§13 all passed** (§11 UI spot-check by owner; two mid-window incidents, both resolved — §7 below)
- **Final env:** `MCP_OAUTH_ENABLED=true` (read connector live throughout the end state) · `MCP_WRITE_TOOLS_ENABLED` **off/unset** — write tools dark again

## 2. Baseline (§0, before flag-on)

- Owner workspace `rev` = **11** · `tasks[]` = **0** (array absent) · `opportunities[]` = **79**
- Target project id confirmed literally **`synergy`** ("Synergy Massage")
- `mcp_write` audit rows = **0** (no MCP write had ever run)
- OAuth tables: 7 clients / 11 tokens / 8 consents; live Claude.ai connector scope read-only (no `.write`), one refresh family, 3 rows all unrevoked
- Flag-OFF fingerprint verified: write-scoped DCR → **400 `invalid_scope`**, no client row created; PRM/AS metadata write-free

## 3. Flag-on proof (§1–§5)

- Metadata **stayed write-free with the flag on** — PRM still exactly the 4 read scopes; AS still 4 reads + `offline_access`; 0 `.write`/`publish` strings. The flag's fingerprint is behavior, not metadata, as designed.
- Write-scoped DCR → **201** (the same request that returned `invalid_scope` at baseline — positive flag proof).
- Smoke client (loopback callback, after the claude.ai-callback incident — §7):
  `milo_client_RL5LW9VoErJtpTs5mdoxxC0D4ycfw7cDWuMpk72CyCI` · "Milo Write Smoke Test Local Callback" · redirect `http://localhost:8765/callback` · explicit 7-scope request (4 reads + `offline_access` + `milo.tasks.write` + `milo.projects.write`), no client_secret.
- Consent rendered the **amber "Write permissions" section live for the first time** ("Read & write access" badge; cannot-list dropped Create/Edit content) — owner-verified with screenshot.
- Token exchange → 200: access + refresh token, `expires_in 3600`, all 7 scopes granted.
- `tools/list` → **exactly 10 tools**: the 8 read tools + `create_growth_task` + `create_project_recommendation`, writes carrying `annotations {readOnlyHint:false, destructiveHint:false, idempotentHint:false}`.

## 4. Write proof (§6–§9, executed 18:41–18:42 UTC)

- **`create_growth_task`** → task created: `requestId phase1a-write-smoke-task-001`, `taskId lrwcxh6n`, `projectId synergy`, `status open`, `origin claude`, `priority Low`, createdAt/updatedAt set. First entry ever in the workspace `tasks[]` array.
- Idempotent replay (same requestId, verbatim) → **same `taskId` + `deduped:true`**, still exactly one row.
- **`create_project_recommendation`** → opportunity created: `requestId phase1a-write-smoke-rec-001`, `opportunityId n4p3apk2`, `projectId synergy`, `status Linked`, `source claude`, `priority Low`, businessValue = rationale, contentType "Blog Article" (default), language "English" (inherited from the project's own `primaryLanguage` — verified in data, not a fallback bug). Opportunities 79 → 80.
- Idempotent replay → **same `opportunityId` + `deduped:true`**, still exactly one row.
- **Rev sequence landed exactly as predicted: 12 → 13 → 14 → 15** (replays bump rev by design — the write layer re-saves the unchanged blob and the `workspaces_rev_guard` trigger increments unconditionally; dedupe is proven by entity counts + ids, never by rev).
- Later drift to rev 16/17 was **harmless owner app-session save drift** — zero new entities, zero new `mcp_write` rows, matching the runbook's §11 note.

## 5. Audit proof (§10)

- **Exactly 4 `mcp_write` rows**, all attributed to the smoke client — two creates (`ok:true`) and two replays (`ok:true, deduped:true`).
- Detail carried **safe keys only**: `tool, projectId, action, fieldsChanged, requestId, entityIds, ok` (+ `deduped` on replays). `fieldsChanged` = sorted field **names** only: `["description","priority","title"]` / `["priority","rationale","title"]`.
- Planted content strings ("Write smoke task — safe to keep", "Created by Phase 1A write smoke test.", "Write smoke recommendation — safe to keep") → **0 hits** anywhere in the audit log.
- No access tokens, refresh tokens, hashes, client secrets, or refresh family ids in any `mcp_write` detail → **0 hits**.
- No write tool ever double-logged as `mcp_call`/`mcp_denied` → **0 hits**.

## 6. Rollback / dark-state proof (§12, verified ~21:14 UTC)

- Owner unset `MCP_WRITE_TOOLS_ENABLED` and redeployed; **`MCP_OAUTH_ENABLED` remained true** (verified — no repeat of incident #1).
- Production healthy: public page **200**; unauth `POST /api/mcp` → **401 with `resource_metadata`**; PRM live.
- Metadata write-free (unchanged, as always).
- Write-scoped DCR blocked again → **400 `invalid_scope`**; client count unchanged (9) — failed DCR created no row.
- The smoke client's original access token had expired naturally (1h TTL), so §12.4/12.5 used a **flag-off refresh**: the refresh grant succeeded and preserved the original scope verbatim, including both write scopes (see §7). With that fresh write-scoped token:
  - `tools/list` → **exactly 8 read tools**; both write tools absent.
  - `create_growth_task` → JSON-RPC **`-32602` "Unknown tool: create_growth_task"**.
  - No new task, opportunity, or `mcp_write` row. The dark `-32602` call **logs nothing** in the audit (write tools are excluded from `mcp_call`/`mcp_denied`; the `mcp_write` dispatch hooks are never reached flag-off). Only `token_refreshed {scope}` and an `mcp_call {tools/list, ok:true}` appeared during the dark phase.
- Smoke task and recommendation **persisted** (exactly one each; tasks = 1, opportunities = 80) — the rollback deleted nothing.

## 7. Incidents / lessons

1. **Env edit lost `MCP_OAUTH_ENABLED` (incident #1).** The first flag-on redeploy shipped without `MCP_OAUTH_ENABLED`: every OAuth surface 404'd, `/api/mcp` reverted to a plain-`Bearer` 401, and the live Claude.ai read connector was briefly dead (DB grants intact; recovered as soon as the var was restored + redeployed). **Lesson: every Lovable env change must be verified to preserve BOTH flags before/after redeploy.** The §2 fingerprint caught it immediately.
2. **Claude.ai callback swallowed the scripted flow (incident #2).** Using `https://claude.ai/api/mcp/auth_callback` as the redirect URI for a scripted (non-Claude-initiated) flow failed: after consent, claude.ai bounced to `claude.ai/new#settings/connectors` with "Authorization with the MCP server failed" and never surfaced the code (2 consents + 2 unconsumed authorization codes were left behind — harmless, kept as evidence; 0 tokens). **Lesson: scripted smokes must use a loopback redirect URI — `http://localhost:8765/callback` — which `validateRedirectUri` explicitly permits (http allowed on loopback hosts only). This is the scripted-smoke pattern going forward.** Nothing needs to listen on the port; the code is read from the browser address bar.
3. **Refresh grant preserves the original scope string even while the write flag is off.** By design, refresh does not re-validate scopes against the flag-dependent issuable set — a refreshed token keeps `milo.tasks.write`/`milo.projects.write` on paper, while runtime gating still makes the write tools invisible (`tools/list` = 8) and uncallable (`-32602`). **Acceptable for Phase 1A** (double-gating holds; the scope is inert). Flagged as a **future security/product decision**: whether refreshed tokens should degrade scopes while the write flag is off.

## 8. Default cleanup decision (§13)

**Preserve everything as evidence** (house rule, consistent with Phase 0):

- Both smoke clients ("Milo Write Smoke Test" `milo_client_kelauGqHsHcz…` and "Milo Write Smoke Test Local Callback" `milo_client_RL5LW9…`), their tokens, consents, and unconsumed codes stay.
- The 4 `mcp_write` audit rows (plus the window's `token_refreshed`/`mcp_call` rows) stay.
- Task `lrwcxh6n` and opportunity `n4p3apk2` stay in the owner workspace.
- **Nothing revoked, nothing deleted.** The smoke client's refresh family remains valid but write-dark; any future cleanup requires an explicit, separately-approved guarded plan.

---

### Bottom line

Every invariant Phase 1A commit 2 was built around held under live fire: double-gating (flag AND explicit scope), write-free metadata in both flag states, first-render write consent, rev-guarded writes with exact rev accounting, requestId idempotency, content-clean audits, and a rollback that removes capability without touching data. The connector's write foundation is proven; the remaining open items are the product decision on enabling writes permanently and Phase 1B (pending-actions proposals) per `docs/CLAUDE-ACTION-CONNECTOR-BLUEPRINT.md`.
