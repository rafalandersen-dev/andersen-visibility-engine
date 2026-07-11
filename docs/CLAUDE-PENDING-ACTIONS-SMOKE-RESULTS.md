# Phase 1B Pending Actions — Results & Evidence Record (2026-07-11)

> Documentation only. Records a completed owner-only smoke window. No runtime
> code, routes, migrations, env vars, or database state are changed by this
> document.

## 1. Executive summary

**The full Phase 1B propose → review → resolve workflow was live-proven end-to-end, then safely darkened again.** Runbook: `docs/CLAUDE-PENDING-ACTIONS-SMOKE-WINDOW.md`. Sections **§0–§14 all passed**.

- Claude (a propose-scoped OAuth client) **can create pending actions** via `create_pending_action` and read its own via `list_pending_actions` / `get_pending_action`.
- Claude **cannot approve, apply, or reject** — there is no such MCP tool, at any point.
- **Owner approval and rejection happen only in the authenticated Milo UI** (`/app/actions` → `resolvePendingActionFn`), which mutates the target opportunity (approve) or leaves it untouched (reject).
- The **rollback darkened the MCP proposal tools** (flag off ⇒ `-32602`) while **preserving all evidence** — clients, tokens, audits, and both resolved proposals persist.

**Code/document chain (all on origin/main):** blueprint `200de5b` · resolved decisions `af3dedb` · data model `65ebc4c` · server ops + `milo.actions.propose` scope `4067e91` · MCP pending-action tools `abdc707` · read-only inbox UI `b194d9f` · owner resolution UI/server fn `06148d5` · smoke runbook `ad7d7ff`. **Production deployed from `ad7d7ff`** (first deploy since `031d69e`-era; also shipped the 4 audited Lovable bot commits).

## 2. Baseline (§0)

- origin/main HEAD: **`ad7d7ff`** · production before §1: **`031d69e`-era bundle** (`index-BZkiVRJw`)
- owner workspace rev: **17** · pendingActions: **0** · tasks: **1** · opportunities: **80**
- target project: **`synergy`** · target opportunity: **`n4p3apk2`** (`requestId phase1a-write-smoke-rec-001`, the 1A evidence opportunity)
- target field snapshot — the invariant the whole window is measured against:
  - title `"Write smoke recommendation — safe to keep"`
  - businessValue `"Created by Phase 1A write smoke test."`
  - priority `Low`
  - contentType `Blog Article`
  - recommendedCta `""` (empty)
- `pending_action_*` audit rows: **0** · flag-off DCR fingerprint: write/propose DCR → **400 `invalid_scope`** (no client row)

## 3. Dark deploy proof (§1)

Production deployed to `ad7d7ff` with `MCP_WRITE_TOOLS_ENABLED` off (bundle `index-BZkiVRJw` → **`index-D95tkUKV`** — the 1B stack + bot commits live-dark).

- public page **200** · `/app/actions` loaded (empty state) · unauth `POST /api/mcp` → **401 with `resource_metadata`**
- metadata stayed dark: PRM 4 read scopes · AS 4 reads + `offline_access` · **0** write/publish/propose strings
- write/propose DCR stayed blocked (400 `invalid_scope`)
- live Claude.ai read connector healthy (fresh-chat forced `list_projects` succeeded; token active, last-used same day)

## 4. Flag-on / DCR / consent proof (§2–§4)

`MCP_WRITE_TOOLS_ENABLED=true` redeployed (env-only; bundle unchanged — flag is runtime env).

- **metadata stayed dark with the flag on** — 0 write/publish/propose strings (behavior-only fingerprint, by design)
- propose-only DCR → **201**; client **`milo_client_h9l7EUuXG7RkMlCGby_jNOkMV_taa1smrgPkf4KLPD4`** ("Milo 1B Pending Smoke"); **no `client_secret`**; echoed scope exactly the 6 requested, including **`milo.actions.propose`** — the same DCR shape that returned `invalid_scope` at §0, so 400→201 is the flag fingerprint
- **consent screen verified + screenshot** (first live render of the propose consent):
  - **"Read & propose access"** badge
  - **"Proposal permissions"** amber section — "Suggest changes for your approval (never applies them itself)"
  - warning that proposals require owner approval; it can never approve/apply its own suggestions
  - cannot-list keeps: **Approve or apply its own proposals** + Create content + Edit content + Publish + Delete + Settings + Billing

## 5. tools/list proof (§5)

Token exchange → 200 (`offline_access` + `milo.actions.propose` present, no secret). `tools/list` returned **exactly 11 tools**:

