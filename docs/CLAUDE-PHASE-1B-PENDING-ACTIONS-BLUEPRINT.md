# Phase 1B — Pending Actions / Proposals Blueprint

> Documentation only. No runtime code, routes, migrations, env vars, or database
> state are changed by this document. Nothing in it is implemented yet.

**Status:** design blueprint (1B.0) · **Builds on:** Phase 0 (read connector, live), Phase 1 (rev-guarded write foundation, live-proven), Phase 1A (first write tools `create_growth_task` / `create_project_recommendation`, live-proven and darkened — commit `031d69e`, runbook `9353e5f`, results `a861ea7`) · **Current prod:** `MCP_OAUTH_ENABLED=true`, `MCP_WRITE_TOOLS_ENABLED` off/unset, metadata write-free, live Claude.ai read connector untouched.

**One-sentence goal:** let Claude *propose* structured changes that a Milo owner reviews and approves in the Milo UI before they touch core workspace state — extending the connector from "safe creates" (1A) to "anything sensitive, behind human approval" without ever granting direct mutation power.

---

## 1. Product principle

- **Claude proposes; the owner disposes.** Claude can create suggestions with full structured payloads. Only the Milo owner — authenticated in the Milo UI — can approve, reject, or apply them.
- **Approval is a Milo action, not an MCP action.** In Phase 1B there is no MCP tool that approves, applies, or force-executes anything.
- **Hard exclusions, same as 1A:** no publish, no delete, no settings changes, no billing access — neither as a proposal type nor as an apply-side effect. A proposal whose apply step would need any of these is out of scope by construction.
- **Everything reviewable before it lands.** Every proposal carries a human-readable `preview` the UI renders *before* approval; the owner never approves a payload they cannot see.
- **Clear audit trail.** Every lifecycle transition (created → approved/rejected/applied/expired) writes an audit row, content-redacted per the established `mcp_write` discipline.
- **Fail dark.** Flag off ⇒ the proposal tools are invisible and uncallable, exactly like the 1A write tools; existing proposals remain visible in the Milo UI (they are owner data).

## 2. Data model — `pendingActions[]` inside workspace JSONB (recommended)

**Recommendation: a new flat workspace array `pendingActions[]`, NOT a separate table.**

Rationale (consistent with every prior module):
- All owner-scoped app state lives in `workspaces.data` flat arrays (`projects/opportunities/calendar/content/audits/…/tasks`); the store's snapshot/hydrate plumbing, the rev guard, and `mutateWorkspace` already handle them. The 1A smoke proved this end-to-end for MCP-written arrays.
- Proposals are strictly owner-scoped, low-volume (capped, §7), and reviewed in a UI that already hydrates the workspace — no cross-user queries, no service-role reporting, no independent write path.
- A separate table would be justified only by: cross-workspace admin queries, retention beyond workspace lifecycle, high-volume append rates, or non-owner visibility. None apply in 1B. Revisit at Phase 1C (publish approvals) if needed.
- **Store gotcha (learned in 1A):** `store.ts` snapshot/hydrate MUST enumerate `pendingActions` (State, emptyState, ssrSnapshot, hydrate `?? []`, saveWorkspaceNow snapshot) or client saves will drop server-written proposals.

```ts
interface PendingAction {
  id: string;                    // minted server-side (same 8-char scheme as 1A)
  type: PendingActionType;       // §3 enum
  projectId: string;             // must exist at create time; re-checked at apply
  title: string;                 // 1..200 chars, shown in inbox
  summary: string;               // 1..500 chars, plain-language "what this does"
  status: "pending" | "approved" | "rejected" | "applied" | "expired";
  source: "claude";              // only source in 1B
  createdAt: string;             // ISO, server-minted
  updatedAt: string;             // ISO, bumped on every transition
  expiresAt?: string;            // ISO; default createdAt + 14 days (§7, open decision §11)
  requestId?: string;            // idempotency key, 1..100 chars (1A semantics)
  proposedByClientId?: string;   // oauth client_id (public identifier) for UI attribution
  requiredScope: string;         // the write scope that GOVERNS this type (informational
                                 // + enforced at create; apply is owner-auth, not scope-auth)
  payload: Record<string, unknown>; // type-specific, strictly validated, ≤16KB serialized
  preview: string;               // human-readable markdown preview rendered in UI (≤4KB)
  riskLevel: "low" | "medium" | "high"; // DERIVED SERVER-SIDE from type — never client-supplied
  resolution?: {                 // audit metadata, set on transition
    resolvedAt: string;
    resolvedBy: "owner";         // UI-authenticated owner; only resolver in 1B
    note?: string;               // optional owner note, ≤500 chars
    appliedEntityIds?: string[]; // ids created/updated by apply
    appliedAtRev?: number;       // workspace rev at which apply landed
    error?: string;              // machine reason if apply failed (validation/conflict)
  };
}
```

