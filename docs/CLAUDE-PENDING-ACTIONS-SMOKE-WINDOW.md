# Phase 1B Pending Actions — Owner-Only Smoke Window Runbook

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document. Nothing here has been executed.

**Code under test (all on origin/main):** blueprint `200de5b` · decisions `af3dedb` · data model `65ebc4c` · server ops + scope `4067e91` · MCP tools `abdc707` · inbox UI `b194d9f` · owner resolution `06148d5` — 292 unit tests green.
**Production at window start:** still the `031d69e`-era bundle — **§1's dark deploy is the first deploy of the 1B stack and also ships the 4 audited Lovable bot commits** (audit verdict: safe as-is; the `search_path` migration is already applied in prod).
**Env at window start:** `MCP_OAUTH_ENABLED=true` (never touched in this runbook) · `MCP_WRITE_TOOLS_ENABLED` off/unset (on in §2, off again in §14).

**What this window proves end-to-end:** Claude proposes via `create_pending_action` → the owner reviews in `/app/actions` → owner **Approve & apply** mutates the target opportunity (whitelisted fields only) / owner **Reject** leaves it untouched → all lifecycle audits are content-clean → the whole surface darkens again with data intact.

**Conventions** (identical to the 1A window): curl from the Mac (never python for network — TLS gotcha); SQL via Lovable MCP `query_database`, project `06b696f6-c02b-468f-b0a0-7ab8af92d6a0`; `OWNER = 'bcc9d773-2de5-44da-a798-5add38ccf6ae'`; tokens live only in `chmod 600` scratch files, first 12 chars max in chat; `BASE=https://milogrowth.com`. The live Claude.ai connector (`milo_client_5vzISYkk…`) is never used, re-consented, or revoked. Register calls ≤5/h (limit 10/h/IP); write-bucket calls ≤6 (limit 30/h/token).

**GLOBAL STOP RULE** — on any ❌ or §16 condition: stop, capture evidence, then run §14 (flag off + redeploy + dark verification). Rollback is always one env change; created/applied data persists.

---

## §0 Pre-window baseline (read-only)

Record every value:

- [ ] **Deploy state:** current deployed commit + deployment id (Lovable UI) — expected `031d69e`-era, deploy lineage `8ddc5688…`. origin/main HEAD = `06148d5`.
- [ ] **Env:** `MCP_OAUTH_ENABLED=true`, `MCP_WRITE_TOOLS_ENABLED` off/unset (confirm in Lovable settings — remember incident #1: verify BOTH survive every env edit).

```sql
-- 0.1 rev + counts (record as REV0 / PA0 / TASKS0 / OPPS0; last known rev 17, drift expected)
SELECT rev,
       jsonb_array_length(coalesce(data->'pendingActions','[]'::jsonb)) AS pending_actions,
       jsonb_array_length(coalesce(data->'tasks','[]'::jsonb))          AS tasks,
       jsonb_array_length(coalesce(data->'opportunities','[]'::jsonb))  AS opportunities
FROM workspaces WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae';

-- 0.2 project + target opportunity (the 1A smoke evidence opportunity)
SELECT p->>'id' FROM workspaces, jsonb_array_elements(data->'projects') p
WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae' AND p->>'id' = 'synergy';

SELECT o->>'id' AS id, o->>'title' AS title, o->>'businessValue' AS business_value,
       o->>'priority' AS priority, o->>'contentType' AS content_type, o->>'recommendedCta' AS recommended_cta
FROM workspaces, jsonb_array_elements(data->'opportunities') o
WHERE user_id = 'bcc9d773-2de5-44da-a798-5add38ccf6ae' AND o->>'requestId' = 'phase1a-write-smoke-rec-001';
-- expect id n4p3apk2 ("Write smoke recommendation — safe to keep", Low, Blog Article,
-- recommendedCta likely empty). RECORD ALL FIVE FIELD VALUES — §6/§9/§11 assert against them.
-- ❌ STOP if missing: pick another safe test opportunity and substitute its id everywhere.

-- 0.3 audit baselines
SELECT (SELECT count(*) FROM oauth_audit_log WHERE event = 'pending_action_created')  AS created_rows,
       (SELECT count(*) FROM oauth_audit_log WHERE event LIKE 'pending_action_%')     AS lifecycle_rows,
       (SELECT count(*) FROM oauth_clients) AS clients;
-- expect 0 / 0 / <clients baseline ~11>
```

```bash
# 0.4 metadata + fingerprint (all expected values = the standing dark state)
curl -s $BASE/.well-known/oauth-protected-resource      # 200; exactly the 4 read scopes
curl -s $BASE/.well-known/oauth-authorization-server    # 200; 4 reads + offline_access
curl -s $BASE/.well-known/oauth-protected-resource $BASE/.well-known/oauth-authorization-server | grep -o -i "write\|publish\|propose" | wc -l   # 0
curl -s -X POST $BASE/api/oauth/register -H 'Content-Type: application/json' \
  -d '{"redirect_uris":["http://localhost:8765/callback"],"client_name":"1B Flag Probe","scope":"milo.tasks.write milo.actions.propose"}' -w '\nHTTP %{http_code}\n'
# → 400 invalid_scope naming both scopes (flag OFF fingerprint; no client row created)
```

- [ ] Live Claude.ai connector untouched (no action needed — just don't).

## §1 Deploy current origin/main DARK

1. Owner: Lovable `deploy_project` (or UI deploy) of origin/main `06148d5` with env **unchanged** (`MCP_OAUTH_ENABLED=true`, write flag off). Record the new deployment id.
2. Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' $BASE/                    # 200
curl -s -D - -o /dev/null -X POST $BASE/api/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping"}' | grep -i "www-authenticate"
# → Bearer resource_metadata="…" — ❌ STOP if plain Bearer/404s (incident-#1 signature: env lost in deploy)
# metadata + write/propose DCR probe: repeat §0.4 verbatim — identical results expected
```

- [ ] Owner (browser): `/app/actions` loads — title, safety explainer, **empty state** ("No pending actions yet."), nav shows "Pending Actions" with no badge. 📸 optional.
- [ ] Live read connector healthy: **brand-new** Claude.ai chat → "Use the Milo connector to call list_projects right now, don't answer from memory" → works.

## §2 Enable the proposal window

1. Owner: set **`MCP_WRITE_TOOLS_ENABLED=true`** (keep `MCP_OAUTH_ENABLED=true` — verify both fields before saving), **redeploy**. Record deployment id.
2. Verify: public 200 · `/app/actions` 200 · unauth `/api/mcp` 401 + `resource_metadata` · **metadata still write/publish/propose-free** (§0.4 grep = 0) · flag fingerprint flipped:

```bash
# same probe as §0.4 → now 201 (explicitly-requested scopes accepted; defaults unchanged)
```

❌ STOP if any `.write`/`publish`/`propose` string ever appears in PRM/AS metadata (§16).

## §3 Scripted DCR / client setup

**Loopback callback pattern (mandatory):** `http://localhost:8765/callback`. During the 1A window, `https://claude.ai/api/mcp/auth_callback` swallowed scripted redirects (Claude.ai rejects flows it didn't initiate — bounced to settings, code never delivered). Loopback is the accepted scripted-smoke pattern: nothing listens on the port; after Allow, the browser shows connection-refused and the `code` is read from the address bar.

**Client 1 — propose-only smoke client (mandatory):**

```bash
curl -s -X POST $BASE/api/oauth/register -H 'Content-Type: application/json' -d '{
  "redirect_uris":["http://localhost:8765/callback"],
  "client_name":"Milo 1B Pending Smoke",
  "scope":"milo.projects.read milo.content.read milo.insights.read milo.authority.read offline_access milo.actions.propose"
}' -w '\nHTTP %{http_code}\n' | tee $SCRATCH/dcr_1b.json
```

Expect **201**, `client_id` (record as `CLIENT_P`), **no client_secret**, echoed scope **exactly** the 6 requested. Then PKCE (fresh verifier/challenge/state persisted to scratch), authorize URL with the explicit 6-scope string, owner consent (§4), callback code from the address bar, token exchange → access+refresh in scratch only (`expires_in 3600`; scope = all 6).

**Clients 2–4 — optional diagnostic matrix** (the visibility matrix is fully unit-tested; live-verify only if desired): read-only (5 default scopes — may simply omit `scope`), direct-write-only (reads + offline + `milo.tasks.write milo.projects.write`), write+propose (all 8). Same loopback/PKCE/scratch rules; each 201, no secret, exact scope echo.

## §4 Consent checks

**Propose-only consent (Client 1) — 📸 REQUIRED (first live render of the propose consent):**
- [ ] Badge: **"Read & propose access"** (amber, NOT the write badge, NOT read-only)
- [ ] Amber **"Proposal permissions"** section with the propose label ("Suggest changes for your approval (never applies them itself)") and warning: suggestions are reviewed, nothing applies until owner approval in Milo, it can never approve its own suggestions, never publish/delete/settings/billing
- [ ] Cannot-list contains: **Approve or apply its own proposals** + Create content + Edit content (propose-only keeps the full list) + Publish + Delete + Settings + Billing

**Mixed write+propose consent (Client 4, optional):** write badge (stronger wording wins), BOTH amber sections (write + proposal), cannot-list drops Create/Edit content but keeps Approve-own-proposals + Publish/Delete/Settings/Billing. 📸 optional.

## §5 tools/list matrix

With the flag on, `tools/list` per token:

| Token | Count | Must include | Must NOT include |
|---|---|---|---|
| read-only | **8** | the 8 reads | any write/pending tool |
| direct-write-only | **10** | + create_growth_task, create_project_recommendation | any pending tool |
| propose-only (Client 1) | **11** | + create_pending_action, list_pending_actions, get_pending_action | create_growth_task, create_project_recommendation |
| write+propose | **13** | all of the above | — |

Annotations (propose-only token): `create_pending_action {readOnlyHint:false, destructiveHint:false, idempotentHint:false}`; `list_pending_actions` and `get_pending_action` `{readOnlyHint:true, destructiveHint:false, idempotentHint:true}`.

Client 1's check is mandatory; the rest may cite the unit-tested matrix if the diagnostic clients were skipped. ❌ STOP if a pending tool appears without the propose scope.

## §6 Create the approve-path pending action

With Client 1's token (`AT_P`):

```json
{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"create_pending_action","arguments":{
  "type":"opportunity_update_proposal","projectId":"synergy",
  "title":"Phase 1B smoke approve proposal",
  "summary":"Safe smoke proposal for owner approval.",
  "payload":{"opportunityId":"n4p3apk2","updates":{"recommendedCta":"Phase 1B smoke approved CTA"}},
  "preview":"- recommendedCta → Phase 1B smoke approved CTA",
  "requestId":"phase1b-pending-approve-001"}}}
```

**Expect (response):** `actionId` (record `PA_APPROVE_ID`), `status "pending"`, `riskLevel "medium"`, `requiredScope "milo.actions.propose"`, `deduped false`, `rev` = REV_before+1.

**Expect (DB):** `pendingActions` count +1; the stored action has `source:"claude"`, `proposedByClientId = CLIENT_P`, the requestId; **target opportunity `n4p3apk2` completely unchanged** (all five §0.2 values); rev bumped exactly once.

**Expect (audit):** one `pending_action_created` row, client_id = CLIENT_P, detail keys ⊆ {actionId, type, projectId, status, riskLevel, requiredScope, fieldsChanged, requestId, deduped?, expiredIds?, ok} with `fieldsChanged = ["recommendedCta"]`; probes:

```sql
SELECT count(*) FROM oauth_audit_log
WHERE detail::text ILIKE '%Phase 1B smoke%' OR detail::text ILIKE '%approved CTA%' OR detail::text ILIKE '%Safe smoke proposal%';  -- 0
SELECT count(*) FROM oauth_audit_log WHERE event LIKE 'pending_action_%'
  AND (detail::text LIKE '%milo_at_%' OR detail::text LIKE '%milo_rt_%' OR detail::text ILIKE '%hash%' OR detail::text ILIKE '%secret%' OR detail::text ILIKE '%family%');  -- 0
```

## §7 Idempotent replay (approve-path)

Re-run §6 **verbatim** (new JSON-RPC id only). **Expect:** same `actionId` + `deduped:true`; still exactly ONE action with the requestId; target opportunity still unchanged; **rev still bumps by one on the replay** (1A semantics: the write layer re-saves the unchanged blob and the trigger increments unconditionally — dedupe is proven by counts + ids, never rev); audit: a second `pending_action_created` row with `deduped:true` and the same safe keys; leak probes stay 0.

## §8 UI inbox proof — 📸 REQUIRED

Owner opens `/app/actions`:
- [ ] The proposal card renders: title, summary, **Pending** + **Medium risk** badges, project Synergy, type "Opportunity update", proposed fields `recommendedCta`, created/expires dates
- [ ] Nav "Pending Actions" badge shows **1**
- [ ] "Show before / after" → target `n4p3apk2`, row `recommendedCta`: current (§0.2 value) → "Phase 1B smoke approved CTA"; preview block renders
- [ ] No tokens, client ids, or audit internals anywhere on the page
- [ ] Controls visible: **Approve & apply** + **Reject** (only because it's effectively pending)

## §9 Owner approve & apply

Owner clicks **Approve & apply** → dialog states it applies immediately and lists the field names (`recommendedCta`) → confirm.

**Expect (UI):** success toast; card flips to **Applied**; controls gone; resolution line (Applied · date). 📸 recommended.
**Expect (DB):** opportunity `n4p3apk2.recommendedCta = "Phase 1B smoke approved CTA"` and **the other four fields byte-identical to §0.2**; action `status "applied"` with `resolution {resolvedAt, resolvedBy:"owner", appliedEntityIds:["n4p3apk2"]}`; **rev bumped exactly once** for the whole approve+apply (single atomic mutation).
**Expect (audit):** `pending_action_approved` AND `pending_action_applied` rows (applied carries `appliedAtRev` = the new rev), detail = names/ids + `source:"milo_ui"` + `ok:true` only; §6's leak probes still 0.
**Registry check:** `tools/list` (any token) contains no tool matching approve/apply/reject/resolve.

## §10 Create the reject-path pending action

Same as §6 with: title `"Phase 1B smoke reject proposal"`, summary `"Safe smoke proposal that should be rejected."`, updates `{"recommendedCta":"Phase 1B smoke rejected CTA should not apply"}`, preview accordingly, `requestId "phase1b-pending-reject-001"`.

**Expect:** new `actionId` (record `PA_REJECT_ID`), `status "pending"`; **opportunity still carries the §9 approved CTA**; clean `pending_action_created` audit; leak probe for `"rejected CTA"` → 0.

## §11 Owner reject

Owner opens `/app/actions`, clicks **Reject** on the second proposal, optionally types a note (e.g. "smoke reject note — must not appear in audit"), confirms.

**Expect:** status **Rejected**, controls gone, resolution line shows the note (owner-visible is fine); **opportunity unchanged** — `recommendedCta` still `"Phase 1B smoke approved CTA"`; one `pending_action_rejected` audit row, safe keys only; probes: the rejected-CTA string AND the note text absent from the entire audit log; token-material probe 0.

## §12 list/get visibility (propose-only token)

- [ ] `list_pending_actions` → exactly the 2 smoke proposals (this client's own), as summaries: id/type/projectId/title/summary/status/riskLevel/requiredScope/timestamps — **no `payload`, no `preview` keys**; statuses applied + rejected
- [ ] `list_pending_actions {"status":"applied"}` → 1; `{"projectId":"synergy"}` → 2
- [ ] `get_pending_action {actionId: PA_APPROVE_ID}` → full action incl. payload/preview/resolution
- [ ] `get_pending_action` with a bogus id → `-32011` "Not found." (uniform; foreign-client ids behave identically — cite the unit-tested cross-client case unless diagnostic Client 4 creates one to prove live)
- [ ] Audit: list/get appear as normal `mcp_call {method, tool, ok}` rows — **no payload/preview bodies anywhere**

## §13 Negative / security checks

- [ ] Registry: no MCP tool matching **approve/apply/reject/resolve**; no direct opportunity-edit tool; nothing publish/delete/settings/billing-shaped (also enforced by unit guards)
- [ ] Malformed creates all → `-32010`, nothing persisted: unknown top-level key (`{"riskLevel":"low"}`), unknown payload key (`{"mode":"force"}`), unknown update key, and publish/delete/settings/billing-like updates (`{"publish":true}`, `{"delete":true}`, `{"settings":{}}`, `{"billing":"pro"}`)
- [ ] Bogus `projectId`/`opportunityId` → uniform `-32011`
- [ ] Cap (`-32013` at 200): **cite the unit tests** — a live cap test would pollute the workspace with 200 proposals; do not run it
- [ ] Cross-client visibility: covered by §12's uniform not-found + unit tests (live-provable with diagnostic Client 4 if desired)

## §14 Rollback / dark-state verification (default end state)

1. Owner: unset **`MCP_WRITE_TOOLS_ENABLED`**, keep **`MCP_OAUTH_ENABLED=true`** (check both fields), **redeploy**.
2. Verify:

```bash
curl -s -o /dev/null -w '%{http_code}\n' $BASE/                          # 200
# unauth /api/mcp → 401 + resource_metadata; metadata grep → 0; §0.4 DCR probe → 400 invalid_scope again
```

- [ ] `/app/actions` still loads for the owner and shows **both resolved proposals** (Applied + Rejected) with resolution lines — the UI is not flag-gated; proposals are owner data
- [ ] Propose token (refresh first if the 1h access token expired — the refresh grant works flag-off and preserves scopes, 1A finding): `tools/list` → **8 read tools**; `create_pending_action` → **`-32602` "Unknown tool"**; `list_pending_actions`/`get_pending_action` absent and also `-32602`
- [ ] DB: pendingActions count unchanged since §11; **no new `pending_action_created` rows** after rollback; applied action still applied, rejected still rejected; opportunity keeps `"Phase 1B smoke approved CTA"`
- [ ] Live Claude.ai read connector: fresh-chat forced `list_projects` → works

## §15 Cleanup / evidence decision

**Default: preserve everything** (house rule). Test clients + tokens + consents stay; all `pending_action_*` and `mcp_call` audit rows stay; the applied and rejected pending actions stay in `pendingActions[]`; the opportunity keeps the approved CTA as living evidence. Nothing revoked, nothing deleted. Any later cleanup needs a separate, explicitly-approved guarded plan.

## §16 Stop conditions (immediate stop + §14)

Metadata ever advertises propose/write/publish · `MCP_OAUTH_ENABLED` found false (incident-#1 signature: OAuth 404s / plain-Bearer 401) · live read connector breaks · propose scope granted while the flag is off · pending tools visible/callable without the propose scope · any approve/apply/reject/resolve MCP tool exists · an apply happens without the owner clicking Approve in Milo · audit contains planted content strings, the owner's note, or token/hash/secret/family material · any publish/delete/settings/billing effect becomes possible · rev accounting deviates without an identified cause (open app tabs bump rev — harmless, documented in 1A).

---

## Final report checklists

**Evidence:** deployment ids (§1 dark, §2 on, §14 off) · REV0→final rev trail with per-step accounting · `CLIENT_P` + both `actionId`s + both requestIds · §0.2 five-field snapshot vs §9/§11 final values (only `recommendedCta` changed, once) · audit row counts per event type (`created` ×2 + 1 deduped replay row, `approved` ×1, `applied` ×1, `rejected` ×1, `expired` ×0 expected) · all leak-probe zeros · tools/list counts observed.

**Screenshots:** §4 propose-only consent (required) · §8 inbox with pending card + controls (required) · §9 applied state (recommended) · §1 empty inbox, §4 mixed consent, §11 rejected state (optional).

**Expected final state:** prod runs origin/main (1B stack + bot commits) with `MCP_OAUTH_ENABLED=true`, `MCP_WRITE_TOOLS_ENABLED` off · metadata dark as always · live read connector untouched · one applied + one rejected pending action preserved · opportunity `n4p3apk2` carrying `"Phase 1B smoke approved CTA"` · zero content/token leaks in audit — ready for the 1B.8 results doc.