- the 8 read tools + `create_pending_action` + `list_pending_actions` + `get_pending_action`
- **absent:** `create_growth_task`, `create_project_recommendation` (propose is genuinely weaker than direct write)
- **no tool matching approve / apply / reject / resolve**
- annotations exact: `create_pending_action {readOnly:false, destructive:false, idempotent:false}`; `list_pending_actions` & `get_pending_action` `{readOnly:true, destructive:false, idempotent:true}`

## 6. Approve-path proof (§6–§7)

`create_pending_action` created the first live pending action:

- actionId **`zo5vhtzp`** · requestId `phase1b-pending-approve-001` · status **pending** · riskLevel **medium** · requiredScope **`milo.actions.propose`** · source **claude** · `proposedByClientId` = the smoke client
- **target opportunity unchanged before approval** (recommendedCta still `""`, other 4 fields byte-identical) · rev **17 → 18**
- idempotent replay: **same actionId** + **`deduped:true`**, no duplicate row, rev **18 → 19** (replay bumps rev by design — the write layer re-saves the unchanged blob; dedupe is proven by count + id, never by rev)
- `pending_action_created` audit safe (`fieldsChanged:["recommendedCta"]`, names/ids only) — planted-string and token-material probes **0**; no `mcp_call` double-log

## 7. Owner approve/apply proof (§8–§9)

Owner reviewed in `/app/actions` (card, badge=1, before/after diff — 📸) and clicked **Approve & apply** (dialog listed `recommendedCta`). Backend applied correctly:

- action `zo5vhtzp` status **applied**; resolution `{resolvedBy:"owner", resolvedAt, appliedEntityIds:["n4p3apk2"]}`
- **target `recommendedCta` = "Phase 1B smoke approved CTA"**; title/businessValue/priority/contentType **byte-identical to baseline** (whitelisted-merge touched only the CTA)
- rev **19 → 20**, exactly one bump for the whole approve+apply (single atomic mutation)
- audit: `pending_action_approved` ×1 and `pending_action_applied` ×1 (**`appliedAtRev = 20`**, `source:"milo_ui"`), safe keys only, planted-string and token probes **0**
- after a **hard refresh**, `/app/actions` showed **Applied** with controls gone

**Cosmetic UI-refresh bug (data correct):** after the success toast, the already-mounted card still appeared **Pending** with live Approve/Reject buttons until a hard refresh. The backend, DB, and audit were all correct; the in-place `hydrateForUser` did not repaint the mounted card. Follow-up patch recommended (§13-A below).

## 8. Reject-path proof (§10–§11)

Second proposal created:

- actionId **`y1nztpin`** · requestId `phase1b-pending-reject-001` · status **pending** · riskLevel **medium** · requiredScope **`milo.actions.propose`**
- **target opportunity stayed `recommendedCta = "Phase 1B smoke approved CTA"`** (the pending reject proposal changed nothing) · rev **20 → 21** · `pending_action_created` audit safe

Owner clicked **Reject** in `/app/actions`. Backend rejected correctly:

- action `y1nztpin` status **rejected**; resolution `{resolvedBy:"owner", resolvedAt}` (no note entered — no `note` key)
- **target opportunity unchanged** — recommendedCta still `"Phase 1B smoke approved CTA"`; other fields byte-identical to baseline
- rev **21 → 22**, exactly one bump
- audit: `pending_action_rejected` ×1 (`source:"milo_ui"`), safe keys only; the rejected-CTA string **absent**, no note leakage, no token material; **no `pending_action_applied`** row for `y1nztpin`
- after a **hard refresh**, `/app/actions` showed **Rejected** with controls gone — same cosmetic refresh bug reproduced

## 9. list/get visibility proof (§12)

Using the propose-only token:

- `list_pending_actions` returned **only this client's proposals** — `zo5vhtzp` + `y1nztpin`
- **summaries only** — no `payload`, no `preview`, no bodies (keys: id/type/projectId/title/summary/status/riskLevel/requiredScope/requestId/createdAt/updatedAt/expiresAt)
- filters worked: projectId `synergy` → 2 · status `applied` → `[zo5vhtzp]` · status `rejected` → `[y1nztpin]` · type `opportunity_update_proposal` → 2 · `limit=1` → 1 · `limit` 0/999 → `-32010`
- `get_pending_action` returned full own actions (payload + preview + resolution); missing id → **`-32011` "Not found."**; unknown field → `-32010`
- audit: list/get logged as normal safe `mcp_call` rows with **no payload/preview bodies**
- **no mutation:** pendingActions count stayed **2**, rev stayed **22**, target CTA stayed the approved value

## 10. Negative / security proof (§13)