Validation is strict (1A `validateWriteArgs` style): unknown fields rejected at every level, string bounds enforced, enums checked against runtime mirrors, per-type payload schema whitelisted field-by-field.

## 3. Initial action types — smallest useful set

Ship **at most three** types in 1B, in this order (first type = open decision §11):

| Type | Payload (whitelisted) | Apply mutation (deterministic) | Risk |
|---|---|---|---|
| `opportunity_update_proposal` | `opportunityId` + subset of `{title, businessValue, priority, contentType, recommendedCta}` | Merge only the provided whitelisted fields onto the existing opportunity | medium |
| `content_brief_proposal` | brief fields (`title, contentType, targetAudience, outline[], keyPoints[], language`) | Create ONE new Linked opportunity carrying the brief in `businessValue`/structured fields — net-new artifact, zero mutation of existing data | low |
| `task_batch_proposal` | `tasks[]` (≤10) each `{title, description?, dueOn?, priority?}` | Create ≤10 growth tasks (1A task shape, `origin:"claude"`) in one atomic `mutateWorkspace` | low |

`project_recommendation_proposal` is **deliberately omitted**: 1A already ships direct `create_project_recommendation` (a safe create); wrapping the same thing in approval adds friction without adding safety. `growth_plan_proposal` (composite multi-entity plan) is **deferred** — composite applies multiply validation and preview complexity; revisit after the first types prove the loop.

**Strictly excluded as types AND as apply side-effects:** any publish (draft or live), any delete, any settings/billing/publishing-connector change, any bulk destructive operation, any GSC/authority/external-platform mutation, anything touching another user's data. The apply functions are per-type, hand-written, and additive/merge-only — there is no generic "execute payload" path.

## 4. MCP tool design

Four tools, all **write-class**: visible and callable only when `MCP_WRITE_TOOLS_ENABLED=true` (same registry-view gating as 1A — flag off ⇒ `-32602`), and only with the required scope (else `-32002`). Legacy null-scope developer tokens never qualify.

**Scope: one new write-class scope `milo.actions.propose`.**
- Added to `MCP_WRITE_SCOPES` (issuable only flag-on **and** explicitly requested; never advertised in PRM/AS metadata; never in the default grant — identical posture to 1A write scopes).
- Renders in the consent amber write section with copy like *"Suggest changes for your approval — suggestions never apply until you approve them in Milo."*
- It is deliberately **weaker** than `milo.*.write`: a propose-only grant cannot mutate anything directly. Each PendingAction still records the governing `requiredScope` of its type for UI display.

| Tool | Required scope | Behavior |
|---|---|---|
| `create_pending_action` | `milo.actions.propose` | Validate type + payload strictly → derive riskLevel/preview requirements → insert via `mutateWorkspace` → return `{actionId, status:"pending"}` |
| `list_pending_actions` | `milo.actions.propose` | Filter by optional `projectId`/`status`; returns id/type/title/summary/status/riskLevel/timestamps — **not** full payloads (bounded output) |
| `get_pending_action` | `milo.actions.propose` | Full single action incl. payload/preview/resolution |
| `cancel_own_pending_action` | `milo.actions.propose` | Only actions with `status:"pending"` AND `proposedByClientId == caller's client_id` → status `rejected` with `resolution.note:"cancelled by proposer"`; anything else → uniform `-32011` |

**Input schema — `create_pending_action`:**

```jsonc
{
  "type": "object", "additionalProperties": false,
  "required": ["projectId", "type", "title", "summary", "payload"],
  "properties": {
    "projectId": { "type": "string" },
    "type":      { "enum": ["opportunity_update_proposal", "content_brief_proposal", "task_batch_proposal"] },
    "title":     { "type": "string", "minLength": 1, "maxLength": 200 },
    "summary":   { "type": "string", "minLength": 1, "maxLength": 500 },
    "payload":   { "type": "object" },          // re-validated per type server-side
    "requestId": { "type": "string", "maxLength": 100 }
  }
}
```

Tool description instructs Claude to confirm with the user before proposing and to pass a stable `requestId` (1A convention). Annotations: `{readOnlyHint:false, destructiveHint:false, idempotentHint:false}` for create/cancel; list/get are read-shaped but stay behind the propose scope (they expose Claude-authored payloads, not workspace reads).

- **Idempotency:** `requestId` dedupe inside `pendingActions[]` — replay returns the same `actionId` + `deduped:true` (exact 1A semantics; ids/timestamps minted before the mutation for conflict-retry safety).
- **Rate limits:** reuse the existing `write` bucket (30/h/token, `-32003`) for `create_pending_action` and `cancel_own_pending_action`; `list/get` ride the general `mcp` bucket (120/5min). No new buckets.
- **Errors:** `-32010` validation, `-32011` uniform not-found (unknown project, foreign action, non-pending cancel), `-32012` workspace conflict, `-32013` (new) pending-actions cap reached.
- **Audit:** §8. `buildMcpAuditEvent` skips generic `mcp_call` for these tools (dispatch hooks own their auditing, as in 1A).
- **Flag:** **reuse `MCP_WRITE_TOOLS_ENABLED`** (recommended; final call §11). These are write-class tools and the flag's meaning is "Claude may put things into the workspace". Incident #1 of the 1A smoke showed env-var edits are the operationally riskiest step we have — a third flag doubles that surface for near-zero gating value. If a separate kill-switch is ever wanted, prefer a code-level allowlist constant over another env var.

## 5. UI design

- **Global inbox — `/app/actions`** ("Pending Actions", nav icon Inbox, follows the module pattern: route page mirroring prior ones). Sections: Pending (default), Resolved (approved/applied/rejected/expired collapsed). Badge count of pending items on the nav entry.
- **Project-level surface:** a compact "Pending actions (N)" card on the project dashboard/setup linking into the inbox pre-filtered to that project.
- **Cards:** type badge + riskLevel chip (amber for medium/high), title, summary, proposer ("Suggested by Claude via *client name*", from `proposedByClientId`), created/expires timestamps, and an expandable **preview** — the rendered `preview` markdown plus a field-level "current → proposed" diff for update-type proposals (computed at render time against live workspace state; if the target changed since proposal, show a "target has changed since this was suggested" warning).
- **Controls:** **Approve & apply** (primary, amber for medium/high risk, with AlertDialog confirm reusing the house `components/ui/alert-dialog`), **Reject** (with optional note). No bulk approve in 1B. Buttons render only for `status:"pending"` and unexpired items.
- **Safety language:** amber section copy consistent with the consent screen: *"Claude suggested this change. Nothing happens until you approve it. Approving applies it to your workspace immediately."*
- **Filters:** project, status, type. **Empty state:** explains what pending actions are and that they arrive via the Claude connector when write suggestions are enabled.
- i18n: full en/pl/sv/da (`actions.*` keys), per house rule.

## 6. Approval behavior

Approval is a **Milo server function** (`resolvePendingActionFn`, `createServerFn` + `requireSupabaseAuth`), never an MCP tool in 1B:

1. **AuthZ:** the authenticated user must own the workspace containing the action (owner-only by construction — workspace functions already scope to the caller's row).
2. **Load-and-check inside `mutateWorkspace`:** action exists, `status === "pending"`, not past `expiresAt` (if expired: transition to `expired` instead and return that outcome).
3. **Re-validate against CURRENT state:** target project still exists; for update types the target entity still exists; payload still passes type validation. The rev guard gives atomicity for free — the approve/apply mutation echoes the rev it read, and any concurrent writer triggers `workspace_conflict` (40001) → the server fn retries via `mutateWorkspace`'s standard loop; the mutation is pure so retry is safe.
4. **Apply deterministically:** run the per-type apply function (create/merge only), set `status:"applied"` (or `"approved"` then `"applied"` in the same mutation — single-step is the 1B default, §11), fill `resolution` (`resolvedAt/resolvedBy/appliedEntityIds/appliedAtRev`). **One `mutateWorkspace` call covers both the applied entities and the status transition — atomic by construction.**
5. **Audit:** write `pending_action_approved` + `pending_action_applied` rows (§8). If apply-time validation fails, the action transitions to `rejected` with `resolution.error` and audits `pending_action_rejected {reason:"apply_validation"}` — it never half-applies.
6. **Reject:** status → `rejected`, `resolution.note` optional, audit row. **Rejected/expired proposals are never deleted** — they remain in `pendingActions[]` as evidence (subject only to the cap's pruning policy, §7).

## 7. Security and safety

- **Scope checks:** create/list/get/cancel all require `milo.actions.propose` on an OAuth grant; developer tokens (null scope) are excluded by the 1A `toolAllowed` write rule. Double-gated by `MCP_WRITE_TOOLS_ENABLED`.
- **Owner-only approval:** resolution requires Milo UI auth + workspace ownership; MCP tokens cannot approve, apply, or reject (except proposer-cancel of their own pending item).
- **No publish/delete/settings/billing:** not expressible — no such type, and apply functions are hand-written per type, additive/merge-only.
- **Payload limits:** payload ≤16KB serialized, preview ≤4KB, `pendingActions[]` hard cap **200** (`-32013` when full; UI nudges the owner to resolve). Batch types capped at 10 items.
- **Content sanitization:** previews render as markdown with the app's existing safe renderer (no raw HTML); all strings length-clipped and trimmed at validation; payloads never `eval`'d or interpreted — only whitelisted fields are ever read.
- **Replay/idempotency:** `requestId` dedupe (create); approve/reject transitions are state-guarded (only `pending` resolves — a double-click or replayed approve returns the already-resolved outcome, never applies twice).
- **Expiry:** default `expiresAt = createdAt + 14d`, **lazy** — checked at read/resolve time and transitioned to `expired` (audited) with no cron or background job.
- **Stale rev handling:** all writes go through `mutateWorkspace` (echo-rev + trigger bump, conflict retry with pure mutations); apply re-validates targets at apply time, so a proposal drafted against stale state either merges cleanly or fails closed to `rejected` with a reason.
- **Connected-apps visibility:** the `milo.actions.propose` scope shows as an amber write pill on the client's card; revoking the grant kills the token's ability to propose but leaves existing proposals (owner data) reviewable.
- **Audit redaction:** §8 — same "names and ids only" discipline as `mcp_write`, probe-tested in the smoke.

## 8. Audit model

| Event | Emitted by | Detail (names/ids only) |
|---|---|---|
| `mcp_pending_action_created` | MCP dispatch hooks (awaited) | `{tool, type, projectId, actionId, riskLevel, requiredScope, fieldsChanged (payload field NAMES, sorted), requestId?, deduped?, ok}` — failures add `error: validation\|not_found\|conflict\|cap` |
| `pending_action_approved` | resolve server fn | `{actionId, type, projectId, source:"milo_ui"}` |
| `pending_action_applied` | resolve server fn | `{actionId, type, projectId, appliedEntityIds, appliedAtRev, source:"milo_ui"}` |
| `pending_action_rejected` | resolve fn / MCP cancel | `{actionId, type, projectId, reason: owner\|proposer_cancel\|apply_validation, source}` |
| `pending_action_expired` | lazy expiry at read/resolve | `{actionId, type, projectId}` |

**Must never appear in any audit detail** (extends the 1A probe list): access/refresh token values, token hashes, refresh family ids, client secrets, payload bodies, titles/summaries/previews/notes or any other free-text content, and no private user data beyond the ids and type/risk metadata above. The 1B smoke re-runs the planted-string probe against every new event type.

## 9. Implementation phases (small commits, each deployable dark)

| Commit | Scope | Tests |
|---|---|---|
| **1B.0** | This blueprint (docs only) | — |
| **1B.1** | `PendingAction` types + runtime validators + store plumbing (`pendingActions[]` in State/emptyState/ssrSnapshot/hydrate/snapshot) + pure lifecycle helpers | unit: validation, transitions, expiry, dedupe |
| **1B.2** | Server layer: create/list/get/cancel + resolve fn skeleton over `mutateWorkspace`; `milo.actions.propose` scope constant + consent copy | unit: scope issuance, apply fns, conflict retry |
| **1B.3** | MCP tools, dark-gated (flag + scope), dispatch wiring, audit hooks, rate limits, `-32013` cap error | unit: gating matrix (flag×scope×dev-token), idempotency, audit shape |
| **1B.4** | UI inbox read-only (`/app/actions` + nav + project card + previews/diffs + i18n) | manual + unit for diff/preview helpers |
| **1B.5** | Approve/reject/apply UI + resolve server fn finalized + audit rows | unit: resolve outcomes incl. expired/stale-target |
| **1B.6** | Smoke runbook doc (house §-format; loopback-DCR pattern from 1A results §7) | — |
| **1B.7** | Owner-only smoke window: flag on → propose via scripted client → inbox review → approve/reject live → audits → flag off dark verification | live evidence |
| **1B.8** | Results/evidence doc + memory update + flag decision record | — |

Each code commit lands flag-off-invisible on prod (the 1A "deploy dark, prove by fingerprint" pattern), with the env-edit gotcha from incident #1 called out in the runbook: **verify both flags survive every Lovable env change.**

## 10. Acceptance criteria (pass/fail before 1B is "complete")

1. Flag off: proposal tools absent from `tools/list` for every token; `tools/call` → `-32602`; PRM/AS metadata contain no `actions`/`propose`/`write`/`publish` strings. Write-scoped/propose-scoped DCR → `invalid_scope`.
2. Flag on: `milo.actions.propose` issuable only when explicitly requested; consent renders it in the amber write section; default-scope grants and developer tokens never see the tools (`-32002`/absent).
3. `create_pending_action` (each shipped type): valid payload → pending action visible in DB and inbox; invalid/unknown fields → `-32010`; bogus project → `-32011`; cap → `-32013`; verbatim replay → same `actionId` + `deduped:true`, no duplicate.
4. Owner approve in UI → deterministic apply lands atomically (entities + status in one rev bump), `resolution` filled, `appliedEntityIds` correct; approving twice cannot double-apply; reject leaves an evidential row; expired items cannot be approved.
5. Rev safety: concurrent owner edit during approve produces either a clean retry-apply or a fail-closed rejection — never a partial apply, never data loss (verified by the smoke's rev accounting).
6. Audit: every lifecycle transition produces exactly its §8 row; planted-string probe over all new event types → 0 hits; token-material probe → 0 hits; no `mcp_call` double-logging.
7. Live Claude.ai read connector unaffected throughout (fresh-chat forced `list_projects` check, per the 1A soak gotcha).
8. Full unit suite green; rollback (flag off) leaves proposals and applied entities intact while making the tools vanish.

## 11. Open decisions (owner)

1. **Flag:** reuse `MCP_WRITE_TOOLS_ENABLED` (recommended — one env var, one dark switch, less incident-#1 surface) vs. a new `MCP_PENDING_ACTIONS_ENABLED`.
2. **Proposer cancel:** include `cancel_own_pending_action` in 1B.3 (recommended — cheap, strictly narrowing) or defer.
3. **Auto-expiry:** keep the 14-day lazy default (recommended), change the horizon, or make proposals non-expiring.
4. **Approve = apply immediately** (recommended: one click + AlertDialog confirm, atomic) vs. two-step approve-then-apply.
5. **First shipped type:** `opportunity_update_proposal` (recommended — it introduces the genuinely new capability, guarded updates, that 1A's direct creates don't cover) vs. starting even softer with `content_brief_proposal`.
6. **Standing item from 1A results §7.3:** whether refresh-issued tokens should degrade write/propose scopes while the flag is off (currently: scope preserved, runtime-gated — acceptable, documented).

---

### Bottom line

Phase 1B turns the connector's write surface from "small safe creates" into "any structured suggestion, behind the owner's explicit approval" — reusing every proven 1A mechanism (flag + scope double-gating, strict whitelist validation, requestId idempotency, `mutateWorkspace` rev safety, content-redacted audits, dark deploys with behavioral fingerprints) and adding exactly one new scope, one new workspace array, four gated tools, and one inbox UI. The recommended first slice (1B.1–1B.3 with `opportunity_update_proposal` only) is small enough to deploy dark within one session and proves the whole propose→review→apply loop before any further types ship.