- registry: **no** approve/apply/reject/resolve tool · **no** direct opportunity-edit tool · **no** publish/delete/settings/billing tool
- malformed `create_pending_action` payloads all failed closed at **`-32010`**, nothing persisted: unknown top-level key · unknown payload key · unknown update key · publish-like · delete-like · settings-like · billing-like
- bogus `opportunityId` and bogus `projectId` → **`-32011`** (uniform)
- cap (`-32013`): **cited from unit tests** (dedupe-before-cap included), not polluted live with 200 proposals
- cross-client visibility: unit-tested (`foreign1` case) + live uniform not-found; only one `proposedByClientId` existed live so no foreign action to exclude
- no live mutation: pendingActions stayed **2**, rev stayed **22**, target CTA stayed the approved value; the 9 malformed calls produced 9 `ok:false` failure rows and **zero** new success rows
- audit leak probes: **no** payload/preview key, **no** planted CTA values, **no** token/hash/secret/family material

**Non-blocking §13 nuance:** one malformed **failure** audit row echoed the caller-supplied unknown update **key name** `seoTitle` in `fieldsChanged`. It is a field name, not a value — the value `"bad"` was **not** logged, and no content or token material leaked. Post-window hardening recommended (§13-B below).

## 11. Rollback / dark-state proof (§14)

`MCP_WRITE_TOOLS_ENABLED` unset and redeployed; `MCP_OAUTH_ENABLED` stayed **true**.

- public page **200** · `/app/actions` **200** (still shows both resolved proposals — the UI is not flag-gated; proposals are owner data) · unauth `POST /api/mcp` → **401 with `resource_metadata`**
- metadata stayed dark: PRM 4 reads · AS 4 reads + `offline_access` · **0** write/publish/propose
- write/propose DCR → **400 `invalid_scope`**; the failed probe created **no** client row
- the existing propose-scoped smoke token (still valid — no refresh needed) returned **exactly 8 read tools**; `create_pending_action` / `list_pending_actions` / `get_pending_action` **absent**
- dark calls to all three pending tools → **`-32602` "Unknown tool"**; **no** new pending action created; **no** new `pending_action_created` success row (the `-32602` returns before dispatch, so nothing reaches the audit)
- data persisted: `zo5vhtzp` **applied**, `y1nztpin` **rejected**, target recommendedCta **"Phase 1B smoke approved CTA"**, rev **22**
- live Claude.ai read connector untouched

## 12. Final evidence preserved (§15)

- **1B smoke client preserved:** `milo_client_h9l7EUuXG7RkMlCGby_jNOkMV_taa1smrgPkf4KLPD4` (+ its tokens and consents)
- **lifecycle audit rows preserved:**
  - `pending_action_created` **12 total** — 3 `ok:true` successes (approve create + deduped replay + reject create) + 9 `ok:false` §13 malformed failures
  - `pending_action_approved` **1** · `pending_action_applied` **1** · `pending_action_rejected` **1**
- **pending actions preserved:** `zo5vhtzp` applied · `y1nztpin` rejected
- **target opportunity evidence preserved:** `n4p3apk2` recommendedCta = `"Phase 1B smoke approved CTA"`
- nothing revoked · nothing cleaned

## 13. Follow-up issues (non-blocking)

**A. UI refresh bug.** After an approve/apply or reject success toast, the mounted `/app/actions` card remains visually **Pending** (with live controls) until a hard refresh. Backend, data, and audit are all correct. Suggested fix: force a store/page refresh or apply a local optimistic status update after `resolvePendingActionFn` success (the resolve handler currently calls `hydrateForUser` but the mounted card does not repaint — consistent with this app's `useStore` store-identity caching).

**B. Failure-audit hardening.** The validation-failure path in `dispatchPendingTool` builds `fieldsChanged` from the caller's raw `updates` keys before validation, so a rejected call can echo caller-supplied unknown update **key names** (e.g. `seoTitle`) into the failure audit. No **values** are logged and no token material leaks. Suggested fix: on validation failure, omit `fieldsChanged` or intersect it with the whitelisted update fields so only known field names can ever appear.

## 14. Acceptance

**Phase 1B propose → review → resolve is accepted as live-proven and safely darkened.**

**Final production state:** deployed bundle **`ad7d7ff`** · `MCP_OAUTH_ENABLED=true` · `MCP_WRITE_TOOLS_ENABLED` off/unset · metadata read-only / write-free / propose-free · live Claude.ai read connector healthy and untouched · proposal tools dark · evidence preserved.

---

### Bottom line

Every invariant Phase 1B was designed around held under live fire: double-gating (flag AND explicit propose scope), write/propose-free metadata in both flag states, the first-render propose consent, Claude-proposes-only with no approve/apply/reject MCP surface, owner-only resolution through the authenticated UI, whitelisted-field application with exact rev accounting, requestId idempotency, own-proposal read visibility, content-clean lifecycle audits, and a rollback that removes capability while preserving both data and evidence. Two small non-blocking follow-ups remain (§13-A UI refresh, §13-B failure-audit hardening); neither affects data integrity or the security posture.
